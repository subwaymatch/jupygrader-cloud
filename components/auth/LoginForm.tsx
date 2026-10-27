"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { authClient } from "@/lib/client/auth-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ next, initialError, openReg }: { next?: string; initialError?: string; openReg: boolean }) {
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/courses";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    setError("");
    setBusy(true);
    try {
      if (method === "password") {
        if (!password) return setError("Enter your password.");
        const { error } = await authClient.signIn.email({ email: email.trim(), password });
        if (error) return setError(error.status === 401 ? "That email and password don't match an account." : error.message || "Couldn't sign in.");
        window.location.assign(dest);
      } else {
        const { error } = await authClient.signIn.magicLink({
          email: email.trim(),
          callbackURL: dest,
          errorCallbackURL: "/login?error=link",
        });
        if (error && error.status !== 400 && error.status !== 404) return setError(error.message || "Couldn't send the link.");
        // Don't reveal whether an account exists.
        setMagicSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1 className="auth-card__title">Sign in</h1>
        <div className="pills pills--fill" role="tablist">
          <button
            type="button"
            role="tab"
            className="pill"
            aria-selected={method === "password"}
            onClick={() => {
              setMethod("password");
              setMagicSent(false);
              setError("");
            }}
          >
            <Icon name="keyRound" size={14} />
            Password
          </button>
          <button
            type="button"
            role="tab"
            className="pill"
            aria-selected={method === "magic"}
            onClick={() => {
              setMethod("magic");
              setError("");
            }}
          >
            <Icon name="wand" size={14} />
            Magic link
          </button>
        </div>
        {!(method === "magic" && magicSent) && (
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
        )}
        {method === "password" && (
          <Field
            label="Password"
            htmlFor="password"
            action={
              <Link href="/forgot-password" className="row" style={{ gap: 5, fontWeight: 400 }}>
                <Icon name="key" size={13} />
                Forgot password?
              </Link>
            }
          >
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {method === "magic" && magicSent && (
          <>
            <div className="callout callout--info">
              <Icon name="mail" size={16} />
              <span>
                <span className="callout__title">Check your email</span>
                <br />
                If an account exists for <strong>{email}</strong>, a sign-in link is on its way. It expires in 15 minutes.
              </span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Button variant="secondary" onClick={() => submit()} loading={busy}>
                Resend email
              </Button>
              <button type="button" className="btn btn--link" onClick={() => setMagicSent(false)}>
                Use a different email
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="field__error" role="alert">
            {error}
          </div>
        )}
        {!(method === "magic" && magicSent) && (
          <Button type="submit" variant="primary" block loading={busy} icon={method === "password" ? "logIn" : "send"}>
            {method === "password" ? "Sign in" : "Email me a sign-in link"}
          </Button>
        )}
      </form>
      <div className="auth__foot">
        {openReg && (
          <div className="row">
            <Icon name="graduationCap" size={14} />
            Teaching a course? <Link href="/register">Create an instructor account</Link>
          </div>
        )}
        <p style={{ maxWidth: 320 }}>Graders and TAs join through an email invite from their instructor.</p>
      </div>
    </>
  );
}
