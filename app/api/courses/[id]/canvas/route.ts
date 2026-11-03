import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { canvasFor } from "@/lib/server/canvas";
import { all, run } from "@/lib/server/db";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { htmlToText } from "@/lib/shared/canvas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Assignments in the linked Canvas course, each with the Jupygrader assignment linked to it.
 * With ?id=, one assignment with its instructions as text, for creating an assignment from it.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage");
  if (!course.canvas_course_id) throw badRequest("Link this course to a Canvas course first, in Course settings.");
  const canvas = await canvasFor(me.id);
  const one = new URL(req.url).searchParams.get("id");
  if (one) {
    const a = await canvas.assignment(course.canvas_course_id, one);
    return Response.json({ id: String(a.id), name: a.name, points: a.points_possible, text: htmlToText(a.description || "").slice(0, 60_000) });
  }
  const [list, linked] = await Promise.all([
    canvas.assignments(course.canvas_course_id),
    all<{ id: string; title: string; canvas_assignment_id: string }>(
      "select id, title, canvas_assignment_id from assignment where course_id = ? and canvas_assignment_id is not null",
      id,
    ),
  ]);
  return Response.json({
    assignments: list.map((a) => {
      const l = linked.find((x) => x.canvas_assignment_id === String(a.id));
      return {
        id: String(a.id),
        name: a.name,
        points: a.points_possible,
        dueAt: a.due_at,
        published: a.published !== false,
        uploads: !a.submission_types || a.submission_types.includes("online_upload"),
        linkedTo: l ? { id: l.id, title: l.title } : null,
      };
    }),
  });
});

/** Links the course to a Canvas course, or unlinks it with null. Changing it removes the assignments' links. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage", true);
  const b = await readJson<{ canvasCourseId?: string | null }>(req);
  const target = b.canvasCourseId ? String(b.canvasCourseId).trim() : null;
  if (target === course.canvas_course_id) return Response.json({ id: target, name: course.canvas_course_name });
  let name: string | null = null;
  if (target) {
    if (!/^\d+$/.test(target)) throw badRequest("Choose a Canvas course.");
    name = (await (await canvasFor(me.id)).course(target)).name;
  }
  await run("update course set canvas_course_id = ?, canvas_course_name = ?, updated_at = ? where id = ?", target, name, new Date().toISOString(), id);
  // Assignment links point into the old Canvas course.
  await run("update assignment set canvas_assignment_id = null, canvas_assignment_name = null, canvas_points = null where course_id = ?", id);
  await logActivity({
    type: "rubrics",
    user: me,
    courseId: id,
    text: target ? `Linked ${course.name} to the Canvas course ${name}` : `Unlinked ${course.name} from Canvas`,
  });
  return Response.json({ id: target, name });
});
