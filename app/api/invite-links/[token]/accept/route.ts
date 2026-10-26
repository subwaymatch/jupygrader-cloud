import {
  acceptInvitation,
  checkPassword,
  createUserWithPassword,
  invitationByToken,
  setPassword,
  signInResponse,
  userByEmail,
} from "@/lib/server/accounts";
import { run } from "@/lib/server/db";
import { badRequest, handle, notFound, readJson } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const inv = await invitationByToken(token);
  if (!inv || !inv.valid) throw notFound("This invitation isn't valid. It may have expired, been revoked, or already been used.");

  // Signed in as the invited address: join right away.
  const me = await getSessionUser(req.headers);
  if (me) {
    if (me.email.toLowerCase() !== inv.email.toLowerCase())
      throw badRequest(`This invitation is for ${inv.email}. Sign out, then sign in with that address to accept it.`);
    await acceptInvitation(inv, me.id, me.name);
    return Response.json({ courseId: inv.courseId });
  }

  const body = await readJson<{ name?: string; password?: string }>(req);
  const existing = await userByEmail(inv.email);
  if (existing?.status === "active") throw badRequest("You already have an account. Sign in to accept the invitation.");
  const name = String(body.name || "").trim();
  if (!name) throw badRequest("Enter your name.");
  const password = String(body.password || "");
  checkPassword(password);

  let userId: string;
  if (existing) {
    // A pending instructor request for the same address: the invitation vouches for them.
    await run(`update "user" set status = 'active', name = ? where id = ?`, name, existing.id);
    await setPassword(existing.id, password);
    userId = existing.id;
  } else {
    userId = await createUserWithPassword({ name, email: inv.email, password, status: "active" });
  }
  await acceptInvitation(inv, userId, name);
  const signIn = await signInResponse(req, inv.email, password);
  const res = Response.json({ courseId: inv.courseId });
  for (const c of signIn.headers.getSetCookie()) res.headers.append("Set-Cookie", c);
  return res;
});
