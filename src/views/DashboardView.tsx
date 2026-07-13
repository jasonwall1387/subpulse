import { HeroTotals } from "@/components/dashboard/HeroTotals";
import { UpcomingList } from "@/components/dashboard/UpcomingList";

export function DashboardView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Spend overview and upcoming renewals.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <HeroTotals />
        <UpcomingList />
      </div>
    </div>
  );
}
