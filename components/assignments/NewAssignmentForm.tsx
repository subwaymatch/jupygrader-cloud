"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { pointsMismatch, rubricProblem, scaleRows } from "@/lib/shared/rubric";
import { AnswerKeys, type KeyFile } from "./AnswerKeys";
import { GradingSettingsFields, InstructionsField, type GradingSettings } from "./Fields";
import { MismatchDialog, type MismatchChoice } from "./MismatchDialog";
import { PointsField, RubricEditor, type RubricValue } from "./RubricEditor";
import type { UploadedDoc } from "./uploadDoc";

export function NewAssignmentForm({ courseId, courseName, model }: { courseId: string; courseName: string; model: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [task, setTask] = useState("");
  const [taskFile, setTaskFile] = useState<UploadedDoc | null>(null);
  const [rubric, setRubric] = useState<RubricValue>({ method: "none", rows: [], source: "", file: null, points: "" });
  const [keys, setKeys] = useState<KeyFile[]>([]);
  const [settings, setSettings] = useState<GradingSettings>({ style: "balanced", tone: "neutral", length: "standard", notes: "" });
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const mismatch = pointsMismatch(rubric.method, rubric.rows, rubric.points);

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
      const res = await api<{ id: string }>(`/api/courses/${courseId}/assignments`, {
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
        },
      });
      toast(`Created ${title.trim()}`);
      router.push(`/courses/${courseId}/assignments/${res.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <div className="page-head__text">
        <Link href={`/courses/${courseId}`} className="back-link">
          <Icon name="arrowLeft" size={14} />
          Back to {courseName}
        </Link>
        <h1 className="h1">New assignment</h1>
      </div>
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
      <GradingSettingsFields value={settings} onChange={setSettings} model={model} />
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
        <Link href={`/courses/${courseId}`} className="btn btn--ghost">
          Cancel
        </Link>
      </div>
      {mismatch && (
        <MismatchDialog open={mismatchOpen} sum={mismatch.sum} tot={mismatch.tot} onChoose={(c) => create(c)} onClose={() => setMismatchOpen(false)} />
      )}
    </div>
  );
}
