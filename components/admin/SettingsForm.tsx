"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { AffixInput, Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { AI_PROVIDERS, EFFORTS, RETENTION_OPTIONS, type AiProvider } from "@/lib/shared/constants";
import { fmtTokens, fmtUsd } from "@/lib/shared/format";
import type { SiteSettings } from "@/lib/server/settings";

type Props = {
  initial: SiteSettings;
  keyInfo: { source: "settings" | "env" | "none"; last4: string };
  usage: { cost: number; input: number; cached: number; output: number };
  emailOn: boolean;
};

export function SettingsForm({ initial, keyInfo, usage, emailOn }: Props) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "models" | "test">("");
  const set = (p: Partial<SiteSettings>) => setS((cur) => ({ ...cur, ...p }));
  const pct = s.cap > 0 ? Math.min(100, (usage.cost / s.cap) * 100) : 0;
  const provider = AI_PROVIDERS[s.aiProvider];
  const anthropic = s.aiProvider === "anthropic";
  const keyFromOtherProvider = s.aiProvider !== initial.aiProvider && keyInfo.source !== "none" && !apiKey;

  function switchProvider(aiProvider: AiProvider) {
    if (aiProvider === s.aiProvider) return;
    const p = AI_PROVIDERS[aiProvider];
    set({ aiProvider, aiBaseUrl: p.baseUrl, model: p.model, reasoningEffort: "", ...p.rates });
    setModels([]);
  }

  async function save() {
    setBusy("save");
    try {
      await api("/api/admin/settings", { method: "PUT", body: { ...s, aiApiKey: apiKey || undefined } });
      setApiKey("");
      toast("Settings saved");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function loadModels() {
    setBusy("models");
    try {
      const r = await api<{ models: string[] }>("/api/admin/settings/models", { body: { aiProvider: s.aiProvider, aiBaseUrl: s.aiBaseUrl, aiApiKey: apiKey || undefined } });
      setModels(r.models);
      toast(r.models.length ? `Found ${r.models.length} models` : "The API returned no models");
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    try {
      const r = await api<{ model: string; ms: number }>("/api/admin/settings/test", { method: "POST" });
      toast(`It works. ${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.`);
    } catch (err) {
      toast(errorMessage(err), { error: true, timeout: 9000 });
    } finally {
      setBusy("");
    }
  }

  const modelOptions = [...new Set([s.model, ...s.models, ...models].filter(Boolean))].sort();

  return (
    <div className="form" style={{ gap: 0 }}>
      <section className="settings-section">
        <h2 className="h2">Registration</h2>
        <Checkbox
          checked={s.openReg}
          onChange={(v) => set({ openReg: v })}
          label="Open registration"
          description="Instructors can request an account. Each request waits for an admin to approve it, and new accounts have no course access until they create a course or are invited. When off, people can only join through an invitation."
        />
        <Field label="Allowed email domains" optional htmlFor="st-domains" hint="Separate with commas. Leave blank to allow any address. Applies to sign-ups and invitations.">
          <Input id="st-domains" value={s.domains} onChange={(e) => set({ domains: e.target.value })} placeholder="university.edu" />
        </Field>
        {!emailOn && (
          <div className="callout callout--warn">
            <Icon name="mail" size={15} />
            <span>
              Email isn&apos;t set up, so invitations, sign-in links and password resets are written to the Worker logs instead of being sent. Set the
              RESEND_API_KEY secret to send them. You can still copy invite links from the Invitations page.
            </span>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2 className="h2">AI grading</h2>
        <Field label="Provider" hint="Switching fills in that provider's default address, model and rates.">
          <div style={{ maxWidth: 240 }}>
            <Select
              value={s.aiProvider}
              onChange={switchProvider}
              options={(Object.keys(AI_PROVIDERS) as AiProvider[]).map((value) => ({ value, label: AI_PROVIDERS[value].label }))}
            />
          </div>
        </Field>
        <Field
          label="API address"
          htmlFor="st-base"
          hint={
            anthropic
              ? "The Anthropic Messages API at https://api.anthropic.com, or a gateway that serves the same API."
              : "Any OpenAI-compatible Chat Completions API, such as https://api.openai.com/v1, an Azure OpenAI or OpenRouter endpoint, or a self-hosted server."
          }
        >
          <Input id="st-base" value={s.aiBaseUrl} onChange={(e) => set({ aiBaseUrl: e.target.value })} placeholder={provider.baseUrl} mono />
        </Field>
        <Field
          label="API key"
          htmlFor="st-key"
          hint={
            keyFromOtherProvider
              ? `Enter a key for ${provider.label}. The key ending in ${keyInfo.last4} was set up for the previous provider.`
              : keyInfo.source === "settings"
                ? `A key ending in ${keyInfo.last4} is saved, encrypted. Enter a new one to replace it.`
                : keyInfo.source === "env"
                  ? `Using the AI_API_KEY secret (ending in ${keyInfo.last4}). A key saved here takes precedence.`
                  : "Submissions are sent to this API for grading. The key is encrypted before it is stored."
          }
        >
          <Input id="st-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={keyInfo.source !== "none" ? "••••••••••••" + keyInfo.last4 : anthropic ? "sk-ant-…" : "sk-…"} />
        </Field>
        <Field label="Model" htmlFor="st-model" hint="Used for all grading. Changing it doesn't regrade existing results; they show as graded with earlier settings.">
          <div className="row">
            <div className="grow">
              {models.length ? (
                <Select value={s.model} onChange={(v) => set({ model: v })} options={modelOptions.map((m) => ({ value: m, label: m }))} />
              ) : (
                <Input id="st-model" value={s.model} onChange={(e) => set({ model: e.target.value })} placeholder={provider.model} mono />
              )}
            </div>
            <Button variant="secondary" icon="refresh" onClick={loadModels} loading={busy === "models"}>
              Load models
            </Button>
          </div>
        </Field>
        <Field
          label={anthropic ? "Effort" : "Reasoning effort"}
          optional
          hint={
            anthropic
              ? "How much Claude thinks before it grades. Higher effort uses more output tokens. Default uses the model's own default; older models may reject other values."
              : "For reasoning models only. Leave as Default for other models, or if the API rejects the setting."
          }
        >
          <Select
            value={s.reasoningEffort || "default"}
            onChange={(v) => set({ reasoningEffort: (v === "default" ? "" : v) as SiteSettings["reasoningEffort"] })}
            options={[{ value: "default", label: "Default" }, ...provider.efforts.map((e) => ({ value: e, label: EFFORTS[e] }))]}
          />
        </Field>
        <Checkbox
          checked={s.sendImages}
          onChange={(v) => set({ sendImages: v })}
          label="Send plots and images to the AI"
          description={`Up to 6 notebook output images per file${anthropic ? "" : ", at low detail,"} so the AI can judge visualizations. Images use many tokens; when off, the AI sees a short note instead. Needs a model that accepts images.`}
        />
        <Checkbox
          checked={s.sendInteractive}
          onChange={(v) => set({ sendInteractive: v })}
          label="Send interactive outputs to the AI"
          description="Widgets and Plotly, Bokeh or Vega charts can't be shown to the AI. When on, their text form is sent, up to 2,000 characters each. When off, the AI sees a short note instead."
        />
        <div>
          <Button variant="outline" icon="send" onClick={test} loading={busy === "test"}>
            Test saved settings
          </Button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="h2">Usage and limits</h2>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span style={{ fontWeight: 500 }}>This month</span>
            <span>
              {fmtUsd(usage.cost)}
              {s.capOn && s.cap > 0 ? ` of $${s.cap} cap` : ""}
            </span>
          </div>
          {s.cap > 0 && (
            <div className={"meter" + (pct >= 100 ? " meter--danger" : pct >= 80 ? " meter--warn" : "")}>
              <span style={{ width: pct + "%" }} />
            </div>
          )}
          <span className="field__hint">
            {fmtTokens(usage.input + usage.output)} tokens so far: {fmtTokens(usage.input)} input ({fmtTokens(usage.cached)} cached) and {fmtTokens(usage.output)} output.
            Estimated from the token counts the API returns, at the rates below. Your provider&apos;s invoice is the final amount.
          </span>
        </div>
        <div className="field">
          <span className="field__label">Rates, USD per million tokens</span>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <Field label={<span className="muted" style={{ fontWeight: 400 }}>Input</span>}>
              <AffixInput prefix="$" type="number" min={0} step="0.001" value={s.rateInput} onChange={(e) => set({ rateInput: +e.target.value })} />
            </Field>
            <Field label={<span className="muted" style={{ fontWeight: 400 }}>Cached input</span>}>
              <AffixInput prefix="$" type="number" min={0} step="0.001" value={s.rateCached} onChange={(e) => set({ rateCached: +e.target.value })} />
            </Field>
            <Field label={<span className="muted" style={{ fontWeight: 400 }}>Output</span>}>
              <AffixInput prefix="$" type="number" min={0} step="0.001" value={s.rateOutput} onChange={(e) => set({ rateOutput: +e.target.value })} />
            </Field>
          </div>
          <span className="field__hint">Use your model&apos;s published prices so spend estimates and the cap are accurate.</span>
        </div>
        <Field label="Monthly spending cap" htmlFor="st-cap">
          <AffixInput id="st-cap" prefix="$" type="number" min={0} value={s.cap} onChange={(e) => set({ cap: +e.target.value })} style={{ maxWidth: 240 }} />
        </Field>
        <Checkbox
          checked={s.capOn}
          onChange={(v) => set({ capOn: v })}
          label="Pause grading when the cap is reached"
          description="Queued files wait until the cap is raised or the next month starts. Nothing is lost."
        />
        <Field label="Files graded at once" hint="Lower this if grading fails with rate limit errors (429).">
          <div style={{ maxWidth: 240 }}>
            <Select
              value={String(s.concurrency)}
              onChange={(v) => set({ concurrency: +v })}
              options={["1", "2", "3", "5", "8", "10"].map((v) => ({ value: v, label: v }))}
            />
          </div>
        </Field>
      </section>

      <section className="settings-section">
        <h2 className="h2">Data retention</h2>
        <Field
          label="Delete submissions and graded results after"
          hint="Counted from upload. Files, scores and feedback are deleted, and student links stop working. Only SHA-256 hashes are kept, so duplicate checks still work."
        >
          <Select
            value={String(s.retention)}
            onChange={(v) => set({ retention: +v })}
            options={RETENTION_OPTIONS.map((o) => ({ value: String(o.days), label: o.label }))}
          />
        </Field>
      </section>

      <div className="save-bar" style={{ marginTop: 0 }}>
        <span>Changes apply to grading from now on.</span>
        <Button variant="primary" icon="save" onClick={save} loading={busy === "save"}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
