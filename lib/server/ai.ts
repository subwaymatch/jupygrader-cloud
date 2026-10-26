import type { AiProvider } from "@/lib/shared/constants";
import type { Usage } from "@/lib/shared/types";
import { anthropicChatJson, anthropicListModels } from "./ai-anthropic";
import {
  AiError,
  describeApiError,
  parseJsonContent,
  schemaInstruction,
  type ChatJsonOptions,
  type ChatJsonResult,
  type ChatMessage,
  type ContentPart,
} from "./ai-shared";

export { AiError, type ChatMessage, type ContentPart } from "./ai-shared";

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
  return describeApiError(status, msg, code);
}

/**
 * Sends a request to the AI provider chosen in Settings and returns the reply
 * parsed as JSON that matches the schema.
 */
export async function chatJson<T>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
  const s = opts.settings;
  if (!s.aiApiKey) throw new AiError("No AI API key is set. An admin can add one in Settings.", false);
  if (!s.model) throw new AiError("No AI model is set. An admin can choose one in Settings.", false);
  return s.aiProvider === "anthropic" ? anthropicChatJson<T>(opts) : openAiChatJson<T>(opts);
}

/** Lists model ids from the provider, for the Settings picker. */
export async function listModels(provider: AiProvider, base: string, key: string): Promise<string[]> {
  return provider === "anthropic" ? anthropicListModels(base, key) : openAiListModels(base, key);
}

/** Drops the cache marks, which Chat Completions APIs don't accept. */
function openAiMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    typeof m.content === "string" ? m : { ...m, content: m.content.map((p): ContentPart => (p.type === "text" ? { type: "text", text: p.text } : p)) },
  );
}

/**
 * Calls an OpenAI-compatible Chat Completions endpoint and returns parsed JSON.
 * Uses structured outputs (json_schema) and falls back to JSON mode for
 * providers that don't support schemas.
 */
async function openAiChatJson<T>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
  const s = opts.settings;
  const base = openAiMessages(opts.messages);

  const send = async (mode: "schema" | "object") => {
    const messages =
      mode === "schema"
        ? base
        : [
            ...base.slice(0, 1).map((m) => ({
              ...m,
              content: `${m.content}\n\n${schemaInstruction(opts.schema)}`,
            })),
            ...base.slice(1),
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

async function openAiListModels(base: string, key: string): Promise<string[]> {
  const url = base.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/models";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw describeHttpError(res.status, await res.text());
  const j = (await res.json()) as { data?: { id: string }[] };
  return (j.data || []).map((m) => m.id).sort();
}
