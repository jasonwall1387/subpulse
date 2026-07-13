/** Stub for Task 1.1; real math lands in Task 1.2 (TDD). */
export type BillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "custom";

export function advanceRenewal(
  dateISO: string,
  _cycle: BillingCycle,
  _cycleDays?: number,
): string {
  return dateISO;
}

export function advanceUntilFuture(
  dateISO: string,
  _cycle: BillingCycle,
  _todayISO: string,
  _cycleDays?: number,
): string {
  return dateISO;
}

export function daysUntil(_dateISO: string, _todayISO: string): number {
  return 0;
}
