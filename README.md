# SubPulse

Local-first Windows desktop app for subscription renewals and AI plan usage
limits. Inspired by SubList for the subscription side, and by Cursor/Claude
usage panels for the limit bars. No accounts, no telemetry, no cloud sync in v1.

Secrets live in Windows Credential Manager. App state lives in a local SQLite
database under the Tauri app data directory.

![screenshot placeholder]

## Commands

```bash
pnpm tauri dev    # run the app
pnpm check        # typecheck + vitest
pnpm tauri build  # NSIS installer
```

See `docs/plan.md` for the full implementation plan and `STATUS.md` for session hygiene.
