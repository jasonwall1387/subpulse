# STATUS

Updated: 2026-07-13 (Phase 3 punch list)

## Done
- Phase 0-2 as before
- Phase 3 (3.1-3.4) + punch list fixes:
  - `27d1cef` fix: tray icon load and notify-before-tray boot
  - `6e1086a` fix: forward webview errors to SubPulse.log
  - `f7a9cc5` fix: widget 30s countdown ticker
  - `8069a57` fix: refetch queries on window focus
  - `8b4f7d1` fix: manual plan cards show bucket updated_at
  - `83a121e` fix: tray icon permission and log recursion

## In progress
- (none)

## Blocked
- (none)

## Next
- Phase 4 Task 4.1: Connector framework and scheduler

## Phase 3 gate re-run (2026-07-13 punch list)

| Check | Result | Evidence |
|---|---|---|
| Tray icon + menu | PASS (permission + no tray errors on boot) | Added `core:app:allow-default-window-icon`; fresh boot log has no `defaultWindowIcon` / `initTray` errors; `subpulse.exe` PID 4572 running |
| Notify loops independent of tray | PASS | Boot inserts `notified_renewals` before tray work; Toast Test t0 at `20:09:58` |
| Toast Test renewal toast | PASS | Cleared dedupe then restart: `('Toast Test', 9, '2026-07-13', 't0', '2026-07-13 20:09:58')` + SQL `INSERT OR IGNORE INTO notified_renewals` in tauri log |
| SubPulse.log receives webview errors | PASS | `%LOCALAPPDATA%\com.jasonwall.subpulse\logs\SubPulse.log` Length 12865 after boot; LogDir target `SubPulse`; attachConsole + window error listeners |
| Widget 30s ticker | PASS (code) | Shared `ClockTickProvider` wraps WidgetView; WidgetUsageList calls `useClockTick()` |
| Focus refetch | PASS (code) | `setupFocusRefetch` in App + WidgetView |
| Manual plan updated_at | PASS (code) | PlanCard uses newest bucket `updated_at` when `connector === "manual"` |
| `pnpm check` | PASS | `Test Files  5 passed (5)` / `Tests  11 passed (11)` |
