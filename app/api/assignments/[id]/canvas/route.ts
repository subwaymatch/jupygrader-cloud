import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { canvasFor, submissionInfo } from "@/lib/server/canvas";
import { linkAssignment, linkedIds } from "@/lib/server/canvas-sync";
import { all, run } from "@/lib/server/db";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { planImport } from "@/lib/shared/canvas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * What importing from the linked Canvas assignment would do: each student's submission, and which
 * files are new or already imported. Also refreshes the Canvas assignment's name and points.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade");
  const ids = linkedIds(course, asg);
  const canvas = await canvasFor(me.id);
  const [a, subs, imported] = await Promise.all([
    canvas.assignment(ids.canvasCourseId, ids.canvasAssignmentId),
    canvas.submissions(ids.canvasCourseId, ids.canvasAssignmentId),
    all<{ canvasUserId: string; attachmentId: string | null }>(
      "select canvas_user_id canvasUserId, canvas_attachment_id attachmentId from submission where assignment_id = ? and canvas_user_id is not null",
      id,
    ),
  ]);
  if (a.name !== asg.canvas_assignment_name || a.points_possible !== asg.canvas_points)
    await run("update assignment set canvas_assignment_name = ?, canvas_points = ? where id = ?", a.name, a.points_possible, id);
  return Response.json({
    canvas: { id: String(a.id), name: a.name, points: a.points_possible },
    rows: planImport(subs.map(submissionInfo), imported),
  });
});

/** Links the assignment to a Canvas assignment in the course's Canvas course, or unlinks it with null. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "manage", true);
  const b = await readJson<{ canvasAssignmentId?: string | null }>(req);
  const target = b.canvasAssignmentId ? String(b.canvasAssignmentId).trim() : null;
  if (target && !/^\d+$/.test(target)) throw badRequest("Choose a Canvas assignment.");
  const a = await linkAssignment(target ? await canvasFor(me.id) : null, course, id, target);
  await logActivity({
    type: "rubrics",
    user: me,
    courseId: course.id,
    text: a ? `Linked ${asg.title} to the Canvas assignment ${a.name}` : `Unlinked ${asg.title} from Canvas`,
  });
  return Response.json({ canvas: a ? { id: String(a.id), name: a.name, points: a.points_possible } : null });
});
