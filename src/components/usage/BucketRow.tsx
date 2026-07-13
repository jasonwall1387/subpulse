import { useClockTick } from "@/lib/clock";
import { formatReset } from "@/lib/resets";
import { cn } from "@/lib/utils";

export function barColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-blue-500";
}

export function BucketRow({
  label,
  percent,
  resetsAt,
}: {
  label: string;
  percent: number;
  resetsAt?: string | null;
}) {
  useClockTick();
  const nowISO = new Date().toISOString();
  const resetCopy = formatReset(resetsAt ?? undefined, nowISO);
  const displayPct = Math.round(percent);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-100">{displayPct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", barColor(percent))}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {resetCopy && (
        <p className="text-xs text-zinc-500">{resetCopy}</p>
      )}
    </div>
  );
}
