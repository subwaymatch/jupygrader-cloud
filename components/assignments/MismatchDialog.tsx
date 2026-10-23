"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";

export type MismatchChoice = "scale" | "useSum" | "asIs";

export function MismatchDialog({
  open,
  sum,
  tot,
  onChoose,
  onClose,
}: {
  open: boolean;
  sum: number;
  tot: number;
  onChoose: (c: MismatchChoice) => void;
  onClose: () => void;
}) {
  const opt = (c: MismatchChoice, title: string, desc: string, rec?: boolean) => (
    <button type="button" className="radio-card" style={{ width: "100%" }} onClick={() => onChoose(c)}>
      <span>
        <span className="radio-card__title">
          {title} {rec && <span className="chip chip--blue" style={{ marginLeft: 6, fontSize: 12 }}>Recommended</span>}
        </span>
        <span className="radio-card__desc">{desc}</span>
      </span>
    </button>
  );
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Rubric items add up to ${sum}, not ${tot}`}
      description="Choose how to save. You can change this later in the Rubric tab."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="stack">
        {opt("scale", `Scale items to add up to ${tot}`, "Each item's points change in proportion.", true)}
        {opt("useSum", `Change the total to ${sum}`, "Item points stay as they are.")}
        {opt("asIs", "Save as is", `Item points stay, and each score is scaled from ${sum} to ${tot} points.`)}
      </div>
    </Modal>
  );
}
