"use client";

import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/client/api";
import { fmtSize } from "@/lib/shared/format";
import { uploadDoc } from "./uploadDoc";

export type StarterValue = { key: string; name: string; size: number } | null;

/** The notebook or code students started from. Its code is left out when submissions are compared with each other. */
export function StarterFile({ value, onChange }: { value: StarterValue; onChange: (v: StarterValue) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const doc = await uploadDoc(f);
      onChange({ key: doc.key, name: doc.name, size: doc.size });
    } catch (err) {
      toast(`${f.name}: ${errorMessage(err)}`, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <div className="field__label">
        <span>
          Starter file <span className="opt">optional</span>
        </span>
        <Button variant="link" icon="filePlus" onClick={() => ref.current?.click()} loading={busy}>
          {value ? "Replace" : "Upload"}
        </Button>
      </div>
      <input ref={ref} type="file" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      {value && (
        <div className="file-chip">
          <Icon name="file" size={16} />
          <span className="file-chip__name" title={value.name}>
            {value.name}
          </span>
          <span className="muted">{fmtSize(value.size)}</span>
          <IconButton icon="x" label={`Remove ${value.name}`} size={14} onClick={() => onChange(null)} />
        </div>
      )}
      <span className="field__hint">
        The template notebook or starter code you gave students. Its code is ignored when submissions are compared, so work that only shares the
        starter isn&apos;t flagged as a close match.
      </span>
    </div>
  );
}
