import { retrying } from "./d1-retry";
import { getEnv } from "./env";

type Param = string | number | null | boolean | undefined;

/** The D1 database, with retries for its transient errors (see d1-retry.ts). */
export function db(): D1Database {
  return retrying(getEnv().DB);
}

function bindAll(sql: string, params: Param[]) {
  const values = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  return db().prepare(sql).bind(...values);
}

export function stmt(sql: string, ...params: Param[]): D1PreparedStatement {
  return bindAll(sql, params);
}

export async function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
  const res = await bindAll(sql, params).all<T>();
  return res.results ?? [];
}

export async function first<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | null> {
  return (await bindAll(sql, params).first<T>()) ?? null;
}

export async function run(sql: string, ...params: Param[]): Promise<D1Result> {
  return bindAll(sql, params).run();
}

export async function batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!statements.length) return [];
  const out: D1Result[] = [];
  // D1 limits the number of statements per batch; stay well under it.
  for (let i = 0; i < statements.length; i += 50) {
    out.push(...(await db().batch(statements.slice(i, i + 50))));
  }
  return out;
}

/** Placeholders for an IN (...) clause. */
export function inList(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

/**
 * How many values go in one IN (...) list. D1 allows 100 bound parameters per query
 * (https://developers.cloudflare.com/d1/platform/limits/), so this leaves room for a few others.
 */
export const IN_LIST_MAX = 90;

export function chunked<T>(list: T[], size = IN_LIST_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Runs a SELECT with an IN (...) list of any length, a chunk at a time. `sql` gets the placeholders
 * for each chunk, and `before` are the parameters bound ahead of the list. Rows come back chunk by
 * chunk, so an ORDER BY in the query only sorts within a chunk: sort the result when order matters.
 */
export async function allIn<T = Record<string, unknown>>(sql: (placeholders: string) => string, before: Param[], values: Param[]): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunked(values)) out.push(...(await all<T>(sql(inList(part.length)), ...before, ...part)));
  return out;
}

/** Runs an UPDATE or DELETE with an IN (...) list of any length, a chunk at a time. Returns the rows changed. */
export async function runIn(sql: (placeholders: string) => string, before: Param[], values: Param[]): Promise<number> {
  let changes = 0;
  for (const part of chunked(values)) changes += (await run(sql(inList(part.length)), ...before, ...part)).meta.changes ?? 0;
  return changes;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
