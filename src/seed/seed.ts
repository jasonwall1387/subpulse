import { addMonths, format } from "date-fns";
import type { WindowKind } from "@/lib/connectors/types";
import type { BillingCycle } from "@/lib/cycles";
import { listCategories } from "@/lib/repo/categories";
import {
  createSubscription,
  listSubscriptions,
  type SubscriptionInput,
} from "@/lib/repo/subscriptions";
import {
  createPlan,
  listPlans,
  setManualBucket,
} from "@/lib/repo/usage";

// EDIT ME: verify every price/cycle/renewal date after first run
const seedSubs: Array<{
  name: string;
  category: string;
  priceCents: number;
  cycle: BillingCycle;
}> = [
  { name: "Claude Max", category: "AI", priceCents: 20000, cycle: "monthly" }, // EDIT ME (Max 20x)
  { name: "Cursor Pro", category: "AI", priceCents: 2000, cycle: "monthly" }, // EDIT ME
  { name: "ChatGPT Plus", category: "AI", priceCents: 2000, cycle: "monthly" }, // EDIT ME
  { name: "Perplexity Pro", category: "AI", priceCents: 2000, cycle: "monthly" }, // EDIT ME
  { name: "Google AI Pro", category: "AI", priceCents: 1999, cycle: "monthly" }, // EDIT ME
  { name: "SuperGrok", category: "AI", priceCents: 3000, cycle: "monthly" }, // EDIT ME
  { name: "X Premium+", category: "Media", priceCents: 4000, cycle: "annual" }, // EDIT ME
];

// Usage plan seeds. Limits researched 2026-07-13; consumer numbers are volatile,
// low/med confidence values carry a sourceNote so future-Jason knows what to distrust.
// Claude and Cursor start as manual and flip to live connectors in Tasks 4.2/4.3.
const usagePlanSeeds = [
  {
    provider: "claude",
    displayName: "Claude",
    tierLabel: "Max (20x)",
    connector: "claude_local",
    subName: "Claude Max",
    config: { usagePageUrl: "https://claude.ai/settings/usage" },
    refreshMinutes: 15,
    buckets: [
      {
        key: "five_hour",
        label: "5-hour limit",
        windowKind: "rolling_5h" as WindowKind,
        percent: 0,
      },
      {
        key: "seven_day",
        label: "Weekly - all models",
        windowKind: "weekly" as WindowKind,
        percent: 0,
      },
    ],
  },
  {
    provider: "cursor",
    displayName: "Cursor",
    tierLabel: "Pro",
    connector: "cursor_cookie",
    subName: "Cursor Pro",
    refreshMinutes: 15,
    config: {
      usagePageUrl: "https://cursor.com/dashboard",
      sourceNote:
        "2026-07: $20/mo included usage pool at API token rates, resets on billing date",
    },
    buckets: [
      {
        key: "plan_pool",
        label: "Included usage",
        windowKind: "plan_period" as WindowKind,
        used: 0,
        limit: 20,
        unit: "usd" as const,
        percent: 0,
      },
    ],
  },
  {
    provider: "openai",
    displayName: "ChatGPT",
    tierLabel: "Plus",
    connector: "manual",
    subName: "ChatGPT Plus",
    config: {
      usagePageUrl: "https://chatgpt.com/codex/settings/usage",
      sourceNote:
        "2026-07 help center: ~160 msgs / rolling 3h on default model (silently falls back to mini after); Thinking mode 3000/wk; Codex has its own 5h+weekly meter at the linked page. MED confidence, changes with model swaps",
    },
    buckets: [
      {
        key: "chat_3h",
        label: "Messages - 3h window",
        windowKind: "custom" as WindowKind,
        used: 0,
        limit: 160,
        unit: "requests" as const,
        percent: 0,
      },
      {
        key: "thinking_week",
        label: "Thinking - weekly",
        windowKind: "weekly" as WindowKind,
        used: 0,
        limit: 3000,
        unit: "requests" as const,
        percent: 0,
      },
    ],
  },
  {
    provider: "perplexity",
    displayName: "Perplexity",
    tierLabel: "Pro",
    connector: "manual",
    subName: "Perplexity Pro",
    config: {
      usagePageUrl: "https://www.perplexity.ai/account/usage",
      sourceNote:
        "2026-05: advanced-model queries quietly cut, ~100-150/wk reported (LOW confidence); Pro search itself is a soft unlimited; $5 API credit discontinued Feb 2026",
    },
    buckets: [
      {
        key: "advanced_week",
        label: "Advanced models - weekly",
        windowKind: "weekly" as WindowKind,
        used: 0,
        limit: 125,
        unit: "requests" as const,
        percent: 0,
      },
    ],
  },
  {
    provider: "gemini",
    displayName: "Gemini",
    tierLabel: "AI Pro",
    connector: "manual",
    subName: "Google AI Pro",
    config: {
      usagePageUrl: "https://gemini.google.com",
      sourceNote:
        "2026-07 official: allowance refreshes every 5 hours under a weekly cap; exact numbers unpublished (AI Pro = 4x free). Track percent by feel; usage panel: Gemini app > Settings > Usage limits",
    },
    buckets: [
      {
        key: "five_hour",
        label: "5-hour allowance",
        windowKind: "rolling_5h" as WindowKind,
        percent: 0,
      },
      {
        key: "weekly",
        label: "Weekly cap",
        windowKind: "weekly" as WindowKind,
        percent: 0,
      },
    ],
  },
  {
    provider: "grok",
    displayName: "Grok",
    tierLabel: "SuperGrok",
    connector: "manual",
    subName: "SuperGrok",
    config: {
      usagePageUrl: "https://grok.com",
      sourceNote:
        "xAI publishes nothing; third-party estimates conflict (rolling 2-4h chat windows). Use this bucket as a hit-the-wall logger: set percent 100 + the countdown the app shows when you cap out",
    },
    buckets: [
      {
        key: "session",
        label: "Session limit",
        windowKind: "custom" as WindowKind,
        percent: 0,
      },
    ],
  },
];

export async function loadSeed(): Promise<void> {
  const existing = await listSubscriptions("all");
  if (existing.length === 0) {
    const categories = await listCategories();
    const byName = new Map(categories.map((c) => [c.name, c.id]));
    const nextRenewal = format(addMonths(new Date(), 1), "yyyy-MM-dd");

    for (const row of seedSubs) {
      const input: SubscriptionInput = {
        name: row.name,
        category_id: byName.get(row.category) ?? null,
        price_cents: row.priceCents,
        billing_cycle: row.cycle,
        next_renewal: nextRenewal,
        auto_renews: true,
        status: "active",
      };
      await createSubscription(input);
    }
  }

  const plans = await listPlans();
  if (plans.length > 0) return;

  const subs = await listSubscriptions("all");
  const subByName = new Map(subs.map((s) => [s.name, s.id]));

  let sort = 0;
  for (const seed of usagePlanSeeds) {
    const planId = await createPlan({
      provider: seed.provider,
      display_name: seed.displayName,
      tier_label: seed.tierLabel,
      connector: seed.connector,
      connector_config: seed.config,
      subscription_id: subByName.get(seed.subName) ?? null,
      refresh_minutes:
        "refreshMinutes" in seed && typeof seed.refreshMinutes === "number"
          ? seed.refreshMinutes
          : 15,
      sort_order: sort,
    });
    sort += 1;
    for (const bucket of seed.buckets) {
      await setManualBucket(planId, {
        key: bucket.key,
        label: bucket.label,
        windowKind: bucket.windowKind,
        percent: bucket.percent,
        used: "used" in bucket ? bucket.used : undefined,
        limit: "limit" in bucket ? bucket.limit : undefined,
        unit: "unit" in bucket ? bucket.unit : undefined,
        source: "manual",
      });
    }
  }
}
