import { quickItemize } from "@/lib/shared/rubric";
import type { RubricRow } from "@/lib/shared/types";
import { chatJson } from "./ai";
import { recordUsage } from "./grading";
import { costOf, getSettingsWithKey } from "./settings";

const ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "note"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "points", "description"],
        properties: {
          name: { type: "string", description: "Short item name, 2 to 6 words." },
          points: { type: "number" },
          description: { type: "string", description: "What earns full credit, one or two sentences." },
        },
      },
    },
    note: { type: "string", description: "One sentence about anything that was unclear, or an empty string." },
  },
} as const;

type RawItems = { items?: { name?: string; points?: number; description?: string }[]; note?: string };

function toRows(raw: RawItems): RubricRow[] {
  return (raw.items || [])
    .filter((i) => (i.name || "").trim())
    .slice(0, 25)
    .map((i) => ({ name: String(i.name).trim(), pts: String(Math.max(0, Math.round((Number(i.points) || 0) * 2) / 2)), desc: String(i.description || "").trim() }));
}

/** Turns rubric text written in any format into scored items. */
export async function itemizeRubric(text: string, total: number, ctx: { assignmentId?: string; courseId?: string }) {
  const quick = quickItemize(text);
  if (quick.length && quick.every((r) => +r.pts > 0)) return { rows: quick, note: "" };
  const settings = await getSettingsWithKey();
  const { data, usage, model } = await chatJson<RawItems>({
    settings,
    schemaName: "rubric_items",
    schema: ITEMS_SCHEMA,
    timeoutMs: 120_000,
    messages: [
      {
        role: "system",
        content:
          "You turn a grading rubric written by an instructor into a list of scored items. Keep the instructor's items, wording and point values. Don't invent requirements. If points are given as percentages, convert them to points out of the total. If an item has no points, split the remaining points sensibly and say so in the note.",
      },
      { role: "user", content: `Total points: ${total}\n\nRubric:\n${text.slice(0, 40_000)}` },
    ],
  });
  await recordUsage({ kind: "itemize", usage, cost: costOf(usage, settings), model, ...ctx });
  return { rows: toRows(data), note: String(data.note || "").trim() };
}

/** Drafts rubric items from the assignment instructions. */
export async function draftRubric(task: string, total: number, ctx: { assignmentId?: string; courseId?: string }) {
  const settings = await getSettingsWithKey();
  const { data, usage, model } = await chatJson<RawItems>({
    settings,
    schemaName: "rubric_items",
    schema: ITEMS_SCHEMA,
    timeoutMs: 120_000,
    messages: [
      {
        role: "system",
        content: `You draft a grading rubric from assignment instructions. Make 3 to 8 items that follow the structure of the instructions (one per question or part where sensible), plus one item for clarity or code quality if the work includes code. The points must add up to exactly ${total}. Descriptions say what earns full credit.`,
      },
      { role: "user", content: `Total points: ${total}\n\nAssignment instructions:\n${task.slice(0, 40_000)}` },
    ],
  });
  await recordUsage({ kind: "draft", usage, cost: costOf(usage, settings), model, ...ctx });
  return { rows: toRows(data), note: String(data.note || "").trim() };
}
