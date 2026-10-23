import { NewCourseForm } from "@/components/courses/NewCourseForm";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { retentionLabel } from "@/lib/shared/constants";

export const metadata = { title: "Add course" };

export default async function NewCoursePage() {
  await pageUser();
  const s = await getSettings();
  return (
    <div className="page page--narrow">
      <NewCourseForm retentionLabel={retentionLabel(s.retention)} />
    </div>
  );
}
