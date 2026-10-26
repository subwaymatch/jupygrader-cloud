import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? "/courses" : "/login");
}
