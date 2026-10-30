"use client";

import Link from "next/link";
import { useState } from "react";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { courseDatesLabel, courseSpanLabel, courseTermLabel, fmtDay, fmtLongDay, initials, plural, todayIso } from "@/lib/shared/format";
import type { CourseStats } from "@/lib/server/courses";
import type { CourseSummary } from "@/lib/shared/types";

const NO_STATS: CourseStats = { total: 0, graded: 0, inProgress: 0, failed: 0, needsReview: 0, people: [], lastUpload: null };

// Each course keeps one tint, picked from its id, so it's easy to spot in the grid.
const TINTS = ["blue", "orange", "teal", "violet", "pink", "green"];
function tint(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

const AVATARS = 4;

function CourseCard({ c, s }: { c: CourseSummary; s: CourseStats }) {
  const pct = s.total ? Math.round((s.graded / s.total) * 100) : 0;
  const done = s.total > 0 && s.graded === s.total;
  const term = c.archived ? null : courseTermLabel(c.startDate, c.endDate, c.autoEnd);
  const last = s.lastUpload ? (s.lastUpload.slice(0, 4) === todayIso().slice(0, 4) ? fmtDay(s.lastUpload) : fmtLongDay(s.lastUpload)) : null;
  return (
    <Link href={`/app/courses/${c.id}`} className={"course-card" + (c.archived ? " course-card--archived" : "") + (done ? " course-card--done" : "")}>
      <div className="course-card__head">
        <span className={"course-mark course-mark--" + (c.archived ? "grey" : tint(c.id))} aria-hidden>
          {initials(c.name)}
        </span>
        <div className="course-card__name">
          <span className="course-card__title">{c.name}</span>
          <span className="course-card__dates" title={courseDatesLabel(c.startDate, c.endDate, c.autoEnd)}>
            {courseSpanLabel(c.startDate, c.endDate, c.autoEnd)}
          </span>
          {term && <span className="course-card__term">{term}</span>}
        </div>
        <span className="chip">
          <Icon name={c.enrolled ? "user" : "shield"} size={12} />
          {c.enrolled ? c.role : "Admin"}
        </span>
      </div>

      <div className="course-card__facts">
        <span>
          <Icon name="fileText" size={14} />
          {plural(c.assignments.length, "assignment")}
        </span>
        <span>
          <Icon name="users" size={14} />
          {plural(s.people.length, "person", "people")}
        </span>
        <span>
          <Icon name="files" size={14} />
          {plural(s.total, "file")}
        </span>
      </div>

      <div className="asg-card__status">
        <div className="asg-card__bottom">
          <span className="asg-card__count">
            {done && <Icon name="checkCircle" size={14} />}
            <span>
              {!s.total ? <span className="muted">No files yet</span> : done ? `All ${s.total} graded` : `${s.graded} of ${s.total} graded`}
              {s.inProgress > 0 && <span className="muted">, {s.inProgress} in progress</span>}
            </span>
          </span>
          <div className="asg-card__flags">
            {s.needsReview > 0 && (
              <span className="flag flag--warn">
                <Icon name="flag" size={13} />
                {s.needsReview} need{s.needsReview === 1 ? "s" : ""} review
              </span>
            )}
            {s.failed > 0 && (
              <span className="flag flag--danger">
                <Icon name="alertCircle" size={13} />
                {s.failed} failed
              </span>
            )}
          </div>
        </div>
        <div className="progress" aria-hidden>
          <span style={{ width: pct + "%" }} />
        </div>
      </div>

      {(s.people.length > 0 || last) && (
        <div className="course-card__foot">
          <span className="avatar-stack" aria-label={s.people.map((p) => p.name).join(", ")}>
            {s.people.slice(0, AVATARS).map((p, i) => (
              <span key={i} className={"avatar" + (p.role === "Teacher" ? "" : " avatar--muted")} title={`${p.name}, ${p.role}`}>
                {initials(p.name)}
              </span>
            ))}
            {s.people.length > AVATARS && <span className="avatar avatar--more">+{s.people.length - AVATARS}</span>}
          </span>
          {last && <span className="muted">Last upload {last}</span>}
        </div>
      )}
    </Link>
  );
}

function summary(active: CourseSummary[], t: CourseStats, isAdmin: boolean) {
  if (!active.length) return isAdmin ? "There are no active courses yet. Add one to start grading." : "You're not in any active courses yet.";
  const grading = t.inProgress ? `${plural(t.inProgress, "file")} ${t.inProgress === 1 ? "is" : "are"} being graded` : "";
  if (t.needsReview) return `${plural(t.needsReview, "file")} need${t.needsReview === 1 ? "s" : ""} your review${grading ? `, and ${grading}` : ""}.`;
  if (grading) return grading + ".";
  if (t.total) return "Every file is graded and nothing is waiting for review.";
  return "Open a course to add assignments and drop in students' files.";
}

export function CoursesList({
  courses,
  stats,
  isAdmin,
  firstName,
}: {
  courses: CourseSummary[];
  stats: Record<string, CourseStats>;
  isAdmin: boolean;
  firstName: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);
  const statsOf = (c: CourseSummary) => stats[c.id] ?? NO_STATS;
  const totals = active.reduce(
    (t, c) => {
      const s = statsOf(c);
      return { ...t, total: t.total + s.total, graded: t.graded + s.graded, inProgress: t.inProgress + s.inProgress, needsReview: t.needsReview + s.needsReview };
    },
    { ...NO_STATS },
  );
  const assignments = active.reduce((n, c) => n + c.assignments.length, 0);

  return (
    <>
      <section className="courses-hero">
        <div className="courses-hero__text">
          {firstName && <span className="courses-hero__hello">Welcome back, {firstName}</span>}
          <h1 className="h1">Courses</h1>
          <p className="lede">{summary(active, totals, isAdmin)}</p>
          <div className="courses-hero__actions">
            <LinkButton href="/app/courses/new" variant="primary" icon="plus">
              Add course
            </LinkButton>
          </div>
        </div>
        <Mascot pose="binders" size={176} className="courses-hero__bird" />
        <dl className="courses-hero__stats">
          <div>
            <dt>Active courses</dt>
            <dd>
              {active.length}
              {archived.length > 0 && <span className="courses-hero__note">{archived.length} archived</span>}
            </dd>
          </div>
          <div>
            <dt>Assignments</dt>
            <dd>{assignments}</dd>
          </div>
          <div>
            <dt>Files graded</dt>
            <dd>
              {totals.graded}
              {totals.total > 0 && <span className="courses-hero__note">of {totals.total}</span>}
            </dd>
          </div>
          <div className={totals.needsReview ? "courses-hero__stat--warn" : undefined}>
            <dt>Need review</dt>
            <dd>{totals.needsReview}</dd>
          </div>
        </dl>
      </section>

      {active.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2 className="h2">
              Active courses <span className="count">{active.length}</span>
            </h2>
          </div>
          <div className="course-grid">
            {active.map((c) => (
              <CourseCard key={c.id} c={c} s={statsOf(c)} />
            ))}
            <Link href="/app/courses/new" className="asg-card asg-card--add course-card--add">
              <Icon name="plus" size={16} />
              Add course
            </Link>
          </div>
        </section>
      ) : (
        <div className="setup-steps">
          <strong>Get started</strong>
          <div className="setup-step">
            <span className="step-num">1</span>
            <span>Add a course and choose its dates. It becomes read-only once it ends.</span>
          </div>
          <div className="setup-step">
            <span className="step-num">2</span>
            <span>Invite Teachers and Graders by email.</span>
          </div>
          <div className="setup-step">
            <span className="step-num">3</span>
            <span>Create an assignment and drop in the students&apos; files. Each one is graded in the background.</span>
          </div>
          {!isAdmin && <span className="muted">Grading for someone else&apos;s course? Ask one of its Teachers to invite you.</span>}
          <div>
            <Link href="/app/courses/new" className="btn btn--primary">
              <Icon name="plus" size={15} />
              Add course
            </Link>
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <section className="section courses-archived">
          <button className="archived-toggle" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            <Mascot pose="archive" size={44} />
            Archived <span className="count">{archived.length}</span>
            <Icon name="chevronDown" size={14} style={{ transform: showArchived ? "rotate(180deg)" : undefined, color: "var(--c-muted)" }} />
          </button>
          {showArchived && (
            <>
              <p className="muted">Archived courses are read-only. You can still open their grades and download feedback.</p>
              <div className="course-grid">
                {archived.map((c) => (
                  <CourseCard key={c.id} c={c} s={statsOf(c)} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
