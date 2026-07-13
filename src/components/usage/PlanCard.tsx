import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BucketRow } from "@/components/usage/BucketRow";
import { ManualUpdatePopover } from "@/components/usage/ManualUpdatePopover";
import { refreshPlan } from "@/lib/connectors/scheduler";
import { emitUsageUpdated } from "@/lib/events";
import { relativeAgo } from "@/lib/resets";
import { advanceBucketOnReset } from "@/lib/resets";
import type { LimitBucket, UsagePlan } from "@/lib/repo/usage";
import { setManualBucket } from "@/lib/repo/usage";
import { cn } from "@/lib/utils";

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sourceBadge(plan: UsagePlan): {
  label: string;
  className: string;
} {
  if (plan.last_status === "auth") {
    return { label: "auth needed", className: "bg-red-500/20 text-red-300" };
  }
  if (plan.connector === "manual") {
    return { label: "manual", className: "bg-zinc-500/20 text-zinc-300" };
  }
  if (plan.last_fetch_at) {
    const ageMs = Date.now() - new Date(plan.last_fetch_at).getTime();
    const staleMs = plan.refresh_minutes * 60_000 * 2;
    if (ageMs > staleMs) {
      return { label: "stale", className: "bg-amber-500/20 text-amber-300" };
    }
  }
  if (plan.last_status === "ok") {
    return { label: "auto", className: "bg-blue-500/20 text-blue-300" };
  }
  if (plan.last_status === "error") {
    return { label: "error", className: "bg-red-500/20 text-red-300" };
  }
  return { label: plan.connector, className: "bg-zinc-500/20 text-zinc-300" };
}

export function PlanCard({
  plan,
  buckets,
  onChanged,
}: {
  plan: UsagePlan;
  buckets: LimitBucket[];
  onChanged?: () => void;
}) {
  const config = parseConfig(plan.connector_config);
  const usagePageUrl =
    typeof config.usagePageUrl === "string" ? config.usagePageUrl : null;
  const badge = sourceBadge(plan);
  const rollingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (plan.connector !== "manual") return;
    if (rollingRef.current) return;
    const nowISO = new Date().toISOString();
    const lapsed = buckets.filter(
      (b) => b.resets_at && b.resets_at < nowISO,
    );
    if (lapsed.length === 0) return;
    rollingRef.current = true;
    void (async () => {
      for (const b of lapsed) {
        if (b.window_kind === "plan_period" || b.window_kind === "custom") {
          continue;
        }
        const advanced = advanceBucketOnReset(
          {
            windowKind: b.window_kind,
            percent: b.percent,
            used: b.used ?? undefined,
            resetsAt: b.resets_at ?? undefined,
            resetBehavior: b.reset_behavior,
          },
          nowISO,
        );
        if (advanced.resetsAt === b.resets_at) continue;
        await setManualBucket(plan.id, {
          key: b.key,
          label: b.label,
          windowKind: b.window_kind,
          percent: advanced.percent,
          used: advanced.used,
          limit: b.limit_value ?? undefined,
          unit: b.unit ?? undefined,
          resetsAt: advanced.resetsAt,
          source: "manual",
        });
      }
      await emitUsageUpdated();
      onChanged?.();
      rollingRef.current = false;
    })();
  }, [buckets, plan.connector, plan.id, onChanged]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-zinc-100">{plan.display_name}</h3>
            {plan.tier_label && (
              <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">
                {plan.tier_label}
              </span>
            )}
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] uppercase",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{plan.provider}</p>
        </div>
        {usagePageUrl && (
          <button
            type="button"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100"
            onClick={() => void openUrl(usagePageUrl)}
            aria-label="Open usage page"
          >
            <ExternalLink className="size-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {buckets.map((b) => (
          <BucketRow
            key={b.key}
            label={b.label}
            percent={b.percent}
            resetsAt={b.resets_at}
          />
        ))}
        {buckets.length === 0 && (
          <p className="text-sm text-zinc-500">No buckets yet.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <p className="text-xs text-zinc-500">
          {(() => {
            const stamp =
              plan.connector === "manual"
                ? buckets.reduce<string | null>((max, b) => {
                    if (!b.updated_at) return max;
                    if (!max || b.updated_at > max) return b.updated_at;
                    return max;
                  }, null)
                : plan.last_fetch_at;
            return stamp
              ? relativeAgo(stamp, new Date().toISOString())
              : "never updated";
          })()}
        </p>
        <div className="flex gap-2">
          {plan.connector !== "manual" && (
            <button
              type="button"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100 disabled:opacity-50"
              disabled={refreshing}
              title="Refresh"
              onClick={() => {
                void (async () => {
                  setRefreshing(true);
                  try {
                    await refreshPlan(plan.id, { manual: true });
                    onChanged?.();
                  } finally {
                    setRefreshing(false);
                  }
                })();
              }}
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
            </button>
          )}
          {plan.connector === "manual" &&
            buckets.map((b) => (
              <ManualUpdatePopover
                key={`edit-${b.key}`}
                planId={plan.id}
                bucket={b}
                onSaved={onChanged}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
