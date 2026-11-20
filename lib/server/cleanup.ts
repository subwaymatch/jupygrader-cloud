// Removing what nothing points at any more: uploaded documents whose assignment is gone, and old records.
import { all, first, run } from "./db";
import { getEnv } from "./env";
import { getSettings } from "./settings";
import { deleteFiles } from "./storage";

/** The uploaded documents an assignment row points at: instructions, rubric and starter file. */
export const ASSIGNMENT_DOC_COLUMNS = ["task_file", "rubric_file", "starter_file"] as const;

const USED_SQL = `select (exists (select 1 from answer_key where r2_key = ?1)
  or exists (select 1 from assignment where ${ASSIGNMENT_DOC_COLUMNS.map((c) => `json_extract(${c}, '$.key') = ?1`).join(" or ")})) used`;

/**
 * Deletes the given uploaded documents, with the text extracted from them, unless an assignment
 * still uses them. A copy of an assignment shares its documents with the original, so a document
 * goes only when its last user does. Call it after the rows that used them are gone.
 */
export async function deleteUnusedDocs(keys: (string | null | undefined)[]): Promise<number> {
  const gone: string[] = [];
  for (const key of new Set(keys)) {
    if (!key || !key.startsWith("docs/")) continue;
    if (!(await first<{ used: number }>(USED_SQL, key))?.used) gone.push(key);
  }
  await deleteFiles(gone.flatMap((k) => [k, k + ".txt"]));
  return gone.length;
}

/** The documents of some assignments, read before the assignments are deleted. */
export async function assignmentDocKeys(where: string, param: string): Promise<string[]> {
  const cols = ASSIGNMENT_DOC_COLUMNS.map((c) => `json_extract(${c}, '$.key') ${c}`).join(", ");
  const asgs = await all<Record<(typeof ASSIGNMENT_DOC_COLUMNS)[number], string | null>>(`select ${cols} from assignment a where ${where}`, param);
  const keys = await all<{ r2_key: string }>(`select k.r2_key from answer_key k join assignment a on a.id = k.assignment_id where ${where}`, param);
  return [...keys.map((k) => k.r2_key), ...asgs.flatMap((a) => ASSIGNMENT_DOC_COLUMNS.map((c) => a[c] ?? ""))].filter(Boolean);
}

const DAY = 86400_000;
/** A document uploaded on a form that was never saved is kept this long, in case the form is still open. */
const ORPHAN_AFTER_MS = DAY;
const MAX_PAGES = 20;

/** Daily: uploaded documents that no assignment uses, such as ones attached to a form that was abandoned. */
export async function sweepOrphanDocs(): Promise<number> {
  const used = new Set(
    (
      await all<{ k: string | null }>(
        `select r2_key k from answer_key ${ASSIGNMENT_DOC_COLUMNS.map((c) => `union select json_extract(${c}, '$.key') from assignment`).join(" ")}`,
      )
    ).map((r) => r.k),
  );
  const bucket = getEnv().FILES;
  const before = Date.now() - ORPHAN_AFTER_MS;
  const gone: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await bucket.list({ prefix: "docs/", cursor });
    for (const o of list.objects) {
      // "<key>.txt" is the text extracted from <key>, and lives and dies with it.
      const inUse = used.has(o.key) || (o.key.endsWith(".txt") && used.has(o.key.slice(0, -4)));
      if (!inUse && o.uploaded.getTime() < before) gone.push(o.key);
    }
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  await deleteFiles(gone);
  return gone.length;
}

/** AI usage rows only feed this month's spending total and carry no names, so they're kept a little over a year. */
const USAGE_DAYS = 400;

/**
 * Daily: old records. The activity log names files and people, so it's kept no longer than the files
 * themselves (the retention period in Settings). Batch notices only stop a second "grading finished"
 * email, which can't happen once a batch is a month old.
 */
export async function pruneOldRecords(): Promise<void> {
  const { retention } = await getSettings();
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  await run("delete from activity where at < ?", ago(retention));
  await run("delete from ai_usage where at < ?", ago(Math.max(USAGE_DAYS, retention)));
  await run("delete from batch_notice where at < ?", ago(30));
}
