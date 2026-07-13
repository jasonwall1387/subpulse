import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { formatReset } from "@/lib/resets";
import { getSetting } from "@/lib/repo/settings";
import {
  listAllBuckets,
  type LimitBucket,
  type UsagePlan,
} from "@/lib/repo/usage";
import { run } from "@/lib/db";
import { onUsageUpdated } from "@/lib/events";

async function ensureNotifyPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const perm = await requestPermission();
    granted = perm === "granted";
  }
  return granted;
}

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function alertsEnabledForPlan(plan: UsagePlan): boolean {
  const cfg = parseConfig(plan.connector_config);
  if (typeof cfg.alertsEnabled === "boolean") return cfg.alertsEnabled;
  return plan.connector !== "manual";
}

async function markAlerted(bucketId: number, resetsAt: string): Promise<void> {
  await run(
    `UPDATE limit_buckets SET alerted_for_reset = $1 WHERE id = $2`,
    [resetsAt, bucketId],
  );
}

function alertBody(
  bucket: LimitBucket & { plan: UsagePlan },
  nowISO: string,
): string {
  const pct = Math.round(bucket.percent);
  const reset = formatReset(bucket.resets_at ?? undefined, nowISO)
    .replace(/^Resets /, "resets ")
    .toLowerCase();
  const resetPart = reset ? ` - ${reset}` : "";
  return `${bucket.plan.display_name} ${bucket.label} at ${pct}%${resetPart}`;
}

/** Idempotent per bucket reset window via alerted_for_reset. */
export async function checkUsageAlerts(): Promise<void> {
  const threshold = await getSetting<number>("usage_alert_threshold", 85);
  const buckets = await listAllBuckets();
  const nowISO = new Date().toISOString();
  let permissionOk: boolean | null = null;

  for (const bucket of buckets) {
    if (!alertsEnabledForPlan(bucket.plan)) continue;
    if (bucket.percent < threshold) continue;
    if (!bucket.resets_at) continue;
    if (bucket.alerted_for_reset === bucket.resets_at) continue;

    if (permissionOk === null) {
      permissionOk = await ensureNotifyPermission();
    }
    if (!permissionOk) return;

    sendNotification({
      title: "SubPulse",
      body: alertBody(bucket, nowISO),
    });
    await markAlerted(bucket.id, bucket.resets_at);
  }
}

export function startUsageAlertListener(): void {
  void checkUsageAlerts();
  void onUsageUpdated(() => {
    void checkUsageAlerts();
  });
}
