import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseSettingsForm } from "@/components/courses/CourseSettingsForm";
import { Icon } from "@/components/ui/Icon";
import { getCourseAccess } from "@/lib/server/access";
import { courseView } from "@/lib/server/courses";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { retentionLabel } from "@/lib/shared/constants";

export const metadata = { title: "Course settings" };

export default async function CourseSettingsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  if (!access.canManage) redirect(`/courses/${courseId}`);
  const s = await getSettings();
  return (
    <div className="page page--narrow">
      <div className="page-head">
        <div className="page-head__text">
          <Link href={`/courses/${courseId}`} className="back-link">
            <Icon name="arrowLeft" size={14} />
            Back to course
          </Link>
          <h1 className="h1">Course settings</h1>
          <p className="lede">Changes apply right away for everyone in the course. Grades, feedback and student links are not affected.</p>
        </div>
      </div>
      <CourseSettingsForm course={courseView(access.course)} retentionLabel={retentionLabel(s.retention)} />
    </div>
  );
}
