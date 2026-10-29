import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";

export default async function AppHome() {
  const user = await currentUser();
  redirect(user ? "/app/courses" : "/login");
}
