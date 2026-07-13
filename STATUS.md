# STATUS

Updated: 2026-07-13 (Phase 4 gate)

## Done
- Phase 0-3 as before (including Phase 3 punch list)
- Warm-up: `acf2a92` fix: restore main window on second instance
- Phase 4 (4.1-4.4):
  - `a957f30` feat: connector framework and scheduler (tdd)
  - `aa17663` feat: claude local connector (zero-setup)
  - `417fd3e` feat: cursor cookie connector
  - `cae33cb` chore: connector hardening pass

## In progress
- (none)

## Blocked
- Claude live `/usage` matching Claude Code panel: local OAuth token returns HTTP 401 until Claude Code refreshes credentials
- Cursor live usage-summary: needs one-time WorkosCursorSessionToken paste in Settings > Connections (keyring only)

## Next
- Phase 5 (optional official-API connectors) only if Jason has the keys
- After Claude Code login refresh + Cursor cookie paste: re-check Phase 4 live gate rows

## Phase 4 gate (2026-07-13)

| Check | Result | Evidence |
|---|---|---|
| Claude buckets vs Claude Code `/usage` | PARTIAL (connector + TDD green; live HTTP 401) | Parser fixtures in `src/__tests__/claudeParse.test.ts`; live probe `GET api.anthropic.com/api/oauth/usage` with plan headers → 401; plan `id=1` connector=`claude_local`, `last_status=auth` after fail-soft |
| Cursor after cookie paste; cookie only in Credential Manager | PARTIAL (code + leak-free) | `cursor_cookie` registered; DB `connector_config` has no JWT/`%3A%3A`/`eyJ` hits (`cookie/jwt hits in DB: NONE`); secrets via `secret_*` keyring only; live fetch pending cookie paste |
| Auth + network fail soft | PASS | Scheduler: `ConnectorError('auth')` → `last_status=auth` + `authStopped` (no poll); other errors → `error` + failure count for backoff; subscriptions have zero connector imports; DB fixtures `Claude=auth`, `Cursor=error` with `limit_buckets` still present for plan 1 |
| Stale badge (2x interval) | PASS | Forced `last_fetch_at` ~1h old @ 15m interval → `stale? True` (`age_ms ~3600340`); PlanCard/ConnectorSettings badge logic |
| Sequential `refreshAll` + ≥10m clamp | PASS | Logs `refreshAll sequential start/done` with ISO timestamps; `clampPlanRefreshMinutes` + UI `min={10}`; vitest clamp + `nextDelayMs(5,…)` → 10m |
| `pnpm check` | PASS | `Test Files 8 passed` / `Tests 15 passed` |
