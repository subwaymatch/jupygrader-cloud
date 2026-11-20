import { confirmEmailToken } from "@/lib/server/email-confirm";
import { handle } from "@/lib/server/http";
import { clientIp, limit } from "@/lib/server/rate-limit";

/** Uses a link from a confirmation email. The page it opens posts here, so a mail scanner that only fetches the link changes nothing. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  await limit(`confirm-token:${clientIp(req)}`, { window: 600, max: 30 });
  const { token } = await ctx.params;
  return Response.json(await confirmEmailToken(token));
});
