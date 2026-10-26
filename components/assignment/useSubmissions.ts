"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { QueueInfo } from "@/lib/server/queue-info";
import type { SubmissionListItem } from "@/lib/shared/types";

export type ListResponse = { items: SubmissionListItem[]; queue: QueueInfo; version: number };

/** Loads the submissions table and polls while files are queued or grading. */
export function useSubmissions(assignmentId: string, initial: ListResponse, onBatchDone?: (items: SubmissionListItem[]) => void) {
  const [data, setData] = useState<ListResponse>(initial);
  const [uploading, setUploading] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasActive = useRef(initial.items.some((s) => s.status === "queued" || s.status === "grading"));
  const doneRef = useRef(onBatchDone);
  doneRef.current = onBatchDone;

  const refresh = useCallback(async () => {
    try {
      const next = await api<ListResponse>(`/api/assignments/${assignmentId}/submissions`);
      setData(next);
      const active = next.items.some((s) => s.status === "queued" || s.status === "grading");
      if (wasActive.current && !active) doneRef.current?.(next.items);
      wasActive.current = active;
      return next;
    } catch {
      return null;
    }
  }, [assignmentId]);

  const active = data.items.some((s) => s.status === "queued" || s.status === "grading") || uploading > 0;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
      timer.current = setTimeout(tick, 3000);
    };
    timer.current = setTimeout(tick, 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, refresh]);

  const upsert = useCallback((item: SubmissionListItem) => {
    setData((d) => ({ ...d, items: [item, ...d.items.filter((x) => x.id !== item.id)] }));
  }, []);

  return { data, refresh, upsert, setUploading, uploading };
}
