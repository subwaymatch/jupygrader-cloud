import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentCards } from "@/components/courses/AssignmentCards";
import { CourseHeader } from "@/components/courses/CourseHeader";
import { Members } from "@/components/courses/Members";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { getCourseAccess } from "@/lib/server/access";
import { courseAssignments, courseMembers, courseView } from "@/lib/server/courses";
import { pageUser } from "@/lib/server/session";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  const course = courseView(access.course);
  const [assignments, members] = await Promise.all([courseAssignments(courseId), courseMembers(courseId, me)]);
  const canEdit = access.canManage && !access.archived;
  const memberCount = members.filter((m) => m.kind === "member").length;
  const invited = members.length - memberCount;
  return (
    <div className="page">
      <title>{course.name + " · Jupygrader"}</title>
      <div className="page-head">
        <CourseHeader course={course} role={access.role ?? "Admin"} canEdit={access.canManage} />
        {canEdit && (
          <div className="page-head__actions">
            <LinkButton href={`/courses/${courseId}/invite`} variant="secondary" icon="userPlus">
              Invite people
            </LinkButton>
            <LinkButton href={`/courses/${courseId}/assignments/new`} variant="primary" icon="plus">
              New assignment
            </LinkButton>
          </div>
        )}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">
            Assignments <span className="count">{assignments.length}</span>
          </h2>
        </div>
        {assignments.length > 0 ? (
          <>
            <AssignmentCards courseId={courseId} items={assignments} canManage={canEdit} canGrade={access.canGrade && !access.archived} />
            {canEdit && (
              <div className="tile-add">
                <Link href={`/courses/${courseId}/assignments/new`} className="btn btn--pill">
                  <Icon name="plus" size={15} />
                  New assignment
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="setup-steps">
            <strong>{canEdit ? "Set up your first assignment" : "No assignments yet"}</strong>
            {canEdit ? (
              <>
                <div className="setup-step">
                  <span className="step-num">1</span>
                  <span>Create an assignment and add the instructions students received.</span>
                </div>
                <div className="setup-step">
                  <span className="step-num">2</span>
                  <span>Add a rubric, and a reference solution if you have one.</span>
                </div>
                <div className="setup-step">
                  <span className="step-num">3</span>
                  <span>Drop the students&apos; files, or a .zip of them. Each file is graded on its own and identified only by its name and SHA-256 hash.</span>
                </div>
                <div>
                  <Link href={`/courses/${courseId}/assignments/new`} className="btn btn--primary">
                    <Icon name="plus" size={15} />
                    New assignment
                  </Link>
                </div>
              </>
            ) : (
              <span className="muted">A Teacher in this course hasn&apos;t added any assignments yet.</span>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">
            Members{" "}
            <span className="count">
              {memberCount}
              {invited ? ` · ${invited} invited` : ""}
            </span>
          </h2>
        </div>
        <Members courseId={courseId} courseName={course.name} members={members} canManage={canEdit} showInviteTile={canEdit} />
      </section>
    </div>
  );
}
