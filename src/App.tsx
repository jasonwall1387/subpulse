import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { FooterBar } from "@/components/shell/FooterBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { onSubsUpdated } from "@/lib/events";
import { CalendarView } from "@/views/CalendarView";
import { DashboardView } from "@/views/DashboardView";
import { SettingsView } from "@/views/SettingsView";
import { SubscriptionsView } from "@/views/SubscriptionsView";
import { UsageView } from "@/views/UsageView";

const ClockTickContext = createContext(0);

export function useClockTick(): number {
  return useContext(ClockTickContext);
}

export default function App() {
  const [tick, setTick] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onSubsUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [queryClient]);

  return (
    <ClockTickContext.Provider value={tick}>
      <HashRouter>
        <div className="flex h-full bg-[var(--bg)] text-zinc-100">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="min-h-0 flex-1 overflow-auto p-6">
              <Routes>
                <Route path="/" element={<DashboardView />} />
                <Route path="/subscriptions" element={<SubscriptionsView />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/usage" element={<UsageView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/widget" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <FooterBar />
          </div>
        </div>
      </HashRouter>
    </ClockTickContext.Provider>
  );
}
