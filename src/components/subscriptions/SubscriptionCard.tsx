import { format, parseISO } from "date-fns";
import type { Category } from "@/lib/repo/categories";
import type { Subscription } from "@/lib/repo/subscriptions";
import { resolveIcon } from "@/lib/icons";
import { fmtUSD, monthlyEquivalentCents } from "@/lib/money";
import { cn } from "@/lib/utils";

function cycleLabel(sub: Subscription): string {
  switch (sub.billing_cycle) {
    case "weekly":
      return "/wk";
    case "monthly":
      return "/mo";
    case "quarterly":
      return "/qtr";
    case "annual":
      return "/yr";
    case "custom":
      return sub.cycle_days ? `/${sub.cycle_days}d` : "/custom";
  }
}

function IconBadge({
  sub,
  className = "size-8",
}: {
  sub: Pick<Subscription, "name" | "icon_kind" | "icon_value">;
  className?: string;
}) {
  const icon = resolveIcon(sub);
  if (icon.kind === "emoji") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-white/[0.06] text-lg ${className}`}
      >
        {icon.char}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-white/[0.06] p-1.5 ${className}`}
    >
      <svg
        role="img"
        viewBox="0 0 24 24"
        className="size-full"
        fill={icon.hex}
        aria-hidden
      >
        <path d={icon.svgPath} />
      </svg>
    </span>
  );
}

export function SubscriptionCard({
  sub,
  category,
  onClick,
}: {
  sub: Subscription;
  category?: Category;
  onClick: () => void;
}) {
  const dimmed = sub.status !== "active";
  const yearly =
    monthlyEquivalentCents(
      sub.price_cents,
      sub.billing_cycle,
      sub.cycle_days,
    ) * 12;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left backdrop-blur-xl transition hover:bg-white/[0.07]",
        dimmed && "opacity-50",
      )}
      style={
        category
          ? { boxShadow: `inset 3px 0 0 ${category.color}` }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <IconBadge sub={sub} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-zinc-100">{sub.name}</h3>
            {sub.is_trial === 1 && (
              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                Trial
              </span>
            )}
          </div>
          <p className="mt-1 tabular-nums text-zinc-100">
            {fmtUSD(sub.price_cents)} {cycleLabel(sub)}
          </p>
          <p className="text-xs tabular-nums text-zinc-500">
            {fmtUSD(yearly)} /yr
          </p>
          {sub.next_renewal && (
            <p className="mt-2 text-xs text-zinc-400">
              Next {format(parseISO(sub.next_renewal), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export { IconBadge };
