import { logActivity } from "@/lib/server/activity";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettings, getSettingsWithKey, saveSettings, type SiteSettings } from "@/lib/server/settings";
import { AI_PROVIDERS, isAiProvider, type Effort } from "@/lib/shared/constants";

export const PUT = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await readJson<Partial<SiteSettings> & { aiApiKey?: string }>(req);
  const patch: Partial<SiteSettings> & { aiApiKey?: string } = {};
  const current = await getSettings();
  if (b.openReg !== undefined) patch.openReg = !!b.openReg;
  if (b.domains !== undefined) patch.domains = String(b.domains).slice(0, 1000);
  if (b.aiProvider !== undefined) {
    if (!isAiProvider(b.aiProvider)) throw badRequest("Choose an AI provider.");
    patch.aiProvider = b.aiProvider;
  }
  const provider = AI_PROVIDERS[patch.aiProvider ?? current.aiProvider];
  if (b.aiBaseUrl !== undefined) {
    const u = String(b.aiBaseUrl).trim();
    if (!/^https?:\/\/\S+$/.test(u)) throw badRequest(`Enter the API address as a URL, such as ${provider.baseUrl}.`);
    patch.aiBaseUrl = u.replace(/\/+$/, "");
  }
  if (b.aiApiKey !== undefined && b.aiApiKey !== "") patch.aiApiKey = String(b.aiApiKey).trim();
  if (b.model !== undefined) {
    const m = String(b.model).trim();
    if (!m) throw badRequest("Choose a model.");
    patch.model = m.slice(0, 200);
  }
  for (const k of ["rateInput", "rateCached", "rateOutput", "cap"] as const) {
    if (b[k] !== undefined) {
      const v = Number(b[k]);
      if (!(v >= 0)) throw badRequest("Rates and the spending cap must be 0 or more.");
      patch[k] = v;
    }
  }
  if (b.capOn !== undefined) patch.capOn = !!b.capOn;
  if (b.sendImages !== undefined) patch.sendImages = !!b.sendImages;
  if (b.sendInteractive !== undefined) patch.sendInteractive = !!b.sendInteractive;
  if (b.concurrency !== undefined) {
    const v = Math.round(Number(b.concurrency));
    if (!(v >= 1 && v <= 20)) throw badRequest("Files graded at once must be between 1 and 20.");
    patch.concurrency = v;
  }
  if (b.retention !== undefined) {
    const v = Math.round(Number(b.retention));
    if (![30, 90, 180, 365].includes(v)) throw badRequest("Choose a retention period.");
    patch.retention = v;
  }
  const efforts: readonly string[] = provider.efforts;
  if (b.reasoningEffort !== undefined) {
    if (b.reasoningEffort !== "" && !efforts.includes(b.reasoningEffort)) throw badRequest(`${provider.label} APIs don't take this reasoning effort.`);
    patch.reasoningEffort = b.reasoningEffort as "" | Effort;
  } else if (current.reasoningEffort && !efforts.includes(current.reasoningEffort)) {
    patch.reasoningEffort = "";
  }
  await saveSettings(patch);
  await logActivity({ type: "settings", user: me, text: `Changed site settings: ${Object.keys(patch).map((k) => (k === "aiApiKey" ? "API key" : k)).join(", ")}` });
  const s = await getSettingsWithKey();
  return Response.json({ ...s, aiApiKey: undefined, aiKeyLast4: s.aiApiKey.slice(-4) });
});
