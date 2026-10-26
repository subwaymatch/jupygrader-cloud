import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { first, run } from "@/lib/server/db";
import { handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** Revokes a pending invitation. */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const inv = await first<{ course_id: string; email: string; status: string }>("select course_id, email, status from invitation where id = ?", id);
  if (!inv) throw notFound("Invitation not found.");
  const { course } = await requireCourse(me, inv.course_id, "manage");
  if (inv.status === "pending") {
    await run("update invitation set status = 'revoked' where id = ?", id);
    await logActivity({ type: "people", user: me, courseId: inv.course_id, text: `Revoked the invitation for ${inv.email} to ${course.name}` });
  } else {
    await run("delete from invitation where id = ?", id);
  }
  return Response.json({ ok: true });
});
