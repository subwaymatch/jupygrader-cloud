// The grading flow, clean-up jobs and similarity checks, against an in-memory database and file store.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatJsonOptions } from "@/lib/server/ai-shared";
import { resetEnv, type TestEnv } from "./helpers/env";
import { addAssignment, addCourse, addSubmission, addUser } from "./helpers/seed";

const ai = vi.hoisted(() => ({ chat: (_: unknown): Promise<unknown> => Promise.reject(new Error("no AI in this test")) }));
vi.mock("@/lib/server/ai", async (original) => ({ ...(await original<typeof import("@/lib/server/ai")>()), chatJson: (o: ChatJsonOptions) => ai.chat(o) }));

import { AiError } from "@/lib/server/ai";
import { deleteUnusedDocs, pruneOldRecords, sweepOrphanDocs } from "@/lib/server/cleanup";
import { all, first, run } from "@/lib/server/db";
import { cronTick, gradeNext, kickGrading, retentionSweep } from "@/lib/server/grading";
import { minhash, NEAR_THRESHOLD, shingles, similarity } from "@/lib/server/similarity";
import { recomputeNearOf } from "@/lib/server/submissions";
import { compareBlocks, lineKeys, markShared } from "@/lib/shared/compare";
import { linesDoc } from "@/lib/shared/document";

let e: TestEnv;
const bindings = env as unknown as Record<string, unknown>;
const GRADE = { criteria: [{ item: 1, name: "Overall", max_points: 20, points: 18, comment: "Good.", refs: [] }], comments: [], summary: "Good.", confidence: "high", low_confidence_reason: "" };
const reply = () => ({ data: GRADE, usage: { input: 10, cached: 0, output: 5, reasoning: 0 }, model: "m" });
const statusOf = async () => Object.fromEntries((await all<{ status: string; n: number }>("select status, count(*) n from submission group by status")).map((r) => [r.status, r.n]));

beforeEach(async () => {
  e = resetEnv();
  bindings.AI_API_KEY = "test-key";
  vi.spyOn(console, "log").mockImplementation(() => {});
  await addUser("tess");
  await addCourse("A", { tess: "Teacher" });
  await addAssignment("a1", "A");
});

/** `n` files waiting to be graded, queued a second apart so their order is known. */
async function queueFiles(n: number) {
  for (let i = 0; i < n; i++) {
    const id = "f" + String(i).padStart(2, "0");
    await e.FILES.put(`sub/a1/${id}.py`, `print(${i})\n`);
    await addSubmission(id, "a1", { status: "queued", r2Key: `sub/a1/${id}.py`, uploadedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
  }
}

describe("grading", () => {
  it("grades the files that waited longest first, never more at once than the limit", async () => {
    await queueFiles(8);
    let inFlight = 0;
    let peak = 0;
    ai.chat = async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return reply();
    };
    // Eight wake-ups arrive together. The limit is 3, so three take a file and five find nothing to do.
    const first8 = await Promise.all(Array.from({ length: 8 }, () => gradeNext()));
    expect(first8.filter((o) => o === "done")).toHaveLength(3);
    expect(first8.filter((o) => o === "idle")).toHaveLength(5);
    expect(peak).toBe(3);
    expect((await all<{ id: string }>("select id from submission where status = 'graded' order by id")).map((r) => r.id)).toEqual(["f00", "f01", "f02"]);
    // Each one that finishes hands on, until nothing is left.
    while ((await gradeNext()) === "done");
    expect(await statusOf()).toEqual({ graded: 8 });
    expect((await first<{ score: number }>("select score from submission where id = 'f07'"))?.score).toBe(18);
  });

  it("waits, with the reason shown on each file, when there's no API key, and carries on once there is one", async () => {
    await queueFiles(2);
    delete bindings.AI_API_KEY;
    expect(await gradeNext()).toBe("paused");
    expect((await first<{ note: string }>("select note from submission where id = 'f00'"))?.note).toContain("no AI API key");
    bindings.AI_API_KEY = "test-key";
    ai.chat = async () => reply();
    const sendBatch = vi.fn(async () => {});
    bindings.GRADING_QUEUE = { sendBatch, send: vi.fn(async () => {}) };
    // The cron notices files waiting with slots free and sends that many wake-ups.
    await cronTick();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect((sendBatch.mock.calls[0] as unknown[][])[0]).toHaveLength(2);
    expect((await first<{ note: string }>("select note from submission where id = 'f00'"))?.note).toBe("");
  });

  it("only wakes as many graders as there are free slots", async () => {
    await queueFiles(8);
    await run("update submission set status = 'grading', started_at = ? where id = 'f00'", new Date().toISOString());
    const sendBatch = vi.fn(async () => {});
    bindings.GRADING_QUEUE = { sendBatch, send: vi.fn(async () => {}) };
    expect(await kickGrading()).toBe(2);
    await run("update submission set status = 'grading', started_at = ? where id in ('f01', 'f02')", new Date().toISOString());
    expect(await kickGrading()).toBe(0);
  });

  it("puts a file back after an error worth retrying, makes it wait, and gives up after three tries", async () => {
    await queueFiles(1);
    const send = vi.fn(async () => {});
    bindings.GRADING_QUEUE = { sendBatch: vi.fn(async () => {}), send };
    ai.chat = async () => {
      throw new AiError("The AI API is rate limiting requests (429).", true, 429);
    };
    expect(await gradeNext()).toBe("retry");
    const waiting = (await first<{ status: string; queued_at: string; note: string }>("select status, queued_at, note from submission where id = 'f00'"))!;
    expect(waiting.status).toBe("queued");
    expect(waiting.note).toContain("Retrying");
    expect(Date.parse(waiting.queued_at)).toBeGreaterThan(Date.now() + 20_000);
    // A wake-up is scheduled for when it's due, and until then the file is out of reach.
    expect((send.mock.calls[0] as unknown[])[1]).toEqual({ delaySeconds: 31 });
    expect(await gradeNext()).toBe("idle");
    for (const outcome of ["retry", "failed"]) {
      await run("update submission set queued_at = ? where id = 'f00'", new Date().toISOString());
      expect(await gradeNext()).toBe(outcome);
    }
    expect(await statusOf()).toEqual({ failed: 1 });
  });

  it("requeues a file whose grading was interrupted", async () => {
    await queueFiles(1);
    await run("update submission set status = 'grading', started_at = ? where id = 'f00'", new Date(Date.now() - 20 * 60_000).toISOString());
    ai.chat = async () => reply();
    // No queue is bound here, so the cron grades it itself.
    await cronTick();
    expect(await statusOf()).toEqual({ graded: 1 });
  });
});

describe("retention", () => {
  it("deletes every file past the retention period, however many there are", async () => {
    // More than D1's 100 parameters per query, which used to stop the sweep after it had deleted the stored files.
    for (let i = 0; i < 230; i++) {
      await e.FILES.put(`sub/a1/old${i}.py`, "x");
      await addSubmission("old" + i, "a1", { uploadedAt: "2020-01-01T00:00:00.000Z", r2Key: `sub/a1/old${i}.py` });
    }
    await addSubmission("recent", "a1");
    expect(await retentionSweep()).toBe(230);
    expect((await all("select id from submission")).map((r) => r.id)).toEqual(["recent"]);
    expect(e.FILES.files.size).toBe(0);
    // The fingerprints stay, so the same file uploaded again is still recognised.
    expect((await first<{ n: number }>("select count(*) n from retained_hash"))?.n).toBe(230);
  });
});

describe("clean-up", () => {
  const useDoc = (assignment: string, key: string) => run("update assignment set task_file = ? where id = ?", JSON.stringify({ key, name: "task.md", size: 1, type: "" }), assignment);

  it("deletes a document only when no assignment uses it any more", async () => {
    await addAssignment("copy", "A");
    await e.FILES.put("docs/tess/x/task.md", "task");
    await e.FILES.put("docs/tess/x/task.md.txt", "task");
    await useDoc("a1", "docs/tess/x/task.md");
    await useDoc("copy", "docs/tess/x/task.md");
    await run("delete from assignment where id = 'a1'");
    expect(await deleteUnusedDocs(["docs/tess/x/task.md"])).toBe(0);
    await run("delete from assignment where id = 'copy'");
    expect(await deleteUnusedDocs(["docs/tess/x/task.md", "sub/a1/not-a-document.py", null])).toBe(1);
    expect([...e.FILES.files.keys()]).toEqual([]);
  });

  it("sweeps up documents left by forms that were never saved, once they're a day old", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);
    for (const key of ["docs/tess/used/task.md", "docs/tess/used/task.md.txt", "docs/tess/orphan/key.ipynb", "docs/tess/orphan/key.ipynb.txt", "docs/tess/fresh/new.pdf"]) await e.FILES.put(key, "x");
    await e.FILES.put("sub/a1/file.py", "x");
    for (const [key, f] of e.FILES.files) if (!key.includes("fresh")) f.uploaded = twoDaysAgo;
    await useDoc("a1", "docs/tess/used/task.md");
    expect(await sweepOrphanDocs()).toBe(2);
    // The one in use, the one uploaded a moment ago (its form may still be open), and submitted files are left alone.
    expect([...e.FILES.files.keys()].sort()).toEqual(["docs/tess/fresh/new.pdf", "docs/tess/used/task.md", "docs/tess/used/task.md.txt", "sub/a1/file.py"]);
  });

  it("keeps the activity log no longer than the files it describes", async () => {
    const at = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
    for (const [id, days] of [["new", 10], ["old", 200]] as const) await run("insert into activity (id, at, type, text) values (?, ?, 'grading', 'Uploaded a file')", id, at(days));
    for (const [id, days] of [["u-new", 200], ["u-old", 500]] as const) await run("insert into ai_usage (id, at, kind, model) values (?, ?, 'grade', 'm')", id, at(days));
    await pruneOldRecords();
    // Retention is 180 days by default. Usage rows have no names in them and stay a little over a year.
    expect((await all("select id from activity")).map((r) => r.id)).toEqual(["new"]);
    expect((await all("select id from ai_usage")).map((r) => r.id)).toEqual(["u-new"]);
  });
});

describe("similarity", () => {
  const STARTER = Array.from({ length: 150 }, (_, i) => `def helper_${i}(frame, column_${i}):\n    return frame[column_${i}].mean() + ${i}`).join("\n");
  const own = (who: string) => Array.from({ length: 6 }, (_, i) => `${who}_result_${i} = ${who}_model_${i}.fit(${who}_x_${i}, ${who}_y_${i}).score(${who}_x_${i}, ${who}_y_${i})`).join("\n");

  it("doesn't call two files alike for sharing the starter they were given", () => {
    const [ada, grace, copy] = [STARTER + "\n" + own("ada"), STARTER + "\n" + own("grace"), STARTER + "\n" + own("ada") + "\n# mine"];
    // Without the starter set aside, the shared starter makes unrelated work look copied.
    expect(similarity(minhash(ada)!, minhash(grace)!)).toBeGreaterThanOrEqual(NEAR_THRESHOLD);
    const starter = shingles(STARTER);
    expect(similarity(minhash(ada, starter)!, minhash(grace, starter)!)).toBeLessThan(0.3);
    // A real copy still stands out.
    expect(similarity(minhash(ada, starter)!, minhash(copy, starter)!)).toBeGreaterThanOrEqual(NEAR_THRESHOLD);
    // A file that is only the starter has nothing of its own to compare.
    expect(minhash(STARTER, starter)).toBeNull();
  });

  it("works out close matches again from the fingerprints, each file against the ones before it", async () => {
    const starter = shingles(STARTER);
    const sig = (text: string) => JSON.stringify(minhash(text, starter));
    for (const [id, text, second] of [["ada", own("ada"), 1], ["grace", own("grace"), 2], ["copy", own("ada") + "\n# mine", 3]] as const) {
      await addSubmission(id, "a1", { uploadedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(), nearOf: "stale" });
      await run("update submission set minhash = ? where id = ?", sig(STARTER + "\n" + text), id);
    }
    await recomputeNearOf("a1");
    const near = Object.fromEntries((await all<{ id: string; near_of: string | null }>("select id, near_of from submission")).map((r) => [r.id, r.near_of && JSON.parse(r.near_of).id]));
    expect(near).toEqual({ ada: null, grace: null, copy: "ada" });
  });

  it("marks the lines two files share, setting the starter's aside", () => {
    const blocks = (text: string) => compareBlocks(linesDoc(text, "py"));
    const starter = lineKeys(blocks("import pandas as pd\nframe = pd.read_csv('data.csv')"));
    const a = blocks("import pandas as pd\nframe = pd.read_csv('data.csv')\nclean = frame.dropna()\nprint(clean.mean())\nx = 1");
    const b = blocks("import pandas as pd\nframe = pd.read_csv('data.csv')\nclean   =   frame.dropna()\nprint(clean.median())");
    const marked = markShared(a, lineKeys(b), starter);
    expect(marked.blocks[0].lines.map((l) => l.mark)).toEqual(["starter", "starter", "same", null, null]);
    // Three lines are the author's own and long enough to count ("x = 1" isn't); one of them is in the other file, spacing aside.
    expect({ own: marked.own, shared: marked.shared }).toEqual({ own: 2, shared: 1 });
  });
});
