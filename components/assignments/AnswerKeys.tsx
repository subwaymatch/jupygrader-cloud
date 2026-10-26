"use client";

import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/client/api";
import { fmtSize } from "@/lib/shared/format";
import { uploadDoc } from "./uploadDoc";

export type KeyFile = { id?: string; key?: string; name: string; size: number };

export function AnswerKeys({ files, onChange }: { files: KeyFile[]; onChange: (f: KeyFile[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function add(list: FileList | File[] | null) {
    const arr = [...(list || [])];
    if (!arr.length) return;
    setBusy(true);
    const next = [...files];
    for (const f of arr) {
      try {
        const doc = await uploadDoc(f);
        next.push({ key: doc.key, name: doc.name, size: doc.size });
      } catch (err) {
        toast(`${f.name}: ${errorMessage(err)}`, { error: true });
      }
    }
    onChange(next);
    setBusy(false);
  }

  return (
    <div className="field">
      <div className="field__label">
        <span>
          Answer key or solution <span className="opt">optional</span>
        </span>
        <Button variant="link" icon="filePlus" onClick={() => ref.current?.click()} loading={busy}>
          {files.length ? "Add file" : "Upload"}
        </Button>
      </div>
      <input ref={ref} type="file" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      {files.length === 0 ? (
        <button
          type="button"
          className={"dropzone dropzone--compact" + (over ? " dropzone--active" : "")}
          style={{ justifyContent: "center", color: "var(--c-muted)", cursor: "pointer" }}
          onClick={() => ref.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
        >
          <Icon name="key" size={15} />
          Drop the answer key, a solution notebook, or solution code
        </button>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {files.map((f, i) => (
            <div className="file-chip" key={(f.id || f.key) + String(i)}>
              <Icon name="file" size={16} />
              <span className="file-chip__name" title={f.name}>
                {f.name}
              </span>
              <span className="muted">{fmtSize(f.size)}</span>
              <IconButton icon="x" label={`Remove ${f.name}`} size={14} onClick={() => onChange(files.filter((_, k) => k !== i))} />
            </div>
          ))}
        </div>
      )}
      <span className="field__hint">Any file type. The AI compares each submission against these files. They are never shown to students or included in feedback.</span>
    </div>
  );
}
