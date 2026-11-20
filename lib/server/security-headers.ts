// Headers added to every response the Worker sends (worker/index.ts).

/** Pages whose address carries a secret: a student link, an invitation, or a link from an email. */
const SECRET_PATH = /^\/(r|invite|confirm-email|reset-password)(\/|$)/;

/**
 * What a page may load. Everything comes from this site, except the fonts in app/layout.tsx.
 * Scripts and styles written into the page are allowed because the framework streams the page
 * that way; scripts from anywhere else, plugins, frames on other sites and forms posting
 * elsewhere are not. `dev` adds what Vite's dev server needs.
 */
export function pageCsp(dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** A copy of the response with the security headers set. Headers a route set itself, such as the stricter policy on notebook HTML, are kept. */
export function withSecurityHeaders(req: Request, res: Response, dev = false): Response {
  // A WebSocket upgrade can't be copied, and has no page to protect.
  if (res.status === 101) return res;
  const url = new URL(req.url);
  const out = new Response(res.body, res);
  const h = out.headers;
  const set = (name: string, value: string) => {
    if (!h.has(name)) h.set(name, value);
  };
  set("X-Content-Type-Options", "nosniff");
  set("X-Frame-Options", "SAMEORIGIN");
  set("Referrer-Policy", SECRET_PATH.test(url.pathname) ? "no-referrer" : "strict-origin-when-cross-origin");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (url.protocol === "https:") set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if ((h.get("Content-Type") || "").includes("text/html")) set("Content-Security-Policy", pageCsp(dev));
  return out;
}
