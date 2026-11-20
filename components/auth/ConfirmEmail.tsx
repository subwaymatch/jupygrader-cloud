"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { api, errorMessage } from "@/lib/client/api";

type Result = { kind: "confirm" | "change"; email: string; status: string };

export function ConfirmEmail({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Result | null>(null);
  const next = signedIn ? { href: "/app/account", label: "Back to your account" } : { href: "/login", label: "Go to sign in" };

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      setDone(await api<Result>(`/api/confirm-email/${encodeURIComponent(token)}`, { method: "POST" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card">
        <Mascot pose="thumbs-up" size={96} />
        <h1 className="auth-card__title">{done.kind === "change" ? "Email address changed" : "Email address confirmed"}</h1>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {done.kind === "change"
            ? `Your account now uses ${done.email}. Sign in with it from now on.`
            : done.status === "pending"
              ? `Thanks. An administrator reviews every instructor account by hand, and we'll email ${done.email} once yours is approved.`
              : `${done.email} is confirmed as yours.`}
        </p>
        {(done.status === "active" || signedIn) && (
          <Link href={next.href} className="btn btn--secondary">
            {next.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">Confirm your email address</h1>
      <p className="muted" style={{ lineHeight: 1.6 }}>
        This shows that the address this link was sent to is yours.
      </p>
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
      <Button variant="primary" block icon="check" loading={busy} onClick={confirm}>
        Confirm email address
      </Button>
      {error && (
        <Link href={next.href} className="btn btn--secondary btn--block">
          {next.label}
        </Link>
      )}
    </div>
  );
}
