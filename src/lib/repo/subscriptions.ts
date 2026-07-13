import { z } from "zod";
import { advanceUntilFuture, type BillingCycle } from "../cycles";
import { run, select } from "../db";
import { categorySchema, type Category } from "./categories";

export type { Category };
export { categorySchema };

export const billingCycleSchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "custom",
]);

export const subscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "canceled",
]);

export const iconKindSchema = z.enum(["auto", "simple", "emoji"]);

export const subscriptionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    category_id: z.number().nullable(),
    price_cents: z.number(),
    currency: z.string(),
    billing_cycle: billingCycleSchema,
    cycle_days: z.number().nullable(),
    next_renewal: z.string().nullable(),
    auto_renews: z.number(),
    payment_method: z.string().nullable(),
    url: z.string().nullable(),
    notes: z.string().nullable(),
    is_trial: z.number(),
    trial_ends: z.string().nullable(),
    status: subscriptionStatusSchema,
    icon_kind: iconKindSchema,
    icon_value: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

export type Subscription = z.infer<typeof subscriptionSchema>;

export type SubscriptionInput = {
  name: string;
  category_id?: number | null;
  price_cents?: number;
  currency?: string;
  billing_cycle?: BillingCycle;
  cycle_days?: number | null;
  next_renewal?: string | null;
  auto_renews?: boolean | number;
  payment_method?: string | null;
  url?: string | null;
  notes?: string | null;
  is_trial?: boolean | number;
  trial_ends?: string | null;
  status?: z.infer<typeof subscriptionStatusSchema>;
  icon_kind?: z.infer<typeof iconKindSchema>;
  icon_value?: string | null;
};

function boolToInt(value: boolean | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export async function listSubscriptions(
  filter: "active" | "all" | "trials" | "inactive" = "all",
): Promise<Subscription[]> {
  let where = "";
  switch (filter) {
    case "active":
      where = "WHERE status = 'active'";
      break;
    case "trials":
      where = "WHERE is_trial = 1";
      break;
    case "inactive":
      where = "WHERE status IN ('paused', 'canceled')";
      break;
    default:
      where = "";
  }
  const rows = await select<unknown>(
    `SELECT * FROM subscriptions ${where} ORDER BY (next_renewal IS NULL), next_renewal ASC, name ASC`,
  );
  return rows.map((row) => subscriptionSchema.parse(row));
}

export async function createSubscription(
  input: SubscriptionInput,
): Promise<number> {
  const result = await run(
    `INSERT INTO subscriptions (
      name, category_id, price_cents, currency, billing_cycle, cycle_days,
      next_renewal, auto_renews, payment_method, url, notes, is_trial,
      trial_ends, status, icon_kind, icon_value
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )`,
    [
      input.name,
      input.category_id ?? null,
      input.price_cents ?? 0,
      input.currency ?? "USD",
      input.billing_cycle ?? "monthly",
      input.cycle_days ?? null,
      input.next_renewal ?? null,
      boolToInt(input.auto_renews, 1),
      input.payment_method ?? null,
      input.url ?? null,
      input.notes ?? null,
      boolToInt(input.is_trial, 0),
      input.trial_ends ?? null,
      input.status ?? "active",
      input.icon_kind ?? "auto",
      input.icon_value ?? null,
    ],
  );
  return result.lastInsertId ?? 0;
}

export async function updateSubscription(
  id: number,
  patch: Partial<SubscriptionInput>,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "auto_renews" || key === "is_trial") {
      mapped[key] = boolToInt(value as boolean | number, 0);
    } else {
      mapped[key] = value;
    }
  }
  mapped.updated_at = new Date().toISOString();

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
    `UPDATE subscriptions SET ${fields.join(", ")} WHERE id = $${i}`,
    params,
  );
}

export async function setStatus(
  id: number,
  status: z.infer<typeof subscriptionStatusSchema>,
): Promise<void> {
  await updateSubscription(id, { status });
}

export async function deleteSubscription(id: number): Promise<void> {
  await run("DELETE FROM subscriptions WHERE id = $1", [id]);
}

export async function advanceOverdueRenewals(
  todayISO: string,
): Promise<number> {
  const rows = await select<Subscription>(
    `SELECT * FROM subscriptions
     WHERE status = 'active'
       AND next_renewal IS NOT NULL
       AND next_renewal < $1`,
    [todayISO],
  );
  let count = 0;
  for (const row of rows) {
    const parsed = subscriptionSchema.parse(row);
    if (!parsed.next_renewal) continue;
    const next = advanceUntilFuture(
      parsed.next_renewal,
      parsed.billing_cycle,
      todayISO,
      parsed.cycle_days ?? undefined,
    );
    if (next !== parsed.next_renewal) {
      await updateSubscription(parsed.id, { next_renewal: next });
      count += 1;
    }
  }
  return count;
}
