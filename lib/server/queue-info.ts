import { first } from "./db";
import { getSettingsWithKey, monthUsage } from "./settings";

export type QueueInfo = { waiting: number; grading: number; concurrency: number; paused: "cap" | "nokey" | null; cap: number };

/** Site-wide grading queue state, shown above the submissions table. */
export async function queueInfo(): Promise<QueueInfo> {
  const s = await getSettingsWithKey();
  const w = await first<{ q: number; g: number }>(
    "select sum(case when status = 'queued' then 1 else 0 end) q, sum(case when status = 'grading' then 1 else 0 end) g from submission where status in ('queued','grading')",
  );
  let paused: QueueInfo["paused"] = null;
  if (!s.aiApiKey) paused = "nokey";
  else if (s.capOn && s.cap > 0 && (w?.q ?? 0) > 0 && (await monthUsage()).cost >= s.cap) paused = "cap";
  return { waiting: w?.q ?? 0, grading: w?.g ?? 0, concurrency: s.concurrency, paused, cap: s.cap };
}
