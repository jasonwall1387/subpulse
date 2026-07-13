import { expect, test } from "vitest";
import {
  advanceRenewal,
  advanceUntilFuture,
  daysUntil,
} from "../lib/cycles";

test("advanceRenewal month-end and leap year", () => {
  expect(advanceRenewal("2026-01-31", "monthly")).toBe("2026-02-28"); // month-end clamp
  expect(advanceRenewal("2028-01-31", "monthly")).toBe("2028-02-29"); // leap year
  expect(advanceRenewal("2026-03-31", "monthly")).toBe("2026-04-30");
  expect(advanceRenewal("2026-07-17", "monthly")).toBe("2026-08-17");
  expect(advanceRenewal("2026-07-17", "annual")).toBe("2027-07-17");
  expect(advanceRenewal("2026-07-17", "weekly")).toBe("2026-07-24");
  expect(advanceRenewal("2026-07-17", "custom", 45)).toBe("2026-08-31");
});

test("advanceUntilFuture and daysUntil", () => {
  expect(advanceUntilFuture("2026-05-01", "monthly", "2026-07-13")).toBe(
    "2026-08-01",
  );
  expect(daysUntil("2026-07-17", "2026-07-13")).toBe(4);
  expect(daysUntil("2026-07-13", "2026-07-13")).toBe(0);
});
