import { expect, test } from "vitest";
import {
  clampPlanRefreshMinutes,
  nextDelayMs,
} from "@/lib/connectors/scheduler";

test("nextDelayMs backoff and jitter", () => {
  expect(nextDelayMs(15, 0, () => 0.5)).toBe(15 * 60_000);
  expect(nextDelayMs(15, 1, () => 0.5)).toBe(30 * 60_000);
  expect(nextDelayMs(15, 3, () => 0.5)).toBe(60 * 60_000); // capped at 60 min
  expect(nextDelayMs(10, 0, () => 0)).toBe(9 * 60_000); // -10% jitter
  expect(nextDelayMs(10, 0, () => 1)).toBe(11 * 60_000); // +10% jitter
});

test("clampPlanRefreshMinutes enforces >= 10", () => {
  expect(clampPlanRefreshMinutes(5)).toBe(10);
  expect(clampPlanRefreshMinutes(1)).toBe(10);
  expect(clampPlanRefreshMinutes(15)).toBe(15);
  expect(nextDelayMs(5, 0, () => 0.5)).toBe(10 * 60_000); // base clamped before delay
});
