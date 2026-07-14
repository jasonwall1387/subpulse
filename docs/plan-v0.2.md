# SubPulse v0.2 - Pace Forecasting Implementation Plan

> **For agentic workers:** This plan is written to be executed by Cursor agents, one task per
> session (same convention as `docs/plan.md`). If executed under Claude Code instead, use
> superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking. Approved spec:
> `C:\dev\docs\superpowers\specs\2026-07-13-subpulse-v0.2-pace-design.md`.

**Goal:** Predict when an AI plan bucket will run out BEFORE its reset and say so on the
card, the widget, and a Windows toast; plus a 7-day sparkline per bucket and snapshot
retention.

**Architecture:** A pure pace engine (`src/lib/pace.ts`) computes a least-squares burn rate
over the trailing 6 hours of `usage_snapshots` and projects exhaustion vs `resets_at`.
Thin query hooks feed the existing PlanCard/BucketRow and widget components. Pace toasts
extend the existing `usageAlerts.ts` with their own dedupe column.

**Tech Stack:** Existing only - Tauri 2, React 18 + TS strict, TanStack Query v5, zod,
date-fns, tauri-plugin-sql, vitest. No new dependencies.

**Deviation from spec (approved rationale):** The spec sketched a `PRAGMA user_version`
migration; the repo already uses tauri-plugin-sql versioned migrations (`lib.rs`, versions
1-2), so the schema change ships as `Migration { version: 3 }` instead. The spec's
"component test renders polyline" is satisfied by unit-testing the pure geometry function
(`sparklinePolylinePoints`) - the repo has no DOM test environment and adding one for a
40-line component violates YAGNI.

## Global Constraints

Every task's requirements implicitly include these (from AGENTS.md + spec):

- TypeScript `strict: true`. No `any` at module boundaries.
- Date math only in `src/lib` via date-fns. No raw `Date` arithmetic in components.
- Fail soft: pace code must never block a card/widget render or another connector.
- Docs/copy: no em dashes (use " - "), never the word "straightforward".
- `pnpm check` (tsc + vitest) must pass before EVERY commit. Conventional commits.
- Pace constants live in `pace.ts`, not settings: 6h window, 3 points min, 30 min span
  min, 30 min max staleness, 50% toast floor, 15 min ETA rounding, 90 day retention,
  7 day sparkline.
- The existing 85% threshold alert in `usageAlerts.ts` must keep working unchanged.

---

### Task 1: Schema migration v3 + zod field

**Files:**
- Modify: `src-tauri/src/lib.rs` (migrations vec around line 105)
- Modify: `src/lib/repo/usage.ts` (limitBucketSchema, ~line 46)

**Interfaces:**
- Consumes: existing `Migration` pattern in `lib.rs`.
- Produces: `limit_buckets.pace_alerted_for_reset TEXT` column; `LimitBucket` type gains
  `pace_alerted_for_reset?: string | null` (optional in zod so a pre-migration DB row
  still parses - that is the capability fallback from the spec).

- [ ] **Step 1: Add the migration SQL constant** in `src-tauri/src/lib.rs`, next to the
  existing `MIGRATION_2_SQL`:

```rust
const MIGRATION_3_SQL: &str = r#"
ALTER TABLE limit_buckets ADD COLUMN pace_alerted_for_reset TEXT;
"#;
```

- [ ] **Step 2: Register it** in the `migrations` vec in `run()`:

```rust
        Migration {
            version: 3,
            description: "pace_alerts",
            sql: MIGRATION_3_SQL,
            kind: MigrationKind::Up,
        },
```

- [ ] **Step 3: Add the field to `limitBucketSchema`** in `src/lib/repo/usage.ts`, after
  `alerted_for_reset`:

```ts
    alerted_for_reset: z.string().nullable(),
    pace_alerted_for_reset: z.string().nullable().optional(),
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished` with no errors.

- [ ] **Step 5: Verify TS + tests**

Run: `pnpm check`
Expected: PASS (existing 17 tests untouched).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/lib/repo/usage.ts
git commit -m "feat: pace_alerted_for_reset column (migration v3)"
```

---

### Task 2: Pace engine (pure, TDD)

**Files:**
- Create: `src/lib/pace.ts`
- Test: `src/__tests__/pace.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Tasks 3-7):

```ts
export type SnapshotPoint = { capturedAt: string; percent: number };
export type PaceVerdict = "steady" | "on_pace" | "will_exhaust" | "exhausted";
export type PaceResult = {
  verdict: PaceVerdict;
  slopePctPerHour: number | null;
  etaISO: string | null; // projected exhaustion, rounded to 15 min
};
export const PACE_WINDOW_HOURS = 6;
export const PACE_TOAST_FLOOR_PERCENT = 50;
export function sqliteUtcToIso(value: string): string;
export function computePace(args: {
  points: SnapshotPoint[]; // ascending capturedAt
  currentPercent: number;
  resetsAt: string | null;
  nowISO: string;
}): PaceResult;
export function shouldFirePaceToast(args: {
  result: PaceResult;
  currentPercent: number;
  resetsAt: string | null;
  paceAlertedForReset: string | null;
}): boolean;
export function formatEta(etaISO: string, nowISO: string): string;
```

- [ ] **Step 1: Write the failing tests** at `src/__tests__/pace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computePace,
  formatEta,
  shouldFirePaceToast,
  sqliteUtcToIso,
} from "@/lib/pace";

const NOW = "2026-07-13T12:00:00.000Z";

/** points every 30 min ending at `now`, percent rising by stepPct each point */
function trail(
  count: number,
  startPercent: number,
  stepPct: number,
  endISO: string = NOW,
  gapMinutes = 30,
) {
  const end = new Date(endISO).getTime();
  return Array.from({ length: count }, (_, i) => ({
    capturedAt: new Date(
      end - (count - 1 - i) * gapMinutes * 60_000,
    ).toISOString(),
    percent: startPercent + i * stepPct,
  }));
}

describe("sqliteUtcToIso", () => {
  it("converts sqlite datetime to ISO Z", () => {
    expect(sqliteUtcToIso("2026-07-13 09:30:00")).toBe(
      "2026-07-13T09:30:00Z",
    );
  });
  it("passes through strings already containing T", () => {
    expect(sqliteUtcToIso("2026-07-13T09:30:00.000Z")).toBe(
      "2026-07-13T09:30:00.000Z",
    );
  });
});

describe("computePace guards (all -> steady)", () => {
  const base = { currentPercent: 60, resetsAt: "2026-07-14T12:00:00.000Z", nowISO: NOW };
  it("fewer than 3 points", () => {
    expect(computePace({ ...base, points: trail(2, 50, 5) }).verdict).toBe("steady");
  });
  it("span under 30 minutes", () => {
    expect(
      computePace({ ...base, points: trail(3, 50, 5, NOW, 10) }).verdict,
    ).toBe("steady");
  });
  it("zero slope", () => {
    expect(computePace({ ...base, points: trail(4, 60, 0) }).verdict).toBe("steady");
  });
  it("negative slope", () => {
    expect(computePace({ ...base, points: trail(4, 60, -0.05) }).verdict).toBe("steady");
  });
  it("newest point older than 30 minutes", () => {
    const stale = trail(4, 50, 5, "2026-07-13T11:00:00.000Z");
    expect(computePace({ ...base, points: stale }).verdict).toBe("steady");
  });
  it("missing resets_at", () => {
    expect(
      computePace({ ...base, resetsAt: null, points: trail(4, 50, 5) }).verdict,
    ).toBe("steady");
  });
});

describe("computePace verdicts", () => {
  it("exhausted at 100 regardless of points", () => {
    const r = computePace({
      points: [],
      currentPercent: 100,
      resetsAt: "2026-07-14T12:00:00.000Z",
      nowISO: NOW,
    });
    expect(r.verdict).toBe("exhausted");
  });
  it("will_exhaust when ETA lands before reset", () => {
    // 10 pct per 30 min = 20 pct/hr from 60% -> empty in ~2h, reset in 24h
    const r = computePace({
      points: trail(4, 30, 10),
      currentPercent: 60,
      resetsAt: "2026-07-14T12:00:00.000Z",
      nowISO: NOW,
    });
    expect(r.verdict).toBe("will_exhaust");
    expect(r.slopePctPerHour).toBeCloseTo(20, 5);
    expect(r.etaISO).toBe("2026-07-13T14:00:00.000Z");
  });
  it("on_pace when ETA lands after reset", () => {
    // same burn, but reset arrives in 1h
    const r = computePace({
      points: trail(4, 30, 10),
      currentPercent: 60,
      resetsAt: "2026-07-13T13:00:00.000Z",
      nowISO: NOW,
    });
    expect(r.verdict).toBe("on_pace");
  });
  it("rounds ETA to the nearest 15 minutes", () => {
    // 3 pct per 30 min = 6 pct/hr from 60% -> 40/6 h = 6h40m -> 18:40 -> 18:45
    const r = computePace({
      points: trail(4, 51, 3),
      currentPercent: 60,
      resetsAt: "2026-07-14T12:00:00.000Z",
      nowISO: NOW,
    });
    expect(r.etaISO).toBe("2026-07-13T18:45:00.000Z");
  });
  it("truncates the trail after a mid-window reset drop", () => {
    // big drop between points -> only post-drop points remain -> under 3 -> steady
    const pts = [
      { capturedAt: "2026-07-13T09:00:00.000Z", percent: 80 },
      { capturedAt: "2026-07-13T10:00:00.000Z", percent: 90 },
      { capturedAt: "2026-07-13T11:00:00.000Z", percent: 5 },
      { capturedAt: "2026-07-13T11:50:00.000Z", percent: 10 },
    ];
    const r = computePace({
      points: pts,
      currentPercent: 10,
      resetsAt: "2026-07-14T12:00:00.000Z",
      nowISO: NOW,
    });
    expect(r.verdict).toBe("steady");
  });
});

describe("shouldFirePaceToast", () => {
  const fire = {
    result: {
      verdict: "will_exhaust",
      slopePctPerHour: 20,
      etaISO: "2026-07-13T14:00:00.000Z",
    } as const,
    currentPercent: 60,
    resetsAt: "2026-07-14T12:00:00.000Z",
    paceAlertedForReset: null,
  };
  it("fires on will_exhaust above the floor, not yet alerted", () => {
    expect(shouldFirePaceToast(fire)).toBe(true);
  });
  it("respects the 50 percent floor boundary", () => {
    expect(shouldFirePaceToast({ ...fire, currentPercent: 49 })).toBe(false);
    expect(shouldFirePaceToast({ ...fire, currentPercent: 50 })).toBe(true);
  });
  it("dedupes within the same reset window", () => {
    expect(
      shouldFirePaceToast({
        ...fire,
        paceAlertedForReset: "2026-07-14T12:00:00.000Z",
      }),
    ).toBe(false);
  });
  it("fires again for a NEW reset window", () => {
    expect(
      shouldFirePaceToast({
        ...fire,
        paceAlertedForReset: "2026-07-07T12:00:00.000Z",
      }),
    ).toBe(true);
  });
  it("never fires on steady / on_pace / exhausted", () => {
    for (const verdict of ["steady", "on_pace", "exhausted"] as const) {
      expect(
        shouldFirePaceToast({
          ...fire,
          result: { verdict, slopePctPerHour: null, etaISO: null },
        }),
      ).toBe(false);
    }
  });
});

describe("formatEta", () => {
  it("same day -> time only", () => {
    expect(formatEta("2026-07-13T14:00:00.000Z", NOW)).toMatch(/^~\d/);
  });
  it("different day -> weekday + time", () => {
    expect(formatEta("2026-07-15T14:00:00.000Z", NOW)).toMatch(/^~\w{3} /);
  });
});
```

Note on `formatEta` expectations: rendered times are LOCAL (test machine TZ), so assert
shape (regex), not exact strings.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/__tests__/pace.test.ts`
Expected: FAIL - cannot resolve `@/lib/pace`.

- [ ] **Step 3: Implement `src/lib/pace.ts`**

```ts
import {
  addMinutes,
  differenceInMinutes,
  format,
  isBefore,
  isSameDay,
  parseISO,
} from "date-fns";

export type SnapshotPoint = { capturedAt: string; percent: number };
export type PaceVerdict = "steady" | "on_pace" | "will_exhaust" | "exhausted";
export type PaceResult = {
  verdict: PaceVerdict;
  slopePctPerHour: number | null;
  etaISO: string | null;
};

export const PACE_WINDOW_HOURS = 6;
export const PACE_MIN_POINTS = 3;
export const PACE_MIN_SPAN_MINUTES = 30;
export const PACE_MAX_STALENESS_MINUTES = 30;
export const PACE_TOAST_FLOOR_PERCENT = 50;
const ETA_ROUND_MINUTES = 15;
const RESET_DROP_EPSILON = 0.5;

/** SQLite datetime('now') emits "YYYY-MM-DD HH:MM:SS" (UTC, no zone). Normalize. */
export function sqliteUtcToIso(value: string): string {
  if (value.includes("T")) return value;
  return `${value.replace(" ", "T")}Z`;
}

/** A percent drop inside the window means the bucket reset; keep post-drop points only. */
function truncateAfterReset(points: SnapshotPoint[]): SnapshotPoint[] {
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].percent < points[i - 1].percent - RESET_DROP_EPSILON) {
      start = i;
    }
  }
  return points.slice(start);
}

const STEADY: PaceResult = { verdict: "steady", slopePctPerHour: null, etaISO: null };

export function computePace(args: {
  points: SnapshotPoint[];
  currentPercent: number;
  resetsAt: string | null;
  nowISO: string;
}): PaceResult {
  const { currentPercent, resetsAt, nowISO } = args;
  if (currentPercent >= 100) {
    return { verdict: "exhausted", slopePctPerHour: null, etaISO: null };
  }
  if (!resetsAt) return STEADY;
  const points = truncateAfterReset(args.points);
  if (points.length < PACE_MIN_POINTS) return STEADY;

  const now = parseISO(nowISO);
  const newest = parseISO(points[points.length - 1].capturedAt);
  if (differenceInMinutes(now, newest) > PACE_MAX_STALENESS_MINUTES) return STEADY;

  const first = parseISO(points[0].capturedAt);
  if (differenceInMinutes(newest, first) < PACE_MIN_SPAN_MINUTES) return STEADY;

  // Least squares slope of percent over minutes-since-first-point.
  const xs = points.map((p) => differenceInMinutes(parseISO(p.capturedAt), first));
  const ys = points.map((p) => p.percent);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return STEADY;
  const slopePerMin = num / den;
  if (slopePerMin <= 0) return STEADY;

  const minutesToEmpty = (100 - currentPercent) / slopePerMin;
  const etaRaw = addMinutes(now, minutesToEmpty);
  const roundMs = ETA_ROUND_MINUTES * 60_000;
  const eta = new Date(Math.round(etaRaw.getTime() / roundMs) * roundMs);
  const verdict: PaceVerdict = isBefore(eta, parseISO(resetsAt))
    ? "will_exhaust"
    : "on_pace";
  return {
    verdict,
    slopePctPerHour: slopePerMin * 60,
    etaISO: eta.toISOString(),
  };
}

export function shouldFirePaceToast(args: {
  result: PaceResult;
  currentPercent: number;
  resetsAt: string | null;
  paceAlertedForReset: string | null;
}): boolean {
  if (args.result.verdict !== "will_exhaust") return false;
  if (args.currentPercent < PACE_TOAST_FLOOR_PERCENT) return false;
  if (!args.resetsAt) return false;
  if (args.paceAlertedForReset === args.resetsAt) return false;
  return true;
}

export function formatEta(etaISO: string, nowISO: string): string {
  const eta = parseISO(etaISO);
  const now = parseISO(nowISO);
  if (isSameDay(eta, now)) return `~${format(eta, "h:mm a")}`;
  return `~${format(eta, "EEE h:mm a")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/__tests__/pace.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Full check + commit**

```bash
pnpm check
git add src/lib/pace.ts src/__tests__/pace.test.ts
git commit -m "feat: pace engine (burn rate, verdicts, toast gate)"
```

---

### Task 3: Snapshot repo functions + prune on boot

**Files:**
- Modify: `src/lib/repo/usage.ts` (append at end of file)
- Modify: `src/main.tsx` (bootMain, ~line 36)

**Interfaces:**
- Consumes: `select`/`run` from `src/lib/db`; `SnapshotPoint`, `sqliteUtcToIso` from
  `@/lib/pace` (Task 2).
- Produces (used by Tasks 4 and 6):
  - `listSnapshotsSince(planId: number, bucketKey: string, sinceISO: string): Promise<SnapshotPoint[]>`
  - `listHourlySparkline(planId: number, bucketKey: string): Promise<Array<{ hour: string; percent: number }>>`
  - `pruneSnapshots(): Promise<void>`
  - `markPaceAlerted(bucketId: number, resetsAt: string): Promise<void>`

- [ ] **Step 1: Append to `src/lib/repo/usage.ts`** (add
  `import { sqliteUtcToIso, type SnapshotPoint } from "@/lib/pace";` at the top):

```ts
const SNAPSHOT_RETENTION_DAYS = 90;

/** captured_at is sqlite "YYYY-MM-DD HH:MM:SS" (UTC); datetime($3) normalizes the
 *  ISO input so the string comparison is apples-to-apples. */
export async function listSnapshotsSince(
  planId: number,
  bucketKey: string,
  sinceISO: string,
): Promise<SnapshotPoint[]> {
  const rows = await select<{ captured_at: string; percent: number }>(
    `SELECT captured_at, percent FROM usage_snapshots
     WHERE plan_id = $1 AND bucket_key = $2 AND captured_at >= datetime($3)
     ORDER BY captured_at ASC`,
    [planId, bucketKey, sinceISO],
  );
  return rows.map((r) => ({
    capturedAt: sqliteUtcToIso(r.captured_at),
    percent: r.percent,
  }));
}

/** 7 days of history, one point per hour, MAX percent per hour (how close did I get). */
export async function listHourlySparkline(
  planId: number,
  bucketKey: string,
): Promise<Array<{ hour: string; percent: number }>> {
  return select<{ hour: string; percent: number }>(
    `SELECT strftime('%Y-%m-%dT%H:00:00Z', captured_at) AS hour,
            MAX(percent) AS percent
     FROM usage_snapshots
     WHERE plan_id = $1 AND bucket_key = $2
       AND captured_at >= datetime('now', '-7 days')
     GROUP BY hour ORDER BY hour ASC`,
    [planId, bucketKey],
  );
}

export async function pruneSnapshots(): Promise<void> {
  await run(
    `DELETE FROM usage_snapshots
     WHERE captured_at < datetime('now', '-${SNAPSHOT_RETENTION_DAYS} days')`,
  );
}

export async function markPaceAlerted(
  bucketId: number,
  resetsAt: string,
): Promise<void> {
  await run(
    `UPDATE limit_buckets SET pace_alerted_for_reset = $1 WHERE id = $2`,
    [resetsAt, bucketId],
  );
}
```

- [ ] **Step 2: Call prune on boot** in `src/main.tsx`. Add
  `import { pruneSnapshots } from "./lib/repo/usage";` and inside `bootMain()` after
  `await setupLogging();`:

```ts
  void pruneSnapshots().catch((err) => {
    void logError(`pruneSnapshots failed: ${String(err)}`);
  });
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/repo/usage.ts src/main.tsx
git commit -m "feat: snapshot history queries, pace-alert mark, 90-day prune on boot"
```

---

### Task 4: Pace + sparkline query hooks

**Files:**
- Create: `src/lib/paceData.ts`

**Interfaces:**
- Consumes: `computePace`, `PACE_WINDOW_HOURS`, `PaceResult` from `@/lib/pace`;
  `listSnapshotsSince`, `listHourlySparkline`, `LimitBucket` from `@/lib/repo/usage`.
- Produces (used by Tasks 5-7):
  - `useBucketPace(bucket: LimitBucket): PaceResult | null` (null while loading/on error)
  - `useBucketSparkline(bucket: LimitBucket): Array<{ hour: string; percent: number }>`

- [ ] **Step 1: Create `src/lib/paceData.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { subHours } from "date-fns";
import { computePace, PACE_WINDOW_HOURS, type PaceResult } from "@/lib/pace";
import {
  listHourlySparkline,
  listSnapshotsSince,
  type LimitBucket,
} from "@/lib/repo/usage";

/** Keyed on updated_at so a new fetch/manual edit recomputes; clock drift within a
 *  poll interval is acceptable staleness. Fail soft: null on any error. */
export function useBucketPace(bucket: LimitBucket): PaceResult | null {
  const { data } = useQuery({
    queryKey: ["pace", bucket.plan_id, bucket.key, bucket.updated_at],
    queryFn: async (): Promise<PaceResult> => {
      const nowISO = new Date().toISOString();
      const sinceISO = subHours(new Date(), PACE_WINDOW_HOURS).toISOString();
      const points = await listSnapshotsSince(
        bucket.plan_id,
        bucket.key,
        sinceISO,
      );
      return computePace({
        points,
        currentPercent: bucket.percent,
        resetsAt: bucket.resets_at,
        nowISO,
      });
    },
  });
  return data ?? null;
}

export function useBucketSparkline(
  bucket: LimitBucket,
): Array<{ hour: string; percent: number }> {
  const { data } = useQuery({
    queryKey: ["sparkline", bucket.plan_id, bucket.key, bucket.updated_at],
    queryFn: () => listHourlySparkline(bucket.plan_id, bucket.key),
  });
  return data ?? [];
}
```

- [ ] **Step 2: Verify** - `pnpm check` -> PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/paceData.ts
git commit -m "feat: pace and sparkline query hooks"
```

---

### Task 5: Sparkline component (pure geometry, TDD)

**Files:**
- Create: `src/components/usage/Sparkline.tsx`
- Test: `src/__tests__/sparkline.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 6):
  - `sparklinePolylinePoints(points: Array<{ hour: string; percent: number }>, width: number, height: number): string`
  - `<Sparkline points={...} />` React component (renders null under 2 points)

- [ ] **Step 1: Write the failing test** at `src/__tests__/sparkline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sparklinePolylinePoints } from "@/components/usage/Sparkline";

describe("sparklinePolylinePoints", () => {
  it("maps time to x and percent to inverted y", () => {
    const pts = sparklinePolylinePoints(
      [
        { hour: "2026-07-13T00:00:00Z", percent: 0 },
        { hour: "2026-07-13T12:00:00Z", percent: 50 },
        { hour: "2026-07-14T00:00:00Z", percent: 100 },
      ],
      100,
      24,
    );
    expect(pts).toBe("0,24 50,12 100,0");
  });
  it("returns empty string under 2 points", () => {
    expect(
      sparklinePolylinePoints([{ hour: "2026-07-13T00:00:00Z", percent: 50 }], 100, 24),
    ).toBe("");
  });
  it("clamps percent outside 0..100", () => {
    const pts = sparklinePolylinePoints(
      [
        { hour: "2026-07-13T00:00:00Z", percent: -5 },
        { hour: "2026-07-14T00:00:00Z", percent: 120 },
      ],
      100,
      24,
    );
    expect(pts).toBe("0,24 100,0");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/__tests__/sparkline.test.ts`
Expected: FAIL - cannot resolve module.

- [ ] **Step 3: Create `src/components/usage/Sparkline.tsx`**

```tsx
import { parseISO } from "date-fns";

export type SparkPoint = { hour: string; percent: number };

/** Time-proportional x (gaps stay gaps), inverted y, 1 decimal max. Pure. */
export function sparklinePolylinePoints(
  points: SparkPoint[],
  width: number,
  height: number,
): string {
  if (points.length < 2) return "";
  const times = points.map((p) => parseISO(p.hour).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = Math.max(1, tMax - tMin);
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  return points
    .map((p, i) => {
      const x = ((times[i] - tMin) / span) * width;
      const clamped = Math.min(100, Math.max(0, p.percent));
      const y = height - (clamped / 100) * height;
      return `${fmt(x)},${fmt(y)}`;
    })
    .join(" ");
}

export function Sparkline({ points }: { points: SparkPoint[] }) {
  const polyline = sparklinePolylinePoints(points, 100, 24);
  if (!polyline) return null;
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-5 w-full text-zinc-600"
      aria-hidden="true"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/__tests__/sparkline.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

```bash
pnpm check
git add src/components/usage/Sparkline.tsx src/__tests__/sparkline.test.ts
git commit -m "feat: sparkline component with pure polyline geometry"
```

---

### Task 6: Card surfaces - BucketRow pace state + sparkline

**Files:**
- Modify: `src/components/usage/BucketRow.tsx` (whole file below)
- Modify: `src/components/usage/PlanCard.tsx` (the `buckets.map` around line 143)

**Interfaces:**
- Consumes: `useBucketPace`, `useBucketSparkline` (Task 4), `Sparkline` (Task 5),
  `formatEta` (Task 2), `LimitBucket` type.
- Produces: `BucketRow` signature CHANGES to `{ bucket: LimitBucket }`. `barColor`
  export stays (widget uses it).

- [ ] **Step 1: Replace `src/components/usage/BucketRow.tsx`** with:

```tsx
import { useClockTick } from "@/lib/clock";
import { formatEta } from "@/lib/pace";
import { useBucketPace, useBucketSparkline } from "@/lib/paceData";
import { formatReset } from "@/lib/resets";
import type { LimitBucket } from "@/lib/repo/usage";
import { Sparkline } from "@/components/usage/Sparkline";
import { cn } from "@/lib/utils";

export function barColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-blue-500";
}

export function BucketRow({ bucket }: { bucket: LimitBucket }) {
  useClockTick();
  const pace = useBucketPace(bucket);
  const spark = useBucketSparkline(bucket);
  const nowISO = new Date().toISOString();
  const resetCopy = formatReset(bucket.resets_at ?? undefined, nowISO);
  const displayPct = Math.round(bucket.percent);
  // Capture once so TS strict narrows; null unless the verdict is will_exhaust.
  const paceEta = pace?.verdict === "will_exhaust" ? pace.etaISO : null;
  // Fact (90%+ red) outranks forecast (amber); forecast outranks the default ramp.
  const fill =
    bucket.percent >= 90
      ? "bg-red-500"
      : paceEta
        ? "bg-amber-500"
        : barColor(bucket.percent);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-zinc-300">{bucket.label}</span>
        <span className="tabular-nums text-zinc-100">{displayPct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{
            width: `${Math.min(100, Math.max(0, bucket.percent))}%`,
          }}
        />
      </div>
      <Sparkline points={spark} />
      {paceEta && (
        <p className="text-xs text-amber-400">
          empty {formatEta(paceEta, nowISO)}
        </p>
      )}
      {resetCopy && <p className="text-xs text-zinc-500">{resetCopy}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the call site** in `src/components/usage/PlanCard.tsx`:

```tsx
        {buckets.map((b) => (
          <BucketRow key={b.key} bucket={b} />
        ))}
```

- [ ] **Step 3: Verify visually**

Run: `pnpm tauri dev`
Expected: usage cards render; every bucket with >= 2 hours of history shows a small grey
sparkline; no pace line on steady buckets; no console errors.

- [ ] **Step 4: Full check + commit**

```bash
pnpm check
git add src/components/usage/BucketRow.tsx src/components/usage/PlanCard.tsx
git commit -m "feat: pace state and sparkline on plan card bucket rows"
```

---

### Task 7: Widget surface - ETA replaces reset countdown

**Files:**
- Modify: `src/components/usage/WidgetUsageList.tsx` (the `WidgetUsageList` map body,
  lines ~75-100)

**Interfaces:**
- Consumes: `useBucketPace` (Task 4), `formatEta` (Task 2), existing `barColor`.
- Produces: internal `WidgetBucketRow` component (hooks need a component per item).

- [ ] **Step 1: Add a per-bucket component** in `WidgetUsageList.tsx`. Add imports
  `import { formatEta } from "@/lib/pace";` and
  `import { useBucketPace } from "@/lib/paceData";` and
  `import type { LimitBucket, UsagePlan } from "@/lib/repo/usage";`, then above
  `WidgetUsageList` add:

```tsx
function WidgetBucketRow({ b }: { b: LimitBucket & { plan: UsagePlan } }) {
  const pace = useBucketPace(b);
  const nowISO = new Date().toISOString();
  const paceEta = pace?.verdict === "will_exhaust" ? pace.etaISO : null;
  // The more urgent fact wins the limited space: ETA replaces the reset countdown.
  const subline = paceEta
    ? `empty ${formatEta(paceEta, nowISO)}`
    : formatReset(b.resets_at ?? undefined, nowISO).replace(/^Resets /, "");
  const fill =
    b.percent >= 90
      ? "bg-red-500"
      : paceEta
        ? "bg-amber-500"
        : barColor(b.percent);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-zinc-300">
          {b.plan.display_name} · {b.label}
        </span>
        <span className="tabular-nums text-zinc-100">
          {Math.round(b.percent)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full", fill)}
          style={{ width: `${Math.min(100, Math.max(0, b.percent))}%` }}
        />
      </div>
      {subline && (
        <p
          className={cn(
            "text-[10px]",
            paceEta ? "text-amber-400" : "text-zinc-500",
          )}
        >
          {subline}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use it** - replace the whole `{top.map((b) => { ... })}` block inside
  `WidgetUsageList` with:

```tsx
        {top.map((b) => (
          <WidgetBucketRow key={b.id} b={b} />
        ))}
```

Remove the now-unused `const nowISO = ...` line inside `WidgetUsageList` if TS flags it.

- [ ] **Step 3: Verify visually**

Run: `pnpm tauri dev`, show the widget (tray menu).
Expected: widget renders the same three bars; steady buckets show the reset text
exactly as before.

- [ ] **Step 4: Full check + commit**

```bash
pnpm check
git add src/components/usage/WidgetUsageList.tsx
git commit -m "feat: pace state on widget usage bars"
```

---

### Task 8: Pace toasts + settings toggle

**Files:**
- Modify: `src/lib/notify/usageAlerts.ts` (extend `checkUsageAlerts`)
- Modify: `src/views/SettingsView.tsx` (add one row next to the
  `usage_alert_threshold` control, ~line 71)

**Interfaces:**
- Consumes: `computePace`, `shouldFirePaceToast`, `formatEta`, `PACE_WINDOW_HOURS`
  (Task 2); `listSnapshotsSince`, `markPaceAlerted` (Task 3); setting key
  `pace_alerts_enabled` (boolean, default true).
- Produces: nothing consumed later.

- [ ] **Step 1: Extend `src/lib/notify/usageAlerts.ts`.** Add imports:

```ts
import { subHours } from "date-fns";
import {
  computePace,
  formatEta,
  PACE_WINDOW_HOURS,
  shouldFirePaceToast,
} from "@/lib/pace";
import { listSnapshotsSince, markPaceAlerted } from "@/lib/repo/usage";
import { formatReset } from "@/lib/resets";
```

(`formatReset` and the repo import may partially exist; merge.) Then replace the body of
`checkUsageAlerts` so the threshold alert keeps its exact current behavior and the pace
check runs independently per bucket (the old early `continue`s must not skip it):

```ts
/** Idempotent per bucket reset window via alerted_for_reset / pace_alerted_for_reset. */
export async function checkUsageAlerts(): Promise<void> {
  const threshold = await getSetting<number>("usage_alert_threshold", 85);
  const paceEnabled = await getSetting<boolean>("pace_alerts_enabled", true);
  const buckets = await listAllBuckets();
  const nowISO = new Date().toISOString();
  let permissionOk: boolean | null = null;

  const notify = async (body: string): Promise<boolean> => {
    if (permissionOk === null) {
      permissionOk = await ensureNotifyPermission();
    }
    if (!permissionOk) return false;
    sendNotification({ title: "SubPulse", body });
    return true;
  };

  for (const bucket of buckets) {
    if (!alertsEnabledForPlan(bucket.plan)) continue;
    if (!bucket.resets_at) continue;

    // Fixed-threshold alert (v0.1 behavior, unchanged).
    if (
      bucket.percent >= threshold &&
      bucket.alerted_for_reset !== bucket.resets_at
    ) {
      if (!(await notify(alertBody(bucket, nowISO)))) return;
      await markAlerted(bucket.id, bucket.resets_at);
    }

    // Pace alert (forecast, independent signal).
    if (!paceEnabled) continue;
    try {
      const sinceISO = subHours(new Date(nowISO), PACE_WINDOW_HOURS).toISOString();
      const points = await listSnapshotsSince(
        bucket.plan_id,
        bucket.key,
        sinceISO,
      );
      const result = computePace({
        points,
        currentPercent: bucket.percent,
        resetsAt: bucket.resets_at,
        nowISO,
      });
      const fire = shouldFirePaceToast({
        result,
        currentPercent: bucket.percent,
        resetsAt: bucket.resets_at,
        paceAlertedForReset: bucket.pace_alerted_for_reset ?? null,
      });
      if (fire && result.etaISO) {
        const reset = formatReset(bucket.resets_at, nowISO)
          .replace(/^Resets /, "resets ")
          .toLowerCase();
        const body = `${bucket.plan.display_name} ${bucket.label} on pace to run out ${formatEta(result.etaISO, nowISO)}${reset ? ` (${reset})` : ""}`;
        if (!(await notify(body))) return;
        await markPaceAlerted(bucket.id, bucket.resets_at);
      }
    } catch (err) {
      // Fail soft: a missing column (pre-migration DB) or query error skips pace
      // toasts only; threshold alerts and the UI are unaffected.
      console.error("pace alert check failed", err);
    }
  }
}
```

- [ ] **Step 2: Add the settings row** in `src/views/SettingsView.tsx`. Add the query
  near the other setting queries (~line 71):

```tsx
  const { data: paceAlerts = true } = useQuery({
    queryKey: ["setting", "pace_alerts_enabled"],
    queryFn: () => getSetting<boolean>("pace_alerts_enabled", true),
  });
```

Then add a switch row directly below the usage-alert-threshold control, mirroring the
existing notify-toggle rows (same `<label>` + `<Switch>` markup as "Start hidden"):

```tsx
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-300">
              Pace alerts (projected to run out before reset)
            </span>
            <Switch
              checked={paceAlerts}
              onCheckedChange={(checked) => {
                void (async () => {
                  await setSetting("pace_alerts_enabled", checked);
                  await queryClient.invalidateQueries({
                    queryKey: ["setting", "pace_alerts_enabled"],
                  });
                })();
              }}
            />
          </label>
```

- [ ] **Step 3: Verify behavior manually**

Run: `pnpm tauri dev`. In Settings confirm the toggle renders and persists across an
app restart. Force a pace toast: on a manual test plan, set a bucket to ~55% and add
three fake snapshots via the SQLite db (or temporarily set `PACE_MIN_POINTS` guards
aside by doing three manual edits raising percent over 30+ minutes). Confirm ONE toast
fires and a second `checkUsageAlerts` run stays silent.

- [ ] **Step 4: Full check + commit**

```bash
pnpm check
git add src/lib/notify/usageAlerts.ts src/views/SettingsView.tsx
git commit -m "feat: pace toasts with per-window dedupe and settings toggle"
```

---

### Task 9: Release gate - v0.2.0

**Files:**
- Modify: `package.json` (version), `src-tauri/tauri.conf.json` (version),
  `src-tauri/Cargo.toml` (version)
- Modify: `STATUS.md`

**Interfaces:** none.

- [ ] **Step 1: Bump versions** to `0.2.0` in `package.json`,
  `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

- [ ] **Step 2: Run the full check and build**

Run: `pnpm check && pnpm tauri build`
Expected: tests pass; NSIS installer produced under
`src-tauri/target/release/bundle/nsis/SubPulse_0.2.0_x64-setup.exe`.

- [ ] **Step 3: Manual gate** - install the new build over v0.1.0 and record a
  PASS/FAIL table in `STATUS.md` (same format as the Phase 6 gate):

| Check | How |
|---|---|
| Migration upgrades v0.1 DB, no data loss | subscriptions + plans intact after install; `PRAGMA table_info(limit_buckets)` shows `pace_alerted_for_reset` |
| Sparkline renders | buckets with history show the 7-day line; reset cliffs visible |
| Card pace state | during a heavy session a rising bucket shows amber + "empty ~..." |
| Widget pace state | same bucket's widget row swaps countdown for the ETA |
| Exactly one pace toast per bucket per window | trigger once, confirm silence on the next refresh cycle |
| Prune | backdate a snapshot row 91+ days (SQL), relaunch, row gone |
| Threshold alert unchanged | 85%+ bucket still toasts once per window |

- [ ] **Step 4: Update `STATUS.md`** (Done / In progress / Blocked / Next + gate table)
  and commit:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml STATUS.md
git commit -m "chore: v0.2.0 release gate"
git tag -a v0.2.0 -m "Pace forecasting: burn-rate ETA, pace toasts, sparklines, retention"
git push origin main v0.2.0
```

---

## Self-review notes (performed at plan-writing time)

- Spec coverage: engine (Task 2), repo + prune (Task 3), hooks (Task 4), sparkline
  (Task 5), card (Task 6), widget (Task 7), toast + settings (Task 8), migration
  (Task 1), manual gate incl. migration/data-loss check (Task 9). Spec section 5 edge
  cases are engine guards (Task 2 tests) + fail-soft try/catch (Task 8).
- The spec's `user_version` fallback became a versioned plugin migration plus a
  try/catch in the pace-toast path and an `.optional()` zod field; behavior equivalent
  (missing column = pace toasts off, everything else unaffected).
- Type consistency: `SnapshotPoint`/`PaceResult`/`SparkPoint` names match across Tasks
  2-8; `BucketRow` signature change is applied at its only call site (PlanCard) in the
  same task.
