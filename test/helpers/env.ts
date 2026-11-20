// A stand-in for the Worker's bindings, so route handlers and server modules run under Vitest:
// D1 on Node's built-in SQLite with the real migrations applied, and R2 as a Map.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { env } from "cloudflare:workers";

const MIGRATIONS = fileURLToPath(new URL("../../migrations/", import.meta.url));

type Exec = { sql: string; params: SQLInputValue[] };

function statement(db: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
  const all = () => db.prepare(sql).all(...params) as Record<string, unknown>[];
  const run = () => {
    // A statement with RETURNING hands back rows; anything else, how many rows it changed.
    if (/\breturning\b/i.test(sql)) return { results: all(), success: true, meta: { changes: 1 } };
    const r = db.prepare(sql).run(...params);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  };
  return {
    __exec: { sql, params } satisfies Exec,
    bind: (...values: SQLInputValue[]) => statement(db, sql, values),
    first: async (column?: string) => {
      const row = (db.prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null;
      return column ? (row?.[column] ?? null) : row;
    },
    all: async () => (/^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql) ? { results: all(), success: true, meta: {} } : run()),
    run: async () => run(),
    raw: async () => all().map((r) => Object.values(r)),
  };
}

export function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("pragma foreign_keys = on");
  for (const f of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(MIGRATIONS + f, "utf8"));
  return {
    prepare: (sql: string) => statement(db, sql),
    // D1 runs a batch as one transaction.
    batch: async (statements: { __exec: Exec }[]) => {
      db.exec("begin");
      try {
        const out = statements.map((s) => {
          const r = db.prepare(s.__exec.sql).run(...s.__exec.params);
          return { results: [], success: true, meta: { changes: Number(r.changes) } };
        });
        db.exec("commit");
        return out;
      } catch (err) {
        db.exec("rollback");
        throw err;
      }
    },
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}

type Stored = { data: Uint8Array; uploaded: Date; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };

export function fakeR2() {
  const files = new Map<string, Stored>();
  const view = (key: string, f: Stored) => ({
    key,
    size: f.data.length,
    uploaded: f.uploaded,
    httpMetadata: f.httpMetadata,
    customMetadata: f.customMetadata,
    arrayBuffer: async () => f.data.slice().buffer,
    text: async () => new TextDecoder().decode(f.data),
    json: async () => JSON.parse(new TextDecoder().decode(f.data)),
    body: new Response(f.data.slice()).body,
  });
  return {
    files,
    put: async (key: string, data: string | ArrayBuffer | Uint8Array, opts: Omit<Stored, "data" | "uploaded"> = {}) => {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
      files.set(key, { data: bytes, uploaded: new Date(), ...opts });
    },
    get: async (key: string) => (files.has(key) ? view(key, files.get(key)!) : null),
    head: async (key: string) => (files.has(key) ? view(key, files.get(key)!) : null),
    delete: async (keys: string | string[]) => void (Array.isArray(keys) ? keys : [keys]).forEach((k) => files.delete(k)),
    list: async ({ prefix = "" }: { prefix?: string } = {}) => ({
      objects: [...files].filter(([k]) => k.startsWith(prefix)).map(([k, f]) => view(k, f)),
      truncated: false,
    }),
  };
}

export type TestEnv = { DB: D1Database; FILES: ReturnType<typeof fakeR2> };

/** Fresh, empty bindings. Call it in beforeEach. */
export function resetEnv(): TestEnv {
  const e = env as unknown as Record<string, unknown>;
  for (const k of Object.keys(e)) delete e[k];
  const fresh = { DB: fakeD1(), FILES: fakeR2(), BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", APP_URL: "https://grader.test" };
  Object.assign(e, fresh);
  return fresh;
}
