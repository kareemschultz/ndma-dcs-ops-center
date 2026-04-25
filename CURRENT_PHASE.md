# Current Phase

**Active phase:** 1 — People & Access Registry (UI portion)
**Status:** 🟡 Schema + API + migrations shipped to main; UI screens pending
**Last completed:** Phase 1 schema/router rebase (commit `c8fdd3e`, PR #18)
**Branch:** none active — pick a fresh branch off main for UI work
**Master plan reference:** §5.2 (3-layer hybrid sync model) + §13.1 (Phase 15 stretch — sync adapters NOT in scope here)

## What's now on main (Phase 0 + Phase 1 schema/API)

**Phase 0 (PR #16, commit `3916721`):**
- 8 migrations: 0008 (enum collapse), 0009 (drop callouts/attendance), 0010 (drop team_lead_id), 0011 (departments FK), 0012 (exam_schedule replace), 0013 (operational_overlays rename), 0014 (leave_policies extend), 0015 (calendar_events enum widen)
- Schema deletions: `callouts.ts`, `attendance-exceptions.ts`, `exam-dates.ts`
- Schema additions: `exam-schedule.ts`
- Router/route deletions: `callouts.ts`, `attendance-exceptions.ts`, `hr/callouts.tsx`, `hr/attendance.tsx`

**Phase 1 schema + API (PR #18, commit `c8fdd3e`):**
- 5 migrations: 0016 (extend staff_profiles), 0017 (platforms), 0018 (sync_adapters), 0019 (sync_adapter_runs), 0020 (service_access_registry)
- Schema additions: `platforms.ts`, `sync-adapters.ts`, `sync-adapter-runs.ts`, `service-access-registry.ts`
- `staff.ts` extended with 8 profile fields (cugPhoneNumber, cugSimNumber, mifiAssetTag, birthday, employmentStatus, hireDate, contractEndDate, currentAppointment)
- Router additions: `platforms.*`, `accessRegistry.*` (manual entry only — sync adapters are Phase 15 stretch)
- Sidebar: removed duplicate `/hr/ppe`, kept `/compliance/ppe`

## Phase 1 — what's still TBD (UI work)

Pick up on a new branch (e.g., `phase/1-ui` or just `phase/1-access-registry-ui`) and build:

1. **`/access/platforms` admin UI** — list view + create/edit dialog. Manages the 13-platform reference table. Admin-only.
2. **`/access/registry` matrix UI** — staff × platform grid showing privilege_level cells. Filter by platform/department. Inline edit.
3. **`/access/registry/$staffId` detail** — per-staff page listing all their platform accesses with edit form.
4. **Staff profile access integration** — add an "Access" tab on `/staff/$staffId` showing platforms + privilege_level (read-only).
5. **Staff directory phone number** — show `phoneNumber` column (Ataybia sticky-note feedback).
6. **RBAC matrix tests** — add rows for every new `platforms.*` + `accessRegistry.*` procedure in `packages/api/tests/rbac-matrix.test.ts` (CI gate).
7. **e2e smoke tests** — `/access/platforms` renders, `/access/registry` matrix loads, edit permission gated by role.

## Notes for Phase 1 UI agent

- Use existing patterns from `/staff` and `/hr/*` routes for the matrix view
- `accessRegistryRouter.listByStaff` and `.listByPlatform` are already wired
- `platformsRouter.list/create/update/disable` ready to use
- All `_source` fields default to `'manual'` (Phase 1 manual-only mode)
- Phase 15 stretch (§13.1) is the home for sync adapters — DO NOT build them in this phase

## After Phase 1 UI completes

User said work pauses after Phase 1 (see `docs/session-prompts/phase-1-kickoff.md` pause-point banner). Phases 2-15 resume in a future session.

## Notes for any agent picking up

- **Trust the SHA, not the prose** — see CLAUDE.md "Lessons learned"
- **Phase 0 + Phase 1 schema both shipped** — verified by `git log --oneline -5` showing `c8fdd3e` (Phase 1) → `047822a` (post-Phase-0 coord) → `3916721` (Phase 0 migrations) → `17b7922` (gate ceremony) → `be84973` (docs: §5.2 + §13)
