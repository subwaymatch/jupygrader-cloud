import { NotFound } from "@/components/shell/DeadEnd";

export const metadata = { title: "Page not found" };

export default function RootNotFound() {
  return <NotFound page />;
}
