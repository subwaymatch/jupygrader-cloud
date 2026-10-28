import Link from "next/link";
import { StudentNotebook } from "@/components/notebook/NotebookFrame";
import { NotebookView } from "@/components/notebook/NotebookView";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { getCourseAccess } from "@/lib/server/access";
import { parseJson } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { sharedSubmission } from "@/lib/server/share";
import { submissionDoc } from "@/lib/server/storage";
import { notebookHtmlVersion } from "@/lib/server/submissions";
import { docViewCells, labelFor, refLabels } from "@/lib/shared/document";
import { fmtScore } from "@/lib/shared/format";
import type { GradeResult, GradedMeta } from "@/lib/shared/types";

export const metadata = { title: "Your feedback", robots: { index: false, follow: false } };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const shared = await sharedSubmission(token);
  let back: string | null = null;
  if (sp.preview && shared) {
    const me = await currentUser();
    if (me && (await getCourseAccess(me, shared.course.id))) back = `/submissions/${shared.sub.id}`;
  }

  if (!shared) {
    return (
      <div className="student-page">
        <div className="student-wrap">
          <Logo size={24} />
          <div className="student-card" style={{ alignItems: "flex-start" }}>
            <Icon name="link" size={22} style={{ color: "var(--c-muted)" }} />
            <h1 className="h1">This link is no longer active</h1>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              The person who shared it turned it off or replaced it with a new link, or the feedback was deleted. Ask them for the current one.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { sub, asg, course } = shared;
  const result = parseJson<GradeResult>(sub.result, { criteria: [], comments: [], summary: "", confidence: "high", lowReason: "" });
  const graded = parseJson<GradedMeta | null>(sub.graded_meta, null);
  const doc = await submissionDoc(sub);
  const cells = docViewCells(doc, result.comments);
  const labels = refLabels(doc);
  const when = graded?.gradedAt ? new Date(graded.gradedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const fbFormat = sub.kind === "notebook" ? "ipynb" : "html";
  // Graded notebooks show their nbconvert HTML, feedback cells included, once it has been made.
  const htmlVersion = await notebookHtmlVersion(sub, asg);

  return (
    <div className="student-page">
      {back && (
        <div className="preview-bar">
          <span>Preview of the student view. Students see this page without the bar.</span>
          <Link href={back} className="btn btn--sm" style={{ background: "#334155", color: "#fff" }}>
            Back to grading
          </Link>
        </div>
      )}
      <div className="student-wrap">
        <Logo size={24} />
        <div className="student-card">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">{course.name}</span>
            <h1 className="h1">{asg.title}</h1>
          </div>
          <span className="muted mono" style={{ fontSize: 13 }}>
            {sub.file_name}
          </span>
          <div className="fb-score">
            <span className="fb-score__n">{fmtScore(sub.score)}</span>
            <span className="fb-score__of">/ {asg.points}</span>
          </div>
          {when && <span className="muted">Graded {when}</span>}
          <p style={{ lineHeight: 1.65 }}>{result.summary}</p>
        </div>

        <section className="student-card">
          <h2 className="h2">Rubric</h2>
          <div>
            {result.criteria.map((c, i) => (
              <div className="crit" key={i}>
                <div className="crit__top">
                  <span className="crit__name">{c.name}</span>
                  <span className="crit__score">
                    {c.earned} / {c.pts}
                  </span>
                </div>
                {c.comment && <span className="crit__comment">{c.comment}</span>}
                {c.refs.length > 0 && (
                  <div className="crit__chips">
                    <span>See</span>
                    {c.refs.map((r) => (
                      <a key={r} className="chip chip--blue chip--mono" href={`#nb-${r.replace(/[^\w-]/g, "_")}`}>
                        {labelFor(r, labels)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h2">Your work, with comments</h2>
            <a className="btn btn--secondary btn--sm" href={`/r/${token}/download?format=${fbFormat}`}>
              <Icon name="download" size={14} />
              {sub.kind === "notebook" ? "Notebook with feedback" : "Download feedback"}
            </a>
          </div>
          {htmlVersion ? (
            <div className="student-card" style={{ padding: 0, overflow: "hidden" }}>
              <StudentNotebook src={`/r/${token}/download?format=html&inline=1&v=${htmlVersion}`} />
            </div>
          ) : (
            <div className="student-card" style={{ background: "var(--c-bg-subtle)", boxShadow: "none", padding: "16px 0" }}>
              <NotebookView cells={cells} scope="nb" />
            </div>
          )}
        </section>

        <footer className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Graded with AI and reviewed by your course staff as needed. Ask your instructor if something looks wrong.
          <br />
          File fingerprint (SHA-256): <span className="mono">{sub.sha256.slice(0, 16)}</span>
        </footer>
      </div>
    </div>
  );
}
