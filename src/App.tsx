import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { FooterBar } from "@/components/shell/FooterBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { ClockTickProvider } from "@/lib/clock";
import { setupFocusRefetch } from "@/lib/focusRefetch";
import { onSubsUpdated, onUsageUpdated } from "@/lib/events";
import { CalendarView } from "@/views/CalendarView";
import { DashboardView } from "@/views/DashboardView";
import { SettingsView } from "@/views/SettingsView";
import { SubscriptionsView } from "@/views/SubscriptionsView";
import { UsageView } from "@/views/UsageView";

export { useClockTick } from "@/lib/clock";

export default function App() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return setupFocusRefetch(queryClient);
  }, [queryClient]);

  useEffect(() => {
    let unlistenSubs: (() => void) | undefined;
    let unlistenUsage: (() => void) | undefined;
    void onSubsUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    }).then((fn) => {
      unlistenSubs = fn;
    });
    void onUsageUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["usage-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["usage-buckets"] });
      void queryClient.invalidateQueries({ queryKey: ["usage-all-buckets"] });
    }).then((fn) => {
      unlistenUsage = fn;
    });
    return () => {
      unlistenSubs?.();
      unlistenUsage?.();
    };
  }, [queryClient]);

  return (
    <ClockTickProvider>
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
    </ClockTickProvider>
  );
}
