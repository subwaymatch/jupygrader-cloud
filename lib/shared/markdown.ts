import { Marked } from "marked";

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Raw HTML in student notebooks is shown as text, never rendered.
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const safe = /^(https?:|mailto:|#)/i.test(href || "") ? href : "#";
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image({ href, text }) {
      // Embedded attachments and remote images are not loaded.
      return `<span class="md-img">[image${text ? ": " + escapeHtml(text) : ""}${href && !/^attachment:/.test(href) ? "" : ""}]</span>`;
    },
  },
});

/** Renders untrusted markdown to HTML with raw HTML escaped and links restricted. */
export function renderMarkdown(md: string): string {
  try {
    return marked.parse(md || "", { async: false }) as string;
  } catch {
    return `<p>${escapeHtml(md)}</p>`;
  }
}
