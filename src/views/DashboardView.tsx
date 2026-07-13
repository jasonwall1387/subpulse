import { EmptyState } from "@/components/ui/EmptyState";
import { HeroTotals } from "@/components/dashboard/HeroTotals";
import { UpcomingList } from "@/components/dashboard/UpcomingList";
import { UsageTiles } from "@/components/dashboard/UsageTiles";
import { useSubscriptions } from "@/lib/hooks";

export function DashboardView() {
  const { data: subs = [] } = useSubscriptions("all");
  const empty = subs.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Spend overview and upcoming renewals.
        </p>
      </div>
      {empty ? (
        <EmptyState
          title="Nothing to show yet"
          description="Add a subscription or load seed data to populate the dashboard."
          actionLabel="Go to Settings"
          to="/settings"
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <HeroTotals />
            <UpcomingList />
          </div>
          <UsageTiles />
        </>
      )}
    </div>
  );
}
