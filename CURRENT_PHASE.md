# Current Phase

**Active phase:** 0 — Stabilise & delete
**Status:** 🔵 In Progress (reconciliation complete; migrations not yet written)
**Branch:** `phase/0-stabilise`
**Agent:** Claude Code (opusplan)
**Model:** claude-opus-4-7 (1M context)
**Started:** 2026-04-23
**Last update:** 2026-04-23

## What's done this session

- ✅ §11.3 starting-work protocol executed (git fetch, branch from origin/main)
- ✅ Pre-flight check passed (master plan §2.5): source-of-truth/ unzipped to main repo root, 200 XLSX + 29 DOCX + 17 TXT verified readable
- ✅ `.gitignore` updated — added `source-of-truth/`, `/ndma-source-of-truth-*.zip`, `/category-zips/`, `/WorkUpdate_*.xlsx`, `/files.zip`, `/1.zip`
- ✅ All 5 open questions in `docs/plan-questions.md` resolved with Kareem
- ✅ Schema reconciliation audit complete — **correction: 9 real extra schemas (not 11 — `attendance-time.ts` and `policy.ts` were false positives)**
- ✅ Decisions documented in `docs/superpowers/plans/phase-0-stabilise.md`:
  - `exam-dates` → replace with `exam_schedule` (new migration 0012, copy + drop)
  - `operational-overlays` → rename to `routine_maintenance` (new migration 0013)
  - `certification-budgets` → keep as-is, defer integration to Phase 7
  - `company-forms` → keep as-is, align master plan text to match in follow-up
  - `leave-policies` → extend with `blocked_months` + `allow_rollover` (migration 0014)
  - `calendar-events` → extend enum with 9 new values (migration 0015)
  - `onboarding-tasks` → **DEFER** FK addition to Phase 7 (target table doesn't exist)
  - `staff-promotions`, `company-policies` → keep as-is
- ✅ `docs/superpowers/plans/temp-tracker.md` archived with SUPERSEDED banner
- ✅ `IMPLEMENTATION_PLAN.md` phase status updated (Phase 0 → 🔵 In Progress)
- ✅ `docs/plan-questions.md` updated with Kareem's answers for all 5 questions

## What's next (next session or same session continuation — Kareem to decide)

**Write 8 migrations** (0008-0015) per `phase-0-stabilise.md` §4. DO NOT start before Kareem approves this reconciliation commit.

Before writing migrations:
1. `bun install` (node_modules not present in worktree)
2. Resolve open risk: `callout_legacy` enum value — must be added to `tosd_records` type enum BEFORE migration 0009 runs. Decide: fold into migration 0008 or create 0008.5?
3. Pre-check: how many `leave_requests` rows reference Compassionate leave type? (blocks migration 0010 design)
4. Pre-check: any orphan `departments.parent_id` values? (blocks migration 0011)

## Handoff notes

**Architectural principle established this session (apply going forward):**
> Phase 0 only does self-contained structural work — new columns, new enum values, no new FKs to not-yet-existing tables. Extensions requiring cross-phase dependencies are deferred to the phase that creates the dependency.

**Master plan addenda pending** (list in `phase-0-stabilise.md` §6). These changes propagate back to `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` in a separate follow-up commit after Phase 0 merges.

**Open risks to surface at migration-writing time** (full list in `phase-0-stabilise.md` §8):
- `callout_legacy` enum dependency ordering
- Postgres enum one-way widening (migration 0015 DOWN is no-op)
- `operational_overlays` → `routine_maintenance` rename cascade (many files)
- Compassionate leave type rows — remap or preserve?
- pre-commit hook's `bat` dependency (per CLAUDE.md gotchas) — use `git commit -m` with repeated `-m` flags, not heredoc

**Next agent — resume migrations with:**
> Resuming Phase 0 migrations. Follow §11.3 starting-work protocol. Read `docs/superpowers/plans/phase-0-stabilise.md` §4 for the migration plan (0008-0015). Continue on branch `phase/0-stabilise`. Run `bun install` first. Resolve 4 pre-checks before writing any migration. Implement UP + DOWN for each, test on disposable local DB. After all 8 apply cleanly, push + typecheck + e2e + report for Kareem review before merge.
