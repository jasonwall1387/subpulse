import {
  addDays,
  addHours,
  addMonths,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isBefore,
  parseISO,
} from "date-fns";
import type { WindowKind } from "@/lib/connectors/types";

export type ResetBucket = {
  windowKind: WindowKind;
  percent: number;
  used?: number;
  resetsAt?: string;
  resetBehavior?: "zero" | "hold";
};

export function formatReset(
  resetsAtISO: string | undefined,
  nowISO: string,
): string {
  if (!resetsAtISO) return "";
  const resetsAt = parseISO(resetsAtISO);
  const now = parseISO(nowISO);
  const minutes = differenceInMinutes(resetsAt, now);
  if (minutes < 0) return "";
  if (minutes < 60) {
    return `Resets in ${minutes} min`;
  }
  if (minutes < 24 * 60) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `Resets in ${hrs} hr ${mins} min`;
  }
  const days = differenceInCalendarDays(resetsAt, now);
  if (days < 7) {
    return `Resets ${format(resetsAt, "EEE h:mm a")}`;
  }
  return `Resets ${format(resetsAt, "MMM d")}`;
}

function advanceOnce(resetsAt: Date, windowKind: WindowKind): Date {
  switch (windowKind) {
    case "rolling_5h":
      return addHours(resetsAt, 5);
    case "daily":
      return addDays(resetsAt, 1);
    case "weekly":
      return addDays(resetsAt, 7);
    case "monthly":
      return addMonths(resetsAt, 1);
    case "plan_period":
    case "custom":
      return resetsAt;
  }
}

export function advanceBucketOnReset<T extends ResetBucket>(
  b: T,
  nowISO: string = new Date().toISOString(),
): T {
  if (!b.resetsAt) return b;
  if (b.windowKind === "plan_period" || b.windowKind === "custom") {
    return b;
  }

  const now = parseISO(nowISO);
  let resetsAt = parseISO(b.resetsAt);
  if (!isBefore(resetsAt, now)) {
    return b;
  }

  let guard = 0;
  while (isBefore(resetsAt, now) && guard < 1200) {
    const next = advanceOnce(resetsAt, b.windowKind);
    if (next.getTime() === resetsAt.getTime()) break;
    resetsAt = next;
    guard += 1;
  }

  const zero = (b.resetBehavior ?? "zero") === "zero";
  return {
    ...b,
    resetsAt: resetsAt.toISOString(),
    percent: zero ? 0 : b.percent,
    used: zero ? 0 : b.used,
  };
}

export function relativeAgo(iso: string, nowISO: string): string {
  const then = parseISO(iso);
  const now = parseISO(nowISO);
  const minutes = differenceInMinutes(now, then);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return format(then, "MMM d");
}
