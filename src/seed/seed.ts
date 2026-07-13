import { addMonths, format } from "date-fns";
import { listCategories } from "@/lib/repo/categories";
import {
  createSubscription,
  listSubscriptions,
  type SubscriptionInput,
} from "@/lib/repo/subscriptions";
import type { BillingCycle } from "@/lib/cycles";

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

export async function loadSeed(): Promise<void> {
  const existing = await listSubscriptions("all");
  if (existing.length > 0) return;

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
