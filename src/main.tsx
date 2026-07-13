import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { initTray, setupCloseToTray } from "./lib/tray";
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
  await setupCloseToTray();
  await initTray();
}

if (!isWidget) {
  void bootMain();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isWidget ? <WidgetView /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
);
