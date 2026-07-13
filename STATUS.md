# STATUS

Updated: 2026-07-13 (Phase 4 wrap-up gate)

## Done
- Phase 0-3 as before
- Phase 4 (4.1-4.4) + wrap-up transport/hardening:
  - `fe315ed` fix: claude oauth transport (unsafe-headers, empty Origin, live limits kinds)
  - `e1482a3` fix: single-flight refresh and replace-set usage buckets
  - `95834d0` fix: cursor nullish onDemand parse and human cookie errors
  - `e09fad6` docs: document unsafe-headers and live Claude/Cursor shapes
  - `…` fix: accept null scope on Claude limits entries (see tip)
  - Earlier: warm-up unminimize permission, connector framework, claude_local, cursor_cookie, hardening

## In progress
- (none)

## Blocked
- (none)

## Next
- Phase 5 (optional official-API connectors) only if Jason has the keys

## Phase 4 gate (2026-07-13 wrap-up re-run)

| Check | Result | Evidence |
|---|---|---|
| Claude buckets vs Claude Code `/usage` within 1 pt | PASS | Live `limits[]`: session=6, weekly_all=39, weekly_scoped/Fable=45; DB plan 1 `last_status=ok` keys `five_hour=6`, `seven_day=39`, `seven_day_fable=45` (stale manual/session/weekly_* rows removed by replace-set); `refreshPlan 1 ok` @ 22:00:27; tier `Max (20x)` |
| Cursor matches dashboard; cookie only in Credential Manager | PASS | `auth/me` 200 as <redacted>; usage-summary plan pool ~19% (`autoModelSelectedDisplayMessage` "You've used 18%…"); DB plan 2 `ok` `plan_pool` 19.4 used=20 limit=20 tier `Pro`; `cmdkey` target `p2_cookie.subpulse`; DB config scan cookie/JWT hits NONE |
| Auth + network fail soft | PASS | Prior 401/429/auth paths set badges; single-flight + write lock; no BEGIN/COMMIT on plugin-sql (documented) |
| Stale badge / sequential refresh / ≥10m clamp | PASS | Prior hardening + replace-set; `refreshAll` sequential logs; clamp tests |
| `pnpm check` | PASS | 8 files / 17 tests |
| Transport notes | PASS | `tauri-plugin-http` `unsafe-headers`; Claude `Origin: ""`; Cursor Cookie/Origin/Referer/Sec-* on wire; docs Task 4.2/4.3 + §16 updated |
