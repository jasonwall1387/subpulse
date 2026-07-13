import { expect, test } from "vitest";
import {
  parseClaudeUsage,
  resolveClaudeCreds,
  tierFromCreds,
} from "../lib/connectors/claudeLocal";

test("parseClaudeUsage top-level and limits fixtures", () => {
  const topLevelFixture = {
    five_hour: { utilization: 19, resets_at: "2026-07-13T21:59:00Z" },
    seven_day: { utilization: 24, resets_at: "2026-07-15T06:59:00Z" },
    seven_day_opus: null,
    seven_day_fable: {
      utilization: 21,
      resets_at: "2026-07-15T06:59:00Z",
    },
    extra_usage: {
      is_enabled: false,
      monthly_limit: null,
      used_credits: null,
      utilization: null,
    },
    iguana_necktie: null,
  };
  const buckets = parseClaudeUsage(topLevelFixture);
  expect(buckets).toHaveLength(3); // nulls and disabled extra_usage skipped
  expect(buckets[0]).toMatchObject({
    key: "five_hour",
    label: "5-hour limit",
    windowKind: "rolling_5h",
    percent: 19,
    resetsAt: "2026-07-13T21:59:00Z",
    source: "unofficial",
  });
  expect(buckets.find((b) => b.key === "seven_day_fable")!.label).toBe(
    "Weekly - Fable",
  );

  const limitsFixture = {
    limits: [
      { kind: "five_hour", percent: 19, resets_at: "2026-07-13T21:59:00Z" },
      {
        kind: "seven_day",
        group: "all_models",
        percent: 24,
        resets_at: "2026-07-15T06:59:00Z",
      },
      {
        kind: "seven_day",
        group: "model",
        percent: 21,
        resets_at: "2026-07-15T06:59:00Z",
        scope: { model: { display_name: "Fable" } },
      },
    ],
  };
  const buckets2 = parseClaudeUsage(limitsFixture);
  expect(buckets2).toHaveLength(3);
  expect(buckets2[2]).toMatchObject({ label: "Weekly - Fable", percent: 21 });

  // credential file: both nesting variants resolve
  expect(
    resolveClaudeCreds({ claudeAiOauth: { accessToken: "sk-ant-x" } })!
      .accessToken,
  ).toBe("sk-ant-x");
  expect(resolveClaudeCreds({ accessToken: "sk-ant-y" })!.accessToken).toBe(
    "sk-ant-y",
  );
  expect(tierFromCreds({ rateLimitTier: "default_claude_max_20x" })).toBe(
    "Max (20x)",
  );
});
