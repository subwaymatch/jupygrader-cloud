import { notFound, redirect } from "next/navigation";
import { AssignmentView } from "@/components/assignment/AssignmentView";
import { getCourseAccess, type AssignmentRow, type SubmissionRow } from "@/lib/server/access";
import { assignmentData } from "@/lib/server/assignments";
import { all, first } from "@/lib/server/db";
import { queueInfo } from "@/lib/server/queue-info";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { toListItem } from "@/lib/server/submissions";

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; assignmentId: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const { courseId, assignmentId } = await params;
  // Feedback used to open in a drawer at ?file=<id>; it has its own page now.
  const { file } = await searchParams;
  if (file) redirect(`/app/submissions/${encodeURIComponent(file)}`);
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  const asg = await first<AssignmentRow>("select * from assignment where id = ? and course_id = ?", assignmentId, courseId);
  if (!asg) notFound();
  const [data, rows, settings, queue] = await Promise.all([
    assignmentData(asg),
    all<SubmissionRow>("select * from submission where assignment_id = ? order by uploaded_at desc, file_name", assignmentId),
    getSettings(),
    queueInfo(),
  ]);
  return (
    <AssignmentView
      initialAsg={data}
      courseId={courseId}
      courseName={access.course.name}
      canGrade={access.canGrade}
      canManage={access.canManage}
      archived={access.archived}
      model={settings.model}
      aiDefaults={{ aiImages: settings.aiImages, aiInteractive: settings.aiInteractive }}
      initialList={{ items: rows.map((r) => toListItem(r, asg, settings.model)), queue, version: asg.version }}
    />
  );
}
