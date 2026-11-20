import {
  EMAIL_RE,
  checkPassword,
  countUsers,
  createUserWithPassword,
  domainAllowed,
  normEmail,
  notifyAdminsOfRequest,
  signInResponse,
  userByEmail,
} from "@/lib/server/accounts";
import { logActivity } from "@/lib/server/activity";
import { first } from "@/lib/server/db";
import { emailConfigured } from "@/lib/server/email";
import { sendConfirmation } from "@/lib/server/email-confirm";
import { badRequest, forbidden, handle, readJson } from "@/lib/server/http";
import { clientIp, limit } from "@/lib/server/rate-limit";
import { getSettings } from "@/lib/server/settings";

/** Copies session cookies from a better-auth response onto a JSON response. */
function withCookies(from: Response, data: unknown): Response {
  const res = Response.json(data);
  for (const c of from.headers.getSetCookie()) res.headers.append("Set-Cookie", c);
  return res;
}

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ name?: string; email?: string; password?: string }>(req);
  const name = String(body.name || "").trim();
  const email = normEmail(body.email || "");
  const password = String(body.password || "");
  const firstRun = (await countUsers()) === 0;
  const settings = await getSettings();
  if (!firstRun && !settings.openReg) throw forbidden("Registration is closed. Ask an administrator for an invitation.");
  if (!name) throw badRequest("Enter your name.");
  if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");
  if (!firstRun && !domainAllowed(email, settings.domains)) {
    const list = settings.domains.split(/[\s,]+/).filter(Boolean).map((d) => "@" + d.replace(/^@/, ""));
    throw badRequest(`Registration is limited to ${list.join(", ")} addresses.`);
  }
  checkPassword(password);
  // Each request can send email, so one address can only make a few.
  if (!firstRun) await limit(`register:${clientIp(req)}`, { window: 3600, max: 5 }, "Too many account requests from this network.");
  const existing = await userByEmail(email);
  if (existing?.status === "pending" && !existing.emailVerified) {
    // Asking again for a request that was never confirmed sends the link again. Nothing about the request changes.
    await limit(`confirm-email:${existing.id}`, { window: 3600, max: 5 }, "Several links were sent to this address already.");
    await sendConfirmation(existing, req);
    return Response.json({ status: "pending", confirm: emailConfigured() });
  }
  if (existing) throw badRequest("An account with that email already exists.");

  if (firstRun) {
    // The first account runs the site.
    const id = await createUserWithPassword({ name, email, password, status: "active", isAdmin: true, emailVerified: true });
    await logActivity({ type: "people", user: { id, name }, text: "Created the first administrator account" });
    const signIn = await signInResponse(req, email, password);
    return withCookies(signIn, { status: "active" });
  }
  const pending = (await first<{ n: number }>(`select count(*) n from "user" where status = 'pending'`))?.n ?? 0;
  if (pending >= 100) throw forbidden("There are too many account requests waiting for review. Try again later.");
  const id = await createUserWithPassword({ name, email, password, status: "pending" });
  await logActivity({ type: "people", user: { id, name }, text: `Requested an instructor account (${email})` });
  // Anyone can type any address here. The request is the address owner's once they open the link sent to it,
  // and admins are told then. Without email set up, no link can arrive, so admins are told straight away and
  // see the request marked as unconfirmed.
  let linkSent = emailConfigured();
  try {
    await sendConfirmation({ id, name, email }, req);
  } catch (err) {
    // The request itself is saved. Without a link it's handled like a site with no email: admins see it as unconfirmed.
    console.error("Could not send the confirmation link", err);
    linkSent = false;
  }
  if (!linkSent) await notifyAdminsOfRequest(name, email);
  return Response.json({ status: "pending", confirm: linkSent });
});
