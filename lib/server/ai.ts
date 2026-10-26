import type { Usage } from "@/lib/shared/types";
import type { SiteSettingsWithKey } from "./settings";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

type ChatResponse = {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: string; type?: string };
};

function endpoint(base: string): string {
  const b = base.replace(/\/+$/, "");
  return b.endsWith("/chat/completions") ? b : b + "/chat/completions";
}

function describeHttpError(status: number, body: string): AiError {
  let msg = "";
  let code = "";
  try {
    const j = JSON.parse(body) as ChatResponse;
    msg = j.error?.message || "";
    code = j.error?.code || j.error?.type || "";
  } catch {
    msg = body.slice(0, 200);
  }
  if (status === 401 || status === 403) return new AiError(`The AI API rejected the API key (${status}). An admin can check it in Settings.`, false, status);
  if (status === 404) return new AiError(`The AI API couldn't find the model or endpoint (404). ${msg}`.trim(), false, status);
  if (status === 429 && /quota|billing|credit/i.test(code + " " + msg))
    return new AiError("The AI account is out of credit (429). Add credit with the AI provider, then retry.", false, status);
  if (status === 429) return new AiError("The AI API is rate limiting requests (429). Retry to resend, or lower Files graded at once in Settings.", true, status);
  if (status === 413) return new AiError("This file is too large for the AI to read in one request (413).", false, status);
  if (status >= 500) return new AiError(`The AI API had an error (${status}). Retry to resend.`, true, status);
  return new AiError(`The AI API returned an error (${status}). ${msg}`.trim(), false, status);
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AiError("The AI's reply wasn't valid JSON. Retry to resend.", true);
  }
}

/**
 * Calls an OpenAI-compatible Chat Completions endpoint and returns parsed JSON.
 * Uses structured outputs (json_schema) and falls back to JSON mode for
 * providers that don't support schemas.
 */
export async function chatJson<T>(opts: {
  settings: SiteSettingsWithKey;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  timeoutMs?: number;
}): Promise<{ data: T; usage: Usage; model: string }> {
  const s = opts.settings;
  if (!s.aiApiKey) throw new AiError("No AI API key is set. An admin can add one in Settings.", false);
  if (!s.model) throw new AiError("No AI model is set. An admin can choose one in Settings.", false);

  const send = async (mode: "schema" | "object") => {
    const messages =
      mode === "schema"
        ? opts.messages
        : [
            ...opts.messages.slice(0, 1).map((m) => ({
              ...m,
              content: `${m.content}\n\nReply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(opts.schema)}`,
            })),
            ...opts.messages.slice(1),
          ];
    const body: Record<string, unknown> = {
      model: s.model,
      messages,
      response_format:
        mode === "schema"
          ? { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } }
          : { type: "json_object" },
    };
    if (s.reasoningEffort) body.reasoning_effort = s.reasoningEffort;
    let res: Response;
    try {
      res = await fetch(endpoint(s.aiBaseUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${s.aiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new AiError("The AI API timed out. Retry to resend.", true);
      throw new AiError("Couldn't reach the AI API. Check the API address in Settings, then retry.", true);
    }
    return res;
  };

  let res = await send("schema");
  if (res.status === 400) {
    const text = await res.text();
    if (/response_format|json_schema|structured/i.test(text)) res = await send("object");
    else if (/image/i.test(text))
      throw new AiError("This model doesn't accept images. An admin can turn off Send images to the AI in Settings.", false, 400);
    else throw describeHttpError(400, text);
  }
  if (!res.ok) throw describeHttpError(res.status, await res.text());

  const json = (await res.json()) as ChatResponse;
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    if (choice?.message?.refusal) throw new AiError("The AI declined to grade this file: " + choice.message.refusal, false);
    if (choice?.finish_reason === "length") throw new AiError("The AI ran out of output tokens before finishing. Retry to resend.", true);
    throw new AiError("The AI returned an empty reply. Retry to resend.", true);
  }
  const u = json.usage || {};
  const usage: Usage = {
    input: u.prompt_tokens ?? 0,
    cached: u.prompt_tokens_details?.cached_tokens ?? 0,
    output: u.completion_tokens ?? 0,
    reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
  return { data: parseJsonContent(content) as T, usage, model: json.model || s.model };
}

/** Lists model ids from the provider's /models endpoint, for the Settings picker. */
export async function listModels(base: string, key: string): Promise<string[]> {
  const url = base.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/models";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw describeHttpError(res.status, await res.text());
  const j = (await res.json()) as { data?: { id: string }[] };
  return (j.data || []).map((m) => m.id).sort();
}
