import { requireAssignment, type SubmissionRow } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { all, inList, parseJson, run } from "@/lib/server/db";
import { enqueueGrading } from "@/lib/server/grading";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";
import { deleteFiles } from "@/lib/server/storage";
import type { HistoryEntry } from "@/lib/shared/types";

type Action = "regrade" | "retry" | "gradeAnyway" | "cancel" | "remove";

const ACTIVE = ["queued", "grading"];

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade", true);
  const { action, ids } = await readJson<{ action?: Action; ids?: string[] }>(req);
  if (!ids?.length) throw badRequest("Select at least one file.");
  const rows = await all<SubmissionRow>(`select * from submission where assignment_id = ? and id in (${inList(ids.length)})`, id, ...ids);
  const now = new Date().toISOString();

  if (action === "remove") {
    const list = rows.filter((r) => r.status !== "grading");
    if (!list.length) return Response.json({ count: 0 });
    await deleteFiles(list.flatMap((r) => (r.r2_key ? [r.r2_key, r.r2_key + ".paras.json"] : [])));
    await run(`delete from submission where id in (${inList(list.length)})`, ...list.map((r) => r.id));
    await logActivity({
      type: "grading",
      user: me,
      courseId: course.id,
      text: `Removed ${list.length === 1 ? list[0].file_name : list.length + " files"} from ${asg.title}`,
    });
    return Response.json({ count: list.length });
  }

  if (action === "cancel") {
    const list = rows.filter((r) => r.status === "queued");
    for (const r of list) {
      const h = parseJson<HistoryEntry[]>(r.history, []);
      h.push({ who: me.name, at: now, text: "Cancelled grading" });
      await run("update submission set status = 'cancelled', note = 'Cancelled before grading finished.', history = ? where id = ? and status = 'queued'", JSON.stringify(h), r.id);
    }
    return Response.json({ count: list.length });
  }

  const allowed: Record<string, string[]> = {
    regrade: ["graded", "failed", "skipped", "cancelled"],
    retry: ["failed", "cancelled"],
    gradeAnyway: ["skipped"],
  };
  if (!action || !allowed[action]) throw badRequest("Unknown action.");
  const list = rows.filter((r) => allowed[action].includes(r.status) && !ACTIVE.includes(r.status));
  if (!list.length) return Response.json({ count: 0 });
  const batchId = newId();
  const label = action === "gradeAnyway" ? "Duplicate, graded on request" : action === "retry" ? "Retry requested" : "Regrade requested";
  for (const r of list) {
    const h = parseJson<HistoryEntry[]>(r.history, []);
    h.push({ who: me.name, at: now, text: label });
    await run(
      "update submission set status = 'queued', queued_at = ?, note = '', attempts = 0, batch_id = ?, history = ? where id = ?",
      now,
      batchId,
      JSON.stringify(h),
      r.id,
    );
  }
  await enqueueGrading(list.map((r) => r.id));
  await logActivity({
    type: "grading",
    user: me,
    courseId: course.id,
    text: `${action === "retry" ? "Retried" : "Regraded"} ${list.length === 1 ? list[0].file_name : list.length + " files"} in ${asg.title}`,
  });
  return Response.json({ count: list.length });
});
