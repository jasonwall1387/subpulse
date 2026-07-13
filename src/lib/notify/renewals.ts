import { format, parseISO } from "date-fns";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { daysUntil } from "@/lib/cycles";
import { fmtUSD } from "@/lib/money";
import { getSetting } from "@/lib/repo/settings";
import { listSubscriptions } from "@/lib/repo/subscriptions";
import { run, select } from "@/lib/db";

const KIND_BY_DAYS: Record<number, "t3" | "t1" | "t0"> = {
  3: "t3",
  1: "t1",
  0: "t0",
};

async function ensureNotifyPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const perm = await requestPermission();
    granted = perm === "granted";
  }
  return granted;
}

function bodyFor(
  name: string,
  kind: "t3" | "t1" | "t0",
  renewalDate: string,
  priceCents: number,
): string {
  const price = fmtUSD(priceCents);
  if (kind === "t0") return `${name} renews today - ${price}`;
  if (kind === "t1") return `${name} renews tomorrow - ${price}`;
  const weekday = format(parseISO(renewalDate), "EEEE");
  return `${name} renews ${weekday} - ${price}`;
}

async function alreadyNotified(
  subscriptionId: number,
  renewalDate: string,
  kind: string,
): Promise<boolean> {
  const rows = await select<{ n: number }>(
    `SELECT 1 AS n FROM notified_renewals
     WHERE subscription_id = $1 AND renewal_date = $2 AND kind = $3`,
    [subscriptionId, renewalDate, kind],
  );
  return rows.length > 0;
}

async function markNotified(
  subscriptionId: number,
  renewalDate: string,
  kind: string,
): Promise<void> {
  await run(
    `INSERT OR IGNORE INTO notified_renewals
     (subscription_id, renewal_date, kind) VALUES ($1, $2, $3)`,
    [subscriptionId, renewalDate, kind],
  );
}

/** Idempotent per (subscription, renewal_date, kind). */
export async function checkRenewalNotifications(
  nowISO?: string,
): Promise<void> {
  const today = (nowISO ?? new Date().toISOString()).slice(0, 10);
  const subs = await listSubscriptions("active");
  const toggles = {
    t3: await getSetting<boolean>("notify_renewal_t3", true),
    t1: await getSetting<boolean>("notify_renewal_t1", true),
    t0: await getSetting<boolean>("notify_renewal_t0", true),
  };

  let permissionOk: boolean | null = null;

  for (const sub of subs) {
    if (!sub.auto_renews || !sub.next_renewal) continue;
    const days = daysUntil(sub.next_renewal, today);
    const kind = KIND_BY_DAYS[days];
    if (!kind) continue;
    if (!toggles[kind]) continue;
    if (await alreadyNotified(sub.id, sub.next_renewal, kind)) continue;

    if (permissionOk === null) {
      permissionOk = await ensureNotifyPermission();
    }
    if (!permissionOk) return;

    sendNotification({
      title: "SubPulse",
      body: bodyFor(sub.name, kind, sub.next_renewal, sub.price_cents),
    });
    await markNotified(sub.id, sub.next_renewal, kind);
  }
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function startRenewalNotificationLoop(): void {
  void checkRenewalNotifications();
  window.setInterval(() => {
    void checkRenewalNotifications();
  }, SIX_HOURS_MS);
}
