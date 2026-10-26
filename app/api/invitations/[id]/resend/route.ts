import { requireCourse } from "@/lib/server/access";
import { sendInviteEmail } from "@/lib/server/accounts";
import { logActivity } from "@/lib/server/activity";
import { first, run } from "@/lib/server/db";
import { emailConfigured } from "@/lib/server/email";
import { appUrl } from "@/lib/server/env";
import { badRequest, handle, notFound } from "@/lib/server/http";
import { newToken } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";

/** Sends a pending or expired invitation again with a fresh link. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const inv = await first<{ course_id: string; email: string; status: string; role: string; message: string }>(
    "select course_id, email, status, role, message from invitation where id = ?",
    id,
  );
  if (!inv) throw notFound("Invitation not found.");
  const { course } = await requireCourse(me, inv.course_id, "manage", true);
  if (inv.status === "accepted") throw badRequest("This invitation was already accepted.");
  const token = newToken();
  const now = new Date();
  await run(
    "update invitation set token = ?, status = 'pending', sent_at = ?, expires_at = ?, invited_by = ? where id = ?",
    token,
    now.toISOString(),
    new Date(now.getTime() + 14 * 86400_000).toISOString(),
    me.id,
    id,
  );
  await sendInviteEmail({ email: inv.email, token, courseName: course.name, role: inv.role, message: inv.message, inviter: me.name });
  await logActivity({ type: "people", user: me, courseId: inv.course_id, text: `Resent the invitation for ${inv.email} to ${course.name}` });
  return Response.json({ ok: true, link: `${appUrl(req)}/invite/${token}`, emailed: emailConfigured() });
});
