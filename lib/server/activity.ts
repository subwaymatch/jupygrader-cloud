import type { ActivityType } from "@/lib/shared/constants";
import { run } from "./db";
import { newId } from "./ids";

export async function logActivity(opts: {
  type: ActivityType;
  text: string;
  user?: { id: string; name: string } | null;
  courseId?: string | null;
}): Promise<void> {
  try {
    await run(
      "insert into activity (id, at, user_id, user_name, course_id, type, text) values (?, ?, ?, ?, ?, ?, ?)",
      newId(),
      new Date().toISOString(),
      opts.user?.id ?? null,
      opts.user?.name ?? "Jupygrader",
      opts.courseId ?? null,
      opts.type,
      opts.text.slice(0, 1000),
    );
  } catch (err) {
    console.error("Could not record activity", err);
  }
}
