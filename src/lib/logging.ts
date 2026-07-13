import {
  attachConsole,
  error as logError,
  warn as logWarn,
} from "@tauri-apps/plugin-log";

let started = false;

/** Forward webview errors into the Tauri log file (SubPulse.log). */
export async function setupLogging(): Promise<void> {
  if (started) return;
  started = true;

  try {
    await attachConsole();
  } catch (err) {
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

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    const msg = args
      .map((a) => {
        if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
    void logError(`[console.error] ${msg}`);
  };

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    const msg = args.map((a) => String(a)).join(" ");
    void logWarn(`[console.warn] ${msg}`);
  };
}
