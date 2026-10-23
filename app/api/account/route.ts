import { EMAIL_RE, normEmail, userByEmail } from "@/lib/server/accounts";
import { logActivity } from "@/lib/server/activity";
import { first, run } from "@/lib/server/db";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const PATCH = handle(async (req: Request) => {
  const me = await requireUser(req);
  const b = await readJson<{ name?: string; email?: string; notifyEmail?: boolean }>(req);
  if (b.name !== undefined) {
    const n = String(b.name).trim();
    if (!n) throw badRequest("Enter your name.");
    await run(`update "user" set name = ?, "updatedAt" = ? where id = ?`, n.slice(0, 120), new Date().toISOString(), me.id);
  }
  if (b.email !== undefined) {
    const e = normEmail(b.email);
    if (!EMAIL_RE.test(e)) throw badRequest("Enter a valid email address.");
    if (e !== me.email.toLowerCase()) {
      const other = await userByEmail(e);
      if (other && other.id !== me.id) throw badRequest("Another account already uses that email.");
      await run(`update "user" set email = ?, "emailVerified" = 0, "updatedAt" = ? where id = ?`, e, new Date().toISOString(), me.id);
      await logActivity({ type: "people", user: me, text: `Changed their email to ${e}` });
    }
  }
  if (b.notifyEmail !== undefined) await run(`update "user" set "notifyEmail" = ? where id = ?`, !!b.notifyEmail, me.id);
  return Response.json({ ok: true });
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
