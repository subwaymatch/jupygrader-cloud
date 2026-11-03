"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { pointsMismatch, rubricProblem, scaleRows } from "@/lib/shared/rubric";
import { AnswerKeys, type KeyFile } from "./AnswerKeys";
import { GradingSettingsFields, InstructionsField, type AiDefaults, type GradingSettings } from "./Fields";
import { MismatchDialog, type MismatchChoice } from "./MismatchDialog";
import { PointsField, RubricEditor, type RubricValue } from "./RubricEditor";
import type { UploadedDoc } from "./uploadDoc";

type CanvasOption = { id: string; name: string; points: number | null; linkedTo: { title: string } | null };

export function NewAssignmentForm({
  courseId,
  courseName,
  model,
  aiDefaults,
  canvasCourse,
}: {
  courseId: string;
  courseName: string;
  model: string;
  aiDefaults: AiDefaults;
  /** The linked Canvas course, when the person can use Canvas here. */
  canvasCourse: string | null;
}) {
  const router = useRouter();
  const [canvasOptions, setCanvasOptions] = useState<CanvasOption[] | null>(null);
  const [canvasPick, setCanvasPick] = useState<{ id: string; name: string } | null>(null);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [task, setTask] = useState("");
  const [taskFile, setTaskFile] = useState<UploadedDoc | null>(null);
  const [rubric, setRubric] = useState<RubricValue>({ method: "none", rows: [], source: "", file: null, points: "" });
  const [keys, setKeys] = useState<KeyFile[]>([]);
  const [settings, setSettings] = useState<GradingSettings>({ style: "balanced", tone: "neutral", length: "standard", notes: "", aiImages: null, aiInteractive: null });
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const mismatch = pointsMismatch(rubric.method, rubric.rows, rubric.points);

  async function loadCanvas() {
    setCanvasBusy(true);
    try {
      const r = await api<{ assignments: CanvasOption[] }>(`/api/courses/${courseId}/canvas`);
      setCanvasOptions(r.assignments.filter((a) => !a.linkedTo));
      if (!r.assignments.some((a) => !a.linkedTo)) toast("Every Canvas assignment in this course is already linked.", { error: true });
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setCanvasBusy(false);
    }
  }

  /** Copies the Canvas assignment's title, points and instructions, and links to it on create. */
  async function fillFromCanvas(id: string) {
    setCanvasBusy(true);
    try {
      const a = await api<{ id: string; name: string; points: number | null; text: string }>(`/api/courses/${courseId}/canvas?id=${encodeURIComponent(id)}`);
      setTitle(a.name);
      setTitleError("");
      if (a.text) setTask(a.text);
      if (a.points) setRubric((r) => ({ ...r, points: String(a.points) }));
      setCanvasPick({ id: a.id, name: a.name });
      setCanvasOptions(null);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setCanvasBusy(false);
    }
  }

  async function create(choice?: MismatchChoice) {
    if (!title.trim()) {
      setTitleError("Give the assignment a title.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const problem = rubricProblem({ method: rubric.method, rows: rubric.rows, points: rubric.points, hasSource: !!rubric.source.trim() || !!rubric.file });
    if (problem) return setError(problem);
    let r = rubric;
    if (mismatch && !choice) return setMismatchOpen(true);
    if (mismatch && choice === "scale") r = { ...rubric, rows: scaleRows(rubric.rows, mismatch.tot) };
    if (mismatch && choice === "useSum") r = { ...rubric, points: String(mismatch.sum) };
    setMismatchOpen(false);
    setBusy(true);
    setError("");
    try {
      const res = await api<{ id: string; canvasError?: string }>(`/api/courses/${courseId}/assignments`, {
        body: {
          title,
          taskText: task,
          taskFileKey: taskFile?.key ?? null,
          points: r.points,
          rubricMethod: r.method,
          rubricSource: r.source,
          rubricFileKey: r.file?.key ?? null,
          rubricRows: r.rows,
          ...settings,
          addAnswerKeys: keys.map((k) => k.key).filter(Boolean),
          canvasAssignmentId: canvasPick?.id ?? null,
        },
      });
      if (res.canvasError) toast(`Created ${title.trim()}, but it isn't linked to Canvas: ${res.canvasError}`, { error: true, timeout: 9000 });
      else toast(`Created ${title.trim()}`);
      router.push(`/app/courses/${courseId}/assignments/${res.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <div className="page-head__text">
        <Link href={`/app/courses/${courseId}`} className="back-link">
          <Icon name="arrowLeft" size={14} />
          Back to {courseName}
        </Link>
        <h1 className="h1">New assignment</h1>
      </div>
      {canvasCourse && (
        <div className="canvas-fill">
          <Mascot pose="sync" size={56} />
          <div className="canvas-fill__text">
            {canvasPick ? (
              <>
                <strong>Linked to {canvasPick.name} in Canvas</strong>
                <span className="muted">Its title, points and instructions are filled in below. You can change them.</span>
              </>
            ) : (
              <>
                <strong>Start from a Canvas assignment</strong>
                <span className="muted">
                  Copies the title, points and instructions from {canvasCourse}, and links the two so you can import submissions and post grades.
                </span>
              </>
            )}
            {canvasOptions && (
              <div className="canvas-pick">
                <Select
                  value={null}
                  onChange={fillFromCanvas}
                  ariaLabel="Canvas assignment"
                  placeholder="Choose a Canvas assignment"
                  options={canvasOptions.map((a) => ({ value: a.id, label: a.points ? `${a.name} · ${a.points} points` : a.name }))}
                />
                <Button variant="ghost" onClick={() => setCanvasOptions(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {canvasPick ? (
            <Button variant="ghost" size="sm" onClick={() => setCanvasPick(null)}>
              Don&apos;t link
            </Button>
          ) : (
            !canvasOptions && (
              <Button variant="secondary" size="sm" icon="download" onClick={loadCanvas} loading={canvasBusy}>
                Choose
              </Button>
            )
          )}
        </div>
      )}
      <Field label="Title" htmlFor="asg-title" error={titleError}>
        <Input
          id="asg-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleError("");
          }}
          placeholder="e.g. HW 4: Regression"
          aria-invalid={!!titleError}
          autoFocus
        />
      </Field>
      <InstructionsField text={task} file={taskFile} onText={setTask} onFile={setTaskFile} />
      <PointsField value={rubric.points} onChange={(p) => setRubric({ ...rubric, points: p })} />
      <RubricEditor value={rubric} onChange={setRubric} courseId={courseId} taskText={task} hasTaskFile={!!taskFile} />
      <AnswerKeys files={keys} onChange={setKeys} />
      <hr className="divider" />
      <GradingSettingsFields value={settings} onChange={setSettings} model={model} aiDefaults={aiDefaults} />
      {error && (
        <div className="callout callout--danger" role="alert">
          <Icon name="alertCircle" size={15} />
          <span>{error}</span>
        </div>
      )}
      <div className="row" style={{ paddingTop: 8 }}>
        <Button variant="primary" icon="check" onClick={() => create()} loading={busy}>
          Create assignment
        </Button>
        <Link href={`/app/courses/${courseId}`} className="btn btn--ghost">
          Cancel
        </Link>
      </div>
      {mismatch && (
        <MismatchDialog open={mismatchOpen} sum={mismatch.sum} tot={mismatch.tot} onChoose={(c) => create(c)} onClose={() => setMismatchOpen(false)} />
      )}
    </div>
  );
}
