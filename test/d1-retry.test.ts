import { describe, expect, it } from "vitest";
import { isReadOnly, isTransientD1Error, retrying, shouldRetry, withRetry } from "@/lib/server/d1-retry";

const overloaded = new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.");
const lost = new Error("Network connection lost.");
const syntax = new Error("D1_ERROR: near \"selec\": syntax error");

describe("isReadOnly", () => {
  it("accepts reads", () => {
    expect(isReadOnly("select count(*) n from \"user\"")).toBe(true);
    expect(isReadOnly("  WITH t AS (SELECT 1) SELECT * FROM t")).toBe(true);
    expect(isReadOnly("SELECT * FROM pragma_table_info(?)")).toBe(true);
    expect(isReadOnly("PRAGMA index_list('user')")).toBe(true);
    expect(isReadOnly('select "updatedAt", "createdAt", deleted from submission')).toBe(true);
  });

  it("refuses writes", () => {
    expect(isReadOnly("insert into setting (key, value) values (?, ?)")).toBe(false);
    expect(isReadOnly("update submission set score = ?")).toBe(false);
    expect(isReadOnly("WITH t AS (SELECT 1) DELETE FROM x")).toBe(false);
    expect(isReadOnly("PRAGMA foreign_keys = ON")).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("retries reads on any transient error", () => {
    expect(shouldRetry(overloaded, true)).toBe(true);
    expect(shouldRetry(lost, true)).toBe(true);
    expect(shouldRetry(syntax, true)).toBe(false);
  });

  it("retries writes only when the query never ran", () => {
    expect(shouldRetry(overloaded, false)).toBe(true);
    expect(shouldRetry(lost, false)).toBe(false);
  });

  it("recognizes transient errors", () => {
    expect(isTransientD1Error(overloaded)).toBe(true);
    expect(isTransientD1Error(new Error("D1 query timed out after 8 s"))).toBe(true);
    expect(isTransientD1Error(syntax)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns once an attempt succeeds", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        if (++calls < 3) throw overloaded;
        return "ok";
      },
      true,
      [0, 0],
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the last wait", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw overloaded;
        },
        true,
        [0, 0],
      ),
    ).rejects.toBe(overloaded);
    expect(calls).toBe(3);
  });

  it("retries a read that never answers", async () => {
    let calls = 0;
    const out = await withRetry(
      () => (++calls === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok")),
      true,
      [0, 0],
      20,
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });

  it("times out a write that never answers, without retrying it", async () => {
    let calls = 0;
    const hang = () => {
      calls++;
      return new Promise<string>(() => {});
    };
    await expect(withRetry(hang, false, [0, 0], 20)).rejects.toThrow("D1 query timed out");
    expect(calls).toBe(1);
  });

  it("doesn't retry errors that aren't transient", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw syntax;
        },
        true,
        [0, 0],
      ),
    ).rejects.toBe(syntax);
    expect(calls).toBe(1);
  });
});

/** A stand-in for the D1 binding whose statements fail `failures` times before succeeding. */
function fakeD1(failures: number) {
  const log: string[] = [];
  let left = failures;
  const attempt = async <T>(what: string, value: T) => {
    log.push(what);
    if (left > 0) {
      left--;
      throw overloaded;
    }
    return value;
  };
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement =>
    ({
      sql,
      args,
      bind: (...values: unknown[]) => stmt(sql, values),
      first: () => attempt(`first ${sql}`, { n: 1 }),
      all: () => attempt(`all ${sql}`, { results: [{ n: 1 }], success: true, meta: {} }),
      run: () => attempt(`run ${sql}`, { results: [], success: true, meta: {} }),
      raw: () => attempt(`raw ${sql}`, [[1]]),
    }) as unknown as D1PreparedStatement;
  const batched: unknown[][] = [];
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (statements: unknown[]) => {
      batched.push(statements);
      return attempt("batch", statements.map(() => ({ results: [], success: true, meta: {} })));
    },
    exec: () => attempt("exec", { count: 1, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => db,
  };
  return { db: db as unknown as D1Database, log, batched };
}

describe("retrying", () => {
  it("retries a read that hits an overload", async () => {
    const { db, log } = fakeD1(1);
    const row = await retrying(db).prepare("select 1 n").bind().first();
    expect(row).toEqual({ n: 1 });
    expect(log).toEqual(["first select 1 n", "first select 1 n"]);
  });

  it("passes the binding's own statements to batch()", async () => {
    const { db, batched } = fakeD1(0);
    const r = retrying(db);
    await r.batch([r.prepare("update a set x = ?").bind(1), r.prepare("delete from b")]);
    const [sent] = batched as { sql: string; args: unknown[] }[][];
    expect(sent.map((s) => s.sql)).toEqual(["update a set x = ?", "delete from b"]);
    expect(sent[0].args).toEqual([1]);
    // The binding's own statements, not the wrappers (D1 rejects anything else in a batch).
    expect(Object.getOwnPropertySymbols(sent[0])).toEqual([]);
  });

  it("wraps each binding once", () => {
    const { db } = fakeD1(0);
    expect(retrying(db)).toBe(retrying(db));
  });
});
