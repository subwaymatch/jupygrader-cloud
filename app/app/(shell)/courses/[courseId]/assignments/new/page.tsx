import { notFound, redirect } from "next/navigation";
import { NewAssignmentForm } from "@/components/assignments/NewAssignmentForm";
import { getCourseAccess } from "@/lib/server/access";
import { canvasStatus } from "@/lib/server/canvas";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "New assignment" };

export default async function NewAssignmentPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const me = await pageUser();
  const access = await getCourseAccess(me, courseId);
  if (!access) notFound();
  if (!access.canManage || access.archived) redirect(`/app/courses/${courseId}`);
  const [s, canvas] = await Promise.all([getSettings(), canvasStatus(me.id)]);
  return (
    <div className="page page--narrow">
      <NewAssignmentForm
        courseId={courseId}
        courseName={access.course.name}
        model={s.model}
        aiDefaults={{ aiImages: s.aiImages, aiInteractive: s.aiInteractive }}
        canvasCourse={canvas.connected && access.course.canvas_course_id ? access.course.canvas_course_name || "Canvas" : null}
      />
    </div>
  );
}
