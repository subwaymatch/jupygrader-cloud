"use client";

import { useState } from "react";
import { AnswerKeys, type KeyFile } from "@/components/assignments/AnswerKeys";
import { GradingSettingsFields, InstructionsField, type GradingSettings } from "@/components/assignments/Fields";
import { MismatchDialog, type MismatchChoice } from "@/components/assignments/MismatchDialog";
import { PointsField, RubricEditor, type RubricValue } from "@/components/assignments/RubricEditor";
import type { UploadedDoc } from "@/components/assignments/uploadDoc";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { fmtSize } from "@/lib/shared/format";
import { pointsMismatch, rubricProblem, scaleRows } from "@/lib/shared/rubric";
import type { AssignmentData } from "@/lib/shared/types";

const KEEP_MSG = "Files already graded keep their grades. You can regrade them from the More menu.";

function SaveBar({ onCancel, onSave, busy, msg = KEEP_MSG }: { onCancel: () => void; onSave: () => void; busy: boolean; msg?: string }) {
  return (
    <div className="save-bar">
      <span>{msg}</span>
      <div className="row">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}

async function save(asgId: string, body: Record<string, unknown>): Promise<AssignmentData | null> {
  try {
    const r = await api<AssignmentData>(`/api/assignments/${asgId}`, { method: "PATCH", body });
    toast("Saved");
    return r;
  } catch (err) {
    toast(errorMessage(err), { error: true });
    return null;
  }
}

export function InstructionsTab({ asg, canEdit, onSaved }: { asg: AssignmentData; canEdit: boolean; onSaved: (a: AssignmentData) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(asg.taskText);
  const [file, setFile] = useState<UploadedDoc | null>(asg.taskFile);
  const [busy, setBusy] = useState(false);
  const dirty = text !== asg.taskText || (file?.key ?? null) !== (asg.taskFile?.key ?? null);
  return (
    <section className="asg-body" aria-label="Instructions">
      <div className="section-head">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Instructions</h2>
          <span className="muted">What students were asked to do. Sent to the AI with each submission.</span>
        </div>
        {canEdit && !editing && (asg.taskText || asg.taskFile) && (
          <Button variant="secondary" size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {!editing ? (
        <>
          {asg.taskText && <div className="prose-box">{asg.taskText}</div>}
          {asg.taskFile && (
            <div className="file-chip">
              <Icon name="fileText" size={16} />
              <span className="file-chip__name">{asg.taskFile.name}</span>
              <span className="muted">{fmtSize(asg.taskFile.size)}</span>
            </div>
          )}
          {!asg.taskText && !asg.taskFile && (
            <div className="setup-steps">
              <span>No instructions yet. Without them, the AI grades from the rubric alone.</span>
              {canEdit && (
                <div>
                  <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing(true)}>
                    Add instructions
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <InstructionsField text={text} file={file} onText={setText} onFile={setFile} rows={12} label={false} />
          {(dirty || editing) && (
            <SaveBar
              busy={busy}
              msg="Changes apply to files graded from now on. Files already graded keep their grades."
              onCancel={() => {
                setText(asg.taskText);
                setFile(asg.taskFile);
                setEditing(false);
              }}
              onSave={async () => {
                setBusy(true);
                const r = await save(asg.id, { taskText: text, taskFileKey: file?.key ?? null });
                setBusy(false);
                if (r) {
                  onSaved(r);
                  setEditing(false);
                }
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

export function RubricTab({ asg, canEdit, onSaved }: { asg: AssignmentData; canEdit: boolean; onSaved: (a: AssignmentData) => void }) {
  const initial: RubricValue = {
    method: asg.rubricMethod,
    rows: asg.rubricRows,
    source: asg.rubricSource,
    file: asg.rubricFile,
    points: String(asg.points),
  };
  const [editing, setEditing] = useState(false);
  const [rubric, setRubric] = useState<RubricValue>(initial);
  const [keys, setKeys] = useState<KeyFile[]>(asg.answerKeys);
  const [busy, setBusy] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const mismatch = pointsMismatch(rubric.method, rubric.rows, rubric.points);
  const rows = asg.rubricMethod === "none" ? [] : asg.rubricRows.filter((r) => r.name.trim());
  const sum = rows.reduce((a, r) => a + (+r.pts || 0), 0);

  async function doSave(choice?: MismatchChoice) {
    const problem = rubricProblem({ method: rubric.method, rows: rubric.rows, points: rubric.points, hasSource: !!rubric.source.trim() || !!rubric.file });
    if (problem) return toast(problem, { error: true });
    if (mismatch && !choice) return setMismatchOpen(true);
    let r = rubric;
    if (mismatch && choice === "scale") r = { ...rubric, rows: scaleRows(rubric.rows, mismatch.tot) };
    if (mismatch && choice === "useSum") r = { ...rubric, points: String(mismatch.sum) };
    setMismatchOpen(false);
    setBusy(true);
    const existing = new Set(asg.answerKeys.map((k) => k.id));
    const res = await save(asg.id, {
      points: r.points,
      rubricMethod: r.method,
      rubricSource: r.source,
      rubricFileKey: r.file?.key ?? null,
      rubricRows: r.rows,
      addAnswerKeys: keys.filter((k) => !k.id && k.key).map((k) => k.key),
      removeAnswerKeys: asg.answerKeys.filter((k) => !keys.some((x) => x.id === k.id)).map((k) => k.id).filter((id) => existing.has(id)),
    });
    setBusy(false);
    if (res) {
      onSaved(res);
      setRubric({ method: res.rubricMethod, rows: res.rubricRows, source: res.rubricSource, file: res.rubricFile, points: String(res.points) });
      setKeys(res.answerKeys);
      setEditing(false);
    }
  }

  return (
    <section className="asg-body" aria-label="Rubric">
      <div className="section-head">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Rubric</h2>
          <span className="muted">
            {rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"}, ${asg.points} points total.` : `No rubric, ${asg.points} points total.`}
          </span>
        </div>
        {canEdit && !editing && (
          <Button variant="secondary" size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {!editing ? (
        <>
          {rows.length > 0 ? (
            <div className="rubric-view">
              {rows.map((r, i) => (
                <div className="rubric-view__row" key={i}>
                  <div className="rubric-view__top">
                    <span>{r.name}</span>
                    <span className="nowrap tabular">{r.pts} pts</span>
                  </div>
                  {r.desc && <span className="muted" style={{ whiteSpace: "pre-wrap" }}>{r.desc}</span>}
                </div>
              ))}
              <div className="rubric-view__total">
                <span>Total</span>
                <span>{asg.points} points</span>
              </div>
            </div>
          ) : (
            <div className="prose-box" style={{ whiteSpace: "normal" }}>
              {asg.taskText || asg.taskFile
                ? `The AI splits the ${asg.points} points using the assignment instructions.`
                : `Each file gets one overall score out of ${asg.points}. Add instructions or a rubric for more detailed grading.`}
            </div>
          )}
          {rows.length > 0 && sum !== asg.points && (
            <span className="muted">The items add up to {sum}, so each score is scaled to {asg.points} points.</span>
          )}
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <h3 className="h2" style={{ fontSize: 14 }}>
              Answer key
            </h3>
            {asg.answerKeys.length ? (
              asg.answerKeys.map((k) => (
                <div className="file-chip" key={k.id}>
                  <Icon name="fileKey" size={16} />
                  <span className="file-chip__name">{k.name}</span>
                  <span className="muted">{fmtSize(k.size)}</span>
                </div>
              ))
            ) : (
              <span className="muted">No answer key. The AI grades from the instructions and rubric.</span>
            )}
            {asg.answerKeys.length > 0 && <span className="field__hint">Never shown to students or included in feedback.</span>}
          </div>
        </>
      ) : (
        <>
          <PointsField value={rubric.points} onChange={(p) => setRubric({ ...rubric, points: p })} />
          <RubricEditor value={rubric} onChange={setRubric} courseId={asg.courseId} assignmentId={asg.id} taskText={asg.taskText} hasTaskFile={!!asg.taskFile} />
          <AnswerKeys files={keys} onChange={setKeys} />
          <SaveBar
            busy={busy}
            onCancel={() => {
              setRubric(initial);
              setKeys(asg.answerKeys);
              setEditing(false);
            }}
            onSave={() => doSave()}
          />
          {mismatch && <MismatchDialog open={mismatchOpen} sum={mismatch.sum} tot={mismatch.tot} onChoose={(c) => doSave(c)} onClose={() => setMismatchOpen(false)} />}
        </>
      )}
    </section>
  );
}

export function SettingsTab({ asg, canEdit, model, onSaved }: { asg: AssignmentData; canEdit: boolean; model: string; onSaved: (a: AssignmentData) => void }) {
  const initial: GradingSettings = { style: asg.style, tone: asg.tone, length: asg.length, notes: asg.notes };
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = v.style !== initial.style || v.tone !== initial.tone || v.length !== initial.length || v.notes !== initial.notes;
  return (
    <section className="asg-body" aria-label="Settings" style={{ maxWidth: 620 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="h2">Settings</h2>
        <span className="muted">How the AI grades and writes feedback for this assignment.</span>
      </div>
      <div className="form">
        <GradingSettingsFields value={v} onChange={setV} model={model} disabled={!canEdit} />
      </div>
      {!canEdit && <span className="muted">Only Teachers can change these settings.</span>}
      {dirty && (
        <SaveBar
          busy={busy}
          onCancel={() => setV(initial)}
          onSave={async () => {
            setBusy(true);
            const r = await save(asg.id, v);
            setBusy(false);
            if (r) onSaved(r);
          }}
        />
      )}
    </section>
  );
}
