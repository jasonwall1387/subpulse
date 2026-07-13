import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

export type BillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "custom";

export function advanceRenewal(
  dateISO: string,
  cycle: BillingCycle,
  cycleDays?: number,
): string {
  const date = parseISO(dateISO);
  let next: Date;
  switch (cycle) {
    case "weekly":
      next = addDays(date, 7);
      break;
    case "monthly":
      next = addMonths(date, 1);
      break;
    case "quarterly":
      next = addMonths(date, 3);
      break;
    case "annual":
      next = addYears(date, 1);
      break;
    case "custom":
      next = addDays(date, cycleDays && cycleDays > 0 ? cycleDays : 30);
      break;
  }
  return format(next, "yyyy-MM-dd");
}

export function advanceUntilFuture(
  dateISO: string,
  cycle: BillingCycle,
  todayISO: string,
  cycleDays?: number,
): string {
  let current = dateISO;
  let guard = 0;
  while (current < todayISO && guard < 1200) {
    const next = advanceRenewal(current, cycle, cycleDays);
    if (next === current) break;
    current = next;
    guard += 1;
  }
  return current;
}

export function daysUntil(dateISO: string, todayISO: string): number {
  return differenceInCalendarDays(parseISO(dateISO), parseISO(todayISO));
}
