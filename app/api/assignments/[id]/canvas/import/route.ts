import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { canvasFor } from "@/lib/server/canvas";
import { importStudents } from "@/lib/server/canvas-sync";
import { enqueueGrading } from "@/lib/server/grading";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** Most students per request, so a request stays well within the Worker's limits. The page sends the rest in turn. */
const BATCH = 5;

/** Imports the latest files of a few Canvas students and queues them for grading. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade", true);
  // `prior` is how many files earlier requests in this import added, for the activity log.
  const b = await readJson<{ userIds?: string[]; batchId?: string; last?: boolean; prior?: number }>(req);
  const userIds = (b.userIds || []).map(String).filter((u) => /^\d+$/.test(u));
  if (!userIds.length || userIds.length > BATCH) throw badRequest(`Send 1 to ${BATCH} students at a time.`);
  const { results, queued } = await importStudents({
    canvas: await canvasFor(me.id),
    course,
    asg,
    userIds,
    me,
    batchId: String(b.batchId || "").slice(0, 40) || "canvas",
  });
  if (queued.length) await enqueueGrading(queued);
  const total = (Number(b.prior) || 0) + results.reduce((n, r) => n + r.imported, 0);
  if (b.last && total) await logActivity({ type: "grading", user: me, courseId: course.id, text: `Imported ${total} file${total === 1 ? "" : "s"} from Canvas to ${asg.title}` });
  return Response.json({ results });
});
