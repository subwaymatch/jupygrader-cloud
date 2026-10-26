import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { resolveCourseDates, validateCourseName } from "@/lib/server/courses";
import { all, run } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { deletePrefix } from "@/lib/server/storage";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  // Dates can be changed on an archived course, so it can be reopened.
  const { course } = await requireCourse(me, id, "manage");
  const body = await readJson<{ name?: string; start?: string | null; end?: string | null }>(req);
  const name = body.name !== undefined ? validateCourseName(body.name) : course.name;
  const datesChanged = body.start !== undefined || body.end !== undefined;
  const d = datesChanged
    ? resolveCourseDates(body.start !== undefined ? body.start : course.start_date, body.end !== undefined ? body.end : course.auto_end ? null : course.end_date)
    : { start: course.start_date, end: course.end_date, autoEnd: !!course.auto_end };
  await run(
    "update course set name = ?, start_date = ?, end_date = ?, auto_end = ?, updated_at = ? where id = ?",
    name,
    d.start,
    d.end,
    d.autoEnd,
    new Date().toISOString(),
    id,
  );
  if (name !== course.name) await logActivity({ type: "rubrics", user: me, courseId: id, text: `Renamed the course ${course.name} to ${name}` });
  if (datesChanged) await logActivity({ type: "rubrics", user: me, courseId: id, text: `Changed the dates of ${name}` });
  return Response.json({ ok: true, endDate: d.end, autoEnd: d.autoEnd });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage");
  const asgs = await all<{ id: string }>("select id from assignment where course_id = ?", id);
  for (const a of asgs) {
    await deletePrefix(`sub/${a.id}/`);
    await deletePrefix(`asg/${a.id}/`);
  }
  await run("delete from course where id = ?", id);
  await logActivity({ type: "rubrics", user: me, text: `Deleted the course ${course.name}` });
  return Response.json({ ok: true });
});
