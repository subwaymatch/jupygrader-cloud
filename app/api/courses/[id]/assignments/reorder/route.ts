import { requireCourse } from "@/lib/server/access";
import { batch, stmt } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  await requireCourse(me, id, "manage", true);
  const { ids } = await readJson<{ ids?: string[] }>(req);
  await batch((ids || []).map((aid, i) => stmt("update assignment set position = ? where id = ? and course_id = ?", i + 1, aid, id)));
  return Response.json({ ok: true });
});
