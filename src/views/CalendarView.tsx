import { CalendarMonth } from "@/components/calendar/CalendarMonth";

export function CalendarView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Calendar</h1>
        <p className="mt-1 text-sm text-zinc-400">Renewals by month.</p>
      </div>
      <CalendarMonth />
    </div>
  );
}
