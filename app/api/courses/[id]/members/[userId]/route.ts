import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { first, run } from "@/lib/server/db";
import { badRequest, handle, notFound, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function teacherCount(courseId: string) {
  return (await first<{ n: number }>("select count(*) n from enrollment where course_id = ? and role = 'Teacher'", courseId))?.n ?? 0;
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id, userId } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage", true);
  const { role } = await readJson<{ role?: string }>(req);
  if (role !== "Teacher" && role !== "Grader") throw badRequest("Choose Teacher or Grader.");
  const m = await first<{ role: string; name: string }>(
    `select e.role, u.name from enrollment e join "user" u on u.id = e.user_id where e.course_id = ? and e.user_id = ?`,
    id,
    userId,
  );
  if (!m) throw notFound("That person isn't in this course.");
  if (m.role === "Teacher" && role === "Grader" && (await teacherCount(id)) <= 1) throw badRequest("A course needs at least one Teacher.");
  await run("update enrollment set role = ? where course_id = ? and user_id = ?", role, id, userId);
  await logActivity({ type: "people", user: me, courseId: id, text: `Changed ${m.name}'s role in ${course.name} from ${m.role} to ${role}` });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id, userId } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage", true);
  const m = await first<{ role: string; name: string }>(
    `select e.role, u.name from enrollment e join "user" u on u.id = e.user_id where e.course_id = ? and e.user_id = ?`,
    id,
    userId,
  );
  if (!m) throw notFound("That person isn't in this course.");
  if (m.role === "Teacher" && (await teacherCount(id)) <= 1) throw badRequest("A course needs at least one Teacher.");
  await run("delete from enrollment where course_id = ? and user_id = ?", id, userId);
  await logActivity({ type: "people", user: me, courseId: id, text: `Removed ${m.name} from ${course.name}` });
  return Response.json({ ok: true });
});
