import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Members } from "@/components/courses/Members";
import { InvitePanel } from "@/components/people/InvitePanel";
import { Icon } from "@/components/ui/Icon";
import { getCourseAccess } from "@/lib/server/access";
import { courseMembers } from "@/lib/server/courses";
import { pageUser } from "@/lib/server/session";

export const metadata = { title: "Invite people" };

export default async function CourseInvitePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  if (!access.canManage || access.archived) redirect(`/app/courses/${courseId}`);
  const pending = (await courseMembers(courseId, me)).filter((m) => m.kind === "invite");
  return (
    <div className="page page--medium">
      <div className="page-head">
        <div className="page-head__text">
          <Link href={`/app/courses/${courseId}`} className="back-link">
            <Icon name="arrowLeft" size={14} />
            Back to {access.course.name}
          </Link>
          <h1 className="h1">Invite people</h1>
          <p className="lede">
            Invite people to {access.course.name} by email. They join with the role you choose when they accept. People who already have an
            account are added right away.
          </p>
        </div>
      </div>
      <InvitePanel courseId={courseId} />
      {pending.length > 0 && (
        <section className="section" style={{ marginTop: 40 }}>
          <h2 className="h2">
            Pending <span className="count">{pending.length}</span>
          </h2>
          <Members courseId={courseId} courseName={access.course.name} members={pending} canManage showInviteTile={false} />
        </section>
      )}
    </div>
  );
}
