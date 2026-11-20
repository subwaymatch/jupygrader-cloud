import { beforeEach, describe, expect, it } from "vitest";
import { all, allIn, first, run, runIn } from "@/lib/server/db";
import { consume } from "@/lib/server/rate-limit";
import { resetEnv } from "./helpers/env";

beforeEach(() => void resetEnv());

describe("database helpers", () => {
  it("run the real migrations", async () => {
    const tables = (await all<{ name: string }>("select name from sqlite_master where type = 'table'")).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["user", "course", "assignment", "submission", "rate_limit", "email_token"]));
    expect((await first<{ n: number }>("select count(*) n from pragma_table_info('assignment') where name = 'starter_file'"))?.n).toBe(1);
  });

  it("split a long IN list so a query never has more than 100 parameters", async () => {
    const now = new Date().toISOString();
    await run("insert into course (id, name, end_date, created_at, updated_at) values ('c', 'C', '2099-01-01', ?, ?)", now, now);
    const ids = Array.from({ length: 250 }, (_, i) => "a" + String(i).padStart(3, "0"));
    for (const id of ids) await run("insert into assignment (id, course_id, title, created_at, updated_at) values (?, 'c', ?, ?, ?)", id, id, now, now);
    expect(await allIn<{ id: string }>((q) => `select id from assignment where course_id = ? and id in (${q})`, ["c"], ids)).toHaveLength(250);
    expect(await runIn((q) => `delete from assignment where id in (${q})`, [], ids.slice(0, 130))).toBe(130);
    expect((await first<{ n: number }>("select count(*) n from assignment"))?.n).toBe(120);
  });
});

describe("rate limit", () => {
  it("allows up to the limit in a window, then refuses until it passes", async () => {
    const rule = { window: 60, max: 3 };
    for (let i = 0; i < 3; i++) expect((await consume("k", rule)).allowed).toBe(true);
    const over = await consume("k", rule);
    expect(over.allowed).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
    // Another key has its own count.
    expect((await consume("other", rule)).allowed).toBe(true);
    // The window passing starts the count again.
    await run("update rate_limit set reset_at = ? where key = 'k'", Date.now() - 1);
    expect((await consume("k", rule)).allowed).toBe(true);
  });

  it("lets requests through when the table is missing, rather than locking everyone out", async () => {
    await run("drop table rate_limit");
    const quiet = console.error;
    console.error = () => {};
    try {
      expect((await consume("k", { window: 60, max: 1 })).allowed).toBe(true);
    } finally {
      console.error = quiet;
    }
  });
});
