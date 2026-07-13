import { z } from "zod";
import type { FetchResult, NormalizedBucket, WindowKind } from "@/lib/connectors/types";
import { run, select } from "../db";

export const usagePlanSchema = z
  .object({
    id: z.number(),
    subscription_id: z.number().nullable(),
    provider: z.string(),
    display_name: z.string(),
    tier_label: z.string().nullable(),
    connector: z.string(),
    connector_config: z.string(),
    enabled: z.number(),
    refresh_minutes: z.number(),
    last_fetch_at: z.string().nullable(),
    last_status: z.enum(["never", "ok", "error", "auth"]),
    last_error: z.string().nullable(),
    sort_order: z.number(),
  })
  .passthrough();

export type UsagePlan = z.infer<typeof usagePlanSchema>;

export const limitBucketSchema = z
  .object({
    id: z.number(),
    plan_id: z.number(),
    key: z.string(),
    label: z.string(),
    window_kind: z.enum([
      "rolling_5h",
      "daily",
      "weekly",
      "monthly",
      "plan_period",
      "custom",
    ]),
    used: z.number().nullable(),
    limit_value: z.number().nullable(),
    unit: z.enum(["requests", "tokens", "usd", "percent"]).nullable(),
    percent: z.number(),
    resets_at: z.string().nullable(),
    reset_behavior: z.enum(["zero", "hold"]),
    source: z.enum(["manual", "api", "unofficial", "local"]),
    alerted_for_reset: z.string().nullable(),
    updated_at: z.string(),
  })
  .passthrough();

export type LimitBucket = z.infer<typeof limitBucketSchema>;

export type UsagePlanInput = {
  subscription_id?: number | null;
  provider: string;
  display_name: string;
  tier_label?: string | null;
  connector?: string;
  connector_config?: string | Record<string, unknown>;
  enabled?: boolean | number;
  refresh_minutes?: number;
  sort_order?: number;
};

function boolToInt(value: boolean | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function configToString(
  config: string | Record<string, unknown> | undefined,
): string {
  if (config === undefined) return "{}";
  if (typeof config === "string") return config;
  return JSON.stringify(config);
}

export async function listPlans(): Promise<UsagePlan[]> {
  const rows = await select<unknown>(
    "SELECT * FROM usage_plans ORDER BY sort_order ASC, id ASC",
  );
  return rows.map((row) => usagePlanSchema.parse(row));
}

export async function createPlan(input: UsagePlanInput): Promise<number> {
  const result = await run(
    `INSERT INTO usage_plans (
      subscription_id, provider, display_name, tier_label, connector,
      connector_config, enabled, refresh_minutes, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.subscription_id ?? null,
      input.provider,
      input.display_name,
      input.tier_label ?? null,
      input.connector ?? "manual",
      configToString(input.connector_config),
      boolToInt(input.enabled, 1),
      input.refresh_minutes ?? 15,
      input.sort_order ?? 0,
    ],
  );
  return result.lastInsertId ?? 0;
}

export async function updatePlan(
  id: number,
  patch: Partial<UsagePlanInput> & {
    last_fetch_at?: string | null;
    last_status?: UsagePlan["last_status"];
    last_error?: string | null;
  },
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "enabled") {
      mapped[key] = boolToInt(value as boolean | number, 1);
    } else if (key === "connector_config") {
      mapped[key] = configToString(value as string | Record<string, unknown>);
    } else {
      mapped[key] = value;
    }
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(mapped)) {
    fields.push(`${key} = $${i}`);
    params.push(value);
    i += 1;
  }
  if (fields.length === 0) return;
  params.push(id);
  await run(
    `UPDATE usage_plans SET ${fields.join(", ")} WHERE id = $${i}`,
    params,
  );
}

export async function deletePlan(id: number): Promise<void> {
  await run("DELETE FROM usage_plans WHERE id = $1", [id]);
}

export async function getBuckets(planId: number): Promise<LimitBucket[]> {
  const rows = await select<unknown>(
    "SELECT * FROM limit_buckets WHERE plan_id = $1 ORDER BY id ASC",
    [planId],
  );
  return rows.map((row) => limitBucketSchema.parse(row));
}

export async function listAllBuckets(): Promise<
  Array<LimitBucket & { plan: UsagePlan }>
> {
  const plans = await listPlans();
  const byId = new Map(plans.map((p) => [p.id, p]));
  const rows = await select<unknown>(
    `SELECT b.* FROM limit_buckets b
     INNER JOIN usage_plans p ON p.id = b.plan_id
     WHERE p.enabled = 1
     ORDER BY b.percent DESC, b.id ASC`,
  );
  return rows.map((row) => {
    const bucket = limitBucketSchema.parse(row);
    const plan = byId.get(bucket.plan_id);
    if (!plan) throw new Error(`Missing plan ${bucket.plan_id}`);
    return { ...bucket, plan };
  });
}

async function upsertBucket(
  planId: number,
  bucket: NormalizedBucket,
  source: LimitBucket["source"],
  resetBehavior: LimitBucket["reset_behavior"] = "zero",
): Promise<void> {
  await run(
    `INSERT INTO limit_buckets (
      plan_id, key, label, window_kind, used, limit_value, unit, percent,
      resets_at, reset_behavior, source, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, datetime('now')
    )
    ON CONFLICT(plan_id, key) DO UPDATE SET
      label = excluded.label,
      window_kind = excluded.window_kind,
      used = excluded.used,
      limit_value = excluded.limit_value,
      unit = excluded.unit,
      percent = excluded.percent,
      resets_at = excluded.resets_at,
      reset_behavior = excluded.reset_behavior,
      source = excluded.source,
      updated_at = datetime('now')`,
    [
      planId,
      bucket.key,
      bucket.label,
      bucket.windowKind,
      bucket.used ?? null,
      bucket.limit ?? null,
      bucket.unit ?? null,
      bucket.percent,
      bucket.resetsAt ?? null,
      resetBehavior,
      source,
    ],
  );
}

async function insertSnapshot(
  planId: number,
  bucket: Pick<NormalizedBucket, "key" | "percent" | "used" | "limit">,
): Promise<void> {
  await run(
    `INSERT INTO usage_snapshots (plan_id, bucket_key, percent, used, limit_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      planId,
      bucket.key,
      bucket.percent,
      bucket.used ?? null,
      bucket.limit ?? null,
    ],
  );
}

export async function applyFetchResult(
  planId: number,
  result: FetchResult,
): Promise<void> {
  try {
    await run("BEGIN");
    for (const bucket of result.buckets) {
      await upsertBucket(planId, bucket, bucket.source);
      await insertSnapshot(planId, bucket);
    }
    await updatePlan(planId, {
      last_fetch_at: result.fetchedAt,
      last_status: "ok",
      last_error: null,
      ...(result.tierLabel !== undefined
        ? { tier_label: result.tierLabel }
        : {}),
    });
    await run("COMMIT");
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function recordPlanError(
  planId: number,
  kind: "error" | "auth",
  message: string,
): Promise<void> {
  await updatePlan(planId, {
    last_status: kind,
    last_error: message,
  });
}

export async function setManualBucket(
  planId: number,
  bucket: NormalizedBucket,
): Promise<void> {
  const manual: NormalizedBucket = { ...bucket, source: "manual" };
  await upsertBucket(planId, manual, "manual");
  await insertSnapshot(planId, manual);
}

export type ManualBucketPatch = {
  key: string;
  label: string;
  windowKind: WindowKind;
  percent: number;
  used?: number;
  limit?: number;
  unit?: NormalizedBucket["unit"];
  resetsAt?: string;
  resetBehavior?: LimitBucket["reset_behavior"];
};
