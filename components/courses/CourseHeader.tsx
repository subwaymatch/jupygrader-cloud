"use client";

import { Popover } from "@base-ui/react/popover";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { addYears, courseDatesLabel, todayIso } from "@/lib/shared/format";
import type { CourseView } from "@/lib/server/courses";

export function CourseHeader({ course, role, canEdit }: { course: CourseView; role: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(course.name);
  const [err, setErr] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  const [start, setStart] = useState(course.startDate || "");
  const [end, setEnd] = useState(course.autoEnd ? "" : course.endDate);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    if (!name.trim()) return setErr("Give the course a name.");
    if (name.trim() === course.name) return setEditing(false);
    setBusy(true);
    try {
      await api(`/api/courses/${course.id}`, { method: "PATCH", body: { name } });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDates() {
    setBusy(true);
    try {
      await api(`/api/courses/${course.id}`, { method: "PATCH", body: { start: start || null, end: end || null } });
      setDatesOpen(false);
      toast("Course dates saved");
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-head__text">
      {editing ? (
        <div className="title-edit">
          <Input
            value={name}
            autoFocus
            aria-label="Course name"
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setEditing(false);
                setName(course.name);
              }
            }}
          />
          <IconButton icon="check" label="Save (Enter)" onClick={saveName} disabled={busy} />
          <IconButton
            icon="x"
            label="Cancel (Esc)"
            onClick={() => {
              setEditing(false);
              setName(course.name);
              setErr("");
            }}
          />
          {err && <span className="field__error">{err}</span>}
        </div>
      ) : (
        <div className="title-edit">
          <h1 className="h1">{course.name}</h1>
          {canEdit && <IconButton icon="pencil" label="Rename course" size={15} onClick={() => setEditing(true)} />}
        </div>
      )}
      <div className="meta-line">
        <span className="chip">
          <Icon name="user" size={12} />
          {role}
        </span>
        <span>
          <Icon name="calendar" size={14} />
          {courseDatesLabel(course.startDate, course.endDate, course.autoEnd)}
          {canEdit && (
            <Popover.Root open={datesOpen} onOpenChange={setDatesOpen}>
              <Popover.Trigger render={<button className="icon-btn" aria-label="Edit dates" title="Edit dates" style={{ width: 24, height: 24 }} />}>
                <Icon name="pencil" size={13} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="start" className="menu-positioner">
                  <Popover.Popup className="popover-card" aria-label="Edit course dates">
                    <div className="stack" style={{ gap: 12, width: "min(420px, calc(100vw - 48px))" }}>
                      <div className="form-grid">
                        <Field label="Start date">
                          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                        </Field>
                        <Field label="End date">
                          <Input type="date" value={end} min={start || undefined} max={addYears(start || todayIso(), 1)} onChange={(e) => setEnd(e.target.value)} />
                        </Field>
                      </div>
                      <span className="field__hint">Leave the end date blank to archive the course one year after it starts.</span>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <Button variant="ghost" size="sm" onClick={() => setDatesOpen(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={saveDates} loading={busy}>
                          Save
                        </Button>
                      </div>
                    </div>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
        </span>
        {course.archived && (
          <span className="chip chip--warn">
            <Icon name="archive" size={12} />
            Archived, read-only
          </span>
        )}
      </div>
    </div>
  );
}
