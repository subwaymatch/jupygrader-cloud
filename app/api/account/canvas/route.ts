import { connectCanvas, disconnectCanvas } from "@/lib/server/canvas";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** Connects the signed-in person's Canvas account with a personal access token. */
export const PUT = handle(async (req: Request) => {
  const me = await requireUser(req);
  const b = await readJson<{ token?: string }>(req);
  return Response.json(await connectCanvas(me.id, String(b.token || "")));
});

export const DELETE = handle(async (req: Request) => {
  const me = await requireUser(req);
  await disconnectCanvas(me.id);
  return Response.json({ ok: true });
});
