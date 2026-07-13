import { expect, test } from "vitest";
import {
  fmtUSD,
  monthlyEquivalentCents,
  periodTotalCents,
} from "../lib/money";

test("monthlyEquivalentCents", () => {
  expect(monthlyEquivalentCents(20000, "annual")).toBe(1667); // $200/yr -> $16.67/mo
  expect(monthlyEquivalentCents(2000, "monthly")).toBe(2000);
  expect(monthlyEquivalentCents(500, "weekly")).toBe(2167); // 500*52/12 rounded
  expect(monthlyEquivalentCents(3000, "quarterly")).toBe(1000);
  expect(monthlyEquivalentCents(1000, "custom", 45)).toBe(676); // 1000/45*30.4375 rounded
});

test("periodTotalCents", () => {
  const activeM2000 = {
    price_cents: 2000,
    billing_cycle: "monthly" as const,
    cycle_days: null,
    status: "active" as const,
  };
  const canceledM9900 = {
    price_cents: 9900,
    billing_cycle: "monthly" as const,
    cycle_days: null,
    status: "canceled" as const,
  };
  expect(periodTotalCents([activeM2000, canceledM9900], "month")).toBe(2000); // inactive excluded
  expect(periodTotalCents([activeM2000], "year")).toBe(24000);
});

test("fmtUSD", () => {
  expect(fmtUSD(10820)).toBe("$108.20");
});
