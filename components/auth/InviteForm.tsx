"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api, errorMessage } from "@/lib/client/api";
import type { InvitationView } from "@/lib/server/accounts";

export function InviteForm({ token, inv, signedInAs }: { token: string; inv: InvitationView; signedInAs: string | null }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sameUser = signedInAs?.toLowerCase() === inv.email.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ courseId: string }>(`/api/invite-links/${token}/accept`, { body: { name, password } });
      window.location.assign(`/app/courses/${res.courseId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted">{inv.inviter} invited you</span>
          <h1 className="auth-card__title">
            Join {inv.courseName} as {inv.role}
          </h1>
        </div>
        {inv.message && <p className="callout">{inv.message}</p>}
        {signedInAs && !sameUser ? (
          <div className="callout callout--warn">
            <Icon name="alertTriangle" size={15} />
            <span>
              You&apos;re signed in as {signedInAs}, but this invitation is for {inv.email}. Sign out, then open the link again.
            </span>
          </div>
        ) : sameUser || inv.hasAccount ? (
          <p className="muted">
            {sameUser ? `You're signed in as ${signedInAs}.` : `${inv.email} already has an account. Sign in to accept the invitation.`}
          </p>
        ) : (
          <>
            <Field label="Email">
              <Input value={inv.email} disabled readOnly />
            </Field>
            <Field label="Full name" htmlFor="name">
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Create a password" htmlFor="password" hint="At least 8 characters.">
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        )}
        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}
        {sameUser || (!signedInAs && !inv.hasAccount) ? (
          <Button type="submit" variant="primary" block loading={busy} icon="check">
            Accept invitation
          </Button>
        ) : !signedInAs ? (
          <Link href={`/login?next=${encodeURIComponent("/invite/" + token)}`} className="btn btn--primary btn--block">
            Sign in to accept
          </Link>
        ) : null}
      </form>
      {!signedInAs && !inv.hasAccount && (
        <div className="auth__foot">
          <div className="row">
            <Icon name="user" size={14} />
            Already have an account? <Link href={`/login?next=${encodeURIComponent("/invite/" + token)}`}>Sign in to accept</Link>
          </div>
        </div>
      )}
    </>
  );
}
