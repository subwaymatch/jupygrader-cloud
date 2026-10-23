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
import { badRequest, forbidden, handle, readJson } from "@/lib/server/http";
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
  if (await userByEmail(email)) throw badRequest("An account with that email already exists.");

  if (firstRun) {
    // The first account runs the site.
    const id = await createUserWithPassword({ name, email, password, status: "active", isAdmin: true });
    await logActivity({ type: "people", user: { id, name }, text: "Created the first administrator account" });
    const signIn = await signInResponse(req, email, password);
    return withCookies(signIn, { status: "active" });
  }
  const pending = (await first<{ n: number }>(`select count(*) n from "user" where status = 'pending'`))?.n ?? 0;
  if (pending >= 100) throw forbidden("There are too many account requests waiting for review. Try again later.");
  const id = await createUserWithPassword({ name, email, password, status: "pending" });
  await logActivity({ type: "people", user: { id, name }, text: `Requested an instructor account (${email})` });
  await notifyAdminsOfRequest(name, email);
  return Response.json({ status: "pending" });
});
