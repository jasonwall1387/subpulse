import { format, parseISO } from "date-fns";
import { useSubscriptions } from "@/lib/hooks";
import { fmtUSD, periodTotalCents } from "@/lib/money";

export function FooterBar() {
  const { data: subs = [] } = useSubscriptions("all");
  const active = subs.filter((s) => s.status === "active");
  const monthly = periodTotalCents(active, "month");
  const next = [...active]
    .filter((s) => s.next_renewal)
    .sort((a, b) => (a.next_renewal! < b.next_renewal! ? -1 : 1))[0];

  const nextLabel = next?.next_renewal
    ? `${next.name} - ${format(parseISO(next.next_renewal), "MMM d")}`
    : "none";

  return (
    <footer className="flex items-center gap-3 border-t border-white/[0.08] bg-black/30 px-6 py-2.5 text-sm tabular-nums text-zinc-400">
      <span>
        {active.length} subscription{active.length === 1 ? "" : "s"}
      </span>
      <span className="text-zinc-600">|</span>
      <span>Monthly total {fmtUSD(monthly)}</span>
      <span className="text-zinc-600">|</span>
      <span>Next: {nextLabel}</span>
    </footer>
  );
}
