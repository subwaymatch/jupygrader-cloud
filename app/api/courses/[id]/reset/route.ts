import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { resetCourse } from "@/lib/server/courses";
import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { plural } from "@/lib/shared/format";

/** Deletes every assignment, file and grade in a course, keeping the course and its people. Teachers and admins only. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  // Like deleting, this works on an archived course too.
  const { course } = await requireCourse(me, id, "manage");
  const r = await resetCourse(id);
  await logActivity({
    type: "rubrics",
    user: me,
    courseId: id,
    text: `Reset ${course.name}, deleting ${plural(r.assignments, "assignment")} and ${plural(r.submissions, "file")}`,
  });
  return Response.json(r);
});
