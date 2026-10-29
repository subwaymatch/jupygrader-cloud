import { notFound } from "next/navigation";
import { FeedbackView } from "@/components/assignment/FeedbackView";
import { getCourseAccess, type AssignmentRow, type SubmissionRow } from "@/lib/server/access";
import { all, first } from "@/lib/server/db";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { toDetail } from "@/lib/server/submissions";

/** A file's feedback on its own page, opened in a new tab from the assignment's table. */
export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await pageUser();
  const sub = await first<SubmissionRow>("select * from submission where id = ?", id);
  if (!sub) notFound();
  const asg = await first<AssignmentRow>("select * from assignment where id = ?", sub.assignment_id);
  if (!asg) notFound();
  const access = await getCourseAccess(me, asg.course_id);
  if (!access) notFound();
  const [settings, ids] = await Promise.all([
    getSettings(),
    // The table's default order, for J and K when the table's current order isn't known.
    all<{ id: string }>("select id from submission where assignment_id = ? order by uploaded_at desc, file_name", asg.id),
  ]);
  return (
    <FeedbackView
      initial={await toDetail(sub, asg, settings.model)}
      initialOrder={ids.map((r) => r.id)}
      courseId={asg.course_id}
      assignmentTitle={asg.title}
      canGrade={access.canGrade && !access.archived}
      version={asg.version}
      model={settings.model}
    />
  );
}
