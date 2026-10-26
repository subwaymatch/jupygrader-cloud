"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, errorMessage } from "@/lib/client/api";

export function RegisterForm({ firstRun, openReg }: { firstRun: boolean; openReg: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  if (!openReg && !firstRun) {
    return (
      <div className="auth-card">
        <h1 className="auth-card__title">Registration is closed</h1>
        <p className="muted">Ask an administrator or your instructor for an invitation.</p>
        <Link href="/login" className="btn btn--secondary">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (pending) {
    return (
      <>
        <div className="auth-card">
          <h1 className="auth-card__title">Request received</h1>
          <p style={{ lineHeight: 1.6 }}>
            An administrator reviews every instructor account by hand. We&apos;ll email <strong>{pending}</strong> once yours is approved.
            You can sign in after that.
          </p>
        </div>
        <div className="auth__foot">
          <Link href="/login">Back to sign in</Link>
        </div>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ status: string }>("/api/register", { body: { name, email, password } });
      if (res.status === "active") window.location.assign("/courses");
      else setPending(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 12 }}>
          <h1 className="auth-card__title">{firstRun ? "Set up Jupygrader" : "Create an instructor account"}</h1>
          <p className="auth-card__sub" style={{ marginTop: 0 }}>
            {firstRun
              ? "Create the first account. It becomes the administrator, who approves instructors and sets up AI grading."
              : "Create courses, then invite your graders and TAs."}
          </p>
        </div>
        <Field label="Full name" htmlFor="name">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {!firstRun && (
          <div className="callout">
            <Icon name="info" size={15} />
            <span>We review each instructor account by hand. You&apos;ll get an email when yours is approved and ready to use.</span>
          </div>
        )}
        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" block loading={busy} icon="userPlus">
          {firstRun ? "Create administrator account" : "Request account"}
        </Button>
      </form>
      {!firstRun && (
        <div className="auth__foot">
          <div className="row">
            <Icon name="user" size={14} />
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
          <p style={{ maxWidth: 320 }}>Graders and TAs join through an email invite from their instructor.</p>
        </div>
      )}
    </>
  );
}
