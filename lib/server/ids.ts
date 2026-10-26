const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomId(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 62];
  return out;
}

export const newId = () => randomId(16);
export const newToken = () => randomId(32);
/** Student links: short enough to paste, long enough not to guess. */
export const newShareToken = () => randomId(20);

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf =
    typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
