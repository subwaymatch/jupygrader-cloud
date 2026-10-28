import { cleanOutputPolicy, LENGTHS, MAX_AI_IMAGES, STYLES, TONES, type OutputPolicy } from "@/lib/shared/constants";
import { effectiveTotal, namedRows, rubricProblem, type RubricMethod } from "@/lib/shared/rubric";
import type { AssignmentData, RubricRow, StoredFile } from "@/lib/shared/types";
import type { AssignmentRow } from "./access";
import { all, first, parseJson, run } from "./db";
import { getEnv } from "./env";
import { badRequest } from "./http";
import { newId } from "./ids";

export async function assignmentData(a: AssignmentRow): Promise<AssignmentData> {
  const keys = await all<{ id: string; name: string; size: number }>(
    "select id, name, size from answer_key where assignment_id = ? order by created_at",
    a.id,
  );
  const strip = (f: StoredFile | null) => (f ? { key: f.key, name: f.name, size: f.size, type: f.type } : null);
  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    points: a.points,
    taskText: a.task_text,
    taskFile: strip(parseJson<StoredFile | null>(a.task_file, null)),
    rubricMethod: (a.rubric_method as RubricMethod) || "none",
    rubricSource: a.rubric_source,
    rubricFile: strip(parseJson<StoredFile | null>(a.rubric_file, null)),
    rubricRows: parseJson<RubricRow[]>(a.rubric_rows, []),
    style: a.style as AssignmentData["style"],
    tone: a.tone as AssignmentData["tone"],
    length: a.length as AssignmentData["length"],
    notes: a.notes,
    aiImages: cleanOutputPolicy(parseJson(a.ai_images, null)),
    aiInteractive: cleanOutputPolicy(parseJson(a.ai_interactive, null)),
    version: a.version,
    answerKeys: keys,
  };
}

/** Uploaded documents live under docs/<uploader>/; their extracted text sits next to them. */
export function ownsDocKey(key: string, userId: string) {
  return typeof key === "string" && key.startsWith(`docs/${userId}/`) && !key.includes("..");
}

export async function storedFileFromKey(key: string): Promise<StoredFile> {
  const obj = await getEnv().FILES.head(key);
  if (!obj) throw badRequest("An uploaded file is missing. Upload it again.");
  const txt = await getEnv().FILES.get(key + ".txt");
  const text = txt ? (await txt.text()).slice(0, 60_000) : "";
  const meta = obj.customMetadata || {};
  return { key, name: meta.name || key.split("/").pop() || "file", size: obj.size, type: obj.httpMetadata?.contentType || "", text };
}

export type AssignmentInput = {
  title?: string;
  taskText?: string;
  taskFileKey?: string | null;
  points?: string | number | null;
  rubricMethod?: RubricMethod;
  rubricSource?: string;
  rubricFileKey?: string | null;
  rubricRows?: RubricRow[];
  style?: string;
  tone?: string;
  length?: string;
  notes?: string;
  aiImages?: OutputPolicy | null;
  aiInteractive?: OutputPolicy | null;
  addAnswerKeys?: string[];
  removeAnswerKeys?: string[];
};

function cleanRows(rows: unknown): RubricRow[] {
  if (!Array.isArray(rows)) return [];
  return namedRows(
    rows.slice(0, 40).map((r) => ({
      name: String((r as RubricRow)?.name ?? "").slice(0, 300),
      pts: String(Math.max(0, Math.round((+(r as RubricRow)?.pts || 0) * 2) / 2)),
      desc: String((r as RubricRow)?.desc ?? "").slice(0, 2000),
    })),
  );
}

/**
 * Builds the column values for an insert or update from the request body.
 * Returns only the columns present in the input, plus whether grading-relevant
 * settings changed (which bumps the rubric version).
 */
export async function assignmentColumns(input: AssignmentInput, userId: string, existing: AssignmentRow | null) {
  const cols: Record<string, string | number | null> = {};
  if (input.title !== undefined || !existing) {
    const t = String(input.title ?? "").trim();
    if (!t) throw badRequest("Give the assignment a title.");
    if (t.length > 200) throw badRequest("Titles can be up to 200 characters.");
    cols.title = t;
  }
  if (input.taskText !== undefined) cols.task_text = String(input.taskText).slice(0, 100_000);
  if (input.taskFileKey !== undefined) {
    if (input.taskFileKey === null) cols.task_file = null;
    else {
      const current = parseJson<StoredFile | null>(existing?.task_file ?? null, null);
      if (current?.key !== input.taskFileKey) {
        if (!ownsDocKey(input.taskFileKey, userId)) throw badRequest("Upload the instructions document again.");
        cols.task_file = JSON.stringify(await storedFileFromKey(input.taskFileKey));
      }
    }
  }
  if (input.notes !== undefined) cols.notes = String(input.notes).slice(0, 5000);
  if (input.style !== undefined) {
    if (!STYLES.some((s) => s.id === input.style)) throw badRequest("Unknown grading style.");
    cols.style = input.style;
  }
  if (input.tone !== undefined) {
    if (!TONES.some((s) => s.id === input.tone)) throw badRequest("Unknown feedback tone.");
    cols.tone = input.tone;
  }
  if (input.length !== undefined) {
    if (!LENGTHS.some((s) => s.id === input.length)) throw badRequest("Unknown feedback length.");
    cols.length = input.length;
  }
  for (const [key, col, what] of [
    ["aiImages", "ai_images", "images"],
    ["aiInteractive", "ai_interactive", "interactive outputs"],
  ] as const) {
    const v = input[key];
    if (v === undefined) continue;
    const p = v === null ? null : cleanOutputPolicy(v);
    if (v !== null && !p) throw badRequest(`Enter a number from 1 to ${MAX_AI_IMAGES} for how many ${what} to send.`);
    cols[col] = p && JSON.stringify(p);
  }

  const rubricTouched =
    input.points !== undefined || input.rubricMethod !== undefined || input.rubricRows !== undefined || input.rubricSource !== undefined || input.rubricFileKey !== undefined;
  if (rubricTouched || !existing) {
    const method: RubricMethod = input.rubricMethod ?? ((existing?.rubric_method as RubricMethod) || "none");
    if (!["none", "paste", "manual"].includes(method)) throw badRequest("Unknown rubric type.");
    const rows = input.rubricRows !== undefined ? cleanRows(input.rubricRows) : parseJson<RubricRow[]>(existing?.rubric_rows ?? "[]", []);
    const pointsRaw = input.points !== undefined ? String(input.points ?? "") : String(existing?.points ?? "");
    const source = input.rubricSource !== undefined ? String(input.rubricSource).slice(0, 50_000) : (existing?.rubric_source ?? "");
    let rubricFile = existing?.rubric_file ?? null;
    if (input.rubricFileKey !== undefined) {
      if (input.rubricFileKey === null) rubricFile = null;
      else if (parseJson<StoredFile | null>(rubricFile, null)?.key !== input.rubricFileKey) {
        if (!ownsDocKey(input.rubricFileKey, userId)) throw badRequest("Upload the rubric document again.");
        rubricFile = JSON.stringify(await storedFileFromKey(input.rubricFileKey));
      }
    }
    const problem = rubricProblem({ method, rows, points: pointsRaw, hasSource: !!source.trim() || !!rubricFile });
    if (problem) throw badRequest(problem);
    cols.points = effectiveTotal(pointsRaw);
    cols.rubric_method = method;
    cols.rubric_rows = JSON.stringify(method === "none" ? [] : rows);
    cols.rubric_source = method === "paste" ? source : "";
    cols.rubric_file = method === "paste" ? rubricFile : null;
  }

  let gradingChanged = false;
  if (existing) {
    gradingChanged =
      (cols.points !== undefined && cols.points !== existing.points) ||
      (cols.rubric_method !== undefined && cols.rubric_method !== existing.rubric_method) ||
      (cols.rubric_rows !== undefined && cols.rubric_rows !== existing.rubric_rows) ||
      (cols.style !== undefined && cols.style !== existing.style);
  }
  return { cols, gradingChanged };
}

export async function applyAnswerKeys(assignmentId: string, userId: string, add: string[] = [], remove: string[] = []) {
  for (const id of remove) await run("delete from answer_key where id = ? and assignment_id = ?", id, assignmentId);
  for (const key of add) {
    if (!ownsDocKey(key, userId)) throw badRequest("Upload the answer key again.");
    const f = await storedFileFromKey(key);
    await run(
      "insert into answer_key (id, assignment_id, name, size, content_type, r2_key, text_content, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      newId(),
      assignmentId,
      f.name,
      f.size,
      f.type || "application/octet-stream",
      key,
      f.text ?? "",
      new Date().toISOString(),
    );
  }
}

export async function nextPosition(courseId: string): Promise<number> {
  return ((await first<{ p: number }>("select max(position) p from assignment where course_id = ?", courseId))?.p ?? 0) + 1;
}
