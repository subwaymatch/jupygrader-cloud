// Confirming that a person receives mail at an address: for a new account request, for an
// existing account, and before an account's address changes.
import { domainAllowed, EMAIL_RE, normEmail, notifyAdminsOfRequest, userByEmail } from "./accounts";
import { logActivity } from "./activity";
import { first, run } from "./db";
import { sendEmail } from "./email";
import { appUrl } from "./env";
import { badRequest, notFound } from "./http";
import { newToken, sha256Hex } from "./ids";
import { getSettings } from "./settings";

const HOURS = 24;

type Kind = "confirm" | "change";

async function sendLink(user: { id: string; name: string }, kind: Kind, email: string, req?: Request): Promise<{ sent: boolean }> {
  const token = newToken();
  const now = new Date();
  // One live link of each kind per account: asking again replaces the earlier one.
  await run("delete from email_token where user_id = ? and kind = ?", user.id, kind);
  await run(
    "insert into email_token (token_hash, user_id, kind, email, created_at, expires_at) values (?, ?, ?, ?, ?, ?)",
    await sha256Hex(token),
    user.id,
    kind,
    email,
    now.toISOString(),
    new Date(now.getTime() + HOURS * 3600_000).toISOString(),
  );
  const url = `${appUrl(req)}/confirm-email/${token}`;
  return sendEmail(
    kind === "confirm"
      ? {
          to: email,
          subject: "Confirm your email address for Jupygrader",
          text: `Hi ${user.name},\n\nConfirm that this is your email address to finish setting up your Jupygrader account. The link expires in ${HOURS} hours. If you didn't ask for an account, ignore this email.`,
          action: { label: "Confirm email address", url },
        }
      : {
          to: email,
          subject: "Confirm your new email address for Jupygrader",
          text: `Hi ${user.name},\n\nSomeone asked to use this address for your Jupygrader account. Your account's email changes when you open the link, which expires in ${HOURS} hours. If it wasn't you, ignore this email.`,
          action: { label: "Use this email address", url },
        },
  );
}

/** Emails a link that confirms the account's own address. */
export function sendConfirmation(user: { id: string; name: string; email: string }, req?: Request) {
  return sendLink(user, "confirm", normEmail(user.email), req);
}

/**
 * Starts a change of address. The account keeps its address until the link sent to the new one
 * is opened, so nobody can take an address they don't receive mail at.
 */
export async function requestEmailChange(me: { id: string; name: string; email: string; isAdmin: boolean }, to: string, req?: Request): Promise<{ sent: boolean }> {
  const email = normEmail(to);
  if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");
  const settings = await getSettings();
  if (!me.isAdmin && !domainAllowed(email, settings.domains)) throw badRequest("That address is outside the email domains this site allows.");
  const other = await userByEmail(email);
  if (other && other.id !== me.id) throw badRequest("Another account already uses that email.");
  const r = await sendLink(me, "change", email, req);
  // The current address hears about it too, in case the request wasn't theirs.
  await sendEmail({
    to: me.email,
    subject: "A change to your Jupygrader email address was requested",
    text: `Hi ${me.name},\n\nSomeone asked to change your Jupygrader account's email address to ${email}. Nothing changes unless the link sent to that address is opened. If it wasn't you, change your password.`,
  });
  return r;
}

/** The address an account is waiting to change to, if a link is still live. */
export async function pendingEmailChange(userId: string): Promise<string | null> {
  const row = await first<{ email: string }>(
    "select email from email_token where user_id = ? and kind = 'change' and expires_at > ?",
    userId,
    new Date().toISOString(),
  );
  return row?.email ?? null;
}

export type ConfirmResult = { kind: Kind; email: string; /** The account's state afterwards. */ status: string };

/** Uses a link from a confirmation email. Each link works once. */
export async function confirmEmailToken(token: string): Promise<ConfirmResult> {
  const invalid = () => notFound("This link isn't valid. It may have expired or already been used.");
  if (!/^[A-Za-z0-9]{20,64}$/.test(token)) throw invalid();
  const row = await first<{ token_hash: string; user_id: string; kind: Kind; email: string; expires_at: string }>(
    "select token_hash, user_id, kind, email, expires_at from email_token where token_hash = ?",
    await sha256Hex(token),
  );
  if (!row || row.expires_at <= new Date().toISOString()) throw invalid();
  const user = await first<{ id: string; name: string; email: string; status: string; emailVerified: number }>(
    'select id, name, email, status, "emailVerified" from "user" where id = ?',
    row.user_id,
  );
  if (!user) throw invalid();
  const now = new Date().toISOString();

  if (row.kind === "confirm") {
    // A link for an address the account no longer has confirms nothing.
    if (normEmail(user.email) !== row.email) throw invalid();
    await run(`update "user" set "emailVerified" = 1, "updatedAt" = ? where id = ?`, now, user.id);
    await run("delete from email_token where user_id = ? and kind = 'confirm'", user.id);
    // Admins hear about an account request once its address is known to be the requester's.
    if (user.status === "pending" && !user.emailVerified) await notifyAdminsOfRequest(user.name, user.email);
    return { kind: "confirm", email: row.email, status: user.status };
  }

  const other = await userByEmail(row.email);
  if (other && other.id !== user.id) {
    await run("delete from email_token where token_hash = ?", row.token_hash);
    throw badRequest("Another account already uses that email.");
  }
  await run(`update "user" set email = ?, "emailVerified" = 1, "updatedAt" = ? where id = ?`, row.email, now, user.id);
  // Links for the old address no longer apply.
  await run("delete from email_token where user_id = ?", user.id);
  await logActivity({ type: "people", user, text: `Changed their email to ${row.email}` });
  return { kind: "change", email: row.email, status: user.status };
}

/** Daily: drop links that have expired. */
export async function pruneEmailTokens(): Promise<void> {
  await run("delete from email_token where expires_at <= ?", new Date().toISOString());
}
