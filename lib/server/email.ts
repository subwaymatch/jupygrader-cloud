import { escapeHtml } from "@/lib/shared/markdown";
import { appUrl, getEnv } from "./env";

export type Email = { to: string; subject: string; text: string; action?: { label: string; url: string } };

export function emailConfigured(): boolean {
  return !!getEnv().RESEND_API_KEY;
}

function html(e: Email): string {
  const paras = e.text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const btn = e.action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(e.action.url)}" style="background:#148CFF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:500;display:inline-block">${escapeHtml(e.action.label)}</a></p><p style="margin:0 0 14px;color:#64748B;font-size:13px">Or paste this link into your browser: ${escapeHtml(e.action.url)}</p>`
    : "";
  // Mail clients can only load the logo from a public https address.
  const base = appUrl();
  const logo = base.startsWith("https://")
    ? `<img src="${escapeHtml(base)}/icon-192.png" width="28" height="28" alt="" style="vertical-align:-8px;margin-right:8px">`
    : "";
  return `<div style="font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827;max-width:520px;margin:0 auto;padding:24px"><p style="font-weight:600;font-size:17px;margin:0 0 20px">${logo}Jupygrader</p>${paras}${btn}</div>`;
}

/**
 * Sends an email with Resend when RESEND_API_KEY is set. Otherwise the email,
 * including any link, is written to the Worker logs so it can still be used.
 */
export async function sendEmail(e: Email): Promise<{ sent: boolean }> {
  const env = getEnv();
  const text = e.action ? `${e.text}\n\n${e.action.label}: ${e.action.url}` : e.text;
  if (!env.RESEND_API_KEY) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${e.to} subject="${e.subject}"\n${text}`);
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Jupygrader <onboarding@resend.dev>",
        to: [e.to],
        subject: e.subject,
        text,
        html: html(e),
      }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("Email failed", err);
    return { sent: false };
  }
}
