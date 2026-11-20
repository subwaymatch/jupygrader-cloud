"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useConfirm, type ConfirmOptions } from "./Dialog";

// Work that would be lost by leaving the page: unsaved edits, or files still uploading. Components
// register it with useLeaveGuard or useUnloadWarning, and <LeaveGuard />, mounted once in the root
// layout, asks before the page is closed, reloaded or left through a link.

type Guard = { options: () => ConfirmOptions | null };
const guards = new Set<Guard>();

export const UNSAVED_CHANGES: ConfirmOptions = {
  title: "Leave without saving?",
  body: "You have changes that haven't been saved. They'll be lost if you leave.",
  cta: "Leave without saving",
  cancel: "Keep editing",
  danger: true,
};

/** While `on`, asks before the page is closed or reloaded, and before a link or tab takes the person away. */
export function useLeaveGuard(on: boolean, options: ConfirmOptions = UNSAVED_CHANGES) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!on) return;
    const g: Guard = { options: () => latest.current };
    guards.add(g);
    return () => void guards.delete(g);
  }, [on]);
}

/**
 * While `on`, the browser asks before the page is closed or reloaded. For work that carries on when the
 * person moves around inside the app, such as an upload, but stops when the page goes away.
 */
export function useUnloadWarning(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const g: Guard = { options: () => null };
    guards.add(g);
    return () => void guards.delete(g);
  }, [on]);
}

/** For moves inside a page, such as switching tabs: resolves true when nothing would be lost, or the person chose to leave. */
export function useConfirmLeave(): () => Promise<boolean> {
  const confirm = useConfirm();
  return useCallback(async () => {
    for (const g of guards) {
      const o = g.options();
      if (o) return confirm(o);
    }
    return true;
  }, [confirm]);
}

export function LeaveGuard() {
  const router = useRouter();
  const confirmLeave = useConfirmLeave();
  useEffect(() => {
    // Closing the tab, reloading, or going to another site. Browsers show their own wording here.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!guards.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // Links inside the app don't unload the page, so they're caught here, before the router acts on them.
    const onClick = async (e: MouseEvent) => {
      if (![...guards].some((g) => g.options()) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      // Another site unloads the page, which onUnload covers. A link within this page loses nothing.
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      if (await confirmLeave()) router.push(to.pathname + to.search + to.hash);
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [confirmLeave, router]);
  return null;
}
