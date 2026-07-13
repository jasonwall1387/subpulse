import { expect, test } from "vitest";
import {
  humanizeBucketKey,
  normalizeBuckets,
} from "../lib/connectors/normalize";

test("humanizeBucketKey", () => {
  expect(humanizeBucketKey("five_hour")).toBe("5-hour limit");
  expect(humanizeBucketKey("seven_day")).toBe("Weekly - all models");
  expect(humanizeBucketKey("seven_day_opus")).toBe("Weekly - Opus");
  expect(humanizeBucketKey("seven_day_fable")).toBe("Weekly - Fable");
  expect(humanizeBucketKey("some_new_thing")).toBe("Some new thing");
});

test("normalizeBuckets", () => {
  const [b] = normalizeBuckets([
    {
      key: "x",
      label: "X",
      windowKind: "monthly",
      used: 150,
      limit: 300,
      source: "api",
    },
  ]);
  expect(b.percent).toBe(50);
  expect(
    normalizeBuckets([
      {
        key: "x",
        label: "X",
        windowKind: "monthly",
        percent: 140.2,
        source: "api",
      },
    ])[0].percent,
  ).toBe(100); // clamp
  expect(
    normalizeBuckets([
      { key: "x", label: "X", windowKind: "monthly", source: "api" },
    ]),
  ).toHaveLength(0); // no data -> dropped
});
