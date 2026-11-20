"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className={"dialog" + (wide ? " dialog--wide" : "")}>
            <div className="dialog__head">
              <Dialog.Title className="dialog__title">{title}</Dialog.Title>
              {description && <Dialog.Description className="dialog__desc">{description}</Dialog.Description>}
            </div>
            {children && <div className="dialog__body">{children}</div>}
            {footer && <div className="dialog__foot">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ConfirmOptions = { title: string; body?: ReactNode; cta: string; danger?: boolean; cancel?: string };

/** Asked before revoking an invitation, from a course's people list or the admin's. */
export const revokeInvitation = (email: string): ConfirmOptions => ({
  title: "Revoke this invitation?",
  body: `The link sent to ${email} stops working. To let them join later, invite them again.`,
  cta: "Revoke invitation",
  danger: true,
});

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Provides `useConfirm()`, an awaitable confirmation dialog. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<(v: boolean) => void>(null);
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const done = (v: boolean) => {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(o) => !o && done(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="backdrop" />
          <AlertDialog.Viewport className="dialog-viewport">
            <AlertDialog.Popup className="dialog">
              <div className="dialog__head">
                <AlertDialog.Title className="dialog__title">{opts?.title}</AlertDialog.Title>
                {opts?.body && <AlertDialog.Description className="dialog__desc">{opts.body}</AlertDialog.Description>}
              </div>
              <div className="dialog__foot">
                {/* Focus starts on the safe choice when the action destroys something, so a stray Enter doesn't confirm it. */}
                <Button variant="ghost" onClick={() => done(false)} autoFocus={!!opts?.danger}>
                  {opts?.cancel ?? "Cancel"}
                </Button>
                <Button variant={opts?.danger ? "danger" : "primary"} onClick={() => done(true)} autoFocus={!opts?.danger}>
                  {opts?.cta}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
