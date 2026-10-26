import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicBaseUrl, anthropicChatJson, toAnthropicRequest } from "@/lib/server/ai-anthropic";
import { AiError } from "@/lib/server/ai-shared";
import { costOf, defaultSettings, type SiteSettingsWithKey } from "@/lib/server/settings";

const settings: SiteSettingsWithKey = {
  ...defaultSettings(),
  aiProvider: "anthropic",
  aiBaseUrl: "https://api.anthropic.com/v1",
  model: "claude-haiku-5-5",
  reasoningEffort: "high",
  aiApiKey: "sk-ant-test",
  aiKeySource: "settings",
};

const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };

function sse(events: Record<string, unknown>[]): Response {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function reply(text: string, stop: { stop_reason: string; stop_details?: unknown } = { stop_reason: "end_turn" }): Response {
  return sse([
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_sequence: null, stop_details: null, ...stop }, usage: { output_tokens: 20, output_tokens_details: { thinking_tokens: 5 } } },
    { type: "message_stop" },
  ]);
}

function badRequest(message: string): Response {
  return Response.json({ type: "error", error: { type: "invalid_request_error", message } }, { status: 400 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Anthropic requests", () => {
  it("accepts the API address with or without /v1", () => {
    expect(anthropicBaseUrl("https://api.anthropic.com/v1/")).toBe("https://api.anthropic.com");
    expect(anthropicBaseUrl("https://gateway.example.edu/anthropic/v1/messages")).toBe("https://gateway.example.edu/anthropic");
    expect(anthropicBaseUrl(" ")).toBe("https://api.anthropic.com");
  });

  it("moves system messages to the system prompt and converts cache marks and images", () => {
    const r = toAnthropicRequest([
      { role: "system", content: "Grade it." },
      {
        role: "user",
        content: [
          { type: "text", text: "Assignment", cache: true },
          { type: "text", text: "Submission" },
          { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=", detail: "low" } },
        ],
      },
    ]);
    expect(r.system).toBe("Grade it.");
    expect(r.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Assignment", cache_control: { type: "ephemeral" } },
          { type: "text", text: "Submission" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
        ],
      },
    ]);
  });

  it("sends structured outputs, effort, thinking and fallbacks, and drops a feature the model rejects", async () => {
    const fetchMock = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(badRequest("thinking.type: adaptive thinking is not supported on this model"))
      .mockResolvedValueOnce(reply('{"ok": true}'));
    vi.stubGlobal("fetch", fetchMock);

    const r = await anthropicChatJson<{ ok: boolean }>({
      settings,
      schema,
      schemaName: "ping",
      messages: [
        { role: "system", content: "Reply with JSON." },
        { role: "user", content: "Say ok." },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-ant-test");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const first = JSON.parse(String(init.body));
    expect(first).toMatchObject({
      model: "claude-haiku-5-5",
      system: "Reply with JSON.",
      thinking: { type: "adaptive" },
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema } },
      stream: true,
    });
    const second = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(second.thinking).toBeUndefined();
    expect(second.fallbacks).toBe("default");

    expect(r.data).toEqual({ ok: true });
    expect(r.model).toBe("claude-haiku-5-5");
    expect(r.usage).toEqual({ input: 160, cached: 100, cacheWrite: 50, output: 20, reasoning: 5 });
  });

  it("asks for JSON in the system prompt when the model can't take a schema", async () => {
    const fetchMock = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(badRequest("output_config.format: structured outputs are not supported for this model"))
      .mockResolvedValueOnce(reply('Here it is: {"ok": true}'));
    vi.stubGlobal("fetch", fetchMock);
    const r = await anthropicChatJson<{ ok: boolean }>({ settings, schema, schemaName: "ping", messages: [{ role: "user", content: "Hi" }] });
    const second = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(second.output_config).toEqual({ effort: "high" });
    expect(second.system).toContain("Reply with a single JSON object that matches this JSON Schema");
    expect(r.data).toEqual({ ok: true });
  });

  it("reports a refusal as a non-retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("", { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } })));
    const err = await anthropicChatJson({ settings, schema, schemaName: "ping", messages: [{ role: "user", content: "Hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toBe("The AI declined this request (cyber safeguards).");
    expect(err.retryable).toBe(false);
  });

  it("turns a rejected key into a message for the admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 })),
    );
    const err = await anthropicChatJson({ settings, schema, schemaName: "ping", messages: [{ role: "user", content: "Hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toContain("rejected the API key (401)");
  });
});

describe("cost", () => {
  it("adds the cache-write premium on top of the input rate", () => {
    const rates = { rateInput: 1, rateCached: 0.1, rateOutput: 5 };
    // 1M uncached input at $1 (of which 0.5M written to cache, +25%), 1M cached at $0.10, 1M output at $5.
    expect(costOf({ input: 2_000_000, cached: 1_000_000, cacheWrite: 500_000, output: 1_000_000 }, rates)).toBeCloseTo(6.225);
    expect(costOf({ input: 2_000_000, cached: 1_000_000, output: 1_000_000 }, rates)).toBeCloseTo(6.1);
  });
});
