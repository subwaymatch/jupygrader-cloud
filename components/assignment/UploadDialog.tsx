"use client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { fmtSize, plural } from "@/lib/shared/format";
import type { Staged } from "./staging";

export function UploadDialog({
  staged,
  regrade,
  onRegrade,
  onCancel,
  onConfirm,
}: {
  staged: Staged[] | null;
  regrade: boolean;
  onRegrade: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const list = staged ?? [];
  const ok = list.filter((s) => s.status === "ok").length;
  const dups = list.filter((s) => s.status === "dup").length;
  const errs = list.filter((s) => s.status === "error").length;
  const toGrade = ok + (regrade ? dups : 0);
  const uploads = ok + dups;
  const groups = new Map<string, Staged[]>();
  for (const s of list) {
    const k = s.zip ?? "";
    groups.set(k, [...(groups.get(k) || []), s]);
  }
  const sub = [
    ok && `${plural(ok, "file")} ready`,
    dups && `${plural(dups, "duplicate")}`,
    errs && `${plural(errs, "file")} can't be uploaded`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Modal
      open={!!staged}
      onOpenChange={(o) => !o && onCancel()}
      wide
      title={`Review ${plural(list.length, "file")}`}
      description={sub || "Nothing to upload."}
      footer={
        <>
          {dups > 0 && (
            <div className="grow" style={{ minWidth: 240 }}>
              <Checkbox
                checked={regrade}
                onChange={onRegrade}
                label="Regrade exact duplicates"
                description="Duplicates have the same SHA-256 as a file already here, so they are skipped by default."
              />
            </div>
          )}
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" icon="upload" onClick={onConfirm} disabled={!uploads}>
            {toGrade ? `Grade ${plural(toGrade, "file")}` : `Upload ${plural(uploads, "file")}`}
          </Button>
        </>
      }
    >
      <div className="upload-list">
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
            {rows.map((s, i) => (
              <div className="upload-item" key={i}>
                {s.status === "ok" && <Icon name="checkCircle" size={15} style={{ color: "var(--c-success-text)" }} />}
                {s.status === "dup" && <Icon name="copy" size={15} style={{ color: "var(--c-warning)" }} />}
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
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
