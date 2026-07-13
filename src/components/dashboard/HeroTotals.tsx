import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscriptions } from "@/lib/hooks";
import { fmtUSD, periodTotalCents } from "@/lib/money";
import { getSetting, setSetting } from "@/lib/repo/settings";

type Period = "day" | "week" | "month" | "year";

const periods: Array<{ id: Period; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export function HeroTotals() {
  const { data: subs = [] } = useSubscriptions("all");
  const active = subs.filter((s) => s.status === "active");
  const [period, setPeriod] = useState<Period>("month");

  useEffect(() => {
    void getSetting<Period>("dashboard_period", "month").then(setPeriod);
  }, []);

  async function onPeriodChange(value: string | null) {
    if (!value) return;
    const next = value as Period;
    setPeriod(next);
    await setSetting("dashboard_period", next);
  }

  const total = periodTotalCents(active, period);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl">
      <Tabs value={period} onValueChange={onPeriodChange}>
        <TabsList>
          {periods.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="mt-4 text-4xl font-semibold tabular-nums text-zinc-100">
        {fmtUSD(total)}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {active.length} active subscription{active.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
