import { EMAIL_RE, normEmail, passwordMatches } from "@/lib/server/accounts";
import { logActivity } from "@/lib/server/activity";
import { first, run } from "@/lib/server/db";
import { requestEmailChange } from "@/lib/server/email-confirm";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { limit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const PATCH = handle(async (req: Request) => {
  const me = await requireUser(req);
  const b = await readJson<{ name?: string; email?: string; password?: string; notifyEmail?: boolean }>(req);
  const newName = b.name === undefined ? null : String(b.name).trim();
  if (newName === "") throw badRequest("Enter your name.");
  // The address changes only once the link sent to the new one is opened (lib/server/email-confirm.ts).
  let emailPending: string | null = null;
  let emailed = false;
  if (b.email !== undefined) {
    const e = normEmail(b.email);
    if (!EMAIL_RE.test(e)) throw badRequest("Enter a valid email address.");
    if (e !== me.email.toLowerCase()) {
      await limit(`change-email:${me.id}`, { window: 3600, max: 5 }, "You've asked to change your email several times already.");
      // The email address is how an account is recovered, so changing it takes the password, not just a signed-in browser.
      if (!b.password) throw badRequest("Enter your current password to change your email.");
      if (!(await passwordMatches(me.id, String(b.password)))) throw badRequest("That isn't your current password.");
      emailed = (await requestEmailChange(me, e, req)).sent;
      emailPending = e;
    }
  }
  if (newName) await run(`update "user" set name = ?, "updatedAt" = ? where id = ?`, newName.slice(0, 120), new Date().toISOString(), me.id);
  if (b.notifyEmail !== undefined) await run(`update "user" set "notifyEmail" = ? where id = ?`, !!b.notifyEmail, me.id);
  return Response.json({ ok: true, emailPending, emailed });
});

export const DELETE = handle(async (req: Request) => {
  const me = await requireUser(req);
  if (me.isAdmin) {
    const admins = (await first<{ n: number }>(`select count(*) n from "user" where isAdmin = 1 and status = 'active'`))?.n ?? 0;
    if (admins <= 1) throw badRequest("You're the only administrator. Make someone else an admin before deleting your account.");
  }
  const sole = await first<{ name: string }>(
    `select c.name from enrollment e join course c on c.id = e.course_id
      where e.user_id = ? and e.role = 'Teacher'
        and (select count(*) from enrollment x where x.course_id = e.course_id and x.role = 'Teacher') = 1 limit 1`,
    me.id,
  );
  if (sole) throw badRequest(`You're the only Teacher in ${sole.name}. Add another Teacher or delete the course first.`);
  await logActivity({ type: "people", user: me, text: `Deleted their account (${me.email})` });
  await run('delete from "user" where id = ?', me.id);
  return Response.json({ ok: true });
});
