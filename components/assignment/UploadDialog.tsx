"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { fmtSize, plural } from "@/lib/shared/format";
import type { StageProgress, Staged } from "./staging";

const uploadable = (s: Staged) => s.status === "ok" || s.status === "dup";

function ReadingProgress({ progress: p }: { progress: StageProgress }) {
  const label =
    p.step === "open" ? `Opening ${p.zip}` : p.step === "check" ? "Checking for duplicates" : p.total ? `Reading ${p.done} of ${plural(p.total, "file")}` : "Reading files";
  // Steps without a file count yet slide the bar instead of filling it.
  const pct = p.step === "read" && p.total ? Math.round((p.done / p.total) * 100) : null;
  return (
    <div className="upload-progress">
      <div className="upload-progress__label">
        <Icon name="loader" size={15} className="spin" />
        <span title={label}>{label}</span>
      </div>
      <div
        className={"progress" + (pct === null ? " progress--indeterminate" : "")}
        role="progressbar"
        aria-label="Reading files"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={label}
      >
        <span style={pct === null ? undefined : { width: pct + "%" }} />
      </div>
    </div>
  );
}

export function UploadDialog({
  staged,
  progress,
  regrade,
  onRegrade,
  onCancel,
  onConfirm,
}: {
  staged: Staged[] | null;
  /** Set while dropped files are still being read; the dialog shows progress until `staged` arrives. */
  progress: StageProgress | null;
  regrade: boolean;
  onRegrade: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: (files: Staged[]) => void;
}) {
  // Files the user unchecked; everything that can be uploaded starts checked.
  const [off, setOff] = useState<Set<Staged>>(new Set());
  useEffect(() => setOff(new Set()), [staged]);

  const list = staged ?? [];
  const ok = list.filter((s) => s.status === "ok").length;
  const dups = list.filter((s) => s.status === "dup").length;
  const errs = list.filter((s) => s.status === "error").length;
  const skipped = list.filter((s) => s.status === "skip").length;
  const picked = list.filter((s) => uploadable(s) && !off.has(s));
  const toGrade = picked.filter((s) => s.status === "ok" || regrade).length;
  const uploads = picked.length;
  const toggle = (s: Staged, on: boolean) =>
    setOff((cur) => {
      const n = new Set(cur);
      if (on) n.delete(s);
      else n.add(s);
      return n;
    });
  const groups = new Map<string, Staged[]>();
  for (const s of list) {
    const k = s.zip ?? "";
    groups.set(k, [...(groups.get(k) || []), s]);
  }
  const sub = [
    ok && `${plural(ok, "file")} ready`,
    dups && `${plural(dups, "duplicate")}`,
    skipped && `${skipped} skipped`,
    errs && `${plural(errs, "file")} can't be uploaded`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Modal
      open={!!staged || !!progress}
      onOpenChange={(o) => !o && onCancel()}
      wide
      title={progress ? "Reading files" : `Review ${plural(list.length, "file")}`}
      description={progress ? "Archives (.zip) are unpacked and every file is hashed to find duplicates. Large uploads can take a minute." : sub || "Nothing to upload."}
      footer={
        <>
          {!progress && dups > 0 && (
            <div className="grow" style={{ minWidth: 240 }}>
              <Checkbox
                checked={regrade}
                onChange={onRegrade}
                label="Regrade exact duplicates"
                description="Duplicates have the same SHA-256 as a file already here, so they are skipped by default."
              />
            </div>
          )}
          <Button variant="ghost" icon="x" onClick={onCancel}>
            Cancel
          </Button>
          {!progress && (
            <Button variant="primary" icon="upload" onClick={() => onConfirm(picked)} disabled={!uploads}>
              {toGrade ? `Grade ${plural(toGrade, "file")}` : `Upload ${plural(uploads, "file")}`}
            </Button>
          )}
        </>
      }
    >
      {progress ? (
        <ReadingProgress progress={progress} />
      ) : (
        <div className="upload-list">
          {ok + dups > 1 && (
            <div className="upload-list__head">
              <Checkbox
                checked={uploads === ok + dups}
                indeterminate={uploads > 0 && uploads < ok + dups}
                onChange={(v) => setOff(v ? new Set() : new Set(list.filter(uploadable)))}
                label="Select all"
              />
              <span className="muted">
                {uploads} of {ok + dups} selected
              </span>
            </div>
          )}
          {[...groups.entries()].map(([zip, rows]) => (
            <div key={zip || "_"}>
              {zip && (
                <div className="upload-group">
                  <span className="row" style={{ gap: 6 }}>
                    <Icon name="archive" size={13} />
                    {zip}
                  </span>
                  <span>{plural(rows.length, "file")} inside</span>
                </div>
              )}
              {rows.map((s, i) => {
                const Row = uploadable(s) ? "label" : "div";
                return (
                  <Row className={"upload-item" + (uploadable(s) ? " upload-item--pick" : "") + (off.has(s) ? " upload-item--off" : "")} key={i}>
                    {uploadable(s) && <Checkbox checked={!off.has(s)} onChange={(v) => toggle(s, v)} ariaLabel={s.name} />}
                    {s.status === "skip" && <Icon name="minus" size={15} style={{ color: "var(--c-muted)" }} />}
                    {s.status === "error" && <Icon name="alertCircle" size={15} style={{ color: "var(--c-danger-text)" }} />}
                    <div className="grow">
                      <div className="upload-item__name" title={s.name}>
                        {s.name}
                      </div>
                      <div className={s.status === "error" ? "field__error" : "muted"} style={{ fontSize: 13 }}>
                        {s.status === "ok" ? `${fmtSize(s.file.size)}, SHA-256 ${s.sha256.slice(0, 10)}` : s.msg}
                        {s.status === "dup" && !regrade && " Skipped unless you regrade duplicates."}
                      </div>
                    </div>
                  </Row>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
