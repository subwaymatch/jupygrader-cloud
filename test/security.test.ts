import { describe, expect, it } from "vitest";
import { regradeConfirm } from "@/components/assignment/confirmRegrade";
import { pageCsp, withSecurityHeaders } from "@/lib/server/security-headers";
import { apiOrigin, insecureApiAddress } from "@/lib/shared/constants";
import { csvCell, toCsv } from "@/lib/shared/exports";

describe("csvCell", () => {
  it("shows text that a spreadsheet would run as a formula as text", () => {
    expect(csvCell("=cmd|calc_1012_notes.md")).toBe("'=cmd|calc_1012_notes.md");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("leaves ordinary text and numbers alone", () => {
    expect(csvCell("lovelaceada_1000_lab4.ipynb")).toBe("lovelaceada_1000_lab4.ipynb");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell(17.5)).toBe("17.5");
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["file", "score"], ["=1+1.py", 3]])).toBe("file,score\r\n'=1+1.py,3\r\n");
  });
});

describe("withSecurityHeaders", () => {
  const html = () => new Response("<html></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });

  it("adds the headers to a page", () => {
    const h = withSecurityHeaders(new Request("https://jupygrader.com/app/courses"), html()).headers;
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("Strict-Transport-Security")).toContain("max-age=");
    expect(h.get("Content-Security-Policy")).toBe(pageCsp());
    expect(pageCsp()).not.toContain("unsafe-eval");
    expect(pageCsp()).toContain("frame-ancestors 'self'");
  });

  it("sends no referrer from pages whose address holds a secret", () => {
    for (const path of ["/r/AbCdEf123456", "/invite/tok", "/confirm-email/tok", "/reset-password?token=t"])
      expect(withSecurityHeaders(new Request("https://jupygrader.com" + path), html()).headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("keeps a policy the route set itself, and sets none on files", () => {
    const own = new Response("<html></html>", { headers: { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'none'" } });
    expect(withSecurityHeaders(new Request("https://jupygrader.com/api/x"), own).headers.get("Content-Security-Policy")).toBe("default-src 'none'");
    const csv = new Response("a,b", { headers: { "Content-Type": "text/csv" } });
    const h = withSecurityHeaders(new Request("http://localhost:5173/api/x"), csv).headers;
    expect(h.get("Content-Security-Policy")).toBeNull();
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    // HSTS only means something over https.
    expect(h.get("Strict-Transport-Security")).toBeNull();
  });

  it("keeps the status and body", async () => {
    const res = withSecurityHeaders(new Request("https://jupygrader.com/r/x"), new Response("gone", { status: 404, headers: { "Content-Type": "text/html" } }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("gone");
  });
});

describe("API addresses", () => {
  it("treats a different path on the same site as the same place for a saved key", () => {
    expect(apiOrigin("https://api.openai.com/v1")).toBe(apiOrigin("https://api.openai.com/v1/chat/completions"));
    expect(apiOrigin("https://api.openai.com/v1")).not.toBe(apiOrigin("https://api.openai.com.evil.example/v1"));
    expect(apiOrigin("not a url")).toBe("");
  });

  it("allows plain http only on the same machine", () => {
    expect(insecureApiAddress("http://10.0.0.5/v1")).toBe(true);
    expect(insecureApiAddress("http://api.example.com/v1")).toBe(true);
    expect(insecureApiAddress("http://localhost:11434/v1")).toBe(false);
    expect(insecureApiAddress("http://127.0.0.1:8787/v1")).toBe(false);
    expect(insecureApiAddress("https://api.example.com/v1")).toBe(false);
  });
});

describe("regradeConfirm", () => {
  const graded = { status: "graded", overridden: false };
  const edited = { status: "graded", overridden: true };

  it("doesn't ask about one file nobody changed", () => {
    expect(regradeConfirm([graded])).toBeNull();
    expect(regradeConfirm([{ status: "failed", overridden: false }])).toBeNull();
  });

  it("asks before regrading several files, or one a grader changed", () => {
    expect(regradeConfirm([graded, graded, graded])?.title).toBe("Regrade 3 files?");
    expect(regradeConfirm([graded, edited])?.body).toContain("One has a score that a grader changed");
    expect(regradeConfirm([edited])?.body).toContain("A grader changed this file's score");
  });
});
