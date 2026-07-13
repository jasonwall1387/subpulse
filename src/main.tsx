import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { error as logError } from "@tauri-apps/plugin-log";
import App from "./App";
import {
  applyWidgetVisibilityOnBoot,
  initTray,
  setupCloseToTray,
} from "./lib/tray";
import { startRenewalNotificationLoop } from "./lib/notify/renewals";
import { startUsageAlertListener } from "./lib/notify/usageAlerts";
import { setupLogging } from "./lib/logging";
import { startScheduler } from "./lib/connectors/scheduler";
import { getSetting } from "./lib/repo/settings";
import { WidgetView } from "./views/WidgetView";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const current = getCurrentWindow();
const isWidget = current.label === "widget";

async function bootMain(): Promise<void> {
  await setupLogging();
  // Notifications must not depend on tray succeeding.
  startRenewalNotificationLoop();
  startUsageAlertListener();
  startScheduler();

  await setupCloseToTray();
  try {
    await initTray();
  } catch (err) {
    console.error("initTray failed", err);
    void logError(`initTray failed: ${String(err)}`);
  }
  await applyWidgetVisibilityOnBoot();
  const startHidden = await getSetting<boolean>("start_hidden", false);
  if (startHidden) {
    await current.hide();
  }
}

async function bootWidget(): Promise<void> {
  await setupLogging();
}

if (isWidget) {
  void bootWidget();
} else {
  void bootMain();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isWidget ? <WidgetView /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
);
