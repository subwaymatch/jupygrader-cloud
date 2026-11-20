import { getEnv } from "./env";

/** False when the deployment has no nbconvert Durable Object (see "nbconvert container" in the README). */
export const hasNbconvert = () => !!getEnv().NBCONVERT;

const TIMEOUT_MS = 120_000;

/**
 * Converts a notebook (JSON text) to HTML with nbconvert, which runs in a
 * Cloudflare Container (containers/nbconvert, worker/nbconvert.ts). Returns the
 * HTML, or null when the container isn't available or the conversion fails, so
 * the caller can fall back to the built-in HTML.
 *
 * Nothing of the request outlives the call: the reply is always read to the end and the time
 * limit is cleared. Before, a 503 reply was left unread and the limit was AbortSignal.timeout(),
 * which can't be cancelled, and in local development each graded notebook then held its queue or
 * cron invocation open for the whole two minutes, although the container had answered at once.
 */
export async function nbconvertHtml(notebook: string, title: string, timeoutMs = TIMEOUT_MS): Promise<Uint8Array | null> {
  const ns = getEnv().NBCONVERT as DurableObjectNamespace | undefined;
  if (!ns) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new DOMException("nbconvert timed out", "TimeoutError")), timeoutMs);
  try {
    const res = await ns.getByName("nbconvert").fetch(`http://nbconvert/convert?title=${encodeURIComponent(title)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: notebook,
      signal: abort.signal,
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    const detail = (await res.text()).slice(0, 500);
    // 503 means no container is configured, as in local development by default.
    if (res.status !== 503) console.error("nbconvert failed", res.status, detail);
  } catch (err) {
    console.error("nbconvert unavailable", err);
  } finally {
    clearTimeout(timer);
  }
  return null;
}
