"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { htmlCellAnchor } from "@/lib/shared/notebook";

/**
 * A graded notebook as nbconvert HTML (renderNotebookHtml in lib/server/submissions.ts). The
 * frame runs no scripts; this page reaches into it to open links in a new tab, keep the scroll
 * position when the HTML is made again after a grade change, and scroll to cells. With
 * `autoHeight` the frame is as tall as the notebook, so the page scrolls instead of the frame.
 */
export function NotebookFrame({
  src,
  frameRef,
  onLoad,
  autoHeight = false,
}: {
  src: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onLoad?: () => void;
  autoHeight?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const scrollY = useRef(0);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const html = frame?.contentDocument?.documentElement;
    if (!autoHeight || !frame || !html) return;
    // Measure at a small height, so the frame can shrink when the page gets wider.
    frame.style.height = "0px";
    frame.style.height = Math.ceil(html.scrollHeight) + "px";
  }, [autoHeight, frameRef]);

  function ready() {
    const win = frameRef.current?.contentWindow;
    const doc = frameRef.current?.contentDocument;
    if (!win || !doc) return;
    for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (a.getAttribute("href")?.startsWith("#")) continue;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    fit();
    win.scrollTo(0, scrollY.current);
    win.addEventListener("scroll", () => (scrollY.current = win.scrollY), { passive: true });
    setLoaded(true);
    onLoad?.();
  }

  // A server-rendered frame can finish loading before the page hydrates, and then onLoad never fires.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoHeight) return;
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [autoHeight, fit]);

  return (
    <div className={"nb-frame" + (autoHeight ? " nb-frame--auto" : "")}>
      {!loaded && (
        <div className="nb-frame__loading">
          <Icon name="loader" size={15} className="spin" />
          Loading the notebook
        </div>
      )}
      <iframe
        ref={frameRef}
        src={src}
        title="Notebook with feedback"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        scrolling={autoHeight ? "no" : undefined}
        onLoad={ready}
      />
    </div>
  );
}

/**
 * Scrolls to the cell with a marker such as C4 and highlights it. `page` scrolls the page, for an
 * `autoHeight` frame. False if the cell isn't there (yet).
 */
export function flashFrameCell(frame: HTMLIFrameElement | null, ref: string, scroll: "frame" | "page" = "frame"): boolean {
  const el = frame?.contentDocument?.getElementById(htmlCellAnchor(ref));
  if (!frame || !el) return false;
  if (scroll === "frame") el.scrollIntoView({ behavior: "smooth", block: "center" });
  else window.scrollTo({ top: window.scrollY + frame.getBoundingClientRect().top + el.getBoundingClientRect().top - window.innerHeight / 3, behavior: "smooth" });
  // The frame doesn't have this page's styles, so the highlight is set inline (as .nb-cell--flash).
  el.style.transition = "box-shadow 0.3s";
  el.style.borderRadius = "6px";
  el.style.boxShadow = "0 0 0 3px #aed3ff";
  setTimeout(() => (el.style.boxShadow = ""), 1400);
  return true;
}

/** The notebook on a student's link page. The rubric's "See" links (#nb-C4) scroll to cells in the frame. */
export function StudentNotebook({ src }: { src: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a[href^='#nb-']")?.getAttribute("href");
      if (href && flashFrameCell(frameRef.current, href.slice("#nb-".length), "page")) e.preventDefault();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return <NotebookFrame src={src} frameRef={frameRef} autoHeight />;
}
