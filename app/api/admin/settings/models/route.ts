import { AiError, listModels } from "@/lib/server/ai";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettingsWithKey } from "@/lib/server/settings";

/** Lists models from the provider, using unsaved form values when given. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const b = await readJson<{ aiBaseUrl?: string; aiApiKey?: string }>(req);
  const s = await getSettingsWithKey();
  const key = b.aiApiKey || s.aiApiKey;
  if (!key) throw badRequest("Enter an API key first.");
  try {
    return Response.json({ models: await listModels(b.aiBaseUrl || s.aiBaseUrl, key) });
  } catch (err) {
    if (err instanceof AiError) throw badRequest(err.message);
    throw badRequest("Couldn't list models from this API.");
  }
});
