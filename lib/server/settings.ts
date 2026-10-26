import { AI_PROVIDERS, isAiProvider, type AiProvider, type Effort } from "@/lib/shared/constants";
import { all, run } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { getEnv } from "./env";

export type { AiProvider } from "@/lib/shared/constants";

export type SiteSettings = {
  openReg: boolean;
  domains: string;
  aiProvider: AiProvider;
  aiBaseUrl: string;
  model: string;
  /** Extra model names offered in the picker. */
  models: string[];
  /** Estimated USD per million tokens. */
  rateInput: number;
  rateCached: number;
  rateOutput: number;
  cap: number;
  capOn: boolean;
  concurrency: number;
  retention: number;
  sendImages: boolean;
  sendInteractive: boolean;
  reasoningEffort: "" | Effort;
};

export type SiteSettingsWithKey = SiteSettings & { aiApiKey: string; aiKeySource: "settings" | "env" | "none" };

export function defaultSettings(): SiteSettings {
  const env = getEnv();
  const aiProvider = isAiProvider(env.AI_PROVIDER) ? env.AI_PROVIDER : "openai";
  const p = AI_PROVIDERS[aiProvider];
  return {
    openReg: true,
    domains: "",
    aiProvider,
    aiBaseUrl: env.AI_BASE_URL || p.baseUrl,
    model: env.AI_MODEL || p.model,
    models: [],
    ...p.rates,
    cap: 100,
    capOn: true,
    concurrency: 3,
    retention: 180,
    sendImages: false,
    sendInteractive: false,
    reasoningEffort: "",
  };
}

export async function getSettings(): Promise<SiteSettings> {
  const rows = await all<{ key: string; value: string }>("select key, value from setting where key != 'aiApiKey'");
  const s = defaultSettings() as Record<string, unknown>;
  for (const r of rows) {
    if (!(r.key in s)) continue;
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore bad values */
    }
  }
  return s as SiteSettings;
}

export async function getSettingsWithKey(): Promise<SiteSettingsWithKey> {
  const s = await getSettings();
  const row = await all<{ value: string }>("select value from setting where key = 'aiApiKey'");
  const stored = row[0] ? await decryptSecret(JSON.parse(row[0].value)) : "";
  const envKey = getEnv().AI_API_KEY || "";
  return { ...s, aiApiKey: stored || envKey, aiKeySource: stored ? "settings" : envKey ? "env" : "none" };
}

export async function saveSettings(patch: Partial<SiteSettings> & { aiApiKey?: string }): Promise<void> {
  const now = new Date().toISOString();
  const defaults = defaultSettings() as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "aiApiKey") {
      const enc = await encryptSecret(String(value || ""));
      await run(
        "insert into setting (key, value, updated_at) values ('aiApiKey', ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
        JSON.stringify(enc),
        now,
      );
      continue;
    }
    if (!(key in defaults)) continue;
    await run(
      "insert into setting (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
      key,
      JSON.stringify(value),
      now,
    );
  }
}

/** Cache writes (only the Anthropic client reports them) cost 1.25 times the input rate. They are already counted once in `input`. */
export function costOf(
  u: { input: number; cached: number; cacheWrite?: number; output: number },
  s: Pick<SiteSettings, "rateInput" | "rateCached" | "rateOutput">,
) {
  const writePremium = (u.cacheWrite ?? 0) * s.rateInput * 0.25;
  return ((Math.max(0, u.input - u.cached) * s.rateInput + writePremium + u.cached * s.rateCached + u.output * s.rateOutput) / 1e6) || 0;
}

export function monthStartIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function monthUsage(): Promise<{ cost: number; input: number; cached: number; output: number; reasoning: number }> {
  const rows = await all<{ cost: number; input: number; cached: number; output: number; reasoning: number }>(
    `select coalesce(sum(cost_usd),0) cost, coalesce(sum(input_tokens),0) input, coalesce(sum(cached_tokens),0) cached,
            coalesce(sum(output_tokens),0) output, coalesce(sum(reasoning_tokens),0) reasoning
       from ai_usage where at >= ?`,
    monthStartIso(),
  );
  return rows[0] ?? { cost: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
}
