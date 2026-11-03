"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { fmtLongDay } from "@/lib/shared/format";

/** Connects the person's Canvas account with a personal access token, on the Account page. */
export function CanvasAccount({ url, account }: { url: string; account: { name: string; connectedAt: string } | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const host = url ? new URL(url).host : "";

  async function connect() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ name: string }>("/api/account/canvas", { method: "PUT", body: { token } });
      setToken("");
      toast(`Connected to Canvas as ${r.name}`);
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect Canvas?",
      body: "Jupygrader forgets your access token. Linked courses and imported files stay. You can also delete the token in Canvas, under Account > Settings.",
      cta: "Disconnect",
    });
    if (!ok) return;
    try {
      await api("/api/account/canvas", { method: "DELETE" });
      toast("Disconnected from Canvas");
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  }

  return (
    <section className="settings-section" id="canvas">
      <div className="canvas-head">
        <Mascot pose="connect" size={64} />
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Canvas</h2>
          <p className="muted">
            Connect your Canvas account to import submissions and post grades. Jupygrader acts as you in Canvas, so it only sees the courses you teach or
            assist in.
          </p>
        </div>
      </div>
      {!url ? (
        <p className="callout">
          <Icon name="info" size={15} />
          <span>Canvas isn&apos;t set up on this site. An admin can add your school&apos;s Canvas address in Settings.</span>
        </p>
      ) : account ? (
        <div className="canvas-connected">
          <Icon name="checkCircle" size={16} />
          <span className="grow">
            Connected as <strong>{account.name}</strong> on {host}
            <span className="muted"> since {fmtLongDay(account.connectedAt)}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <div className="setup-step">
              <span className="step-num">1</span>
              <span>
                In Canvas, open{" "}
                <a href={`${url}/profile/settings`} target="_blank" rel="noreferrer">
                  Account &gt; Settings
                </a>
                .
              </span>
            </div>
            <div className="setup-step">
              <span className="step-num">2</span>
              <span>Under Approved integrations, choose New access token. Name it Jupygrader, and set an expiry date if you like.</span>
            </div>
            <div className="setup-step">
              <span className="step-num">3</span>
              <span>Copy the token and paste it here. Canvas shows it only once.</span>
            </div>
          </div>
          <Field label="Access token" htmlFor="ac-canvas" error={err}>
            <Input
              id="ac-canvas"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && token.trim() && connect()}
              placeholder="Paste your Canvas access token"
              mono
            />
          </Field>
          <div>
            <Button variant="primary" icon="link" onClick={connect} loading={busy} disabled={!token.trim()}>
              Connect Canvas
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
