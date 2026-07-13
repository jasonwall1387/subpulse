# STATUS

Updated: 2026-07-13 (Phase 3)

## Done
- Phase 0: scaffold, toolchain, plugins/keyring, hygiene
- Phase 1: subscriptions core, shell, CRUD, dashboard, calendar, seed
- Phase 2: usage schema, resets/normalize (TDD), usage view, dashboard tiles
- Task 3.1: Tray + close-to-tray (`feat: tray with close-to-tray`)
- Task 3.2: Always-on-top widget window (`feat: always-on-top widget window`)
- Task 3.3: Autostart + start hidden (`feat: autostart and start hidden`)
- Task 3.4: Renewal + usage notifications (`feat: renewal and usage notifications`)

## In progress
- (none - Phase 3 complete at gate)

## Blocked
- (none)

## Next
- Phase 4 Task 4.1: Connector framework and scheduler

## Phase 3 gate (2026-07-13)

| Check | Result | Evidence |
|---|---|---|
| App lives in tray; widget config present; process runs | PASS (code + runtime process); interactive close/drag PARTIAL | `subpulse.exe` PID 34340 running after `pnpm tauri dev`; `tauri.conf.json` widget `alwaysOnTop`/`skipTaskbar`/`visible:false`; tray `onCloseRequested` + `preventDefault` + `hide` in `src/lib/tray.ts` |
| Renewal T-3/T-1/T-0 + usage alert dedupe | PASS (schema + SQL dedupe); OS toast PARTIAL | `notified_renewals` schema in live DB; double `INSERT OR IGNORE` kept count=1; usage `alerted_for_reset` column present (bucket id 1 at 85%); toasts need Windows notification permission in-app |
| Autostart registry on/off | PASS | `HKCU\...\Run` name `SubPulse`: set then removed; OFF shows property does not exist |
| `pnpm check` | PASS | `Test Files  5 passed (5)` / `Tests  11 passed (11)` |
| STATUS.md | PASS | this file |

Commits: `9eba6da` … `4605fd1`
