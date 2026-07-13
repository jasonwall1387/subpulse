import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { barColor } from "@/components/usage/BucketRow";
import { daysUntil } from "@/lib/cycles";
import { fmtUSD } from "@/lib/money";
import { formatReset } from "@/lib/resets";
import { listSubscriptions } from "@/lib/repo/subscriptions";
import { listAllBuckets } from "@/lib/repo/usage";
import { cn } from "@/lib/utils";

function chipLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "in 1d";
  return `in ${days}d`;
}

export function WidgetUpcoming() {
  const { data: subs = [] } = useQuery({
    queryKey: ["subscriptions", "active"],
    queryFn: () => listSubscriptions("active"),
  });
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = [...subs]
    .filter((s) => s.next_renewal)
    .sort((a, b) => (a.next_renewal! < b.next_renewal! ? -1 : 1))
    .slice(0, 3);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Up next
      </h2>
      <div className="space-y-2">
        {upcoming.map((sub) => {
          const days = daysUntil(sub.next_renewal!, today);
          return (
            <div key={sub.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-zinc-100">
                {sub.name}
              </span>
              <span className="tabular-nums text-zinc-400">
                {fmtUSD(sub.price_cents)}
              </span>
              <span className="shrink-0 text-zinc-500">{chipLabel(days)}</span>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <p className="text-xs text-zinc-500">No renewals</p>
        )}
      </div>
    </section>
  );
}

export function WidgetUsageList() {
  const { data: buckets = [] } = useQuery({
    queryKey: ["usage-all-buckets"],
    queryFn: () => listAllBuckets(),
  });
  const top = [...buckets]
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);
  const nowISO = new Date().toISOString();

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        AI usage
      </h2>
      <div className="space-y-3">
        {top.map((b) => {
          const reset = formatReset(b.resets_at ?? undefined, nowISO).replace(
            /^Resets /,
            "",
          );
          return (
            <div key={b.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-zinc-300">
                  {b.plan.display_name} · {b.label}
                </span>
                <span className="tabular-nums text-zinc-100">
                  {Math.round(b.percent)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn("h-full rounded-full", barColor(b.percent))}
                  style={{
                    width: `${Math.min(100, Math.max(0, b.percent))}%`,
                  }}
                />
              </div>
              {reset && <p className="text-[10px] text-zinc-500">{reset}</p>}
            </div>
          );
        })}
        {top.length === 0 && (
          <p className="text-xs text-zinc-500">No usage data</p>
        )}
      </div>
    </section>
  );
}
