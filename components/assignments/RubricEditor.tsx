"use client";

import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { RadioCards } from "@/components/ui/Controls";
import { AffixInput, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { DOC_ACCEPT } from "@/lib/shared/constants";
import { fmtSize } from "@/lib/shared/format";
import { EXAMPLE_RUBRIC, effectiveTotal, emptyRow, pointsMismatch, rowsTotal, scaleRows, type RubricMethod } from "@/lib/shared/rubric";
import type { RubricRow } from "@/lib/shared/types";
import { uploadDoc, type UploadedDoc } from "./uploadDoc";

export type RubricValue = {
  method: RubricMethod;
  rows: RubricRow[];
  source: string;
  file: UploadedDoc | null;
  points: string;
};

const METHODS: { id: RubricMethod; title: string; desc: string }[] = [
  { id: "none", title: "No rubric", desc: "The AI splits the total using the assignment instructions." },
  { id: "paste", title: "Paste or upload", desc: "The AI turns your rubric into items you can edit." },
  { id: "manual", title: "Build it yourself", desc: "Add each item and its points." },
];

function autoGrow(e: React.FormEvent<HTMLTextAreaElement> | React.FocusEvent<HTMLTextAreaElement>) {
  const t = e.currentTarget;
  t.style.height = "auto";
  t.style.height = t.scrollHeight + 2 + "px";
}

export function PointsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="asg-points">
        <span>
          Total points <span className="opt">optional</span>
        </span>
      </label>
      <AffixInput
        id="asg-points"
        className="affix--pts"
        type="number"
        min={0}
        step={0.5}
        inputMode="decimal"
        value={value}
        placeholder="100"
        suffix="pts"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="field__hint">Leave blank to use 100.</span>
    </div>
  );
}

export function RubricEditor({
  value,
  onChange,
  courseId,
  assignmentId,
  taskText,
  hasTaskFile,
}: {
  value: RubricValue;
  onChange: (v: RubricValue) => void;
  courseId: string;
  assignmentId?: string;
  taskText: string;
  hasTaskFile?: boolean;
}) {
  const [tab, setTab] = useState<"source" | "items">(value.method === "paste" && value.rows.length ? "items" : "source");
  const [busy, setBusy] = useState<"" | "itemize" | "draft" | "upload">("");
  const [aiNote, setAiNote] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<RubricValue>) => onChange({ ...value, ...patch });
  const total = effectiveTotal(value.points);
  const sum = rowsTotal(value.rows);
  const mismatch = pointsMismatch(value.method, value.rows, value.points);
  const hasTask = !!taskText.trim() || !!hasTaskFile;

  async function itemize() {
    setBusy("itemize");
    try {
      const r = await api<{ rows: RubricRow[]; note: string }>("/api/ai/rubric", {
        body: { mode: "itemize", text: value.source, fileKey: value.file?.key, points: value.points, courseId, assignmentId },
      });
      set({ rows: r.rows });
      setAiNote(r.note || `The AI found ${r.rows.length} items. Check the names and points, then edit anything that's off.`);
      setTab("items");
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function draft() {
    if (!taskText.trim()) {
      toast("Paste the instructions as text to draft rubric items from them.", { error: true });
      return;
    }
    setBusy("draft");
    try {
      const r = await api<{ rows: RubricRow[]; note: string }>("/api/ai/rubric", {
        body: { mode: "draft", text: taskText, points: value.points, courseId, assignmentId },
      });
      onChange({ ...value, method: "manual", rows: r.rows });
      setAiNote(`Drafted ${r.rows.length} items from the instructions. Review them before grading.`);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy("upload");
    try {
      const doc = await uploadDoc(f);
      if (!doc.hasText) toast("No text could be read from this document. Paste the rubric instead.", { error: true });
      set({ file: doc });
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  const updateRow = (i: number, patch: Partial<RubricRow>) => set({ rows: value.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= value.rows.length || from === to) return;
    const rows = [...value.rows];
    const [r] = rows.splice(from, 1);
    rows.splice(to, 0, r);
    set({ rows });
  };

  const showTable = value.method === "manual" || (value.method === "paste" && tab === "items" && value.rows.length > 0);
  const showSource = value.method === "paste" && (tab === "source" || !value.rows.length);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="stack" style={{ gap: 2 }}>
        <span className="field__label">Rubric</span>
        <span className="field__hint">Choose how the points are split across the work.</span>
      </div>
      <RadioCards
        ariaLabel="Rubric"
        value={value.method}
        onChange={(m) => {
          set({ method: m });
          if (m === "paste") setTab(value.rows.length ? "items" : "source");
        }}
        options={METHODS}
      />
      <input ref={fileRef} type="file" accept={DOC_ACCEPT} hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />

      {value.method === "none" && (
        <div className="callout">
          <span className="stack" style={{ gap: 8 }}>
            <span>
              {hasTask
                ? `The AI splits the ${total} points using the assignment instructions, the same way for every file.`
                : `Add assignment instructions above so the AI can split the ${total} points. Without them, each file gets one overall score out of ${total}.`}
            </span>
            {taskText.trim() && (
              <span>
                <Button variant="link" icon="sparkles" onClick={draft} loading={busy === "draft"}>
                  Draft rubric items from the instructions to review them
                </Button>
              </span>
            )}
          </span>
        </div>
      )}

      {value.method === "paste" && value.rows.length > 0 && (
        <div className="pills pills--plain" role="tablist" aria-label="Rubric source">
          <button className="pill" role="tab" aria-selected={tab === "source"} onClick={() => setTab("source")}>
            {value.file ? "Document" : "Pasted text"}
          </button>
          <button className="pill" role="tab" aria-selected={tab === "items"} onClick={() => setTab("items")}>
            Itemized <span className="count">{value.rows.length}</span>
          </button>
        </div>
      )}

      {showSource && (
        <div className="stack" style={{ gap: 10 }}>
          {value.file ? (
            <div className="file-chip">
              <Icon name="fileText" size={16} />
              <span className="file-chip__name">{value.file.name}</span>
              <span className="muted">{fmtSize(value.file.size)}</span>
              <Button variant="link" onClick={() => fileRef.current?.click()}>
                Replace
              </Button>
              <Button variant="link" onClick={() => set({ file: null })}>
                Remove
              </Button>
            </div>
          ) : (
            <Textarea
              rows={7}
              value={value.source}
              onChange={(e) => set({ source: e.target.value })}
              placeholder="Paste your rubric in any format, such as a list, a table copied from a document, or a paragraph. Points can be written any way, for example 20 pts, 20%, or /20."
              aria-label="Rubric text"
            />
          )}
          <div className="row row--wrap" style={{ justifyContent: "space-between" }}>
            <div className="row">
              {!value.file && (
                <Button variant="ghost" size="sm" icon="upload" onClick={() => fileRef.current?.click()} loading={busy === "upload"}>
                  Upload document
                </Button>
              )}
              {!value.file && (
                <Button variant="ghost" size="sm" icon="fileText" onClick={() => set({ source: EXAMPLE_RUBRIC })}>
                  Use example
                </Button>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              icon="sparkles"
              onClick={itemize}
              loading={busy === "itemize"}
              disabled={!value.source.trim() && !value.file}
            >
              Itemize with AI
            </Button>
          </div>
          <span className="field__hint">The AI turns your text or document into scored items. You can edit and reorder them afterwards.</span>
        </div>
      )}

      {showTable && (
        <>
          {aiNote && (
            <div className="callout callout--info">
              <Icon name="sparkles" size={15} />
              <span className="grow">{aiNote}</span>
              <IconButton icon="x" label="Dismiss" size={14} onClick={() => setAiNote("")} />
            </div>
          )}
          <div className="rubric-editor">
            {value.rows.map((r, i) => (
              <div
                key={i}
                className="rubric-item"
                data-drop={dragOver === i && dragFrom !== null && dragFrom !== i}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) moveRow(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
              >
                <button
                  className="rubric-item__grip"
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") (e.preventDefault(), moveRow(i, i - 1));
                    if (e.key === "ArrowDown") (e.preventDefault(), moveRow(i, i + 1));
                  }}
                  title="Drag to reorder. Arrow keys also work."
                  aria-label={`Reorder ${r.name || "item " + (i + 1)}`}
                >
                  <Icon name="grip" size={15} />
                </button>
                <span className="rubric-item__num">{i + 1}</span>
                <Textarea
                  className="rubric-item__name"
                  rows={1}
                  value={r.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  onInput={autoGrow}
                  onFocus={autoGrow}
                  placeholder="Item, e.g. Visualizations"
                  aria-label="Item name"
                />
                <AffixInput
                  type="number"
                  min={0}
                  step={0.5}
                  inputMode="decimal"
                  value={r.pts}
                  onChange={(e) => updateRow(i, { pts: e.target.value })}
                  suffix="pts"
                  aria-label="Points"
                />
                <IconButton icon="x" label="Remove item" onClick={() => set({ rows: value.rows.filter((_, k) => k !== i) })} />
                <div className="rubric-item__desc">
                  <Textarea
                    rows={1}
                    value={r.desc}
                    onChange={(e) => updateRow(i, { desc: e.target.value })}
                    onInput={autoGrow}
                    onFocus={autoGrow}
                    placeholder="What earns full credit"
                    aria-label="Description"
                  />
                </div>
              </div>
            ))}
            {!value.rows.length && (
              <div className="empty" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                <span>No items yet. Add the first one below.</span>
                {taskText.trim() && (
                  <Button variant="link" icon="sparkles" onClick={draft} loading={busy === "draft"}>
                    Draft items from the instructions
                  </Button>
                )}
              </div>
            )}
            <div className="rubric-editor__foot">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => set({ rows: [...value.rows, emptyRow()] })}>
                Add item
              </Button>
              <span className="muted">
                Items total <strong style={{ color: mismatch ? "var(--c-warning-text)" : "var(--c-text)" }}>{sum}</strong> of {total} points
              </span>
            </div>
          </div>
          {mismatch && (
            <div className="callout callout--warn" role="alert">
              <Icon name="alertTriangle" size={15} />
              <span className="stack" style={{ gap: 8 }}>
                <span>
                  <span className="callout__title">
                    Rubric items add up to {mismatch.sum}, but the total is {mismatch.tot} points.
                  </span>{" "}
                  Pick a fix below. If you save as is, each score is scaled from {mismatch.sum} to {mismatch.tot} points.
                </span>
                <span className="row row--wrap">
                  <Button variant="outline" size="sm" onClick={() => set({ rows: scaleRows(value.rows, mismatch.tot) })}>
                    Scale items to add up to {mismatch.tot}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => set({ points: String(mismatch.sum) })}>
                    Change the total to {mismatch.sum}
                  </Button>
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
