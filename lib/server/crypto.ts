import { getEnv } from "./env";

let keyPromise: Promise<CryptoKey> | null = null;

function secretKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const secret = getEnv().BETTER_AUTH_SECRET;
      if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("jupygrader-settings"), info: new Uint8Array() },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
  }
  return keyPromise;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encrypts a secret (such as the AI API key) before it is stored in D1. */
export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await secretKey(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return "enc:v1:" + b64(out);
}

export async function decryptSecret(stored: string): Promise<string> {
  if (!stored) return "";
  if (!stored.startsWith("enc:v1:")) return stored;
  try {
    const raw = unb64(stored.slice(7));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await secretKey(), raw.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    console.error("Could not decrypt a stored secret. Was BETTER_AUTH_SECRET changed?");
    return "";
  }
}
