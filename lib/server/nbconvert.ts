import { getEnv } from "./env";

/** False when the deployment has no nbconvert Durable Object (see "nbconvert container" in the README). */
export const hasNbconvert = () => !!getEnv().NBCONVERT;

/**
 * Converts a notebook (JSON text) to HTML with nbconvert, which runs in a
 * Cloudflare Container (containers/nbconvert, worker/nbconvert.ts). Returns the
 * HTML as a stream, or null when the container isn't available or the
 * conversion fails, so the caller can fall back to the built-in HTML.
 */
export async function nbconvertHtml(notebook: string, title: string): Promise<ReadableStream<Uint8Array> | null> {
  const ns = getEnv().NBCONVERT as DurableObjectNamespace | undefined;
  if (!ns) return null;
  try {
    const res = await ns.getByName("nbconvert").fetch(`http://nbconvert/convert?title=${encodeURIComponent(title)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: notebook,
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok && res.body) return res.body;
    // 503 means no container is configured, as in local development by default.
    if (res.status !== 503) console.error("nbconvert failed", res.status, (await res.text()).slice(0, 500));
  } catch (err) {
    console.error("nbconvert unavailable", err);
  }
  return null;
}
