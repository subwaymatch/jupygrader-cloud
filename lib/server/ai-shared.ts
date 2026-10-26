import type { Usage } from "@/lib/shared/types";
import type { SiteSettingsWithKey } from "./settings";

/**
 * `cache` marks the end of a prefix that repeats across requests, such as the
 * assignment context before each submission. The Anthropic client caches up to
 * there; OpenAI-compatible APIs cache repeated prefixes on their own.
 */
export type ContentPart =
  | { type: "text"; text: string; cache?: boolean }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export type ChatJsonOptions = {
  settings: SiteSettingsWithKey;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  timeoutMs?: number;
};

export type ChatJsonResult<T> = { data: T; usage: Usage; model: string };

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

/** The instruction used when a model can't take a JSON Schema as a response format. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return `Reply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`;
}

/** Turns an HTTP error from either API into a message an admin or grader can act on. */
export function describeApiError(status: number, msg: string, code = ""): AiError {
  if (status === 401 || status === 403) return new AiError(`The AI API rejected the API key (${status}). An admin can check it in Settings.`, false, status);
  if (status === 404) return new AiError(`The AI API couldn't find the model or endpoint (404). ${msg}`.trim(), false, status);
  if (status === 429 && /quota|billing|credit/i.test(code + " " + msg))
    return new AiError("The AI account is out of credit (429). Add credit with the AI provider, then retry.", false, status);
  if (status === 429) return new AiError("The AI API is rate limiting requests (429). Retry to resend, or lower Files graded at once in Settings.", true, status);
  if (status === 413) return new AiError("This file is too large for the AI to read in one request (413).", false, status);
  if (status >= 500) return new AiError(`The AI API had an error (${status}). Retry to resend.`, true, status);
  return new AiError(`The AI API returned an error (${status}). ${msg}`.trim(), false, status);
}

export function parseJsonContent(content: string): unknown {
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
