"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { ROLE_INFO, type Role } from "@/lib/shared/constants";

type Result = { added: string[]; invited: string[]; skipped: { email: string; reason: string }[] };

export function InvitePanel({ courseId, courses }: { courseId?: string; courses?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [course, setCourse] = useState(courseId ?? courses?.[0]?.id ?? "");
  const [role, setRole] = useState<Role>("Grader");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (!list.length) return setError("Enter at least one email address.");
    if (!course) return setError("Choose a course.");
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>(`/api/courses/${course}/invites`, { body: { emails: list, role, message } });
      const parts: string[] = [];
      if (r.added.length) parts.push(`${r.added.length} added`);
      if (r.invited.length) parts.push(`${r.invited.length} invited`);
      toast(parts.length ? parts.join(", ") : "No one was invited");
      if (r.skipped.length) setError("Skipped: " + r.skipped.map((s) => `${s.email} (${s.reason})`).join("; "));
      else setEmails("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form" style={{ maxWidth: 620 }}>
      <Field label="Email addresses" htmlFor="inv-emails" hint="Separate multiple addresses with commas or new lines.">
        <Textarea
          id="inv-emails"
          rows={3}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="jlee@university.edu, mgarcia@university.edu"
        />
      </Field>
      <div className="form-grid">
        {courses && !courseId && (
          <Field label="Course">
            <Select value={course} onChange={setCourse} options={courses.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose a course" />
          </Field>
        )}
        <Field label="Role">
          <Select<Role>
            value={role}
            onChange={setRole}
            options={[
              { value: "Grader", label: "Grader", desc: ROLE_INFO.Grader },
              { value: "Teacher", label: "Teacher", desc: ROLE_INFO.Teacher },
            ]}
          />
        </Field>
      </div>
      <Field label="Message" optional htmlFor="inv-msg">
        <Textarea id="inv-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shown on the invitation email and the accept page." />
      </Field>
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
      <div>
        <Button variant="primary" icon="send" onClick={send} loading={busy}>
          Send invitations
        </Button>
      </div>
    </div>
  );
}
