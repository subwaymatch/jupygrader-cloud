import { Overview } from "@/components/admin/Overview";
import { overviewData } from "@/lib/server/admin";
import { pageAdmin } from "@/lib/server/session";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await pageAdmin();
  const data = await overviewData();
  return (
    <div className="page">
      <Overview data={data} />
    </div>
  );
}
