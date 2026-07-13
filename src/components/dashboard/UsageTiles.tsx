import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { barColor } from "@/components/usage/BucketRow";
import { formatReset } from "@/lib/resets";
import { listAllBuckets } from "@/lib/repo/usage";
import { cn } from "@/lib/utils";

export function UsageTiles() {
  const navigate = useNavigate();
  const { data: buckets = [] } = useQuery({
    queryKey: ["usage-all-buckets"],
    queryFn: () => listAllBuckets(),
  });

  if (buckets.length === 0) return null;

  const tightest = [...buckets].sort((a, b) => b.percent - a.percent)[0];
  const now = Date.now();
  const nextReset = [...buckets]
    .filter((b) => b.resets_at && new Date(b.resets_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.resets_at!).getTime() - new Date(b.resets_at!).getTime(),
    )[0];

  const nowISO = new Date().toISOString();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => navigate("/usage")}
        className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 text-left backdrop-blur-xl transition hover:bg-white/[0.07]"
      >
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Tightest limit
        </p>
        <p className="mt-2 text-sm text-zinc-200">
          {tightest.plan.display_name} · {tightest.label}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full", barColor(tightest.percent))}
            style={{ width: `${Math.min(100, tightest.percent)}%` }}
          />
        </div>
        <p className="mt-2 text-sm tabular-nums text-zinc-100">
          {Math.round(tightest.percent)}%
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatReset(tightest.resets_at ?? undefined, nowISO)}
        </p>
      </button>

      <button
        type="button"
        onClick={() => navigate("/usage")}
        className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 text-left backdrop-blur-xl transition hover:bg-white/[0.07]"
      >
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Next reset
        </p>
        {nextReset ? (
          <>
            <p className="mt-2 text-sm text-zinc-200">
              {nextReset.plan.display_name} · {nextReset.label}
            </p>
            <p className="mt-3 text-sm text-zinc-100">
              {formatReset(nextReset.resets_at ?? undefined, nowISO)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No upcoming resets</p>
        )}
      </button>
    </div>
  );
}
