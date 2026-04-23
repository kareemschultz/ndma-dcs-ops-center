# Agent Log — NDMA DCS Ops Center

> **Append-only.** Most recent entries at the top. Every phase session must add an entry.
>
> **Rules:**
> - Do NOT delete prior entries — this is shared memory across sessions and agents
> - One entry per phase session (start, WIP, complete, or blocked)
> - Include: agent name, model, dates, branch, commit SHA, what shipped, tests, deferred items, blockers, file changes, next-phase handoff notes
> - Follow the template at the bottom of this file

---

## Phase 0 — Reconciliation decisions + migration plan — 🔵 In Progress [WIP]

- **Agent:** Claude Code (opusplan)
- **Model:** claude-opus-4-7 (1M context)
- **Date:** 2026-04-23
- **Branch:** `phase/0-stabilise` (from origin/main @ 93ac57f)
- **Gate commit:** (this commit — reconciliation only, migrations not yet written)
- **Baseline commit:** 93ac57f (plan: approved master remediation plan + agent coordination layer)

### What shipped this session

- **Pre-flight (master plan §2.5):** ✅ source-of-truth/ unzipped from `ndma-source-of-truth-full.zip` (229MB) to main repo root. Verified 200 XLSX + 29 DOCX + 17 TXT. `.gitignore` updated to exclude source archive + zips + category-zips + WorkUpdate.
- **5 open questions resolved** (see `docs/plan-questions.md` for decisions):
  - Q1 temp-tracker → archive with SUPERSEDED banner
  - Q2 appraisal signatures → per-cycle toggle
  - Q3 biometric sync → manual entry only
  - Q4 schema reconciliation → walk-through (done this session)
  - Q5 Slack/WhatsApp webhook → deferred to Phase 15 stretch
- **Schema reconciliation audit complete** — 9 real extras (not 11; `attendance-time.ts` and `policy.ts` were false positives)
- **Kareem-approved decisions** per schema (see `docs/superpowers/plans/phase-0-stabilise.md` §2):
  - Replace: `exam-dates` → `exam_schedule` (migration 0012)
  - Rename: `operational-overlays` → `routine_maintenance` (migration 0013)
  - Keep as-is: `certification-budgets`, `company-forms`, `staff-promotions`, `company-policies`
  - Extend (self-contained): `leave-policies` (migration 0014), `calendar-events` enum (migration 0015)
  - Defer to Phase 7: `onboarding-tasks` FK addition (target table doesn't exist yet)
- **Archived:** `docs/superpowers/plans/temp-tracker.md` → `_archive/` with SUPERSEDED banner
- **Phase 0 detailed plan:** `docs/superpowers/plans/phase-0-stabilise.md` (9 sections: pre-flight result, reconciliation decisions, open question answers, migration plan 0008-0015 with UP/DOWN, phase deferrals, master plan addenda, acceptance criteria, risks, next-session handoff)
- **Coordination files updated:**
  - `IMPLEMENTATION_PLAN.md` phase status table: Phase 0 → 🔵 In Progress
  - `CURRENT_PHASE.md` claimed for Phase 0
  - `docs/plan-questions.md` all 5 questions marked [ANSWERED] with decision text

### Architectural principle established (applies going forward)

> **Phase scope principle:** Phase 0 only does self-contained structural work (new columns, new enum values, no new FKs to not-yet-existing tables). Extensions requiring cross-phase dependencies are deferred to the phase that creates the dependency. Document the decision now, do the work then.

Also: channel-adapter pattern for notifications (Phase 10 AC), master plan section rename for `operational_overlays` → `routine_maintenance` (follow-up addenda commit).

### Deferred to later phases

- `certification-budgets` integration with `trainingEvents` → Phase 7
- `onboarding-tasks.template_id` FK → Phase 7
- `exam_schedule.certification_id` + `voucher_id` FK constraints → Phase 7
- Slack/WhatsApp/SMS webhook adapters → Phase 15 stretch
- `company-forms` master plan text alignment → follow-up addenda commit

### Blockers / risks identified (for next session)

- `callout_legacy` enum value must be added to `tosd_records` type enum BEFORE migration 0009 runs
- Postgres enum one-way widening (migration 0015 DOWN is no-op)
- `operational_overlays` → `routine_maintenance` rename cascade (grep all code references before writing migration 0013)
- Compassionate leave type rows: remap to 'emergency'/'special' or preserve?
- `departments.parent_id` orphan values must be NULLed before FK constraint applies
- `node_modules` not installed in worktree — next session runs `bun install` first

### Files changed (this commit)

- `docs/superpowers/plans/phase-0-stabilise.md` (new — 9 sections, full migration plan)
- `docs/superpowers/plans/_archive/temp-tracker.md` (renamed + SUPERSEDED banner)
- `IMPLEMENTATION_PLAN.md` (phase status table: Phase 0 row updated)
- `CURRENT_PHASE.md` (claimed for Phase 0)
- `AGENT_LOG.md` (this entry appended)
- `docs/plan-questions.md` (5 questions marked [ANSWERED])
- `.gitignore` (source-of-truth + zips excluded)

### Next-phase handoff (to whoever writes the migrations)

- **Branch:** continue on `phase/0-stabilise` (do NOT merge to main yet — migrations still needed)
- **Starting prompt:** see `CURRENT_PHASE.md` handoff section
- **Pre-migration pre-checks** (4 items in `phase-0-stabilise.md` §8 risks table) must resolve before any migration SQL
- **After all 8 migrations pass locally:** push, typecheck, e2e, **stop and surface to Kareem for review before merge to main**

### Tests

- ❌ typecheck — deferred; node_modules not installed
- ❌ e2e — deferred; needs install + dev server
- N/A RBAC matrix — no router changes this session

---

## Planning session — Master plan approved — 🟢 Done

- **Agents:**
  - Claude Code (opusplan) — wrote plan, explored codebase, drafted master plan
  - Claude web (opus-4.7) — audit passes, review checkpoints, coordination-layer design
- **Model:** claude-opus-4-7 (1M context) for planning; claude-opus-4-7 for web audit
- **Date:** 2026-04-23
- **Branch:** `planning/2026-04-23-master`
- **Gate commit:** (this commit)
- **Baseline:** main @ fc04a0a (feat: expand NDMA portal workflows and navigation)

### What shipped

- **Master plan:** `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` (11 sections, ~1400 lines)
  - Executive summary + 15-phase timeline
  - Source-of-truth confirmation (200 XLSX + 29 DOCX + 17 TXT)
  - Full defect register with file:line references
  - Data model changes per-entity at column level (40+ entities)
  - Feature specs §6.1-§6.6 expanded with UI details
  - CSV import template summary (32 templates)
  - Phase plan with acceptance criteria per phase
  - 35-step seed plan with natural keys + parser notes + CI gate
  - Risk register (12 risks with owners + triggers)
  - Multi-agent coordination protocol pointer
- **Agent coordination files:**
  - `IMPLEMENTATION_PLAN.md` — NEW navigational version replacing OLD 508-line task list
  - `CURRENT_PHASE.md` — initial state "none active"
  - `AGENT_LOG.md` — this file
- **Open questions:** `docs/plan-questions.md` seeded with 5 questions from §9 of planning handoff
- **CLAUDE.md + AGENTS.md:** pointer banner added to top of both
- **Superseded plans:** 3 plans moved to `docs/superpowers/plans/_archive/` with SUPERSEDED banners:
  - `2026-04-12-phase3-operations-intelligence.md`
  - `2026-04-12-rota-system.md`
  - `2026-04-21-master-implementation-directive.md`

### Review checkpoints captured in master plan §10 + invariants

1. Phase 0 is hard baseline — must merge to main before Phase 1
2. Seed uses upsert-by-natural-key with 15-entity key table — no raw INSERT
3. Appraisal parser reads raw X-position (B-F), not openpyxl formula result
4. EoM formulas as service-layer calculator + 19-month validation gate (19/19 required)
5. Leave rules = warnings-with-HR-override + audit log, not hard blocks
6. RBAC matrix = blocking CI gate on every PR, not Phase 15 sweep
7. Phase 0 migration split into 4 files (0008-0011) each independently revertable
8. `seed-historical.ts --dry-run` mandatory before staging
9. Seed observability: stdout JSONL + `docs/seed-report.md` + `docs/seed-report.json` (machine-readable CI gates)
10. Phase 3 scheduling cutover: metric-gated (7 consecutive days zero 5xx + zero open regressions)

### Decisions

- `IMPLEMENTATION_PLAN.md` is REPLACED in this commit (not deferred to Phase 13 delete). The NEW version is navigational; the OLD 508-line task list is overwritten.
- `temp-tracker.md` — decision deferred to `docs/plan-questions.md` question #1 (Kareem must resolve before Phase 1 starts)
- Schema reconciliation (11 extra schemas in worktree not in handoff §6) — moved from "audit during execution" to Phase 0 acceptance criterion

### Deferred

- Full CSV import template column details (30+ templates) — summary in master plan §7; detailed per-template specs will be expanded in Phase 12 checklist
- Phase 5-15 file-by-file change list — will be expanded in each phase's checklist `docs/superpowers/plans/phase-{N}-*.md`

### Files changed

- `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` (new)
- `IMPLEMENTATION_PLAN.md` (replaced — 508 lines → ~120 lines navigational)
- `CURRENT_PHASE.md` (new)
- `AGENT_LOG.md` (new — this file)
- `docs/plan-questions.md` (new)
- `CLAUDE.md` (pointer banner added to top)
- `AGENTS.md` (pointer banner added to top)
- `docs/superpowers/plans/_archive/2026-04-12-phase3-operations-intelligence.md` (moved + banner)
- `docs/superpowers/plans/_archive/2026-04-12-rota-system.md` (moved + banner)
- `docs/superpowers/plans/_archive/2026-04-21-master-implementation-directive.md` (moved + banner)

### Next-phase handoff

- **Phase 0 branches from:** this planning-commit's squash-merge to main
- **Phase 0 agent must first:**
  1. Unzip `ndma-source-of-truth-full.zip` to `source-of-truth/` at repo root (if not already)
  2. Run pre-flight check (master plan §2.5)
  3. Review `docs/plan-questions.md` — answer questions #1 and #4 BEFORE starting Phase 0 schema reconciliation
  4. Create `docs/superpowers/plans/phase-0-stabilise.md` with full checklist from master plan §8
- **Blocker risk:** pre-flight may fail if source-of-truth/ not unzipped. Kareem must confirm archive location.

---

## Template — copy this block when appending a new entry

```markdown
## Phase N — Phase title — 🟢 Done  (or 🔵 In Progress / 🟠 Blocked / 🔴 Reverted)

- **Agent:** Claude Code  (or Codex / human name)
- **Model:** claude-opus-4-7 (opusplan)  (or equivalent)
- **Date:** YYYY-MM-DD [→ YYYY-MM-DD if multi-day]
- **Branch:** `phase/N-slug` [→ merged to main if complete]
- **Gate commit:** abc1234
- **Baseline commit (previous phase):** def5678

### What shipped

- (bullet list of concrete changes)

### Tests

- ✅ typecheck
- ✅ e2e (X new, Y updated)
- ✅ RBAC matrix (+Z rows for newRouter.*)
- ✅ (Phase-specific gate: e.g. 19/19 EoM match)

### Deferred

- (items intentionally punted + which phase picks them up)

### Blockers hit + resolved

- (brief note on each)

### Files changed

- X files, +A / −B
- (list of significant new/deleted files)

### Next-phase handoff

- Phase N+1 branches from {gate commit SHA}
- (any carry-over context the next agent needs)
```
