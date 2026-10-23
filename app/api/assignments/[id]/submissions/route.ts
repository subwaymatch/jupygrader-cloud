import { requireAssignment, type SubmissionRow } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { all } from "@/lib/server/db";
import { enqueueGrading } from "@/lib/server/grading";
import { badRequest, handle } from "@/lib/server/http";
import { queueInfo } from "@/lib/server/queue-info";
import { requireUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { createSubmission, toListItem } from "@/lib/server/submissions";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/constants";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg } = await requireAssignment(me, id, "view");
  const rows = await all<SubmissionRow>("select * from submission where assignment_id = ? order by uploaded_at desc, file_name", id);
  const settings = await getSettings();
  return Response.json({
    items: rows.map((r) => toListItem(r, asg, settings.model)),
    queue: await queueInfo(),
    version: asg.version,
  });
});

/** Uploads one file. The client sends files one at a time so large batches stay under request limits. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade", true);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to upload.");
  if (!file.size) throw badRequest("This file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files can be up to 25 MB.");
  const batchId = String(form.get("batchId") || "") || null;
  const regrade = form.get("regradeDuplicates") === "1";
  const { row, queued } = await createSubmission({
    asg,
    file,
    bytes: new Uint8Array(await file.arrayBuffer()),
    userId: me.id,
    batchId,
    regradeDuplicates: regrade,
  });
  if (queued) await enqueueGrading([row.id]);
  if (form.get("last") === "1") {
    const n = Number(form.get("count") || 1);
    await logActivity({ type: "grading", user: me, courseId: course.id, text: `Uploaded ${n} file${n === 1 ? "" : "s"} to ${asg.title}` });
  }
  const settings = await getSettings();
  return Response.json({ item: toListItem(row, asg, settings.model) });
});
