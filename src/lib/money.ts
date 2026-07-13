import type { BillingCycle } from "./cycles";

export type { BillingCycle };

function annualCents(
  priceCents: number,
  cycle: BillingCycle,
  cycleDays?: number | null,
): number {
  switch (cycle) {
    case "weekly":
      return priceCents * 52;
    case "monthly":
      return priceCents * 12;
    case "quarterly":
      return priceCents * 4;
    case "annual":
      return priceCents;
    case "custom": {
      const days = cycleDays && cycleDays > 0 ? cycleDays : 30;
      return priceCents * (365 / days);
    }
  }
}

export function monthlyEquivalentCents(
  priceCents: number,
  cycle: BillingCycle,
  cycleDays?: number | null,
): number {
  return Math.round(annualCents(priceCents, cycle, cycleDays) / 12);
}

export function periodTotalCents(
  subs: Array<{
    price_cents: number;
    billing_cycle: BillingCycle;
    cycle_days: number | null;
    status: string;
  }>,
  period: "day" | "week" | "month" | "year",
): number {
  const annual = subs
    .filter((s) => s.status === "active")
    .reduce(
      (sum, s) => sum + annualCents(s.price_cents, s.billing_cycle, s.cycle_days),
      0,
    );
  switch (period) {
    case "day":
      return Math.round(annual / 365);
    case "week":
      return Math.round(annual / 52);
    case "month":
      return Math.round(annual / 12);
    case "year":
      return Math.round(annual);
  }
}

export function fmtUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
