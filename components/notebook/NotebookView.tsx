import { Icon } from "@/components/ui/Icon";
import { renderMarkdown } from "@/lib/shared/markdown";
import type { ViewCell } from "@/lib/shared/types";

export function cellDomId(ref: string, scope = "nb") {
  return `${scope}-${ref.replace(/[^\w-]/g, "_")}`;
}

/** Renders a submitted file as cells, with AI feedback shown under the cells it refers to. */
export function NotebookView({ cells, scope = "nb", showFeedback = true }: { cells: ViewCell[]; scope?: string; showFeedback?: boolean }) {
  return (
    <div className="nb">
      {cells.map((c, i) => {
        const id = "ref" in c && c.ref ? cellDomId(c.ref, scope) : undefined;
        const fb = showFeedback && "fb" in c && c.fb ? c.fb : "";
        return (
          <div className="nb-cell" id={id} key={i}>
            {c.t === "md" && (c.text || !fb) && (
              <div className="nb-row">
                <span className="nb-prompt nb-prompt--md">{c.prompt ?? ""}</span>
                <div className="nb-main">
                  {c.plain ? (
                    <div className="md md--plain">{c.text}</div>
                  ) : (
                    <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.text) }} />
                  )}
                </div>
              </div>
            )}
            {c.t === "code" && (
              <>
                <div className="nb-row">
                  <span className="nb-prompt">{c.prompt ?? ""}</span>
                  <div className="nb-main">
                    <pre className="nb-src">{c.src}</pre>
                  </div>
                </div>
                {(c.outputs || []).map((o, k) => (
                  <div className="nb-row" key={k}>
                    <span className="nb-prompt" />
                    <div className="nb-main">
                      {o.t === "text" && <pre className={"nb-out" + (o.error ? " nb-out--err" : "")}>{o.text}</pre>}
                      {o.t === "image" && <img className="nb-img" alt="Cell output" src={`data:${o.mime};base64,${o.data}`} loading="lazy" />}
                    </div>
                  </div>
                ))}
              </>
            )}
            {c.t === "image" && (
              <div className="nb-row">
                <span className="nb-prompt" />
                <div className="nb-main">
                  <img className="nb-img" alt={c.alt} src={c.src} />
                </div>
              </div>
            )}
            {c.t === "note" && <div className="nb-note">{c.text}</div>}
            {fb && (
              <div className="nb-row">
                <span className="nb-prompt nb-prompt--md">{c.t === "md" && !c.text ? (c.prompt ?? "") : ""}</span>
                <div className="nb-main">
                  <div className="nb-fb">
                    <Icon name="messageText" size={15} />
                    <span>
                      <span className="nb-fb__label">AI feedback</span>
                      {fb}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
