import { first, run } from "./db";
import { HttpError } from "./http";

export type RateRule = { /** Seconds. */ window: number; max: number };

/**
 * Counts one request against `key` and says whether it's within the rule. The count lives in D1
 * and is updated in a single statement, so the limit holds across Worker instances and under
 * concurrent requests. (A Worker's memory is per instance and short-lived, so an in-memory count
 * limits very little.)
 */
export async function consume(key: string, rule: RateRule): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const now = Date.now();
  let row: { count: number; reset_at: number } | null;
  try {
    row = await countRequest(key, rule, now);
  } catch (err) {
    // A limiter that can't count lets the request through: a database hiccup, or a deployment that
    // hasn't applied migration 0004 yet, shouldn't stop everyone signing in.
    console.error("Rate limit not applied", err);
    return { allowed: true, retryAfter: null };
  }
  if (!row || row.count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
}

function countRequest(key: string, rule: RateRule, now: number) {
  return first<{ count: number; reset_at: number }>(
    `insert into rate_limit (key, count, reset_at) values (?1, 1, ?2)
       on conflict(key) do update set
         count = case when rate_limit.reset_at <= ?3 then 1 else rate_limit.count + 1 end,
         reset_at = case when rate_limit.reset_at <= ?3 then ?2 else rate_limit.reset_at end
     returning count, reset_at`,
    key.slice(0, 300),
    now + rule.window * 1000,
    now,
  );
}

/** The address a request came from. Cloudflare sets CF-Connecting-IP itself; a client can't. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || "local";
}

function wait(seconds: number): string {
  if (seconds < 90) return "a minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  return seconds < 5400 ? "an hour" : `${Math.ceil(seconds / 3600)} hours`;
}

/** Throws a 429 when `key` is over the rule. */
export async function limit(key: string, rule: RateRule, what = "Too many requests."): Promise<void> {
  const r = await consume(key, rule);
  if (!r.allowed) throw new HttpError(429, `${what} Try again in ${wait(r.retryAfter ?? rule.window)}.`);
}

/** Daily: drop counts whose window has passed. */
export async function pruneRateLimits(): Promise<void> {
  await run("delete from rate_limit where reset_at <= ?", Date.now());
}
