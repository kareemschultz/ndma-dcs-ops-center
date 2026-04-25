# Current Phase

**Active phase:** none
**Status:** ⏳ Awaiting Phase 1 final review + merge
**Last completed:** Phase 0 — Stabilise & delete (gate commit `3916721`, 2026-04-25 — see AGENT_LOG for course-correction history)
**Next:** Phase 1 — People & Access Registry (PR #15 open, needs rebase onto current main)

## Phase 0 — what's actually on main now

8 migrations shipped via PR #16:
- `0008_enum_fix` — collapse `appraisalStatusEnum` to 7 lowercase values
- `0009_drop_callouts_attendance` — drop legacy tables + 4 enums
- `0010_staff_cleanup` — drop `staff_profiles.team_lead_id`
- `0011_departments_fk` — add `departments.parent_id` FK
- `0012_exam_schedule` — replace `exam_dates` with richer `exam_schedule`
- `0013_routine_maintenance_rename` — rename `operational_overlays_*` → `routine_maintenance_*`
- `0014_leave_policies_extend` — `blocked_months` + `allow_rollover`
- `0015_calendar_event_type_widen` — enum 3→12 values

Plus: schema cleanup (`callouts.ts`, `attendance-exceptions.ts`, `exam-dates.ts` deleted; `exam-schedule.ts` added), router/route cleanup, `appraisals.ts` `normalizeKey` helper removed, `.env.example` added, e2e auth credential fix.

## Phase 1 next steps

**PR #15 (`phase/1-access-registry`) is open** with migrations 0016-0020 + access-registry schema + routers.

**Before merging Phase 1:**
1. Rebase `phase/1-access-registry` onto current main (it was branched from a main missing 0008-0015 — needs to be re-tested against the current schema state)
2. Re-run CI on the rebased branch (current PR #15 CI passed against an outdated base)
3. Verify e2e passes against staging DB with all migrations 0008-0020 applied
4. Build `/access/platforms` and `/access/registry` UI screens (Phase 1 PR is partial — schema + routers shipped, UI deferred per "wip handoff" commit)

**Notes for Phase 1 final session:**
- Use `db:migrate` (not `db:push`) for any staging/prod DB operations
- The 3-layer model is authoritative — `platforms` + `sync_adapters` (empty) + `service_access_registry` + `sync_adapter_runs` (empty). See master plan §5.2.
- All `_source` fields default to `'manual'` in Phase 1 — sync adapter implementations are Phase 15 stretch (§13.1)
- RBAC matrix needs new rows for every `platforms.*` and `accessRegistry.*` procedure (CI gate)

## Notes for any agent picking up

- **Phase 0 was course-corrected on 2026-04-25** — see AGENT_LOG for the detailed history. The TL;DR: the migrations existed on a branch but never made it to main; an audit caught the discrepancy and a clean cherry-pick → PR #16 → squash merge fixed it.
- **Trust the AGENT_LOG more than the CHANGELOG** — the CHANGELOG can lag (or, in this case, run ahead) of what's actually on main. Always check the SHA in IMPLEMENTATION_PLAN.md.
- **Stale Codex branches still exist on origin** — `codex/phase1-foundation`, `codex/phase2-appraisals`, `codex/phase3-operational-hr`, `codex/phase4-shift-scheduling`, `codex/phase5-leave-policy`. These are pre-2026-04-23-planning work and were superseded by the master plan. PRs #9 and #10 closed; branches retained for reference only — DO NOT cherry-pick from them blindly. Their phase numbering does not match the new master plan's phase numbering.
