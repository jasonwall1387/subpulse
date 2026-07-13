import type { UsagePlan } from "@/lib/repo/usage";

const MIN_REFRESH_MINUTES = 10;

/** Pure: base interval with exponential backoff (cap 60m) and ±10% jitter. */
export function nextDelayMs(
  baseMinutes: number,
  consecutiveFailures: number,
  rand: () => number,
): number {
  const clampedBase = Math.max(MIN_REFRESH_MINUTES, baseMinutes);
  const multiplier = Math.min(2 ** consecutiveFailures, 60 / clampedBase);
  const baseMs = clampedBase * multiplier * 60_000;
  const capped = Math.min(baseMs, 60 * 60_000);
  const jitter = 0.9 + rand() * 0.2; // rand 0 -> 0.9, 0.5 -> 1.0, 1 -> 1.1
  return Math.round(capped * jitter);
}

export function clampPlanRefreshMinutes(minutes: number): number {
  return Math.max(MIN_REFRESH_MINUTES, minutes);
}

const failures = new Map<number, number>();
const timers = new Map<number, number>();
const authStopped = new Set<number>();
/** Per-plan single-flight: skip if a refresh for that plan is already running. */
const inFlight = new Map<number, Promise<void>>();
let started = false;
let refreshingAll = false;

function clearTimer(planId: number): void {
  const t = timers.get(planId);
  if (t !== undefined) {
    window.clearTimeout(t);
    timers.delete(planId);
  }
}

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function refreshPlan(
  planId: number,
  opts?: { manual?: boolean },
): Promise<void> {
  if (inFlight.has(planId)) return;
  const work = refreshPlanInner(planId, opts).finally(() => {
    inFlight.delete(planId);
  });
  inFlight.set(planId, work);
  await work;
}

async function refreshPlanInner(
  planId: number,
  opts?: { manual?: boolean },
): Promise<void> {
  const { connectors } = await import("@/lib/connectors/registry");
  const { normalizeBuckets } = await import("@/lib/connectors/normalize");
  const { ConnectorError } = await import("@/lib/connectors/types");
  const { emitUsageUpdated } = await import("@/lib/events");
  const {
    applyFetchResult,
    listPlans,
    recordPlanError,
  } = await import("@/lib/repo/usage");
  const { getSecret } = await import("@/lib/secrets");
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const { error: logError, info: logInfo } = await import(
    "@tauri-apps/plugin-log"
  );

  const plans = await listPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return;
  if (!plan.enabled) return;
  if (plan.connector === "manual") return;

  const connector = connectors[plan.connector];
  if (!connector) {
    await recordPlanError(
      planId,
      "error",
      `Unknown connector: ${plan.connector}`,
    );
    await emitUsageUpdated();
    return;
  }

  if (authStopped.has(planId) && !opts?.manual) {
    return;
  }

  try {
    const result = await connector.fetchUsage({
      config: parseConfig(plan.connector_config),
      getSecret,
      fetch: tauriFetch as typeof fetch,
    });
    const normalized = normalizeBuckets(result.buckets);
    await applyFetchResult(planId, {
      ...result,
      buckets: normalized,
    });
    failures.set(planId, 0);
    authStopped.delete(planId);
    await emitUsageUpdated();
    void logInfo(`refreshPlan ${planId} ok`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ConnectorError && err.kind === "auth") {
      await recordPlanError(planId, "auth", msg);
      authStopped.add(planId);
      clearTimer(planId);
      await emitUsageUpdated();
      void logError(`refreshPlan ${planId} auth: ${msg}`);
      return;
    }
    await recordPlanError(planId, "error", msg);
    const next = (failures.get(planId) ?? 0) + 1;
    failures.set(planId, next);
    await emitUsageUpdated();
    void logError(`refreshPlan ${planId} error (${next}): ${msg}`);
  }

  if (!authStopped.has(planId)) {
    const latest = (await listPlans()).find((p) => p.id === planId);
    if (latest) schedulePlan(latest);
  }
}

function schedulePlan(plan: UsagePlan): void {
  void (async () => {
    const { connectors } = await import("@/lib/connectors/registry");
    if (plan.connector === "manual") return;
    if (!connectors[plan.connector]) return;
    if (authStopped.has(plan.id)) return;

    clearTimer(plan.id);
    const failCount = failures.get(plan.id) ?? 0;
    const clamped = clampPlanRefreshMinutes(plan.refresh_minutes);
    const delay = nextDelayMs(clamped, failCount, Math.random);
    void import("@tauri-apps/plugin-log").then(({ info }) => {
      void info(
        `schedulePlan id=${plan.id} failures=${failCount} delayMs=${delay} baseMin=${clamped}`,
      );
    });
    const timer = window.setTimeout(() => {
      void (async () => {
        const { listPlans } = await import("@/lib/repo/usage");
        const latest = (await listPlans()).find((p) => p.id === plan.id);
        if (!latest || !latest.enabled) return;
        await refreshPlan(latest.id);
      })();
    }, delay);
    timers.set(plan.id, timer);
  })();
}

export async function refreshAll(): Promise<void> {
  if (refreshingAll) return;
  refreshingAll = true;
  try {
    const { listPlans } = await import("@/lib/repo/usage");
    const { connectors } = await import("@/lib/connectors/registry");
    const { info: logInfo } = await import("@tauri-apps/plugin-log");
    const plans = await listPlans();
    const auto = plans.filter(
      (p) => p.enabled && p.connector !== "manual" && connectors[p.connector],
    );
    for (const plan of auto) {
      const startedAt = new Date().toISOString();
      void logInfo(
        `refreshAll sequential start plan=${plan.id} connector=${plan.connector} at=${startedAt}`,
      );
      authStopped.delete(plan.id);
      await refreshPlan(plan.id, { manual: true });
      void logInfo(
        `refreshAll sequential done plan=${plan.id} at=${new Date().toISOString()}`,
      );
    }
  } finally {
    refreshingAll = false;
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;

  void (async () => {
    const { listPlans } = await import("@/lib/repo/usage");
    const { connectors } = await import("@/lib/connectors/registry");
    const { listen } = await import("@tauri-apps/api/event");

    const plans = await listPlans();
    for (const plan of plans) {
      if (!plan.enabled || plan.connector === "manual") continue;
      if (!connectors[plan.connector]) continue;
      window.setTimeout(() => {
        void refreshPlan(plan.id).then(async () => {
          const latest = (await listPlans()).find((p) => p.id === plan.id);
          if (latest) schedulePlan(latest);
        });
      }, 1_500 + Math.random() * 2_000);
    }

    void listen("refresh:all", () => {
      void refreshAll();
    });
  })();
}

/** Clear auth stop when config changes so polling can resume. */
export function clearAuthStop(planId: number): void {
  authStopped.delete(planId);
}

export async function setPlanConnector(
  planId: number,
  connector: string,
  config: Record<string, unknown>,
  refreshMinutes: number,
): Promise<void> {
  const { updatePlan } = await import("@/lib/repo/usage");
  clearAuthStop(planId);
  await updatePlan(planId, {
    connector,
    connector_config: config,
    refresh_minutes: clampPlanRefreshMinutes(refreshMinutes),
  });
}
