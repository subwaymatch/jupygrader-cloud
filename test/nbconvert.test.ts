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

  it("posts the notebook to the container and streams back the HTML", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("<html>ok</html>"));
    const getByName = bind(fetch);
    const html = await nbconvertHtml('{"cells": []}', "HW 1: a.ipynb");
    expect(getByName).toHaveBeenCalledWith("nbconvert");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://nbconvert/convert?title=HW%201%3A%20a.ipynb");
    expect(init).toMatchObject({ method: "POST", body: '{"cells": []}' });
    expect(await new Response(html).text()).toBe("<html>ok</html>");
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
