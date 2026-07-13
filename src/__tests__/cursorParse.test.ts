import { expect, test } from "vitest";
import {
  assertCookieLooksComplete,
  cookieExpiryEpoch,
  parseCursorSummary,
} from "../lib/connectors/cursorCookie";
import { ConnectorError } from "../lib/connectors/types";

function fakeJwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

test("assertCookieLooksComplete rejects truncated pastes", () => {
  expect(() => assertCookieLooksComplete("")).toThrow(ConnectorError);
  expect(() => assertCookieLooksComplete("123%3A%3AeyJ")).toThrow(
    /looks incomplete/,
  );
  expect(() =>
    assertCookieLooksComplete("123%3A%3A" + fakeJwtWithExp(1790000000)),
  ).not.toThrow();
});

test("parseCursorSummary and cookieExpiryEpoch", () => {
  const summaryFixture = {
    billingCycleStart: "2026-07-01T00:00:00Z",
    billingCycleEnd: "2026-08-01T00:00:00Z",
    membershipType: "pro",
    individualUsage: {
      plan: {
        enabled: true,
        used: 1234,
        limit: 2000,
        remaining: 766,
        totalPercentUsed: 61.7,
      },
      onDemand: { used: 250, limit: 5000, remaining: 4750 },
    },
  };
  const r = parseCursorSummary(summaryFixture);
  expect(r.buckets).toHaveLength(2);
  expect(r.buckets[0]).toMatchObject({
    key: "plan_pool",
    label: "Included usage",
    windowKind: "plan_period",
    percent: 61.7,
    used: 12.34,
    limit: 20,
    unit: "usd",
    resetsAt: "2026-08-01T00:00:00Z",
    source: "unofficial",
  });
  expect(r.buckets[1]).toMatchObject({
    key: "on_demand",
    percent: 5,
    used: 2.5,
    limit: 50,
  });
  expect(r.tierLabel).toBe("Pro");

  // no onDemand limit -> single bucket; no totalPercentUsed -> derived percent
  const r2 = parseCursorSummary({
    individualUsage: { plan: { used: 500, limit: 2000 } },
  });
  expect(r2.buckets).toHaveLength(1);
  expect(r2.buckets[0].percent).toBe(25);

  // live shape: onDemand.limit null must not fail parse
  const r3 = parseCursorSummary({
    membershipType: "pro",
    individualUsage: {
      plan: {
        enabled: true,
        used: 2000,
        limit: 2000,
        remaining: 0,
        totalPercentUsed: 18.3,
      },
      onDemand: { enabled: false, used: 0, limit: null, remaining: null },
    },
  });
  expect(r3.buckets).toHaveLength(1);
  expect(r3.buckets[0]).toMatchObject({ key: "plan_pool", percent: 18.3 });
  expect(r3.tierLabel).toBe("Pro");

  // cookie expiry decode
  expect(
    cookieExpiryEpoch("123%3A%3A" + fakeJwtWithExp(1790000000)),
  ).toBe(1790000000);
});
