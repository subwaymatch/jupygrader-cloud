import { sendConfirmation } from "@/lib/server/email-confirm";
import { handle } from "@/lib/server/http";
import { limit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

/** Emails the signed-in person a link that confirms their address. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req);
  if (me.emailVerified) return Response.json({ ok: true, alreadyConfirmed: true });
  await limit(`confirm-email:${me.id}`, { window: 3600, max: 5 }, "You've asked for several links already.");
  const { sent } = await sendConfirmation(me, req);
  return Response.json({ ok: true, emailed: sent });
});
