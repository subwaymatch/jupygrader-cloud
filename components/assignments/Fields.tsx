"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { Field, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/client/api";
import { DOC_ACCEPT, LENGTHS, STYLES, TONES, type FeedbackLength, type GradingStyle, type Tone } from "@/lib/shared/constants";
import { fmtSize } from "@/lib/shared/format";
import { uploadDoc, type UploadedDoc } from "./uploadDoc";

export function InstructionsField({
  text,
  file,
  onText,
  onFile,
  rows = 4,
  label = true,
}: {
  text: string;
  file: UploadedDoc | null;
  onText: (t: string) => void;
  onFile: (f: UploadedDoc | null) => void;
  rows?: number;
  label?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const doc = await uploadDoc(f);
      if (!doc.hasText) toast("No text could be read from this document. The AI won't see its contents; paste the text instead.", { error: true });
      onFile(doc);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field
      label={label ? "Assignment instructions" : undefined}
      optional={label}
      htmlFor="asg-task"
      hint="Sent to the AI with each submission so it knows what was expected."
      action={
        !file && (
          <Button variant="link" icon="filePlus" onClick={() => ref.current?.click()} loading={busy}>
            Upload document
          </Button>
        )
      }
    >
      <input ref={ref} type="file" accept={DOC_ACCEPT} hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      {file ? (
        <div className="file-chip">
          <Icon name="fileText" size={16} />
          <span className="file-chip__name">{file.name}</span>
          <span className="muted">{fmtSize(file.size)}</span>
          <Button variant="link" onClick={() => ref.current?.click()}>
            Replace
          </Button>
          <Button variant="link" onClick={() => onFile(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <Textarea
          id="asg-task"
          rows={rows}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Paste what students were asked to do, e.g. the questions from the assignment handout."
        />
      )}
    </Field>
  );
}

export type GradingSettings = { style: GradingStyle; tone: Tone; length: FeedbackLength; notes: string };

export function GradingSettingsFields({
  value,
  onChange,
  model,
  disabled,
}: {
  value: GradingSettings;
  onChange: (v: GradingSettings) => void;
  model: string;
  disabled?: boolean;
}) {
  const set = (p: Partial<GradingSettings>) => onChange({ ...value, ...p });
  return (
    <>
      <div className="field">
        <span className="field__label">Grading style</span>
        <Segmented ariaLabel="Grading style" value={value.style} onChange={(s) => set({ style: s })} options={STYLES} disabled={disabled} />
        <span className="field__hint">{STYLES.find((s) => s.id === value.style)?.desc}</span>
      </div>
      <div className="field">
        <span className="field__label">Student feedback</span>
        <div className="form-grid">
          <div className="field">
            <span className="field__hint">Tone</span>
            <Segmented ariaLabel="Tone" value={value.tone} onChange={(t) => set({ tone: t })} options={TONES} disabled={disabled} />
          </div>
          <div className="field">
            <span className="field__hint">Length</span>
            <Segmented ariaLabel="Length" value={value.length} onChange={(l) => set({ length: l })} options={LENGTHS} disabled={disabled} />
          </div>
        </div>
        <span className="field__hint">Changes how the summary and comments are written. Scores are not affected.</span>
      </div>
      <div className="field">
        <span className="field__label">Model</span>
        <span className="row" style={{ gap: 7 }}>
          <Icon name="bot" size={15} style={{ color: "var(--c-muted)" }} />
          {model || "Not set"}
        </span>
        <span className="field__hint">Used for all assignments. Set by an admin in Settings.</span>
      </div>
      <Field label="Notes for the AI" optional htmlFor="asg-notes">
        <Textarea
          id="asg-notes"
          rows={3}
          value={value.notes}
          readOnly={disabled}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. Partial credit for a correct approach with arithmetic errors."
        />
      </Field>
    </>
  );
}
