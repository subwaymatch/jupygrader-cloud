"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { courseDatesLabel } from "@/lib/shared/format";
import type { CourseSummary } from "@/lib/shared/types";

function Row({ c }: { c: CourseSummary }) {
  return (
    <Link href={`/courses/${c.id}`} className="list-row course-row">
      <div className="list-row__main">
        <span className="list-row__title">{c.name}</span>
        <span className="list-row__meta">
          <Icon name="calendar" size={13} style={{ color: "var(--c-muted-dot)" }} />
          {courseDatesLabel(c.startDate, c.endDate, c.autoEnd)}
        </span>
      </div>
      <span className="chip">
        <Icon name={c.enrolled ? "user" : "shield"} size={12} />
        {c.enrolled ? c.role : "Admin"}
      </span>
      <Icon name="chevronRight" size={16} className="chev" />
    </Link>
  );
}

export function CoursesList({ courses, isAdmin }: { courses: CourseSummary[]; isAdmin: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);
  return (
    <>
      {active.length > 0 ? (
        <div className="list">
          {active.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <div className="setup-steps setup-steps--mascot">
          <Mascot pose="graduate" size={112} />
          <div className="setup-steps__body">
            <p style={{ lineHeight: 1.6 }}>
              {isAdmin
                ? "There are no active courses yet. Add a course to start grading."
                : "You're not in any courses yet. Add a course to start grading, or ask a teacher to invite you to theirs."}
            </p>
            <div>
              <Link href="/courses/new" className="btn btn--primary">
                <Icon name="plus" size={15} />
                Add course
              </Link>
            </div>
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <>
          <button className="archived-toggle" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            <Icon name="archive" size={15} style={{ color: "var(--c-muted)" }} />
            Archived <span className="count">{archived.length}</span>
            <Icon name="chevronDown" size={14} style={{ transform: showArchived ? "rotate(180deg)" : undefined, color: "var(--c-muted)" }} />
          </button>
          {showArchived && (
            <div className="list" style={{ marginTop: 12 }}>
              {archived.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
