import type { Role } from "@/lib/shared/constants";
import type { Me } from "@/lib/shared/types";
import { logActivity } from "./activity";
import { getAuth } from "./auth";
import { all, first, run } from "./db";
import { sendEmail } from "./email";
import { appUrl } from "./env";
import { badRequest } from "./http";
import { newId, newToken } from "./ids";
import { getSettings } from "./settings";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normEmail = (e: string) => String(e || "").trim().toLowerCase();

export async function countUsers(): Promise<number> {
  return (await first<{ n: number }>('select count(*) n from "user"'))?.n ?? 0;
}

export async function userByEmail(email: string) {
  return first<{ id: string; name: string; email: string; status: string; isAdmin: number }>(
    'select id, name, email, status, isAdmin from "user" where lower(email) = ?',
    normEmail(email),
  );
}

export function checkPassword(password: string) {
  if (!password || password.length < 8) throw badRequest("Password must be at least 8 characters.");
  if (password.length > 128) throw badRequest("Password must be 128 characters or fewer.");
}

/** Creates an account with an email and password through better-auth's adapter. */
export async function createUserWithPassword(opts: {
  name: string;
  email: string;
  password: string;
  status: "active" | "pending";
  isAdmin?: boolean;
}): Promise<string> {
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(opts.password);
  const user = await ctx.internalAdapter.createUser({
    name: opts.name.trim(),
    email: normEmail(opts.email),
    emailVerified: false,
    isAdmin: !!opts.isAdmin,
    status: opts.status,
    notifyEmail: true,
  }, { method: "email-password" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  return user.id;
}

export async function setPassword(userId: string, password: string) {
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(password);
  const existing = await first<{ id: string }>("select id from account where userId = ? and providerId = 'credential'", userId);
  if (existing) await ctx.internalAdapter.updatePassword(userId, hash);
  else await ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
}

/** Signs in with email and password and returns better-auth's response (with session cookies). */
export async function signInResponse(req: Request, email: string, password: string): Promise<Response> {
  return getAuth().api.signInEmail({ body: { email: normEmail(email), password }, headers: req.headers, asResponse: true });
}

export function domainAllowed(email: string, domains: string): boolean {
  const list = domains
    .split(/[\s,]+/)
    .map((d) => d.replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  const dm = (email.split("@")[1] || "").toLowerCase();
  return list.includes(dm);
}

export async function notifyAdminsOfRequest(name: string, email: string) {
  const admins = await all<{ email: string }>('select email from "user" where isAdmin = 1 and status = \'active\'');
  for (const a of admins) {
    await sendEmail({
      to: a.email,
      subject: `${name} requested an instructor account`,
      text: `${name} (${email}) asked for a Jupygrader instructor account. Approve or decline the request in Admin > Overview.`,
      action: { label: "Review the request", url: `${appUrl()}/admin` },
    });
  }
}

const INVITE_DAYS = 14;

export type InviteResult = { added: string[]; invited: string[]; skipped: { email: string; reason: string }[] };

/**
 * Adds people to a course. People with an account join right away; everyone
 * else gets an email invitation that expires in 14 days.
 */
export async function inviteToCourse(opts: {
  emails: string[];
  courseId: string;
  courseName: string;
  role: Role;
  message: string;
  by: Me;
}): Promise<InviteResult> {
  const out: InviteResult = { added: [], invited: [], skipped: [] };
  const now = new Date();
  const settings = await getSettings();
  for (const raw of opts.emails) {
    const email = normEmail(raw);
    if (!EMAIL_RE.test(email)) {
      out.skipped.push({ email: raw, reason: "Not a valid email address." });
      continue;
    }
    if (!domainAllowed(email, settings.domains)) {
      out.skipped.push({ email, reason: "Outside the allowed email domains." });
      continue;
    }
    const user = await userByEmail(email);
    if (user && user.status === "active") {
      const existing = await first<{ role: string }>("select role from enrollment where course_id = ? and user_id = ?", opts.courseId, user.id);
      if (existing) {
        out.skipped.push({ email, reason: `Already a ${existing.role} in this course.` });
        continue;
      }
      await run(
        "insert into enrollment (course_id, user_id, role, created_at) values (?, ?, ?, ?)",
        opts.courseId,
        user.id,
        opts.role,
        now.toISOString(),
      );
      out.added.push(email);
      await sendEmail({
        to: email,
        subject: `You were added to ${opts.courseName}`,
        text: `${opts.by.name} added you to ${opts.courseName} on Jupygrader as ${opts.role}.${opts.message ? "\n\n" + opts.message : ""}`,
        action: { label: "Open Jupygrader", url: `${appUrl()}/courses/${opts.courseId}` },
      });
      continue;
    }
    const token = newToken();
    const expires = new Date(now.getTime() + INVITE_DAYS * 86400_000).toISOString();
    const pending = await first<{ id: string }>(
      "select id from invitation where lower(email) = ? and course_id = ? and status = 'pending'",
      email,
      opts.courseId,
    );
    if (pending) {
      await run(
        "update invitation set token = ?, role = ?, message = ?, invited_by = ?, sent_at = ?, expires_at = ? where id = ?",
        token,
        opts.role,
        opts.message,
        opts.by.id,
        now.toISOString(),
        expires,
        pending.id,
      );
    } else {
      await run(
        `insert into invitation (id, token, email, course_id, role, message, invited_by, status, created_at, sent_at, expires_at)
         values (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        newId(),
        token,
        email,
        opts.courseId,
        opts.role,
        opts.message,
        opts.by.id,
        now.toISOString(),
        now.toISOString(),
        expires,
      );
    }
    await sendInviteEmail({ email, token, courseName: opts.courseName, role: opts.role, message: opts.message, inviter: opts.by.name });
    out.invited.push(email);
  }
  if (out.added.length || out.invited.length) {
    const who = [...out.added, ...out.invited];
    await logActivity({
      type: "people",
      user: opts.by,
      courseId: opts.courseId,
      text: `Invited ${who.length > 3 ? who.length + " people" : who.join(", ")} to ${opts.courseName} as ${opts.role}`,
    });
  }
  return out;
}

export async function sendInviteEmail(i: { email: string; token: string; courseName: string; role: string; message: string; inviter: string }) {
  return sendEmail({
    to: i.email,
    subject: `${i.inviter} invited you to ${i.courseName} on Jupygrader`,
    text: `${i.inviter} invited you to join ${i.courseName} as ${i.role} on Jupygrader, where you'll ${i.role === "Teacher" ? "set up assignments and review AI-graded work" : "upload student work for AI grading and review the feedback"}.${i.message ? "\n\n" + i.message : ""}\n\nThe invitation expires in ${INVITE_DAYS} days.`,
    action: { label: "Accept invitation", url: `${appUrl()}/invite/${i.token}` },
  });
}

export type InvitationView = {
  id: string;
  email: string;
  role: Role;
  message: string;
  courseId: string;
  courseName: string;
  inviter: string;
  valid: boolean;
  hasAccount: boolean;
};

export async function invitationByToken(token: string): Promise<InvitationView | null> {
  const row = await first<{
    id: string;
    email: string;
    role: Role;
    message: string;
    course_id: string;
    status: string;
    expires_at: string;
    course_name: string;
    inviter: string | null;
  }>(
    `select i.*, c.name course_name, u.name inviter from invitation i
       join course c on c.id = i.course_id
       left join "user" u on u.id = i.invited_by
      where i.token = ?`,
    token,
  );
  if (!row) return null;
  const valid = row.status === "pending" && row.expires_at > new Date().toISOString();
  const account = await userByEmail(row.email);
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    message: row.message,
    courseId: row.course_id,
    courseName: row.course_name,
    inviter: row.inviter || "Your instructor",
    valid,
    hasAccount: !!account && account.status === "active",
  };
}

export async function acceptInvitation(inv: InvitationView, userId: string, userName: string) {
  const now = new Date().toISOString();
  await run(
    "insert into enrollment (course_id, user_id, role, created_at) values (?, ?, ?, ?) on conflict(course_id, user_id) do nothing",
    inv.courseId,
    userId,
    inv.role,
    now,
  );
  await run("update invitation set status = 'accepted', accepted_at = ?, accepted_by = ? where id = ?", now, userId, inv.id);
  await logActivity({ type: "people", user: { id: userId, name: userName }, courseId: inv.courseId, text: `Joined ${inv.courseName} as ${inv.role}` });
}
