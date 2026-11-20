"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { useConfirm } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { browserNotifyOn } from "@/lib/client/notify";
import type { Me } from "@/lib/shared/types";
import { CanvasAccount } from "./CanvasAccount";

const LINK_IN_LOGS = "Email isn't set up on this site, so the link was written to the Worker logs instead of being sent. Ask an administrator for it.";

export function AccountForm({
  me,
  roles,
  deleteBlock,
  canvas,
  pendingEmail,
}: {
  me: Me;
  /** An address the account is waiting to change to, once the link sent there is opened. */
  pendingEmail: string | null;
  roles: { courseId: string; course: string; role: string }[];
  deleteBlock: string | null;
  /** Shown when Canvas is set up, and to admins so they know where to set it up. */
  canvas: { url: string; account: { name: string; connectedAt: string } | null } | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(me.notifyEmail);
  const [browser, setBrowser] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [waitingFor, setWaitingFor] = useState(pendingEmail);
  const [emailPw, setEmailPw] = useState("");
  const emailChanged = email.trim().toLowerCase() !== me.email.toLowerCase();
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    try {
      setBrowser(browserNotifyOn());
      setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
    } catch {
      /* ignore */
    }
  }, []);

  async function saveProfile() {
    setBusy("profile");
    try {
      const r = await api<{ emailPending: string | null; emailed: boolean }>("/api/account", {
        method: "PATCH",
        body: { name, email, password: emailChanged ? emailPw : undefined },
      });
      setEmailPw("");
      if (r.emailPending) {
        // The address only changes once the link sent to the new one is opened.
        setWaitingFor(r.emailPending);
        setEmail(me.email);
        toast(r.emailed ? `We sent a link to ${r.emailPending}. Open it to finish changing your email.` : LINK_IN_LOGS, { timeout: 9000 });
      } else toast("Profile saved");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function sendConfirm() {
    setBusy("confirm");
    try {
      const r = await api<{ emailed?: boolean; alreadyConfirmed?: boolean }>("/api/account/confirm-email", { method: "POST" });
      if (r.alreadyConfirmed) router.refresh();
      else {
        setConfirmSent(true);
        toast(r.emailed ? `We sent a link to ${me.email}.` : LINK_IN_LOGS, { timeout: 9000 });
      }
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function changePw() {
    if (nw.length < 8) return setPwErr("The new password must be at least 8 characters.");
    setPwErr("");
    setBusy("pw");
    const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: nw, revokeOtherSessions: true });
    setBusy("");
    if (error) return setPwErr(error.message || "Couldn't change the password. Check your current password.");
    setCur("");
    setNw("");
    toast("Password changed. Other devices were signed out.");
  }

  async function toggleBrowser(v: boolean) {
    if (!v) {
      setBrowser(false);
      try {
        localStorage.setItem("jg-browser-notify", "0");
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof Notification === "undefined") return toast("This browser doesn't support notifications.", { error: true });
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setBlocked(perm === "denied");
      return;
    }
    setBrowser(true);
    try {
      localStorage.setItem("jg-browser-notify", "1");
    } catch {
      /* ignore */
    }
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete your account permanently?",
      body: "You lose access to every course. Grades and feedback you worked on stay with the courses.",
      cta: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/account", { method: "DELETE" });
      await authClient.signOut().catch(() => {});
      window.location.assign("/login");
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  return (
    <div className="form" style={{ gap: 0 }}>
      <section className="settings-section">
        <h2 className="h2">Profile</h2>
        <div className="form-grid">
          <Field label="Full name" htmlFor="ac-name">
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field
            label="Email"
            htmlFor="ac-email"
            hint={
              waitingFor
                ? `Waiting for you to open the link we sent to ${waitingFor}. Until then your email stays as it is.`
                : emailChanged
                  ? "We'll send a link to the new address. Your email changes when you open it."
                  : undefined
            }
          >
            <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {emailChanged && (
            <Field label="Current password" htmlFor="ac-email-pw" hint="Needed to change your email.">
              <Input id="ac-email-pw" type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} autoComplete="current-password" />
            </Field>
          )}
        </div>
        {!me.emailVerified && (
          <div className="callout callout--warn">
            <Icon name="mail" size={15} />
            <span className="grow">
              You haven&apos;t confirmed that {me.email} is yours. Until you do, people who add you to a course have to send you an invitation link
              instead of adding you straight away.
            </span>
            <Button variant="secondary" size="sm" onClick={sendConfirm} loading={busy === "confirm"} disabled={confirmSent}>
              {confirmSent ? "Link sent" : "Send confirmation link"}
            </Button>
          </div>
        )}
        <div>
          <Button variant="secondary" icon="save" onClick={saveProfile} loading={busy === "profile"} disabled={(name === me.name && !emailChanged) || (emailChanged && !emailPw)}>
            Save profile
          </Button>
        </div>
      </section>
      <section className="settings-section">
        <h2 className="h2">Password</h2>
        <div className="form-grid">
          <Field label="Current password" htmlFor="ac-cur">
            <Input id="ac-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" htmlFor="ac-new">
            <Input id="ac-new" type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {pwErr && (
          <div className="field__error" role="alert">
            {pwErr}
          </div>
        )}
        <div>
          <Button variant="secondary" icon="key" onClick={changePw} loading={busy === "pw"} disabled={!cur || !nw}>
            Change password
          </Button>
        </div>
      </section>
      <section className="settings-section">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Notifications</h2>
          <p className="muted">When a batch you uploaded or regraded finishes grading.</p>
        </div>
        <Checkbox
          checked={notifyEmail}
          onChange={async (v) => {
            setNotifyEmail(v);
            try {
              await api("/api/account", { method: "PATCH", body: { notifyEmail: v } });
            } catch (err) {
              setNotifyEmail(!v);
              toast(errorMessage(err), { error: true });
            }
          }}
          label="Email me a summary"
          description="How many files were graded, need review or failed, with a link to the assignment."
        />
        <Checkbox
          checked={browser}
          onChange={toggleBrowser}
          label="Show a browser notification"
          description="Only while the assignment is open in another tab. Your browser asks for permission first."
        />
        {blocked && <span className="field__error">Notifications are blocked for this site. Allow them in your browser settings, then try again.</span>}
      </section>
      {canvas && <CanvasAccount url={canvas.url} account={canvas.account} />}
      <section className="settings-section">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Course roles</h2>
          <span className="muted">{me.isAdmin ? "You're an administrator, so you have Teacher access in every course." : "Teachers and admins manage these."}</span>
        </div>
        <div className="list">
          {roles.map((r) => (
            <div className="list-row" key={r.courseId}>
              <Icon name="hash" size={14} style={{ color: "var(--c-muted-dot)" }} />
              <span className="grow truncate">{r.course}</span>
              <span className="chip">
                <Icon name="user" size={12} />
                {r.role}
              </span>
            </div>
          ))}
          {!roles.length && <p className="empty">You&apos;re not in any courses yet.</p>}
        </div>
      </section>
      <section className="settings-section">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Delete account</h2>
          <span className="muted">{deleteBlock ?? "Permanently delete your account and sign out."}</span>
        </div>
        <div>
          <Button variant="danger-outline" icon="trash" onClick={deleteAccount} disabled={!!deleteBlock}>
            Delete account
          </Button>
        </div>
      </section>
    </div>
  );
}
