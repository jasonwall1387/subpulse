import { expect, test } from "vitest";
import {
  advanceBucketOnReset,
  formatReset,
  relativeAgo,
} from "../lib/resets";

const now = "2026-07-13T20:00:00-05:00";

test("formatReset", () => {
  expect(formatReset("2026-07-13T20:42:00-05:00", now)).toBe(
    "Resets in 42 min",
  );
  expect(formatReset("2026-07-13T23:58:00-05:00", now)).toBe(
    "Resets in 3 hr 58 min",
  );
  expect(formatReset("2026-07-15T01:59:00-05:00", now)).toBe(
    "Resets Wed 1:59 AM",
  );
  expect(formatReset("2026-07-22T09:00:00-05:00", now)).toBe("Resets Jul 22");
  expect(formatReset(undefined, now)).toBe("");
});

test("advanceBucketOnReset", () => {
  // weekly bucket that lapsed: rolls +7d past now, zeroes when behavior 'zero'
  const rolled = advanceBucketOnReset(
    {
      windowKind: "weekly",
      percent: 84,
      resetsAt: "2026-07-08T06:59:00Z",
      resetBehavior: "zero",
    },
    now,
  );
  expect(rolled.resetsAt).toBe("2026-07-15T06:59:00.000Z");
  expect(rolled.percent).toBe(0);

  const held = advanceBucketOnReset(
    {
      windowKind: "rolling_5h",
      percent: 60,
      resetsAt: "2026-07-13T19:00:00-05:00",
      resetBehavior: "hold",
    },
    now,
  );
  expect(new Date(held.resetsAt!).getTime()).toBeGreaterThan(
    new Date(now).getTime(),
  );
  expect(held.percent).toBe(60);

  // plan_period and custom never auto-advance
  const frozen = advanceBucketOnReset(
    {
      windowKind: "plan_period",
      percent: 50,
      resetsAt: "2026-07-01T00:00:00Z",
      resetBehavior: "zero",
    },
    now,
  );
  expect(frozen.resetsAt).toBe("2026-07-01T00:00:00Z");
});

test("relativeAgo", () => {
  expect(relativeAgo("2026-07-13T20:00:00-05:00", now)).toBe("just now");
  expect(relativeAgo("2026-07-13T19:56:00-05:00", now)).toBe("4 min ago");
  expect(relativeAgo("2026-07-13T18:00:00-05:00", now)).toBe("2 hr ago");
  expect(relativeAgo("2026-07-12T12:00:00-05:00", now)).toBe("Jul 12");
});
