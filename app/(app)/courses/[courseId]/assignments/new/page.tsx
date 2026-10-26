import { notFound, redirect } from "next/navigation";
import { NewAssignmentForm } from "@/components/assignments/NewAssignmentForm";
import { getCourseAccess } from "@/lib/server/access";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "New assignment" };

export default async function NewAssignmentPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  if (!access.canManage || access.archived) redirect(`/courses/${courseId}`);
  const s = await getSettings();
  return (
    <div className="page page--narrow">
      <NewAssignmentForm courseId={courseId} courseName={access.course.name} model={s.model} />
    </div>
  );
}
