"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { authClient } from "@/lib/client/auth-client";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setError("");
    setBusy(true);
    try {
      await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 12 }}>
          <h1 className="auth-card__title">Reset your password</h1>
          <p className="auth-card__sub" style={{ marginTop: 0 }}>
            {sent
              ? `If an account exists for ${email.trim()}, a reset link is on its way. It expires in 1 hour.`
              : "Enter your email and we'll send you a link to choose a new password."}
          </p>
        </div>
        {!sent && (
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
        )}
        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" variant={sent ? "secondary" : "primary"} block loading={busy} icon={sent ? "rotate" : "send"}>
          {sent ? "Resend email" : "Send reset link"}
        </Button>
      </form>
      <div className="auth__foot">
        <Link href="/login">Back to sign in</Link>
      </div>
    </>
  );
}
