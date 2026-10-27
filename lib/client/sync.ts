/**
 * Keeps an assignment's page and the feedback pages opened from it in step.
 * The table shares its current order so J and K follow it, and feedback pages
 * announce changes so the table refreshes.
 */

const CHANNEL = "jg-submissions";
const orderKey = (assignmentId: string) => `jg-order:${assignmentId}`;

export function saveOrder(assignmentId: string, ids: string[]) {
  try {
    localStorage.setItem(orderKey(assignmentId), JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/** The table's last order, if it includes this file. */
export function savedOrder(assignmentId: string, id: string): string[] | null {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(orderKey(assignmentId)) || "null");
    return Array.isArray(ids) && ids.includes(id) ? ids : null;
  } catch {
    return null;
  }
}

export function announceChange(assignmentId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(assignmentId);
  channel.close();
}

/** Calls `fn` when another tab changes a file in this assignment. Returns an unsubscribe function. */
export function onChange(assignmentId: string, fn: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e) => {
    if (e.data === assignmentId) fn();
  };
  return () => channel.close();
}
