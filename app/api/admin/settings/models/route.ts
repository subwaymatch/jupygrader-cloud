import { AiError, listModels } from "@/lib/server/ai";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettingsWithKey } from "@/lib/server/settings";
import { isAiProvider } from "@/lib/shared/constants";

/** Lists models from the provider, using unsaved form values when given. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const b = await readJson<{ aiProvider?: string; aiBaseUrl?: string; aiApiKey?: string }>(req);
  const s = await getSettingsWithKey();
  const key = b.aiApiKey || s.aiApiKey;
  if (!key) throw badRequest("Enter an API key first.");
  try {
    const provider = isAiProvider(b.aiProvider) ? b.aiProvider : s.aiProvider;
    return Response.json({ models: await listModels(provider, b.aiBaseUrl || s.aiBaseUrl, key) });
  } catch (err) {
    if (err instanceof AiError) throw badRequest(err.message);
    throw badRequest("Couldn't list models from this API.");
  }
});
