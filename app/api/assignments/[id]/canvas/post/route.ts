import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { canvasFor } from "@/lib/server/canvas";
import { postGrades } from "@/lib/server/canvas-sync";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** Most grades per request; each can mean an upload and two more Canvas calls. */
const BATCH = 5;

/** Posts the grades of a few files to Canvas, with optional comments and feedback files. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade", true);
  // `prior` is how many grades earlier requests in this run posted, for the activity log.
  const b = await readJson<{ ids?: string[]; comment?: boolean; attach?: boolean; last?: boolean; prior?: number }>(req);
  const ids = (b.ids || []).map(String);
  if (!ids.length || ids.length > BATCH) throw badRequest(`Send 1 to ${BATCH} files at a time.`);
  const results = await postGrades({ canvas: await canvasFor(me.id), course, asg, ids, comment: !!b.comment, attach: !!b.attach, me, req });
  const total = (Number(b.prior) || 0) + results.filter((r) => r.ok).length;
  if (b.last && total) await logActivity({ type: "exports", user: me, courseId: course.id, text: `Posted ${total} grade${total === 1 ? "" : "s"} for ${asg.title} to Canvas` });
  return Response.json({ results });
});
