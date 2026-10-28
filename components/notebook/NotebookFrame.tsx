"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { htmlCellAnchor } from "@/lib/shared/notebook";

/**
 * A graded notebook as nbconvert HTML (renderNotebookHtml in lib/server/submissions.ts). The
 * frame runs no scripts; this page reaches into it to open links in a new tab, keep the scroll
 * position when the HTML is made again after a grade change, and scroll to cells.
 */
export function NotebookFrame({ src, frameRef, onLoad }: { src: string; frameRef: RefObject<HTMLIFrameElement | null>; onLoad?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const scrollY = useRef(0);

  function ready() {
    const win = frameRef.current?.contentWindow;
    const doc = frameRef.current?.contentDocument;
    if (!win || !doc) return;
    for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (a.getAttribute("href")?.startsWith("#")) continue;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
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

  return (
    <div className="nb-frame">
      {!loaded && (
        <div className="nb-frame__loading">
          <Icon name="loader" size={15} className="spin" />
          Loading the notebook
        </div>
      )}
      <iframe ref={frameRef} src={src} title="Notebook with feedback" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" onLoad={ready} />
    </div>
  );
}

/** Scrolls the frame to the cell with a marker such as C4 and highlights it. False if it isn't there (yet). */
export function flashFrameCell(frame: HTMLIFrameElement | null, ref: string): boolean {
  const el = frame?.contentDocument?.getElementById(htmlCellAnchor(ref));
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // The frame doesn't have this page's styles, so the highlight is set inline (as .nb-cell--flash).
  el.style.transition = "box-shadow 0.3s";
  el.style.borderRadius = "6px";
  el.style.boxShadow = "0 0 0 3px #aed3ff";
  setTimeout(() => (el.style.boxShadow = ""), 1400);
  return true;
}
