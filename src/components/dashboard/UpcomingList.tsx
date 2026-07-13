import { useEffect } from "react";
import { format, parseISO } from "date-fns";
import { IconBadge } from "@/components/subscriptions/SubscriptionCard";
import { useSubscriptions } from "@/lib/hooks";
import { daysUntil } from "@/lib/cycles";
import { emitSubsUpdated } from "@/lib/events";
import { fmtUSD } from "@/lib/money";
import { advanceOverdueRenewals } from "@/lib/repo/subscriptions";

function chipLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

export function UpcomingList() {
  const { data: subs = [], refetch } = useSubscriptions("active");

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    void advanceOverdueRenewals(today).then(async (count) => {
      if (count > 0) {
        await emitSubsUpdated();
        await refetch();
      }
    });
  }, [refetch]);

  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = [...subs]
    .filter((s) => s.next_renewal)
    .sort((a, b) => (a.next_renewal! < b.next_renewal! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl">
      <h2 className="text-sm font-medium text-zinc-300">Up next</h2>
      <div className="mt-4 space-y-3">
        {upcoming.map((sub) => {
          const days = daysUntil(sub.next_renewal!, today);
          return (
            <div key={sub.id} className="flex items-center gap-3">
              <IconBadge sub={sub} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{sub.name}</p>
                <p className="text-xs tabular-nums text-zinc-500">
                  {fmtUSD(sub.price_cents)} ·{" "}
                  {format(parseISO(sub.next_renewal!), "MMM d")}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                {chipLabel(days)}
              </span>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <p className="text-sm text-zinc-500">No upcoming renewals.</p>
        )}
      </div>
    </div>
  );
}
