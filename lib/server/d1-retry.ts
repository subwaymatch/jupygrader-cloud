/*
 * Retries for D1's transient errors (https://developers.cloudflare.com/d1/observability/debug-d1/#error-list).
 *
 * D1 already retries read-only queries twice, straight away. These retries come after a short wait, which gets
 * past brief overloads and restarts, such as the moments after a deploy. Reads are retried for any transient
 * error. Writes are retried only for errors that mean the query never ran (the database turned it away or
 * couldn't be reached), so a write is never applied twice.
 */

const TRANSIENT = [
  "Network connection lost",
  "storage caused object to be reset",
  "reset because its code was updated",
  "Cannot resolve D1 DB due to transient issue",
  "Replica disconnected from primary",
  "D1 DB is overloaded",
];
const NEVER_RAN = ["D1 DB is overloaded", "Cannot resolve D1 DB due to transient issue"];

/** Milliseconds to wait before each retry; each wait varies by ±25%. */
const WAITS = [150, 600];

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Whether an error is one of D1's transient errors, which a later attempt may not hit. */
export function isTransientD1Error(err: unknown): boolean {
  const m = message(err);
  return TRANSIENT.some((t) => m.includes(t));
}

export function shouldRetry(err: unknown, readOnly: boolean): boolean {
  const m = message(err);
  return (readOnly ? TRANSIENT : NEVER_RAN).some((t) => m.includes(t));
}

/** Whether a statement only reads: it starts with SELECT, WITH, EXPLAIN or a PRAGMA that sets nothing, and has
 *  no keyword that writes. A false "no" only means fewer retries. */
export function isReadOnly(sql: string): boolean {
  const s = sql.trim();
  if (/^pragma\b/i.test(s)) return !s.includes("=");
  return /^(select|with|explain)\b/i.test(s) && !/\b(insert|update|delete|replace|create|drop|alter)\b/i.test(s);
}

export async function withRetry<T>(run: () => Promise<T>, readOnly: boolean, waits: number[] = WAITS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= waits.length || !shouldRetry(err, readOnly)) throw err;
      await new Promise((r) => setTimeout(r, waits[attempt] * (0.75 + Math.random() * 0.5)));
    }
  }
}

const RAW = Symbol("D1 statement");

type Retrying = D1PreparedStatement & { [RAW]: D1PreparedStatement; sql: string };

function statement(raw: D1PreparedStatement, sql: string): D1PreparedStatement {
  const readOnly = isReadOnly(sql);
  const s = {
    [RAW]: raw,
    sql,
    bind: (...values: unknown[]) => statement(raw.bind(...values), sql),
    first: (column?: string) => withRetry(() => (column === undefined ? raw.first() : raw.first(column)), readOnly),
    all: () => withRetry(() => raw.all(), readOnly),
    run: () => withRetry(() => raw.run(), readOnly),
    raw: (options?: { columnNames?: boolean }) => withRetry(() => raw.raw(options as { columnNames: true }), readOnly),
  };
  return s as unknown as D1PreparedStatement;
}

function unwrap(s: D1PreparedStatement): D1PreparedStatement {
  return (s as Retrying)[RAW] ?? s;
}

const wrapped = new WeakMap<D1Database, D1Database>();

/** The D1 binding with retries. Statements it prepares can be passed to its batch(), which runs them as one
 *  transaction, so a batch is retried as a whole. */
export function retrying(db: D1Database): D1Database {
  let w = wrapped.get(db);
  if (w) return w;
  w = {
    prepare: (sql: string) => statement(db.prepare(sql), sql),
    batch: <T = unknown>(statements: D1PreparedStatement[]) => {
      const readOnly = statements.every((s) => isReadOnly((s as Retrying).sql ?? ""));
      return withRetry(() => db.batch<T>(statements.map(unwrap)), readOnly);
    },
    exec: (sql: string) => withRetry(() => db.exec(sql), false),
    dump: () => db.dump(),
    withSession: (constraintOrBookmark?: string) => db.withSession(constraintOrBookmark),
  } as unknown as D1Database;
  wrapped.set(db, w);
  return w;
}
