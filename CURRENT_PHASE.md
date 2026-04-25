# Current Phase

**Active phase:** 1 — People & Access Registry (polish portion)
**Status:** 🟡 Core shipped (schema + API + migrations + UI); polish items pending
**Last completed:** Phase 1 UI (commit `fea4835`, PR #20)
**Branch:** none active — pick a fresh branch off main for polish work
**Master plan reference:** §5.2 (3-layer hybrid sync model) + §13.1 (Phase 15 stretch — sync adapters NOT in scope here)

## What's now on main (Phase 0 + Phase 1)

**Phase 0 (PR #16, commit `3916721`):**
- 8 migrations 0008-0015 (enum collapse, drop callouts/attendance, drop team_lead_id, departments FK, exam_schedule replace, operational_overlays rename, leave_policies extend, calendar_events enum widen)
- Schema files updated to match — callouts/attendance-exceptions/exam-dates removed; exam-schedule added
- Router + routes for callouts/attendance-exceptions removed

**Phase 1 schema + API (PR #18, commit `c8fdd3e`):**
- 5 migrations 0016-0020 (extend staff_profiles, platforms, sync_adapters, sync_adapter_runs, service_access_registry)
- Schemas: platforms, sync-adapters, sync-adapter-runs, service-access-registry; staff extended with 8 profile fields
- Routers: platforms.* + accessRegistry.*

**Phase 1 UI (PR #20, commit `fea4835`):**
- `/access/platforms` admin CRUD page
- `/access/registry` staff × platform matrix view
- `/hr/ppe` → `/compliance/ppe` redirect
- Sidebar entries for both new pages

## Phase 1 polish — what's still TBD

Pick up on a new branch (e.g., `phase/1-polish`) and add:

1. **`/access/registry/$staffId` per-staff detail page** — list all access records for one staff member with inline edit form per record
2. **Staff profile Access tab** — add a new tab on `/staff/$staffId` showing platforms + privilege_level (read-only, viewable by self + leads + HR)
3. **Inline edit on `/access/registry` matrix** — currently view-only; should support changing privilege_level + groups in-place
4. **RBAC matrix test rows** — `platforms.*` (5 procedures) + `accessRegistry.*` (5 procedures) per master plan §10.6 — file is `packages/api/tests/rbac-matrix.test.ts`
5. **e2e Playwright smokes** — `/access/platforms` create/edit/disable flow, `/access/registry` matrix + search, `/hr/ppe` redirect

## Notes for Phase 1 polish agent

- Use existing patterns from `/staff/$staffId` for the detail page tab integration
- All `_source` fields default to `'manual'` (Phase 1 manual-only mode)
- Phase 15 stretch (§13.1) is the home for sync adapters — DO NOT build them in this phase
- CLAUDE.md gotchas to watch: no `Button asChild`, `Select onValueChange` returns `string | null`

## After Phase 1 polish completes

Per `docs/session-prompts/phase-1-kickoff.md` pause-point banner, work pauses. Phases 2-15 resume in a future session/sprint.

## Notes for any agent picking up

- **Trust the SHA, not the prose** — see CLAUDE.md "Lessons learned"
- Latest 5 commits on main: `fea4835` (Phase 1 UI), `b6b7d54` (post-Phase-1 coord), `c8fdd3e` (Phase 1 schema), `047822a` (post-Phase-0 coord), `3916721` (Phase 0 migrations)
