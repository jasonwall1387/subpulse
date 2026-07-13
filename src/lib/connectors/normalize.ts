import type {
  BucketSource,
  NormalizedBucket,
  WindowKind,
} from "@/lib/connectors/types";

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function humanizeBucketKey(key: string): string {
  if (key === "five_hour") return "5-hour limit";
  if (key === "seven_day") return "Weekly - all models";
  if (key.startsWith("seven_day_")) {
    const model = key.slice("seven_day_".length);
    return `Weekly - ${capitalize(model)}`;
  }
  const parts = key.split("_").filter(Boolean);
  if (parts.length === 0) return key;
  const [first, ...rest] = parts;
  return [capitalize(first), ...rest].join(" ");
}

function clampPercent(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(100, Math.max(0, rounded));
}

export function normalizeBuckets(
  raw: Array<Partial<NormalizedBucket> & { key: string }>,
): NormalizedBucket[] {
  const out: NormalizedBucket[] = [];
  for (const item of raw) {
    let percent = item.percent;
    if (
      percent === undefined &&
      item.used !== undefined &&
      item.limit !== undefined &&
      item.limit !== 0
    ) {
      percent = (item.used / item.limit) * 100;
    }
    if (percent === undefined) {
      console.warn(`Dropping bucket ${item.key}: no percent or used+limit`);
      continue;
    }
    const windowKind = (item.windowKind ?? "custom") as WindowKind;
    const source = (item.source ?? "manual") as BucketSource;
    out.push({
      key: item.key,
      label: item.label ?? humanizeBucketKey(item.key),
      windowKind,
      percent: clampPercent(percent),
      used: item.used,
      limit: item.limit,
      unit: item.unit,
      resetsAt: item.resetsAt,
      source,
    });
  }
  return out;
}
