import { AiError, chatJson } from "@/lib/server/ai";
import { badRequest, handle } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettingsWithKey } from "@/lib/server/settings";

/** Sends a tiny structured-output request to check the saved API settings. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const s = await getSettingsWithKey();
  const started = Date.now();
  try {
    const r = await chatJson<{ ok: boolean }>({
      settings: s,
      schemaName: "ping",
      schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
      messages: [
        { role: "system", content: "Reply with JSON." },
        { role: "user", content: 'Return {"ok": true}.' },
      ],
      timeoutMs: 60_000,
    });
    return Response.json({ ok: true, model: r.model, ms: Date.now() - started, tokens: r.usage.input + r.usage.output });
  } catch (err) {
    if (err instanceof AiError) throw badRequest(err.message);
    throw err;
  }
});
