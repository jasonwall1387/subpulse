import { endOfMonth, format, startOfMonth } from "date-fns";
import { CalendarMonth } from "@/components/calendar/CalendarMonth";
import { EmptyState } from "@/components/ui/EmptyState";
import { advanceRenewal } from "@/lib/cycles";
import { useSubscriptions } from "@/lib/hooks";
import type { Subscription } from "@/lib/repo/subscriptions";

function hasRenewalThisMonth(subs: Subscription[]): boolean {
  if (subs.length === 0) return false;
  const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const end = format(endOfMonth(new Date()), "yyyy-MM-dd");
  for (const sub of subs) {
    if (sub.status !== "active" || !sub.next_renewal) continue;
    let cursor = sub.next_renewal;
    let guard = 0;
    while (cursor < start && guard < 1200) {
      const next = advanceRenewal(
        cursor,
        sub.billing_cycle,
        sub.cycle_days ?? undefined,
      );
      if (next === cursor) break;
      cursor = next;
      guard += 1;
    }
    if (cursor >= start && cursor <= end) return true;
  }
  return false;
}

export function CalendarView() {
  const { data: subs = [] } = useSubscriptions("active");
  const showEmpty = !hasRenewalThisMonth(subs);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Calendar</h1>
        <p className="mt-1 text-sm text-zinc-400">Renewals by month.</p>
      </div>
      {showEmpty && (
        <EmptyState
          title="No renewals this month"
          description="Add active subscriptions with renewal dates to fill the calendar."
          actionLabel="Add subscription"
          to="/subscriptions"
        />
      )}
      <CalendarMonth />
    </div>
  );
}
