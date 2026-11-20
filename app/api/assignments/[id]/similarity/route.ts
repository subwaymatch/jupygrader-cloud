import { requireAssignment } from "@/lib/server/access";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { recheckSimilarity } from "@/lib/server/submissions";

/**
 * Compares an assignment's files with each other again, a batch per request, after its starter
 * file changed. The page calls it with the `next` it got back until `next` is null.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg } = await requireAssignment(me, id, "manage", true);
  const { after } = await readJson<{ after?: string | null }>(req);
  return Response.json(await recheckSimilarity(asg, typeof after === "string" ? after : null));
});
