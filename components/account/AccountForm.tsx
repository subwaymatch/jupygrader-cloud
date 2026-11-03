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
import type { Me } from "@/lib/shared/types";
import { CanvasAccount } from "./CanvasAccount";

export function AccountForm({
  me,
  roles,
  deleteBlock,
  canvas,
}: {
  me: Me;
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

  useEffect(() => {
    try {
      setBrowser(localStorage.getItem("jg-browser-notify") === "1" && typeof Notification !== "undefined" && Notification.permission === "granted");
      setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
    } catch {
      /* ignore */
    }
  }, []);

  async function saveProfile() {
    setBusy("profile");
    try {
      await api("/api/account", { method: "PATCH", body: { name, email } });
      toast("Profile saved");
      router.refresh();
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
          <Field label="Email" htmlFor="ac-email">
            <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
        </div>
        <div>
          <Button variant="secondary" icon="save" onClick={saveProfile} loading={busy === "profile"} disabled={name === me.name && email === me.email}>
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
