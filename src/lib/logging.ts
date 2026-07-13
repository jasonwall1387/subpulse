import {
  attachConsole,
  error as logError,
} from "@tauri-apps/plugin-log";

let started = false;

/** Forward webview errors into the Tauri log file (SubPulse.log). */
export async function setupLogging(): Promise<void> {
  if (started) return;
  started = true;

  try {
    await attachConsole();
  } catch (err) {
    // Use native console only - do not wrap console.error (Webview log target loops).
    console.error("attachConsole failed", err);
  }

  window.addEventListener("error", (event) => {
    const msg = event.error
      ? `${event.message}\n${String(event.error?.stack ?? event.error)}`
      : event.message;
    void logError(`[window.error] ${msg}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : String(reason);
    void logError(`[unhandledrejection] ${msg}`);
  });
}
