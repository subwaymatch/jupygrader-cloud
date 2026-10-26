import Anthropic, { type APIError } from "@anthropic-ai/sdk";
import { AI_PROVIDERS, type Effort } from "@/lib/shared/constants";
import type { Usage } from "@/lib/shared/types";
import {
  AiError,
  describeApiError,
  parseJsonContent,
  schemaInstruction,
  type ChatJsonOptions,
  type ChatJsonResult,
  type ChatMessage,
} from "./ai-shared";

type Block = Anthropic.Beta.BetaContentBlockParam;
type ImageType = Anthropic.Beta.BetaBase64ImageSource["media_type"];

// Room for adaptive thinking plus the reply. Requests stream, so a long one doesn't hit HTTP timeouts.
const MAX_TOKENS = 64_000;

// Server-side fallback re-runs a request on another Claude model when a safety classifier
// declines it, such as a false positive on security or biology coursework. Models without
// a fallback target leave the refusal as it is.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Request features dropped one at a time when a model or proxy rejects them. */
type Feature = "fallbacks" | "thinking" | "format";

/** The SDK adds /v1/..., so accept the address with or without it. */
export function anthropicBaseUrl(base: string): string {
  return (base.trim() || AI_PROVIDERS.anthropic.baseUrl).replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
}

function client(base: string, key: string): Anthropic {
  return new Anthropic({ apiKey: key, authToken: null, baseURL: anthropicBaseUrl(base) });
}

function toBlocks(content: ChatMessage["content"]): Block[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((p): Block => {
    if (p.type === "text") return p.cache ? { type: "text", text: p.text, cache_control: { type: "ephemeral" } } : { type: "text", text: p.text };
    const url = p.image_url.url;
    const m = /^data:([^;,]+);base64,/.exec(url);
    return m
      ? { type: "image", source: { type: "base64", media_type: m[1] as ImageType, data: url.slice(m[0].length) } }
      : { type: "image", source: { type: "url", url } };
  });
}

/** Splits chat messages into the Messages API's system prompt and turns. */
export function toAnthropicRequest(messages: ChatMessage[]): { system: string; messages: Anthropic.Beta.BetaMessageParam[] } {
  const text = (c: ChatMessage["content"]) => (typeof c === "string" ? c : c.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n"));
  return {
    system: messages
      .filter((m) => m.role === "system")
      .map((m) => text(m.content))
      .join("\n\n"),
    messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: toBlocks(m.content) })),
  };
}

function apiMessage(err: APIError): { msg: string; type: string } {
  const body = err.error as { error?: { message?: string; type?: string } } | undefined;
  return { msg: body?.error?.message || err.message, type: body?.error?.type || "" };
}

/** Which feature a 400 complains about, if it is one this client can do without. */
function rejectedFeature(err: unknown, on: Set<Feature>): Feature | undefined {
  if (!(err instanceof Anthropic.BadRequestError)) return undefined;
  const { msg } = apiMessage(err);
  if (on.has("fallbacks") && /fallback/i.test(msg)) return "fallbacks";
  if (on.has("thinking") && /thinking/i.test(msg)) return "thinking";
  if (on.has("format") && /output_config\.format|output_format|json_schema|structured output/i.test(msg)) return "format";
  return undefined;
}

function toAiError(err: unknown): unknown {
  if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError)
    return new AiError("The AI API timed out. Retry to resend.", true);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach the AI API. Check the API address in Settings, then retry.", true);
  if (!(err instanceof Anthropic.APIError)) return err;
  const { msg, type } = apiMessage(err);
  // An error event in the middle of a stream has no HTTP status.
  if (err.status === undefined) return new AiError(`The AI API had an error${type === "overloaded_error" ? " (overloaded)" : ""}. Retry to resend.`, true);
  if (/credit balance/i.test(msg)) return new AiError(`The AI account is out of credit (${err.status}). Add credit with the AI provider, then retry.`, false, err.status);
  if (err.status === 400 && /image/i.test(msg)) return new AiError(`The AI API couldn't read an image in this file. ${msg}`, false, 400);
  return describeApiError(err.status, msg, type);
}

/**
 * Calls the Anthropic Messages API and returns parsed JSON. Uses structured
 * outputs and adaptive thinking, and caches the prompt up to the part marked
 * `cache`, so files graded against the same assignment reuse it.
 */
export async function anthropicChatJson<T>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
  const s = opts.settings;
  const req = toAnthropicRequest(opts.messages);
  const effort = (AI_PROVIDERS.anthropic.efforts as readonly Effort[]).includes(s.reasoningEffort as Effort)
    ? (s.reasoningEffort as Anthropic.Beta.BetaOutputConfig["effort"])
    : undefined;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const api = client(s.aiBaseUrl, s.aiApiKey);
  const on = new Set<Feature>(["fallbacks", "thinking", "format"]);

  let message: Anthropic.Beta.BetaMessage;
  for (;;) {
    const output: Anthropic.Beta.BetaOutputConfig = {};
    if (effort) output.effort = effort;
    if (on.has("format")) output.format = { type: "json_schema", schema: opts.schema };
    const system = on.has("format") ? req.system : [req.system, schemaInstruction(opts.schema)].filter(Boolean).join("\n\n");
    try {
      message = await api.beta.messages
        .stream(
          {
            model: s.model,
            max_tokens: MAX_TOKENS,
            ...(system ? { system } : {}),
            messages: req.messages,
            ...(Object.keys(output).length ? { output_config: output } : {}),
            ...(on.has("thinking") ? { thinking: { type: "adaptive" as const } } : {}),
            ...(on.has("fallbacks") ? { fallbacks: "default" as const, betas: [FALLBACK_BETA] } : {}),
          },
          { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) },
        )
        .finalMessage();
      break;
    } catch (err) {
      const feature = rejectedFeature(err, on);
      if (!feature) throw toAiError(err);
      on.delete(feature);
    }
  }

  if (message.stop_reason === "refusal") {
    const d = message.stop_details;
    const why = d?.explanation || (d?.category ? `${d.category} safeguards` : "");
    throw new AiError(`The AI declined this request${why ? ` (${why})` : ""}.`, false);
  }
  if (message.stop_reason === "max_tokens") throw new AiError("The AI ran out of output tokens before finishing. Retry to resend.", true);
  // After a mid-reply fallback, the fallback model continues the declined model's text.
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  if (!text.trim()) throw new AiError("The AI returned an empty reply. Retry to resend.", true);

  const u = message.usage;
  const cached = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const usage: Usage = {
    input: u.input_tokens + cached + cacheWrite,
    cached,
    cacheWrite,
    output: u.output_tokens,
    reasoning: u.output_tokens_details?.thinking_tokens ?? 0,
  };
  return { data: parseJsonContent(text) as T, usage, model: message.model || s.model };
}

export async function anthropicListModels(base: string, key: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    for await (const m of client(base, key).models.list({ limit: 100 }, { timeout: 15_000 })) ids.push(m.id);
  } catch (err) {
    throw toAiError(err);
  }
  return ids.sort();
}
