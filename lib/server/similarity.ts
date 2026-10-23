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

/** Returns null for texts too short to compare meaningfully. */
export function minhash(text: string): number[] | null {
  const tokens = text.toLowerCase().match(/[a-z0-9_]+|[^\sa-z0-9_]/g) || [];
  if (tokens.length < 40) return null;
  const shingles = new Set<string>();
  for (let i = 0; i + SHINGLE <= tokens.length; i++) shingles.add(tokens.slice(i, i + SHINGLE).join(" "));
  const sig = new Array<number>(SEEDS).fill(0xffffffff);
  for (const sh of shingles) {
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
