import { useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconBadge } from "@/components/subscriptions/SubscriptionCard";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { advanceRenewal } from "@/lib/cycles";
import { useSubscriptions } from "@/lib/hooks";
import { fmtUSD } from "@/lib/money";
import type { Subscription } from "@/lib/repo/subscriptions";
import { cn } from "@/lib/utils";

type DayRenewal = { sub: Subscription; date: string };

function renewalsInRange(
  subs: Subscription[],
  rangeStart: Date,
  rangeEnd: Date,
): DayRenewal[] {
  const startISO = format(rangeStart, "yyyy-MM-dd");
  const endISO = format(rangeEnd, "yyyy-MM-dd");
  const out: DayRenewal[] = [];

  for (const sub of subs) {
    if (sub.status !== "active" || !sub.next_renewal) continue;
    let cursor = sub.next_renewal;
    let guard = 0;
    while (cursor < startISO && guard < 1200) {
      const next = advanceRenewal(
        cursor,
        sub.billing_cycle,
        sub.cycle_days ?? undefined,
      );
      if (next === cursor) break;
      cursor = next;
      guard += 1;
    }
    while (cursor <= endISO && guard < 2400) {
      if (cursor >= startISO) {
        out.push({ sub, date: cursor });
      }
      const next = advanceRenewal(
        cursor,
        sub.billing_cycle,
        sub.cycle_days ?? undefined,
      );
      if (next === cursor || next <= cursor) break;
      cursor = next;
      guard += 1;
    }
  }
  return out;
}

export function CalendarMonth() {
  const { data: subs = [] } = useSubscriptions("active");
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()));

  const gridStart = startOfWeek(startOfMonth(cursorMonth), { weekStartsOn: 0 });
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );
  const monthEnd = endOfMonth(cursorMonth);
  const renewals = useMemo(
    () => renewalsInRange(subs, gridStart, addDays(gridStart, 41)),
    [subs, gridStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, DayRenewal[]>();
    for (const item of renewals) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [renewals]);

  const monthTotal = useMemo(() => {
    const startISO = format(startOfMonth(cursorMonth), "yyyy-MM-dd");
    const endISO = format(monthEnd, "yyyy-MM-dd");
    return renewals
      .filter((r) => r.date >= startISO && r.date <= endISO)
      .reduce((sum, r) => sum + r.sub.price_cents, 0);
  }, [renewals, cursorMonth, monthEnd]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setCursorMonth(addDays(startOfMonth(cursorMonth), -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-40 text-center text-lg font-medium tabular-nums">
            {format(cursorMonth, "MMMM yyyy")}
          </h2>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() =>
              setCursorMonth(startOfMonth(addDays(endOfMonth(cursorMonth), 1)))
            }
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursorMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>
        <p className="text-sm tabular-nums text-zinc-300">
          {fmtUSD(monthTotal)} due this month
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const visible = items.slice(0, 2);
          const overflow = items.length - visible.length;
          const inMonth = isSameMonth(day, cursorMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <Popover key={key}>
              <PopoverTrigger
                className={cn(
                  "min-h-24 rounded-xl border border-transparent p-1.5 text-left transition hover:border-white/[0.08] hover:bg-white/[0.04]",
                  !inMonth && "opacity-40",
                  isToday && "border-white/20 bg-white/[0.06]",
                )}
              >
                <div className="mb-1 text-xs tabular-nums text-zinc-400">
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {visible.map((item) => (
                    <div
                      key={`${item.sub.id}-${item.date}`}
                      className="truncate rounded-md bg-white/10 px-1 py-0.5 text-[10px] text-zinc-200"
                    >
                      {item.sub.name}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[10px] text-zinc-500">+{overflow}</div>
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <p className="mb-2 text-sm font-medium">
                  {format(day, "MMM d, yyyy")}
                </p>
                {items.length === 0 ? (
                  <p className="text-sm text-zinc-500">No renewals</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={`${item.sub.id}-${item.date}-pop`}
                        className="flex items-center gap-2"
                      >
                        <IconBadge sub={item.sub} className="size-7" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{item.sub.name}</p>
                          <p className="text-xs tabular-nums text-zinc-400">
                            {fmtUSD(item.sub.price_cents)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
