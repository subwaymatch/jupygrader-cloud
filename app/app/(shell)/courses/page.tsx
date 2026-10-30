import { CoursesList } from "@/components/courses/CoursesList";
import { userCourses } from "@/lib/server/access";
import { courseStats } from "@/lib/server/courses";
import { pageUser } from "@/lib/server/session";
import { firstName } from "@/lib/shared/format";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const me = await pageUser();
  const [courses, stats] = await Promise.all([userCourses(me), courseStats(me)]);
  return (
    <div className="page">
      <CoursesList courses={courses} stats={stats} isAdmin={me.isAdmin} firstName={firstName(me.name)} />
    </div>
  );
}
