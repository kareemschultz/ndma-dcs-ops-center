# Phase 0 Migrations — Session Prompt

> Paste the content below into a **fresh** Claude Code session. Do NOT reuse the planning / reconciliation session — context budget matters for this session.
>
> **Before pasting:**
> 1. Ensure `docs/phase-1-scope-refinement` is merged to `main` so the fresh session starts from an up-to-date base
> 2. Run the 3 prod pre-check queries against staging/prod DB and paste results into the prompt where marked `[PASTE ... HERE]`. If VPN unavailable, leave as `UNAVAILABLE` — the prompt has a fallback path
> 3. Open a fresh Claude Code session (not a resumed one)

---

```
Phase 0 migration implementation — execution session.

Goal: write + verify + push migrations 0008-0015 on phase/0-stabilise branch.
NO merging to main in this session. Report back at the end for gate ceremony approval.

═══════════════════════════════════════════════════════════════════════
§11.3 STARTING-WORK PROTOCOL
═══════════════════════════════════════════════════════════════════════

Run these in order. STOP if any fail.

  git fetch origin
  git status                          # must be clean
  git checkout phase/0-stabilise
  git pull origin phase/0-stabilise
  git log -1 --oneline                # must show 10220f4 or later
  cat CURRENT_PHASE.md                # must show Phase 0 reconciliation done
  bun install                         # must complete clean
  bun run check-types                 # baseline must pass

If any step fails, STOP and report. Do not "fix" and proceed.

═══════════════════════════════════════════════════════════════════════
MANDATORY PRE-READS (read in full, do not skim)
═══════════════════════════════════════════════════════════════════════

1. IMPLEMENTATION_PLAN.md                                    (10 hard invariants)
2. CURRENT_PHASE.md                                          (prior session handoff)
3. AGENT_LOG.md — most recent 3 entries                      (context)
4. docs/superpowers/plans/phase-0-stabilise.md               (AUTHORITATIVE for this session)
5. docs/superpowers/plans/2026-04-23-master-remediation-plan.md §10  (9 review checkpoints — invariants)

After reading, confirm in your response:
- Phase 0 status per IMPLEMENTATION_PLAN.md
- The 8 migrations you're about to write, by number + one-line description
- Any discrepancy between phase-0-stabilise.md and the master plan §10 invariants

═══════════════════════════════════════════════════════════════════════
PROD PRE-CHECK RESULTS (filled by Kareem)
═══════════════════════════════════════════════════════════════════════

-- Query 1: Compassionate leave requests
SELECT COUNT(*) FROM leave_requests lr
  JOIN leave_types lt ON lr.leave_type_id = lt.id
  WHERE lt.code ILIKE 'compassionate%' OR lt.name ILIKE '%compassionate%';
RESULT: [PASTE COUNT HERE — if unavailable, write "UNAVAILABLE — no prod access"]

-- Query 2: Orphaned department parent_id values
SELECT id, name, parent_id FROM departments
  WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM departments);
RESULT: [PASTE ROW COUNT + ROW DATA HERE — if unavailable, write "UNAVAILABLE"]

-- Query 3: Live callouts rows (this is the incident-response callouts table,
-- NOT the XLSX 2023-Callout sheet — see phase-0-stabilise.md §8.5)
SELECT COUNT(*), MAX(created_at) FROM callouts;
RESULT: [PASTE COUNT + MAX TIMESTAMP HERE — if unavailable, write "UNAVAILABLE"]

IF ANY RESULT = "UNAVAILABLE":
  Run the query against local dev DB instead (will return 0 since DB is empty
  from prior session). Proceed assuming 0 rows — migrations will work for that
  case. Flag to Kareem that prod verification is still required before staging
  apply, and make this a blocking item in the final report.

═══════════════════════════════════════════════════════════════════════
MIGRATION SEQUENCE (from phase-0-stabilise.md §4)
═══════════════════════════════════════════════════════════════════════

Write in this exact order:
  0008 — collapse appraisalStatusEnum to lowercase
  0009 — drop callouts + attendance_exceptions + 4 related enums
         (includes JSONL export if callouts row count > 0)
  0010 — staff cleanup (drop team_lead_id) + Compassionate leave remap
  0011 — departments.parent_id FK (null orphans first if any)
  0012 — exam_schedule replaces exam_dates (copy data, drop old)
  0013 — operational_overlays rename to routine_maintenance
  0014 — leave_policies extend (blocked_months, allow_rollover)
  0015 — calendar_events enum widen

Do NOT change the order. Do NOT combine migrations. Each gets its own file
+ its own commit.

═══════════════════════════════════════════════════════════════════════
HARD RULES — VIOLATING ANY OF THESE IS A SEVERE FAILURE
═══════════════════════════════════════════════════════════════════════

RULE 1 — ONE MIGRATION = ONE COMMIT
  Commit format: `phase(0): migration NNNN — {brief description}`
  Example: `phase(0): migration 0008 — collapse appraisalStatusEnum to lowercase`
  NO squashing. NO combining. NO "while I'm in there" edits.
  Push after each commit so progress survives context loss.

RULE 2 — EVERY MIGRATION HAS WORKING UP AND DOWN
  UP applies cleanly against a DB with all prior migrations applied.
  DOWN rolls UP back to the pre-UP state.
  If DOWN has irreducible data fidelity loss (enum widening → narrowing,
  type collapse), write DOWN to restore SHAPE and document the data loss
  in migration comments. NEVER skip DOWN. NEVER write `-- irreversible`
  as the entire DOWN body.

RULE 3 — VERIFY EACH MIGRATION LOCALLY BEFORE COMMITTING
  Required cycle per migration:
    a. Fresh disposable local DB (drop + recreate or docker restart)
    b. Apply all prior migrations in order
    c. Apply new migration UP — verify schema + data state
    d. Apply new migration DOWN — verify rollback matches pre-UP state
    e. Apply UP again — must succeed (idempotent path)
  Only after all 5 steps pass: commit.

RULE 4 — UPSERT-BY-NATURAL-KEY FOR DATA MIGRATIONS
  (Master plan §10.2, non-negotiable)
  If a migration inserts or updates data (0009 JSONL export row iteration,
  0010 Compassionate remap, 0011 orphan nulling, 0012 exam_dates copy),
  use ON CONFLICT DO UPDATE with explicit natural keys.
  Raw INSERT outside bootstrap = SEVERE VIOLATION. Stop and ask if unsure.

RULE 5 — AUDIT LOG FOR DATA MUTATIONS
  Migration 0010 Compassionate remap: EVERY remapped leave_request gets
  an audit_logs entry:
    action='leave.type_migration'
    beforeValue={type:'compassionate', original_type_id:<id>}
    afterValue={type:'special_leave', new_type_id:<id>,
                reason:'Compassionate type deprecated 2026-04-23 per master plan §10.5'}
    actorStaffId=NULL (system migration)
    correlationId=<migration_run_uuid>  -- same UUID for all entries in this run

  Migration 0011 orphan nulling: EVERY nulled parent_id gets:
    action='department.parent_orphan_nulled'
    beforeValue={parent_id:<old_orphan_value>}
    afterValue={parent_id:null, reason:'Phase 0 FK integrity fix'}
    actorStaffId=NULL
    correlationId=<migration_run_uuid>

  Migration 0009 callouts drop: the JSONL export IS the audit (no per-row
  audit_logs entry since table is being dropped).

RULE 6 — JSONL EXPORT FOR CALLOUTS (only if row count > 0)
  Destination: source-of-truth/_archived-post-seed/callouts-final-export-YYYYMMDD.jsonl
  (NOT docs/. Use today's date: YYYYMMDD format.)
  Format: one JSON line per row, include all columns + LEFT JOIN incidents
  to pull incident_title and incident_status for traceability.

  BEFORE committing migration 0009:
    - Show me first 3 lines of the JSONL + total line count
    - I will review for sensitive content and approve or request redaction
    - DO NOT commit 0009 until I approve the JSONL content

  The JSONL file is committed as part of migration 0009's commit, not
  separately.

RULE 7 — PAUSE POINTS (stop and ask before proceeding)
  - Migration 0009: after JSONL generated, before commit (per RULE 6)
  - Migration 0010: if Compassionate row count > 10, show me the rows
    before writing the remap. I may want per-row remap decisions.
  - Migration 0011: if departments orphans > 5, show me the rows.
    Might indicate upstream data issue that needs understanding before nulling.
  - Migration 0012: show me exam_dates row count + sample rows before
    writing the copy logic. The 3→7 column mapping needs verification.
  - After all 8 migrations committed + pushed: STOP. Report back.
    Do NOT run staging apply or attempt merge.

RULE 8 — IF CONTEXT GETS TIGHT
  Never partial-commit a migration.
  If tight, commit the last fully-verified migration, update
  CURRENT_PHASE.md with which migrations landed + which are pending,
  append WIP entry to AGENT_LOG.md per §11.4, push, and stop.
  Next session resumes from the next unwritten migration.

RULE 9 — NO SCOPE CREEP
  Do NOT:
  - Touch access-registry schemas (Phase 1 scope — even though they're in §5.2 now)
  - Modify any router files unless directly required by a Phase 0 migration
    (dropping callouts.ts router IS required by 0009; extending other routers is NOT)
  - Add "helpful" new features, fields, or tests beyond migration acceptance tests
  - Fix unrelated typos, style issues, or refactors you notice along the way
  - Update master plan text (that's a separate Phase 0.5 commit Kareem handles)

RULE 10 — RBAC MATRIX
  Phase 0 migrations should not add any router procedures.
  If you find yourself touching a router file for anything other than
  deletion (callouts, attendance-exceptions), STOP — it's out of scope.
  If the deletion removes procedures that had RBAC matrix rows, remove
  those rows in the same commit.

═══════════════════════════════════════════════════════════════════════
PER-MIGRATION ACCEPTANCE TESTS
═══════════════════════════════════════════════════════════════════════

Write test(s) for each migration in packages/db/tests/migrations/NNNN.test.ts
(or follow the existing test path convention in the repo — check
packages/db/tests/ first).

Acceptance test template per migration:
  - describe('migration NNNN — {description}')
    - test('UP applies cleanly from baseline')
    - test('expected rows/columns exist after UP')
    - test('DOWN rolls back to pre-UP state')
    - test('UP is idempotent (second apply does not fail)')
    - test('data-specific assertion per migration')
      - 0008: old enum values remapped correctly, no data loss
      - 0009: callouts + attendance_exceptions tables gone, JSONL exists if rows existed
      - 0010: all Compassionate leave_requests now special_leave with audit_logs entries
      - 0011: all parent_id values reference existing departments OR are null
      - 0012: exam_schedule row count == pre-migration exam_dates row count
      - 0013: routine_maintenance table exists, operational_overlays doesn't,
              all referencing code points to new name
      - 0014: leave_policies has blocked_months + allow_rollover columns
      - 0015: calendar_events enum has all 10 values from master plan §5.12

These tests run in CI on every push. If any test fails, the commit has a
bug — fix the migration, re-verify locally, force-push (fine on feature
branch), re-run tests.

═══════════════════════════════════════════════════════════════════════
FINAL SESSION OUTPUT (do this at the end, not during)
═══════════════════════════════════════════════════════════════════════

After all 8 migrations committed + pushed, run:
  bun run check-types                                   — must be green
  cd apps/web && bun run test:e2e                       — must be green
  bun run test --filter=@ndma/db                        — must be green
                                                          (or repo-equivalent db test command)

Then report back with:

1. List of 8 commit SHAs in order with one-line descriptions
2. Output of check-types (pass/fail)
3. Output of e2e (pass/fail, count)
4. Output of migration tests (pass/fail, count)
5. JSONL export: did it happen? path + line count
6. Pause points hit: what, what I decided, what you did
7. Any rule bendings you're flagging for my review
8. BLOCKING ITEMS for staging apply (especially if prod pre-check results
   were "UNAVAILABLE")

Then STOP. Do not:
- Run staging db:push
- Squash-merge to main
- Update IMPLEMENTATION_PLAN.md phase status to 🟢 Done
- Touch CHANGELOG.md (gate ceremony step)
- Clear CURRENT_PHASE.md

Those are gate ceremony steps I run separately.

═══════════════════════════════════════════════════════════════════════
ESCALATION
═══════════════════════════════════════════════════════════════════════

Escalate to me immediately if:
- Any master plan §10 invariant appears contradicted by phase-0-stabilise.md
- Any migration would need to INSERT without upsert-by-natural-key
- A DOWN migration would be genuinely irreversible (not just lossy)
- Any data beyond what's in phase-0-stabilise.md pre-checks surfaces
  that affects migration writing
- Any prior-session commit (0648549, 10220f4, 7e14ae1) appears corrupted
  or conflicting with main
- You feel uncertain about scope, behaviour, or SQL semantics for any
  migration

Do not guess. Do not "make it work." Stop and ask.

═══════════════════════════════════════════════════════════════════════
BEGIN
═══════════════════════════════════════════════════════════════════════

Start by:
1. Running §11.3 starting-work protocol
2. Reading the 5 mandatory pre-reads
3. Confirming back to me: Phase 0 status, the 8 migrations you'll write,
   any discrepancies found between phase-0-stabilise.md and master plan §10
4. Waiting for my "proceed" before writing migration 0008

Do not start writing until I say proceed.
```

---

## Expected "clean" final report shape

```
✅ 8 commits pushed to phase/0-stabilise
   0008 — abc1234 — collapse appraisalStatusEnum to lowercase
   0009 — def5678 — drop callouts + attendance_exceptions
   0010 — 9abc012 — staff cleanup + compassionate remap (N requests audited)
   ...
✅ check-types: PASS
✅ e2e: X passed, 0 failed
✅ migration tests: Y passed, 0 failed
⚠️  BLOCKING: prod pre-checks were UNAVAILABLE, run against prod before staging
```

Anything else in "blocking" or "rule bendings" sections needs debugging before the Phase 0 gate ceremony.

## Gate ceremony (Kareem runs separately, post-migrations)

1. Review commits (diff spot-check, migration comments make sense, tests cover data invariants)
2. Apply to staging DB, verify schema matches expectations
3. If staging clean: squash-merge `phase/0-stabilise` → `main`
4. Update coordination files (IMPLEMENTATION_PLAN phase status 🟢 Done, AGENT_LOG full Phase 0 entry, CHANGELOG user-visible bullets, CURRENT_PHASE cleared)
5. Open fresh session for Phase 1 kickoff using [`phase-1-kickoff.md`](./phase-1-kickoff.md)

Gate ceremony is typically 30-45 minutes when migrations come back clean.
