import { notFound } from "next/navigation";
import { Members } from "@/components/courses/Members";
import { LinkButton } from "@/components/ui/Button";
import { getCourseAccess } from "@/lib/server/access";
import { courseMembers } from "@/lib/server/courses";
import { pageUser } from "@/lib/server/session";

export const metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  const members = await courseMembers(courseId, me);
  const canEdit = access.canManage && !access.archived;
  const n = members.filter((m) => m.kind === "member").length;
  return (
    <div className="page page--medium">
      <div className="page-head">
        <div className="page-head__text">
          <h1 className="h1">
            Members <span className="muted" style={{ fontWeight: 400, fontSize: 20 }}>{n}</span>
          </h1>
          <span className="muted">{access.course.name}</span>
        </div>
        {canEdit && (
          <LinkButton href={`/app/courses/${courseId}/invite`} variant="primary" icon="userPlus">
            Invite people
          </LinkButton>
        )}
      </div>
      <Members courseId={courseId} courseName={access.course.name} members={members} canManage={canEdit} showInviteTile={false} />
    </div>
  );
}
