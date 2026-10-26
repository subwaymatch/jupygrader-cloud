"use client";

import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

const manager = Toast.createToastManager();

/** Shows a short message at the bottom of the screen. Works from anywhere in client code. */
export function toast(title: string, opts: { error?: boolean; action?: { label: string; onClick: () => void }; timeout?: number } = {}) {
  manager.add({
    title,
    type: opts.error ? "error" : "info",
    timeout: opts.timeout ?? (opts.error ? 6000 : 3500),
    actionProps: opts.action ? { children: opts.action.label, onClick: opts.action.onClick } : undefined,
  });
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className={"toast" + (t.type === "error" ? " toast--error" : "")}>
      <Toast.Content className="toast__content">
        <Toast.Title className="toast__title" />
        <Toast.Action className="toast__action" />
        <Toast.Close className="toast__close" aria-label="Dismiss">
          <Icon name="x" size={14} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="toast-viewport">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
