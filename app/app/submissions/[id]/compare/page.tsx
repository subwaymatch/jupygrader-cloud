import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { getCourseAccess, type AssignmentRow, type SubmissionRow } from "@/lib/server/access";
import { first, parseJson } from "@/lib/server/db";
import { loadSourceDoc } from "@/lib/server/extract";
import { pageUser } from "@/lib/server/session";
import { getBytes, submissionDoc } from "@/lib/server/storage";
import { compareBlocks, lineKeys, markShared, type MarkedBlock } from "@/lib/shared/compare";
import { fmtScore } from "@/lib/shared/format";
import type { NearOf } from "@/lib/shared/types";

export const metadata = { title: "Compare files" };

type Side = { sub: SubmissionRow; blocks: MarkedBlock[]; own: number; shared: number };

/** Two files of an assignment side by side, with the lines they share marked. Opened from a file's close-match flag. */
export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ with?: string }> }) {
  const { id } = await params;
  const other = (await searchParams).with || "";
  const me = await pageUser();
  const a = await first<SubmissionRow>("select * from submission where id = ?", id);
  if (!a) notFound();
  const asg = await first<AssignmentRow>("select * from assignment where id = ?", a.assignment_id);
  if (!asg || !(await getCourseAccess(me, asg.course_id))) notFound();
  // The other file has to be in the same assignment: that's all this page compares, and all the person was let into.
  const b = other ? await first<SubmissionRow>("select * from submission where id = ? and assignment_id = ?", other, asg.id) : null;

  if (!b) {
    return (
      <div className="cmp-page">
        <Top back={`/app/submissions/${a.id}`} file={a.file_name} />
        <div className="cmp-missing">
          <p>The other file isn&apos;t in this assignment any more, so there&apos;s nothing to compare with.</p>
          <Link href={`/app/submissions/${a.id}`} className="btn btn--secondary">
            Back to {a.file_name}
          </Link>
        </div>
      </div>
    );
  }

  const [docA, docB] = await Promise.all([submissionDoc(a), submissionDoc(b)]);
  const blocksA = compareBlocks(docA);
  const blocksB = compareBlocks(docB);
  // Lines from the starter every student was given are shown, but set aside.
  const starterFile = parseJson<{ key: string; name: string } | null>(asg.starter_file, null);
  const starterBytes = starterFile ? await getBytes(starterFile.key) : null;
  const starter = starterBytes ? lineKeys(compareBlocks(await loadSourceDoc(starterFile!.name, starterBytes))) : new Set<string>();
  const sides: Side[] = [
    { sub: a, ...markShared(blocksA, lineKeys(blocksB), starter) },
    { sub: b, ...markShared(blocksB, lineKeys(blocksA), starter) },
  ];
  const near = parseJson<NearOf | null>(a.near_of, null);
  const pct = near?.id === b.id ? near.pct : (parseJson<NearOf | null>(b.near_of, null)?.id === a.id ? parseJson<NearOf | null>(b.near_of, null)!.pct : null);

  return (
    <div className="cmp-page">
      <Top back={`/app/submissions/${a.id}`} file={a.file_name} />
      <div className="cmp-legend">
        <span>
          <strong>Comparing two files in {asg.title}.</strong>
          {pct !== null && <> Their code is {pct}% alike.</>}
        </span>
        <span className="cmp-key">
          <span className="cmp-swatch cmp-swatch--same" /> Also in the other file
        </span>
        {starter.size > 0 && (
          <span className="cmp-key">
            <span className="cmp-swatch cmp-swatch--starter" /> From the starter file
          </span>
        )}
      </div>
      <div className="cmp-cols">
        {sides.map((s, i) => (
          <section className="cmp-col" key={s.sub.id} aria-label={s.sub.file_name}>
            <header className="cmp-col__head">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <Link href={`/app/submissions/${s.sub.id}`} className="cmp-col__file" title="Open this file's feedback">
                  {s.sub.file_name}
                </Link>
                <span className="muted">
                  {s.sub.student || "No student name"}
                  {s.sub.status === "graded" && s.sub.score !== null ? ` · ${fmtScore(s.sub.score)} / ${asg.points}` : ""}
                </span>
              </div>
              <span className="cmp-col__count">
                {s.own ? `${s.shared} of ${s.own} lines also in the ${i === 0 ? "second" : "first"} file` : "Nothing to compare"}
              </span>
            </header>
            {s.blocks.length === 0 && <p className="cmp-missing">This kind of file can&apos;t be compared line by line.</p>}
            {s.blocks.map((blk, k) => (
              <div className="cmp-block" key={k}>
                {blk.label && <span className="cmp-block__label">{blk.label}</span>}
                <pre className={"cmp-lines" + (blk.kind === "text" ? " cmp-lines--text" : "")}>
                  {blk.lines.map((l, n) => (
                    <span key={n} className={"cmp-line" + (l.mark ? " cmp-line--" + l.mark : "")}>
                      {l.text || " "}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Top({ back, file }: { back: string; file: string }) {
  return (
    <header className="fb-top">
      <Link href={back} className="fb-top__back">
        <Icon name="arrowLeft" size={16} />
        <span className="truncate">Back to {file}</span>
      </Link>
      <h1 className="fb-top__file" style={{ fontFamily: "var(--font)" }}>
        Compare files
      </h1>
    </header>
  );
}
