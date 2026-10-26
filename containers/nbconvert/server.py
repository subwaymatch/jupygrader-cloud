"""Converts Jupyter notebooks to HTML with nbconvert.

POST /convert?title=...  body: notebook JSON  ->  text/html
GET  /health             ->  "ok"

The Worker reaches this server only through the Nbconvert Durable Object
(worker/nbconvert.ts); it isn't exposed to the internet.
"""

import logging
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import bleach
import nbformat
from bleach.css_sanitizer import CSSSanitizer
from nbconvert import HTMLExporter

PORT = 8080
MAX_BYTES = 64 * 1024 * 1024

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("nbconvert-server")

# Student notebooks can contain arbitrary HTML and JavaScript in markdown and
# outputs. With sanitize_html, the template runs rendered markdown and HTML
# outputs through the clean_html filter. nbconvert's own filter allows so few
# tags that headings, paragraphs and blockquotes come out as escaped text, so
# this one allows common formatting while dropping scripts, frames, event
# handlers and javascript: links.
TAGS = {
    *bleach.ALLOWED_TAGS,
    *("p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "span", "div", "img"),
    *("sub", "sup", "del", "ins", "s", "u", "mark", "small", "kbd", "samp", "var"),
    *("table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col"),
    *("details", "summary", "figure", "figcaption", "dl", "dt", "dd"),
}
ATTRIBUTES = {
    "*": ["class", "id", "title", "style", "align"],
    "a": ["href", "title"],
    "img": ["src", "alt", "width", "height"],
    "th": ["colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
    "ol": ["start"],
    "table": ["border"],
}
cleaner = bleach.Cleaner(
    tags=TAGS,
    attributes=ATTRIBUTES,
    protocols=["http", "https", "mailto", "data"],
    strip=True,
    css_sanitizer=CSSSanitizer(),
)
# Stripping a tag keeps its text, so drop <script> and <style> blocks whole first
# (pandas tables, for example, carry a <style scoped> block).
SCRIPT_OR_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.IGNORECASE | re.DOTALL)


def clean_html(element: object) -> str:
    text = element.decode() if isinstance(element, bytes) else str(element)
    return cleaner.clean(SCRIPT_OR_STYLE.sub("", text))


# The exporter loads its templates once; conversions share it one at a time.
exporter = HTMLExporter(template_name="lab", sanitize_html=True, filters={"clean_html": clean_html})
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: bytes, content_type: str = "text/plain; charset=utf-8") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self.reply(200, b"ok")
        else:
            self.reply(404, b"not found")

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/convert":
            self.reply(404, b"not found")
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            self.reply(413, b"send the notebook as a body of at most 64 MB")
            return
        body = self.rfile.read(length)
        title = (parse_qs(url.query).get("title") or ["Notebook"])[0][:200]
        try:
            nb = nbformat.reads(body.decode("utf-8"), as_version=4)
        except Exception as err:  # noqa: BLE001 - any parse error means a bad request
            self.reply(400, f"not a notebook: {err}".encode())
            return
        started = time.monotonic()
        try:
            with lock:
                html, _ = exporter.from_notebook_node(nb, resources={"metadata": {"name": title}})
        except Exception:
            log.exception("conversion failed")
            self.reply(500, b"conversion failed")
            return
        out = html.encode("utf-8")
        log.info("converted %d bytes to %d bytes in %.2fs", length, len(out), time.monotonic() - started)
        self.reply(200, out, "text/html; charset=utf-8")

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - signature from BaseHTTPRequestHandler
        pass


if __name__ == "__main__":
    log.info("listening on %d", PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
