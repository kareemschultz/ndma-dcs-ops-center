# Phase 0 — Stabilise & Delete — Reconciliation Decisions + Migration Plan

**Phase:** 0 — Stabilise & delete
**Status:** 🔵 In Progress (reconciliation complete; migrations not yet written)
**Branch:** `phase/0-stabilise`
**Authoritative spec:** [`./2026-04-23-master-remediation-plan.md`](./2026-04-23-master-remediation-plan.md)
**Prepared:** 2026-04-23 by Claude Code (opusplan)
**Approved (decisions 1-4):** Kareem Schultz, 2026-04-23

---

## 1. Pre-flight check result

| Check | Status |
|---|---|
| `source-of-truth/` exists at main repo root | ✅ (unzipped from `ndma-source-of-truth-full.zip` 229MB) |
| `source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md` readable | ✅ |
| `source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md` readable | ✅ |
| XLSX count ≥ 200 | ✅ 200 exactly |
| DOCX count ≥ 29 | ✅ 29 exactly |
| TXT count | 17 (no threshold — noted) |
| `source-of-truth/` added to `.gitignore` | ✅ + explicit rules for `/ndma-source-of-truth-*.zip`, `/category-zips/`, `/WorkUpdate_*.xlsx`, `/files.zip`, `/1.zip` |

**Archive location:** `C:\Users\admin\Documents\karetech\ndma-dcs-ops-center\source-of-truth\` (main checkout, NOT worktree). Worktrees read via `../../../source-of-truth/` relative path.

**Pre-flight result:** ✅ **PASSED** — Phase 0 cleared to proceed.

---

## 2. Schema reconciliation decisions (9 extras + temp_changes = 10 schemas)

**Methodology correction:** Master plan §3.5 listed 11 extras; 2 were false positives (`attendance-time.ts` + `policy.ts` do not exist in worktree). Real count: **9 schemas** from the "extras" list, plus 1 related decision on `temp_changes`.

**Core principle (from Kareem 2026-04-23):** Phase 0 only does **self-contained** extensions — new columns, new enum values, no new FKs to tables that don't yet exist. Extensions requiring FKs to future-phase entities are deferred to the phase that creates the target entity.

| # | Schema | Current shape | Decision | Phase | Rationale | Migration impact |
|---|---|---|---|---|---|---|
| 1 | `exam-dates.ts` | id + staffId + examName + scheduledDate + status(3 enum) | **Replace → `exam_schedule`** | 0 | Option 1 spec (§3.4 below). Copy-then-drop preserves data without assumption. | New migration 0012 |
| 2 | `operational-overlays.ts` | Generic overlay_types + assignments for quarterly duties (server room cleaning, routine maintenance) | **Rename → `routine_maintenance`** | 0 | Naming alignment with master plan §5.7. Existing structure preserved, just renamed. | New migration 0013 |
| 3 | `certification-budgets.ts` | certName + year + estimatedCost + actualCost + GYD currency + status | **Keep as-is — defer integration to Phase 7** | Phase 7 | Phase 0 ≠ integration work. Feature is live; trainingEvents (required for integration) doesn't exist yet. | **None in Phase 0** |
| 4 | `company-forms.ts` | title + category(5) + fileUrl + uploadedAt | **Keep as-is — align master plan later** | None | Existing works; master plan §5.12 fields (storage_path/published_by) are a rename/add; reconcile master plan text to match existing schema in follow-up addenda (§6). | **None in Phase 0** |
| 5 | `leave-policies.ts` | Full policy table with max_concurrent_absences, dept FK, leaveType FK | **Extend — add blocked_months + allow_rollover** | 0 | Master plan §5.6 additions are self-contained (column + array + bool). | Migration 0014 (or fold into 0011) |
| 6 | `calendar-events.ts` | 3-value enum (Birthday/Training/Event) | **Extend enum** | 0 | Master plan §5.12 adds 9 more values (public_holiday, exam, contract_renewal, appraisal_due, appraisal_followup, ppe_review, routine_maintenance, server_room_cleaning, custom). Self-contained enum widening. | Migration 0015 |
| 7 | `onboarding-tasks.ts` | staffId + taskName + category + isCompleted | **DEFER — FK requires onboarding_task_templates (Phase 7)** | Phase 7 | Per Kareem's principle: Phase 0 doesn't add FKs to not-yet-existing tables. | **None in Phase 0** |
| 8 | `staff-promotions.ts` | staffId + promotionDate + letterDate + fromTitle + toTitle + letterUrl | **Keep as-is** | None | Already matches master plan §5.5 spec. | **None in Phase 0** |
| 9 | `company-policies.ts` | title + contentText + documentUrl + lastUpdated | **Keep as-is** | None | Master plan §5.12 says "keep existing". | **None in Phase 0** |
| 10 | `temp-changes.ts` (+ `docs/superpowers/plans/temp-tracker.md`) | `temp_changes` table and router exist; `temp-tracker.md` is in-progress planning doc | **Keep schema; archive temp-tracker.md with SUPERSEDED banner** | 0 | Kareem decision: archive the planning doc now (SUPERSEDED, feature subsumed). Schema/router stay as-is (in use). | **None on schema**; file move only |

### Summary of Phase 0 schema work

**Touched:** `exam-dates` → `exam_schedule`, `operational-overlays` → `routine_maintenance`, `leave-policies` extend, `calendar-events` enum widen.
**Untouched:** `certification-budgets`, `company-forms`, `onboarding-tasks`, `staff-promotions`, `company-policies`, `temp_changes` table.
**Archived (doc only):** `docs/superpowers/plans/temp-tracker.md` → `_archive/`.

---

## 3. Open question answers (verbatim decisions from Kareem)

### 3.1 operational-overlays naming — **Rename to `routine_maintenance`**

Rationale (Kareem): specific name wins over generic; better semantic clarity. Requires migration + code updates wherever `operational_overlays` is referenced.

### 3.2 certification-budgets — **Keep but defer integration to Phase 7**

Verbatim spec from Kareem:

> Phase 0 scope: zero changes to `certification-budgets.ts`. Schema, router, routes, seed all left as-is. Document decision in `phase-0-stabilise.md` with rationale: feature is in production, integration with `trainingEvents` requires `trainingEvents` to exist first (Phase 7).
>
> Phase 7 scope addendum (add to master plan §5.10 as note): when `trainingEvents` lands, evaluate integration options:
>   - A. Add `trainingEventId` FK to `certification-budgets` actuals tracking
>   - B. Add computed "budgetUsed" via query (SUM of matching `trainingEvents.total_cost`)
>   - C. Leave decoupled — budgets and events track different things in parallel
>
> Pick option at Phase 7 kickoff based on how Ataybia describes her actual budget-tracking workflow. Don't pre-commit in Phase 0.

**Lesson (applies to all phases going forward):** Phase 0 is for defects and clear decisions, not integration work that belongs in later phases. If a "keep + extend" requires fields, FKs, or relationships that depend on entities Phase 0 doesn't create, defer the extend to the phase that creates the dependency. Document the decision now, do the work then.

### 3.3 Slack/WhatsApp webhook — **Deferred to Phase 15 stretch**

Verbatim spec from Kareem:

> Phase 10 scope: in-app notification bell + email reminders only. Build as **channel-adapter pattern** from the start (`NotificationChannel` interface with `InAppChannel`, `EmailChannel` implementations) so future channels (Slack, WhatsApp, SMS, webhook) slot in without schema change. Store channel preferences per-user so staff can opt in/out per channel.
>
> Document in master plan §8 as Phase 10 acceptance criterion:
>   "Notification dispatch uses channel-adapter pattern. Adding a new channel post-Phase-10 requires only a new adapter implementation + registration, no changes to reminder logic, schema, or existing channels."
>
> Phase 15 stretch items (add to master plan §16):
>   - Slack webhook channel adapter
>   - WhatsApp Business API channel adapter (or Twilio)
>   - SMS channel adapter (if NDMA has an SMS gateway)
>
> Rationale: external channels add procurement/credential/API dependencies unrelated to reminder correctness. Shipping core reminders first, channels later, keeps Phase 10 deliverable tight.

### 3.4 exam-dates replacement — **Migrate + drop old (Option 1)**

Verbatim spec from Kareem:

> Phase 0 migration (new `0012_exam_schedule_rename.sql`):
>
> 1. `CREATE TABLE exam_schedule` with full master plan §5.10 shape:
>    ```
>    id uuid PK
>    staff_id uuid FK staff(id)
>    certification_id uuid FK certification_catalog(id) nullable
>    certification_name text  -- denormalized for historical rows without certification_id
>    window_start date
>    window_end date
>    booked_date date nullable
>    voucher_id uuid FK exam_vouchers(id) nullable
>    status enum('scheduled','booked','completed_pass','completed_fail','missed','cancelled','will_write')
>    notes text nullable
>    created_at, updated_at, created_by, updated_by per audit pattern
>    ```
> 2. `INSERT INTO exam_schedule SELECT ... FROM exam_dates` — map old 3 columns into new shape:
>    - `examName` → `certification_name` (FK null; Phase 7 seed resolves FKs where possible)
>    - `date` → `window_end` (`window_start = date - interval '14 days'` as default, adjust in Phase 7)
>    - status mapping: `'Passed'` → `'completed_pass'`, `'Failed'` → `'completed_fail'`, `'Scheduled'` → `'scheduled'`
> 3. `DROP TABLE exam_dates;`
> 4. DROP router, routes, MDX docs referencing `exam_dates` — replace with `exam_schedule` equivalents.
>
> Phase 7 populates from source-of-truth XLSX:
>   - `Shared-training/exam-dates/Exam Dates.xlsx` → `exam_schedule`
>   - `Shared-training/vouchers/NDMA EXAM VOUCHER.xlsx` → `exam_vouchers` + `voucher_id` FK resolution
>   - `certification_id` FKs resolved against `certification_catalog` (also seeded in Phase 7)
>
> Gate criteria addition for Phase 0:
>   - Row count: `exam_schedule` row count after migration == `exam_dates` row count before migration (no data loss)
>   - All old `exam_dates` consumers (grep) now point to `exam_schedule`
>   - Migration UP/DOWN both work (DOWN recreates `exam_dates` from `exam_schedule` projection, reducing enum to 3 values and dropping FK columns; data fidelity imperfect on rollback)

**FK dependency note:** `certification_catalog` and `exam_vouchers` don't exist yet (Phase 7). Per Kareem's principle, the FKs go in as **nullable** in Phase 0 (columns exist, constraints added in Phase 7 when target tables exist). Alternative: create the new `exam_schedule` without the FK columns at all and add them in Phase 7 migration.

**Phase 0 agent decision:** choose nullable-column-now-vs-add-column-later before writing migration 0012.

---

## 4. Phase 0 migration plan

Per master plan §10.7 — each migration is independently revertable. Order matters: 0008 first (enum fix, preserves rows), then deletes (0009), then cleanups (0010), then FKs (0011), then renames (0012-0015).

| # | File | Purpose | UP | DOWN | Notes |
|---|---|---|---|---|---|
| **0008** | `0008_enum_fix.sql` | Collapse `appraisalStatusEnum` to single lowercase casing | `CASE WHEN status IN ('Draft','draft') THEN 'draft' WHEN status IN ('Completed','completed') THEN 'completed' ... END` update; alter enum to have lowercase values only | Restore mixed-case enum values; map back via reverse CASE | Pre-migration snapshot required; post-migration row count check |
| **0009** | `0009_delete_legacy_features.sql` | Drop `callouts`, `attendance_exceptions` tables; migrate callout rows to `tosd_records` with `type='callout_legacy'` | 1. `INSERT INTO tosd_records (staff_id, date, type, hours, reason_text) SELECT staff_id, date, 'callout_legacy', hours, comments FROM callouts;` 2. `DROP TABLE callouts;` 3. `DROP TABLE attendance_exceptions;` 4. Drop related enums | Recreate tables from schema definitions; restore rows from `tosd_records WHERE type='callout_legacy'` into `callouts`; remove the `callout_legacy` rows | `tosd_records` schema must accept `'callout_legacy'` — add this value to the type enum if not present |
| **0010** | `0010_staff_cleanup.sql` | Drop `staff.team_lead_id`; remove Compassionate leave type | 1. `ALTER TABLE staff DROP COLUMN team_lead_id;` 2. `DELETE FROM leave_types WHERE code='compassionate';` 3. `ALTER TYPE leave_type_code DROP VALUE 'compassionate';` (if applicable) | Re-add `team_lead_id` column (data unrecoverable); re-insert Compassionate leave type | Pre-check: any `reports_to` values that depended on `team_lead_id` — already migrated in migration 0005 per repo history |
| **0011** | `0011_departments_fk.sql` | Add `departments.parent_id` FK (raw SQL, not Drizzle — circular FK) | `ALTER TABLE departments ADD CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id);` | `ALTER TABLE departments DROP CONSTRAINT fk_departments_parent;` | Pre-check: all existing `parent_id` values resolve to existing `departments.id`; orphans must be NULLed before FK applies |
| **0012** | `0012_exam_schedule_rename.sql` | Replace `exam_dates` → `exam_schedule` with richer shape (Kareem spec §3.4) | `CREATE TABLE exam_schedule`; `INSERT ... SELECT FROM exam_dates` with column/enum mapping; `DROP TABLE exam_dates` | Recreate `exam_dates` from `exam_schedule` projection (reduce enum to 3, drop FK columns). Data fidelity imperfect on rollback — acceptable per Kareem | FK columns (`certification_id`, `voucher_id`) are nullable in Phase 0; constraints added in Phase 7 migration |
| **0013** | `0013_operational_overlays_rename.sql` | Rename `operational_overlays` schema/tables to `routine_maintenance` | `ALTER TABLE overlay_types RENAME TO routine_maintenance_types;` `ALTER TABLE operational_overlays RENAME TO routine_maintenance;` (and related indexes/constraints) | Reverse rename | Also rename router file + all TS imports in follow-up code changes (non-migration) |
| **0014** | `0014_leave_policies_extend.sql` | Add `blocked_months` (text[]) + `allow_rollover` (bool, default false) to `leave_policies` | `ALTER TABLE leave_policies ADD COLUMN blocked_months text[]; ADD COLUMN allow_rollover boolean NOT NULL DEFAULT false;` | `ALTER TABLE leave_policies DROP COLUMN blocked_months; DROP COLUMN allow_rollover;` | Self-contained; no FK changes |
| **0015** | `0015_calendar_events_enum_extend.sql` | Add 9 new values to `calendar_event_type` enum | `ALTER TYPE calendar_event_type ADD VALUE 'public_holiday'; ... (9 ADD VALUE statements)` | Cannot DROP VALUE in Postgres without rewriting type — acceptable to leave UP-only (enum widening is forward-compat) | **Note:** Postgres enum widening is one-way; DOWN is documented as "no-op acceptable" |

### Phase 0 code changes (not migrations, but part of same commit)

- **Delete files:**
  - `packages/db/src/schema/callouts.ts`
  - `packages/db/src/schema/attendance-exceptions.ts`
  - `packages/db/src/schema/exam-dates.ts` (replaced by new `exam-schedule.ts`)
  - `packages/api/src/routers/callouts.ts`
  - `packages/api/src/routers/attendance-exceptions.ts`
  - `apps/web/src/routes/_authenticated/hr/callouts.tsx`
  - `apps/web/src/routes/_authenticated/hr/attendance.tsx`
  - MDX docs in `apps/docs/content/docs/` referencing removed features (audit + delete as encountered)

- **New/rename files:**
  - `packages/db/src/schema/exam-schedule.ts` (replaces `exam-dates.ts`)
  - `packages/db/src/schema/routine-maintenance.ts` (rename of `operational-overlays.ts`)
  - `packages/api/src/routers/routine-maintenance.ts` (rename of overlays router)

- **Modify files:**
  - `packages/db/src/schema/appraisals.ts` — collapse `appraisalStatusEnum`
  - `packages/db/src/schema/staff.ts` — drop `teamLeadId` references
  - `packages/db/src/schema/departments.ts` — parent FK handled in migration 0011 SQL
  - `packages/db/src/schema/leave-policies.ts` — add `blockedMonths` + `allowRollover` columns
  - `packages/db/src/schema/calendar-events.ts` — extend enum
  - `packages/db/src/schema/index.ts` — remove deleted exports, add new
  - `apps/web/src/components/layout/data/sidebar-data.ts` — merge Scheduling group, remove `/hr/ppe` dup, remove deleted route entries
  - `packages/api/src/routers/index.ts` — remove deleted router exports

---

## 5. Phase deferrals (moved to later phases)

| Item | Moved to | Reason |
|---|---|---|
| `certification-budgets` integration with `trainingEvents` | Phase 7 | `trainingEvents` doesn't exist yet (Kareem principle) |
| `onboarding-tasks.template_id` FK | Phase 7 | `onboarding_task_templates` doesn't exist yet |
| `exam_schedule.certification_id` FK constraint | Phase 7 | `certification_catalog` doesn't exist yet (column nullable in Phase 0) |
| `exam_schedule.voucher_id` FK constraint | Phase 7 | `exam_vouchers` doesn't exist yet (column nullable in Phase 0) |
| Channel-adapter pattern IMPLEMENTATION for notifications | Phase 10 | Design principle landed here; code lands Phase 10 |
| Slack/WhatsApp/SMS webhook adapters | Phase 15 stretch | External dependencies; not core to reminder correctness |
| `company-forms` schema alignment with master plan §5.12 | Follow-up master plan edit | Existing works; align master plan to match, not code to master plan |

---

## 6. Master plan addenda (propagate in follow-up commit — NOT this session)

The following updates to `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` should be made in a separate follow-up commit (ideally alongside the actual migration implementation session):

1. **§5.7 rename:** "routine_maintenance" → align text with decision. The existing schema is called `operational_overlays`; Phase 0 renames to `routine_maintenance`. Master plan §5.7 already uses `routine_maintenance` — confirm no other references to `operational_overlays` remain.

2. **§5.10 add integration note (for Phase 7):**
   > When `trainingEvents` lands in Phase 7, evaluate certification-budgets integration: (A) add `trainingEventId` FK, (B) compute `budgetUsed` via query, or (C) leave decoupled. Decision made at Phase 7 kickoff.

3. **§5.11 note on onboarding-tasks FK:**
   > `template_id` FK to `onboarding_task_templates` is added in Phase 7 (not Phase 0) because `onboarding_task_templates` is created in Phase 7.

4. **§5.12 reconcile company-forms spec:**
   > Existing `company_forms` schema (title, 5-enum category, fileUrl, uploadedAt) is kept as-is. Phase 0 makes no changes. Any future extension aligns master plan text to the live schema, not the reverse.

5. **§8 Phase 10 acceptance criterion:**
   > Notification dispatch uses channel-adapter pattern (`NotificationChannel` interface with `InAppChannel`, `EmailChannel` implementations). Adding a new channel post-Phase-10 requires only a new adapter implementation + registration, no changes to reminder logic, schema, or existing channels.

6. **§8 Phase 15 stretch goals:**
   > - Slack webhook channel adapter
   > - WhatsApp Business API channel adapter (or Twilio)
   > - SMS channel adapter (if NDMA has an SMS gateway)

7. **§5.10 exam_schedule FK nullability note:**
   > `certification_id` and `voucher_id` FK columns added as nullable in Phase 0 migration 0012; constraints enforced in Phase 7 when `certification_catalog` and `exam_vouchers` tables exist.

8. **New architectural principle (cross-reference from §1, §5, §10):**
   > **Phase scope principle:** Phase 0 only does self-contained structural work (new columns, new enum values, no new FKs to not-yet-existing tables). Extensions requiring cross-phase dependencies are deferred to the phase that creates the dependency. Document the decision now, do the work then.

9. **§3 defect register correction:**
   > 2 of the 11 "extra schemas" listed in §3.5 (`attendance-time.ts` + `policy.ts`) do not actually exist in the worktree. Real count: 9. Update table.

---

## 7. Phase 0 acceptance criteria (before merging to main)

- [ ] Pre-flight check passes (§1) ✅ already done
- [ ] All 9 schema reconciliation decisions documented and applied (§2)
- [ ] All 8 migrations (0008-0015) apply cleanly in staging; UP/DOWN both tested
- [ ] `appraisalStatusEnum` has only lowercase values; no existing rows lost (pre-migration row count == post-migration row count)
- [ ] `callouts` + `attendance_exceptions` tables dropped; callout rows migrated to `tosd_records` with `type='callout_legacy'` (verify count of migrated rows matches pre-drop callouts count)
- [ ] `staff.team_lead_id` column dropped; `reports_to` is sole source of truth (no code paths reference `teamLeadId` in API or web)
- [ ] `departments.parent_id` has FK constraint (migration 0011 SQL)
- [ ] `exam_dates` table dropped; `exam_schedule` exists with richer shape; row count preserved (Phase 0 gate)
- [ ] `operational_overlays` tables renamed to `routine_maintenance`; all code references updated
- [ ] `leave_policies` has `blocked_months` + `allow_rollover` columns
- [ ] `calendar_event_type` enum has 12 total values (3 original + 9 new)
- [ ] `temp-tracker.md` archived with SUPERSEDED banner
- [ ] Sidebar: `/hr/callouts` + `/hr/attendance` + `/hr/ppe` dup removed; Scheduling group created (Phase 3 will fill contents)
- [ ] Route files `hr/callouts.tsx` + `hr/attendance.tsx` deleted
- [ ] `bun run check-types` passes
- [ ] `cd apps/web && bun run test:e2e` passes (baseline must be re-run after migrations)
- [ ] Appraisal list UI still renders all existing rows post-migration
- [ ] `IMPLEMENTATION_PLAN.md` phase status table updated: Phase 0 → 🟢 Done with commit SHA
- [ ] `AGENT_LOG.md` has full Phase 0 entry appended
- [ ] `CHANGELOG.md` has user-facing bullet for Phase 0 changes
- [ ] Master plan addenda (§6 above) committed in follow-up commit

---

## 8. Open risks / unknowns

| Risk | Impact | Mitigation |
|---|---|---|
| `exam_schedule` FK nullability strategy — columns-from-day-0 vs added-in-Phase-7 | Low | Phase 0 agent picks at migration-write time; document choice in migration 0012 header comment |
| Postgres enum widening is one-way (can't DROP VALUE in migration 0015 DOWN) | Low | Document as "forward-compat only"; accept imperfect rollback |
| `operational_overlays` → `routine_maintenance` rename may cascade through many files | Medium | Grep pass before migration: list all files referencing `operationalOverlays` / `operational_overlays` / `OverlayType`; include rename in same commit |
| Compassionate leave type removal may orphan historical leave_requests rows | Medium | Pre-check: `SELECT COUNT(*) FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id WHERE lt.code = 'compassionate';` — if > 0, either (a) remap to 'emergency' or 'special', or (b) keep the leave_type row but remove from enum values visible in UI. Decide before migration 0010. |
| `callout_legacy` type enum value — must exist in `tosd_records` type enum before migration 0009 migrates rows | High | Migration 0009 Step 0: `ALTER TYPE tosd_type ADD VALUE 'callout_legacy';` BEFORE the INSERT. Or use migration 0008 to extend the enum first. |
| Pre-commit hook runs `bat` which may not be installed (per CLAUDE.md gotchas) | Low | Use `git commit -m` with repeated `-m` flags (not heredoc) |
| node_modules not installed in this worktree — typecheck baseline couldn't run | Low | Phase 0 migration-writing agent runs `bun install` as first step |

---

## 9. Next-session handoff (when migrations get written)

**Resuming Phase 0 migrations** — fresh session's starting prompt:

> Resuming Phase 0 migrations. Follow §11.3 starting-work protocol from `IMPLEMENTATION_PLAN.md`. Read `docs/superpowers/plans/phase-0-stabilise.md` for the full migration plan. Continue on branch `phase/0-stabilise` (no merge to main yet). Implement migrations 0008-0015 in order per §4 of the plan doc, with UP/DOWN for each, acceptance tests per migration. Run `bun install` first, then `bun run db:push` against a disposable local DB after each migration to verify UP works, then revert to verify DOWN. After all 8 migrations pass locally, push to `phase/0-stabilise`, run full typecheck + e2e, then report back for Kareem to review before merging to main.
>
> Do NOT proceed to Phase 1 until Phase 0 is 🟢 Done in `IMPLEMENTATION_PLAN.md` and merged.
