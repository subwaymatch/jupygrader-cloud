import { getEnv } from "./env";

type Param = string | number | null | boolean | undefined;

function bindAll(sql: string, params: Param[]) {
  const values = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  return getEnv().DB.prepare(sql).bind(...values);
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
    out.push(...(await getEnv().DB.batch(statements.slice(i, i + 50))));
  }
  return out;
}

/** Placeholders for an IN (...) clause. */
export function inList(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
