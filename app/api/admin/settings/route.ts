import { logActivity } from "@/lib/server/activity";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";
import { getSettingsWithKey, saveSettings, type SiteSettings } from "@/lib/server/settings";

export const PUT = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await readJson<Partial<SiteSettings> & { aiApiKey?: string }>(req);
  const patch: Partial<SiteSettings> & { aiApiKey?: string } = {};
  if (b.openReg !== undefined) patch.openReg = !!b.openReg;
  if (b.domains !== undefined) patch.domains = String(b.domains).slice(0, 1000);
  if (b.aiBaseUrl !== undefined) {
    const u = String(b.aiBaseUrl).trim();
    if (!/^https?:\/\/\S+$/.test(u)) throw badRequest("Enter the API address as a URL, such as https://api.openai.com/v1.");
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
  if (b.reasoningEffort !== undefined) {
    if (!["", "minimal", "low", "medium", "high"].includes(b.reasoningEffort)) throw badRequest("Unknown reasoning effort.");
    patch.reasoningEffort = b.reasoningEffort;
  }
  await saveSettings(patch);
  await logActivity({ type: "settings", user: me, text: `Changed site settings: ${Object.keys(patch).map((k) => (k === "aiApiKey" ? "API key" : k)).join(", ")}` });
  const s = await getSettingsWithKey();
  return Response.json({ ...s, aiApiKey: undefined, aiKeyLast4: s.aiApiKey.slice(-4) });
});
