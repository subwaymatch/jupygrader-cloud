"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { browserNotifyOn } from "@/lib/client/notify";
import { onChange } from "@/lib/client/sync";
import type { QueueInfo } from "@/lib/server/queue-info";
import type { SubmissionListItem } from "@/lib/shared/types";

const POLL_MS = 3000;
const HIDDEN_POLL_MS = 15_000;

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

  // Feedback pages in other tabs announce grade changes.
  useEffect(() => onChange(assignmentId, () => void refresh()), [assignmentId, refresh]);

  const active = data.items.some((s) => s.status === "queued" || s.status === "grading") || uploading > 0;
  const pausedRef = useRef(false);
  pausedRef.current = !!data.queue.paused && uploading === 0 && !data.items.some((s) => s.status === "grading");

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    const tick = () => {
      const visible = document.visibilityState === "visible";
      // In the background the page only keeps checking when it has a notification to show at the end, and then less often.
      if (visible || browserNotifyOn()) void refresh();
      // Nothing moves while grading is paused (no API key, or the spending cap), so there's less to check for.
      timer.current = setTimeout(tick, visible && !pausedRef.current ? POLL_MS : HIDDEN_POLL_MS);
    };
    timer.current = setTimeout(tick, POLL_MS);
    // Catch up as soon as the page is looked at again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer.current) clearTimeout(timer.current);
      void refresh();
      timer.current = setTimeout(tick, POLL_MS);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, refresh]);

  const upsert = useCallback((item: SubmissionListItem) => {
    setData((d) => ({ ...d, items: [item, ...d.items.filter((x) => x.id !== item.id)] }));
  }, []);

  return { data, refresh, upsert, setUploading, uploading };
}
