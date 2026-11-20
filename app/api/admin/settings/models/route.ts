import { AiError, listModels } from "@/lib/server/ai";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettingsWithKey } from "@/lib/server/settings";
import { apiOrigin, insecureApiAddress, isAiProvider, KEY_NEEDED_FOR_NEW_ADDRESS } from "@/lib/shared/constants";

/** Lists models from the provider, using unsaved form values when given. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const b = await readJson<{ aiProvider?: string; aiBaseUrl?: string; aiApiKey?: string }>(req);
  const s = await getSettingsWithKey();
  const base = String(b.aiBaseUrl || s.aiBaseUrl).trim();
  // The saved key only goes to the address it was saved for (see the settings route).
  const moved = apiOrigin(base) !== apiOrigin(s.aiBaseUrl);
  if (moved && !b.aiApiKey && s.aiApiKey) throw badRequest(KEY_NEEDED_FOR_NEW_ADDRESS);
  if (base !== s.aiBaseUrl && insecureApiAddress(base)) throw badRequest("Use an https:// address. Plain http:// would send the API key unencrypted.");
  const key = b.aiApiKey || s.aiApiKey;
  if (!key) throw badRequest("Enter an API key first.");
  try {
    const provider = isAiProvider(b.aiProvider) ? b.aiProvider : s.aiProvider;
    return Response.json({ models: await listModels(provider, base, key) });
  } catch (err) {
    if (err instanceof AiError) throw badRequest(err.message);
    throw badRequest("Couldn't list models from this API.");
  }
});
