"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import type { Role } from "@/lib/shared/constants";
import { addYears, fmtLongDay, todayIso } from "@/lib/shared/format";

type Row = { email: string; role: Role };

export function NewCourseForm({ retentionLabel }: { retentionLabel: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<Row[]>([{ email: "", role: "Grader" }]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = start || todayIso();
  const maxEnd = addYears(from, 1);
  const dateError = end && start && end < start ? "The end date must be after the start date." : end && end > maxEnd ? "A course can last up to one year." : "";

  async function create() {
    if (!name.trim()) return setNameError("Give the course a name.");
    if (dateError) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ id: string; invites: { added: string[]; invited: string[]; skipped: { email: string; reason: string }[] } | null }>(
        "/api/courses",
        { body: { name, start, end, invites: rows.filter((r) => r.email.trim()), message } },
      );
      const inv = res.invites;
      const n = inv ? inv.added.length + inv.invited.length : 0;
      toast(n ? `Course created. ${n} ${n === 1 ? "person" : "people"} invited.` : "Course created");
      if (inv?.skipped.length) toast(`Skipped ${inv.skipped.map((s) => `${s.email} (${s.reason})`).join(", ")}`, { error: true, timeout: 9000 });
      router.push(`/app/courses/${res.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <div className="page-head__text">
        <Link href="/app/courses" className="back-link">
          <Icon name="arrowLeft" size={14} />
          Back to courses
        </Link>
        <h1 className="h1">Add course</h1>
        <p className="lede">You&apos;ll be the course Teacher. Add assignments next, then invite graders to help.</p>
      </div>
      <Field
        label="Course name"
        htmlFor="cname"
        error={nameError}
        hint="Any name works. Include a code or term if it helps tell courses apart."
      >
        <Input
          id="cname"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError("");
          }}
          placeholder="e.g. DATA 201 Fall 2026"
          aria-invalid={!!nameError}
          autoFocus
        />
      </Field>
      <div className="field">
        <span className="field__label">
          <span>
            Duration <span className="opt">optional</span>
          </span>
        </span>
        <div className="form-grid">
          <Field label={<span className="muted" style={{ fontWeight: 400 }}>Start date</span>} htmlFor="cstart">
            <Input id="cstart" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={<span className="muted" style={{ fontWeight: 400 }}>End date</span>} htmlFor="cend">
            <Input id="cend" type="date" value={end} min={start || undefined} max={maxEnd} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {dateError ? (
          <span className="field__error">{dateError}</span>
        ) : (
          <span className="field__hint">A course can last up to one year. After the end date it is archived and becomes read-only.</span>
        )}
        <div className="callout" style={{ marginTop: 6 }}>
          <Icon name="info" size={15} />
          <span className="stack" style={{ gap: 4 }}>
            {!end && (
              <span>
                With no end date, this course is archived automatically on <strong>{fmtLongDay(maxEnd)}</strong>, one year after{" "}
                {start ? "the start date" : "today"}.
              </span>
            )}
            <span>
              Submissions and their graded results are deleted <strong>{retentionLabel}</strong> after upload. Student links stop working at
              the same time.
            </span>
          </span>
        </div>
      </div>
      <div className="field">
        <span className="field__label">
          <span>
            Invite people <span className="opt">optional</span>
          </span>
        </span>
        <span className="field__hint" style={{ marginTop: -2 }}>
          People with an account are added right away. Everyone else gets an email invitation.
        </span>
        <div className="invite-rows">
          {rows.map((r, i) => (
            <div className="invite-row" key={i}>
              <Input
                type="email"
                value={r.email}
                placeholder="name@university.edu"
                aria-label="Email"
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))}
              />
              <Select<Role>
                value={r.role}
                onChange={(v) => setRows(rows.map((x, k) => (k === i ? { ...x, role: v } : x)))}
                options={[
                  { value: "Grader", label: "Grader" },
                  { value: "Teacher", label: "Teacher" },
                ]}
                ariaLabel="Role"
              />
              <IconButton
                icon="x"
                label="Remove"
                style={{ marginTop: 5 }}
                onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : [{ email: "", role: "Grader" }])}
              />
            </div>
          ))}
          <div>
            <Button variant="ghost" size="sm" icon="plus" onClick={() => setRows([...rows, { email: "", role: "Grader" }])}>
              Add another person
            </Button>
          </div>
        </div>
        <span className="field__hint">Teachers can edit assignments and manage people. Graders upload files, review feedback and change scores.</span>
        {rows.some((r) => r.email.trim()) && (
          <Field label="Message" optional htmlFor="cmsg">
            <Textarea id="cmsg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note included in the invitation email" />
          </Field>
        )}
      </div>
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--c-border)", paddingTop: 20 }}>
        <Link href="/app/courses" className="btn btn--ghost">
          Cancel
        </Link>
        <Button variant="primary" onClick={create} loading={busy} icon="check">
          Create course
        </Button>
      </div>
    </div>
  );
}
