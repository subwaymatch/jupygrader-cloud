"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { addYears, fmtLongDay, plural, todayIso } from "@/lib/shared/format";
import type { CourseView } from "@/lib/server/courses";

export function CourseSettingsForm({
  course,
  contents,
  retentionLabel,
  canvas,
}: {
  course: CourseView;
  contents: { assignments: number; submissions: number };
  retentionLabel: string;
  /** The Canvas section, when Canvas is set up. */
  canvas?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState(course.name);
  const [start, setStart] = useState(course.startDate || "");
  const [end, setEnd] = useState(course.autoEnd ? "" : course.endDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = name !== course.name || start !== (course.startDate || "") || end !== (course.autoEnd ? "" : course.endDate);
  const maxEnd = addYears(start || todayIso(), 1);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/courses/${course.id}`, { method: "PATCH", body: { name, start: start || null, end: end || null } });
      toast("Course settings saved");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await confirm({
      title: `Reset ${course.name}?`,
      body: `This permanently deletes ${plural(contents.assignments, "assignment")} and ${plural(contents.submissions, "uploaded file")}, with their rubrics, answer keys, grades, feedback and student links. The course, its people and settings stay. It can't be undone.`,
      cta: "Reset course",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/courses/${course.id}/reset`, { method: "POST" });
      toast(`Reset ${course.name}`);
      router.push(`/app/courses/${course.id}`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${course.name}?`,
      body: "This permanently deletes the course with all of its assignments, files, grades and student links. It can't be undone.",
      cta: "Delete course",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/courses/${course.id}`, { method: "DELETE" });
      toast(`Deleted ${course.name}`);
      router.push("/app/courses");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  return (
    <div className="form">
      <Field label="Course name" htmlFor="cs-name" hint="Any name works. Include a code or term if it helps tell courses apart.">
        <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="field">
        <span className="field__label">
          <span>
            Duration <span className="opt">optional</span>
          </span>
        </span>
        <div className="form-grid">
          <Field label={<span className="muted" style={{ fontWeight: 400 }}>Start date</span>}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={<span className="muted" style={{ fontWeight: 400 }}>End date</span>}>
            <Input type="date" value={end} min={start || undefined} max={maxEnd} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <span className="field__hint">
          A course can last up to one year. After the end date it is archived and becomes read-only.
          {!end && ` With no end date it archives on ${fmtLongDay(maxEnd)}.`}
        </span>
      </div>
      <div className="callout">
        <Icon name="info" size={15} />
        <span>
          Submissions and their graded results are deleted <strong>{retentionLabel}</strong> after upload. Student links stop working at the same
          time.
        </span>
      </div>
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--c-border)", paddingTop: 20 }}>
        <Button variant="ghost" disabled={!dirty} onClick={() => router.refresh()}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>
          Save changes
        </Button>
      </div>
      {canvas}
      <section className="settings-section" style={canvas ? undefined : { marginTop: 24 }}>
        <h2 className="h2">Reset course</h2>
        <p className="muted">
          Deletes every assignment, file, grade and student link, and keeps the course, its people and settings. Useful for starting a new term with the same team.
        </p>
        <div>
          <Button variant="danger-outline" icon="rotate" onClick={reset} disabled={!contents.assignments}>
            Reset course
          </Button>
        </div>
      </section>
      <section className="settings-section">
        <h2 className="h2">Delete course</h2>
        <p className="muted">Deletes every assignment, file, grade and student link in this course.</p>
        <div>
          <Button variant="danger-outline" icon="trash" onClick={remove}>
            Delete course
          </Button>
        </div>
      </section>
    </div>
  );
}
