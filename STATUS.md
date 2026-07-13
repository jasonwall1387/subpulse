# STATUS

Updated: 2026-07-13 (Phase 6 gate)

## Done
- Phase 0-4 as before (connectors live)
- Phase 6 (6.1-6.2):
  - `37ede46` feat: windows installer (nsis)
  - `eedf9c3` chore: v1 polish pass
  - tag `v0.1.0`

## In progress
- (none)

## Blocked
- (none)

## Next
- Phase 5 (optional official-API connectors) only if Jason has the keys
- Push tag `v0.1.0` when ready

## Phase 6 gate (2026-07-13)

| Check | Result | Evidence |
|---|---|---|
| Icon + `pnpm tauri icon` | PASS | `assets/icon.png` 1024 violet rounded square + white pulse; `assets/icon.svg`; icons populated under `src-tauri/icons/` |
| NSIS `installMode: currentUser` | PASS | `tauri.conf.json` bundle targets `["nsis"]` + `windows.nsis.installMode=currentUser`; installer `src-tauri/target/release/bundle/nsis/SubPulse_0.1.0_x64-setup.exe` (7.8 MB) |
| Installed exe launches | PASS | Silent `/S` install -> `%LOCALAPPDATA%\SubPulse\subpulse.exe`; process Path matches |
| Tray works | PASS | App running from install path; no tray/permission errors in SubPulse.log on boot |
| Connectors fetch | PASS | After install boot: Claude `ok` (five_hour/seven_day/seven_day_fable), Cursor `ok` (plan_pool); `refreshPlan` 1/2 ok in log |
| Autostart survives kill (reboot-sim) | PASS | `HKCU\...\Run\com.jasonwall.subpulse` = installed exe; persists after `taskkill`; toggle off/on works; relaunch succeeds |
| Data persists | PASS | `%APPDATA%\com.jasonwall.subpulse\subpulse.db` kept across install/relaunch; 7 subscriptions + live buckets |
| Polish (empty states, toasts, About, shortcuts) | PASS | EmptyState CTAs; sonner; Settings About (version/data path/plan doc); Ctrl+N / Ctrl+, |
| `pnpm check` | PASS | 8 files / 17 tests |
| Tag | PASS | `v0.1.0` annotated on `eedf9c3` |
