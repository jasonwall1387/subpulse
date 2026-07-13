# subpulse - AI usage + subscriptions desktop dashboard (personal)

Windows-first Tauri 2 app: SubList-style subscription/renewal tracking plus
Cursor/Claude-style AI plan usage bars. Local-first, no accounts, no telemetry.

## Stack
Tauri 2 + React 18 + TS strict + Vite | Tailwind v4 + shadcn/ui | SQLite
(tauri-plugin-sql) | TanStack Query + zod + date-fns | Rust: keyring only.

## Commands
- `pnpm tauri dev` - run app
- `pnpm check` - typecheck + vitest (must pass before every commit)
- `pnpm tauri build` - NSIS installer

## Hard rules
- Secrets ONLY in Windows Credential Manager via secret_* commands. Never in
  SQLite, git, logs, or connector_config.
- External JSON (HTTP, credential file) always through zod, tolerant of
  unknown fields.
- Unofficial connectors (claude_local, cursor_cookie) fail soft: stale badge,
  never block UI. Min poll 10 min.
- ~/.claude/.credentials.json is READ ONLY. Never write, never log its contents.
- Date math only in src/lib (date-fns). Money is integer cents, USD display.
- Docs style: no em dashes (use " - "), never the word "straightforward".

## Map
- Plan: docs/plan.md (source of truth for tasks/gates)
- Session status: STATUS.md (update at end of every phase)
