"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { authClient } from "@/lib/client/auth-client";

export function ResetForm({ token, invalid }: { token: string; invalid: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(invalid ? "This reset link is invalid or has expired. Request a new one." : "");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setError("");
    setBusy(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) setError(error.message || "This reset link is invalid or has expired. Request a new one.");
      else setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1 className="auth-card__title">Password changed</h1>
        <p className="muted">You can sign in with your new password now.</p>
        <Link href="/login" className="btn btn--primary btn--block">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1 className="auth-card__title">Choose a new password</h1>
        {!invalid && (
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
        )}
        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}
        {invalid ? (
          <Link href="/forgot-password" className="btn btn--primary btn--block">
            Request a new link
          </Link>
        ) : (
          <Button type="submit" variant="primary" block loading={busy} icon="key">
            Change password
          </Button>
        )}
      </form>
      <div className="auth__foot">
        <Link href="/login">Back to sign in</Link>
      </div>
    </>
  );
}
