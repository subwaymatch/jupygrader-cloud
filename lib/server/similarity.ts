// MinHash fingerprints for spotting near-identical submissions.

const SEEDS = 64;
const SHINGLE = 5;

function fnv1a(s: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Fewest tokens, and fewest runs of tokens left once the starter's are taken out, worth comparing. */
const MIN_TOKENS = 40;
const MIN_OWN_SHINGLES = 20;

/** Every run of five tokens in the text: the units two files are compared by. */
export function shingles(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9_]+|[^\sa-z0-9_]/g) || [];
  const out = new Set<string>();
  if (tokens.length < MIN_TOKENS) return out;
  for (let i = 0; i + SHINGLE <= tokens.length; i++) out.add(tokens.slice(i, i + SHINGLE).join(" "));
  return out;
}

/**
 * A fingerprint for spotting near-identical files, or null for a text too short to compare
 * meaningfully. Runs of tokens in `exclude`, the starter file every student was given, are left
 * out, so two files are alike only in what their authors wrote. A file that is little more than
 * the starter has nothing of its own to compare and gets no fingerprint.
 */
export function minhash(text: string, exclude?: Set<string>): number[] | null {
  const all = shingles(text);
  if (!all.size) return null;
  const own = exclude?.size ? [...all].filter((sh) => !exclude.has(sh)) : [...all];
  if (exclude?.size && own.length < MIN_OWN_SHINGLES) return null;
  const sig = new Array<number>(SEEDS).fill(0xffffffff);
  for (const sh of own) {
    for (let k = 0; k < SEEDS; k++) {
      const h = fnv1a(sh, k * 0x9e3779b1);
      if (h < sig[k]) sig[k] = h;
    }
  }
  return sig;
}

export function similarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

export const NEAR_THRESHOLD = 0.9;
