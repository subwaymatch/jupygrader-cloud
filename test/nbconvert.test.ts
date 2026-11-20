import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nbconvertHtml } from "@/lib/server/nbconvert";

const testEnv = env as unknown as Record<string, unknown>;

function bind(fetch: (url: string, init: RequestInit) => Promise<Response>) {
  const getByName = vi.fn(() => ({ fetch }));
  testEnv.NBCONVERT = { getByName };
  return getByName;
}

afterEach(() => {
  delete testEnv.NBCONVERT;
  vi.restoreAllMocks();
});

describe("nbconvertHtml", () => {
  it("returns null when the container isn't configured", async () => {
    expect(await nbconvertHtml("{}", "HW")).toBeNull();
  });

  it("posts the notebook to the container and returns the HTML", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("<html>ok</html>"));
    const getByName = bind(fetch);
    const html = await nbconvertHtml('{"cells": []}', "HW 1: a.ipynb");
    expect(getByName).toHaveBeenCalledWith("nbconvert");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://nbconvert/convert?title=HW%201%3A%20a.ipynb");
    expect(init).toMatchObject({ method: "POST", body: '{"cells": []}' });
    expect(new TextDecoder().decode(html!)).toBe("<html>ok</html>");
  });

  it("leaves nothing pending, whatever the container answers", async () => {
    vi.useFakeTimers();
    try {
      for (const reply of [new Response("<html>ok</html>"), new Response("No container is configured.", { status: 503 })]) {
        bind(async () => reply);
        await nbconvertHtml("{}", "HW");
        // A reply left unread, or a time limit still counting, keeps a queue or cron invocation open.
        expect(reply.bodyUsed).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up when the container takes longer than the time limit", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      bind((_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
      const pending = nbconvertHtml("{}", "HW", 5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await pending).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when the conversion fails or the container can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    bind(async () => new Response("conversion failed", { status: 500 }));
    expect(await nbconvertHtml("{}", "HW")).toBeNull();
    bind(async () => {
      throw new Error("container didn't start");
    });
    expect(await nbconvertHtml("{}", "HW")).toBeNull();
  });
});
