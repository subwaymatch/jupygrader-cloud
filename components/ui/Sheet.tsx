"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { CSSProperties, ReactNode } from "react";

/** A panel that slides in from the side, built on Base UI Dialog. */
export function Sheet({
  open,
  onOpenChange,
  side = "right",
  label,
  children,
  className,
  style,
  modal = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "right" | "left";
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  modal?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)} modal={modal}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup
          className={["sheet", side === "left" && "sheet--left", className].filter(Boolean).join(" ")}
          aria-label={label}
          style={style}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Dialog };
