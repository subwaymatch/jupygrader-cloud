import { CoursesList } from "@/components/courses/CoursesList";
import { LinkButton } from "@/components/ui/Button";
import { userCourses } from "@/lib/server/access";
import { pageUser } from "@/lib/server/session";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const me = await pageUser();
  const courses = await userCourses(me);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Courses</h1>
        <LinkButton href="/courses/new" variant="primary" icon="plus">
          Add course
        </LinkButton>
      </div>
      <CoursesList courses={courses} isAdmin={me.isAdmin} />
    </div>
  );
}
