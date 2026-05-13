# Plan Questions

> Open questions tagged `@kareem [DECISION]` block progress. Questions tagged `@kareem [INFO]` are advisory. Append resolved answers inline; do not delete resolved questions — they're the decision record.

## Format

```
## [OPEN|ANSWERED] — Short title — @kareem [DECISION|INFO|BLOCKER]
**Opened:** YYYY-MM-DD by {agent}
**Context:** (why this matters, which phase is blocked)
**Question:** (the specific ask)
**Options:** (if the question has options, enumerate)

**Resolution:** (filled in by Kareem; include date)
```

<!-- Template at bottom of file, not a real question — ignore when grepping [OPEN] -->

---

## [ANSWERED] — temp-tracker.md fate — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Answered:** 2026-04-23
**Decision:** **Archive with SUPERSEDED banner.**
**Action taken:** File moved to `docs/superpowers/plans/_archive/temp-tracker.md` with banner in Phase 0 reconciliation commit (2026-04-23).
**Rationale (Kareem):** The `temp_changes` schema + router already exist in the codebase and work fine. The planning doc was in-progress spec; feature ships without needing that doc. Schema/router stay as-is; further development (if any) deferred until after Phase 9 (self-service).

---

## [ANSWERED] — Appraisal signature model — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Answered:** 2026-04-23
**Decision:** **Per-cycle toggle.** Each appraisal cycle can be configured independently as digital-signature or wet-sign-placeholder.
**Action:** Phase 4 implementation must model `appraisal_cycles.signature_mode enum('digital','wet_sign')` and render signature block accordingly. Design in Phase 4 kickoff.
**Rationale (Kareem):** Preserves flexibility — earlier cycles may have been wet-sign in practice; newer cycles can opt into digital. Per-org toggle was too coarse; per-signatory hybrid was too complex.

---

## [ANSWERED] — Biometric + physical door registry sync — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Answered:** 2026-04-23
**Decision:** **Manual entry only** — Admin + Ataybia enter via UI; audit-logged.
**Action:** Phase 1 builds data entry UI only. Tables are snapshots. Connector / import can be added later as stretch goals.
**Rationale (Kareem):** Simplest Phase 1 scope. No procurement / credential / connector work. Can evolve to connector (Option 2) or monthly XLSX import (Option 3) in Phase 15 or beyond if Ataybia asks.

---

## [ANSWERED] — Extra schemas in worktree (reconciliation) — @kareem [INFO / PER-SCHEMA DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Answered:** 2026-04-23 (walk-through with Kareem)
**Correction:** Master plan §3.5 listed 11 extras; 2 were false positives (`attendance-time.ts` + `policy.ts` do not exist). Real count: **9 schemas**.
**Decision (per-schema):** See [`phase-0-stabilise.md §2`](./superpowers/plans/phase-0-stabilise.md#2-schema-reconciliation-decisions-9-extras--temp_changes--10-schemas) for full reconciliation table. Summary:

| # | Schema | Decision |
|---|---|---|
| 1 | `exam-dates.ts` | Replace with `exam_schedule` (migration 0012) |
| 2 | `operational-overlays.ts` | Rename to `routine_maintenance` (migration 0013) |
| 3 | `certification-budgets.ts` | Keep as-is; defer integration to Phase 7 |
| 4 | `company-forms.ts` | Keep as-is; align master plan text in follow-up |
| 5 | `leave-policies.ts` | Extend (migration 0014 adds blocked_months + allow_rollover) |
| 6 | `calendar-events.ts` | Extend enum (migration 0015 adds 9 new values) |
| 7 | `onboarding-tasks.ts` | DEFER — FK requires onboarding_task_templates (Phase 7) |
| 8 | `staff-promotions.ts` | Keep as-is |
| 9 | `company-policies.ts` | Keep as-is |

**Rationale (Kareem):** Established a new architectural principle — Phase 0 only does self-contained structural work (no new FKs to not-yet-existing tables). Extensions requiring cross-phase dependencies are deferred to the phase that creates the dependency.

---

## [ANSWERED] — Slack/WhatsApp webhook priority — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Answered:** 2026-04-23
**Decision:** **Deferred to Phase 15 stretch.** Phase 10 ships in-app + email only.
**Architectural addition (new requirement for Phase 10):** Build notification dispatch as **channel-adapter pattern** from day one — `NotificationChannel` interface with `InAppChannel`, `EmailChannel` implementations. Future channels (Slack, WhatsApp, SMS, webhook) slot in without schema change or changes to reminder logic. Store channel preferences per-user.

**Rationale (Kareem):** External channels add procurement/credential/API dependencies unrelated to reminder correctness. Shipping core reminders first, channels later, keeps Phase 10 deliverable tight. But the adapter pattern must be designed now to prevent a future scramble.

**Action:** Add to master plan §8 Phase 10 acceptance criterion (follow-up addenda commit):
> Notification dispatch uses channel-adapter pattern. Adding a new channel post-Phase-10 requires only a new adapter implementation + registration, no changes to reminder logic, schema, or existing channels.

**Phase 15 stretch items** (add to master plan §16):
- Slack webhook channel adapter
- WhatsApp Business API channel adapter (or Twilio)
- SMS channel adapter (if NDMA has an SMS gateway)

---

## [ANSWERED] — _template for future resolved questions_

Move resolved questions to the bottom of the file (below this line) as a decision record. Format:

```
## [ANSWERED] — Short title — @kareem [DECISION]
**Opened:** YYYY-MM-DD
**Answered:** YYYY-MM-DD
**Decision:** (one-line summary)
**Rationale:** (Kareem's reason, captured verbatim where possible)
```

---

## [KNOWN DEFECT] Production DB migration not yet applied — @kareem [ACTION REQUIRED]

Production DATABASE_URL was not available during Phase 0 gate ceremony.
Migrations 0008-0015 must be applied to production using:

  DATABASE_URL=$PROD_DATABASE_URL bun run db:migrate

Must be done before Phase 1 goes to production.

**Opened:** 2026-04-23
**Status:** OPEN
**Update 2026-05-04:** Migration index now at 0029. The full backlog to apply to prod is **migrations 0008-0029 (22 migrations)** in a single `bun run db:migrate` run.

---

## [ANSWERED] — `performance_journal_entries` naming alignment with master plan §5.3 — @kareem [DECISION]

**Opened:** 2026-05-04 by Claude Code (Phase 4-5 spec follow-up session)
**Answered:** 2026-05-04 (Kareem authorised autonomous selection — "you can run and do all the things that needs my attention")
**Decision:** **Option B** — add new table under name `noc_performance_journal`; existing `performance_journal_entries` in `hr-docs.ts` stays as-is for the appraisal-period feedback log flow.
**Action taken:** migration 0030 ships the new table + enum + indexes; `packages/db/src/schema/noc-performance-journal.ts` + `packages/api/src/routers/noc-performance-journal.ts` added; RBAC matrix tests appended; master plan §5.3 reference will be amended in a follow-up doc commit (not blocking).
**Phase 14 seed step 10** can now ingest `StaffPerformanceJournal_20230731_v01.xlsx` into `noc_performance_journal` (~2,304 rows expected).
**Phase blocked:** ~~Phase 5 follow-up + Phase 14 seed step 10~~ (UNBLOCKED)

**Context:**
The 2026-05-04 source-of-truth inspection confirmed two distinct entities with the same name:

1. **Existing** `performance_journal_entries` in `packages/db/src/schema/hr-docs.ts` — appraisal-period feedback log:
   - Columns: `staffProfileId`, `appraisalId`, `linkedEntryId`, `authorId`, `entryType` (note/incident/commendation/etc.), `body`, `visibleToStaff`, `entryDate`
   - Purpose: supervisor/HR jots dated notes about a staff member during an appraisal cycle

2. **Master plan §5.3 spec** for `performance_journal_entries` — XLSX matrix tracker:
   - Columns: `staff_id`, `year`, `month`, `category enum('tickets_itop','alarms','slack_whatsapp','task_incomplete')`, `count`, `narrative`
   - Source: `NOC/appraisals/StaffPerformanceJournal_20230731_v01.xlsx` (12 per-staff sheets × 4 years × 12 months × 4 categories = ~2,304 rows)
   - Purpose: NOC-specific monthly mistake counter

**Question:** how should the naming + schema reconcile?

**Options:**

| # | Option | Pros | Cons |
|---|---|---|---|
| A | Rename existing `performance_journal_entries` → `appraisal_journal_entries` in a follow-up migration; add new `performance_journal_entries` matching master plan §5.3 spec | Aligns with master plan exactly. Clear semantics. | Migration touches existing data + router/UI references. Risk of regression in already-shipped HR docs flow. |
| B | Keep existing as-is; create new table under a different name (e.g., `noc_performance_journal` or `noc_mistake_log`); update master plan §5.3 reference to the new name | Non-destructive to existing HR docs. Lowest risk. | Diverges from master plan literal text — requires plan update. |
| C | Reshape existing `performance_journal_entries` (drop entryDate / entryType / body / visibleToStaff; add year / month / category enum / count / narrative) | Single table, exact spec match. | Most destructive. Breaks shipped HR docs router + tests. Requires backfill of existing rows. |

**Recommendation:** Option B (lowest risk; cleanest separation between DCS appraisal feedback and NOC mistake tracking; small master plan §5.3 text update only).

**Action required:** Kareem decides A / B / C, and the chosen option ships in a Phase 5 follow-up PR before Phase 14 seed step 10 can run.

**Resolution:** _pending_

---

## [OPEN] — iCal export for `/scheduling/*` (Phase 3 AC) — @kareem [DECISION]

**Opened:** 2026-05-12 by Claude Code (Part A audit, claude-opus-4-7)
**Context:** Master plan §6.3 + §8 Phase 3 acceptance criteria require iCal/`.ics` export so staff can subscribe to their on-call / shift schedule in Google Calendar. Grep across `packages/api/src/` returns 0 hits for `.ics` / `iCal` / `icalendar`. **Feature not shipped.** Phase 3 AC unmet.

**Question:** Implement now (Part D scope) or defer to v1.1?

**Options:**

| # | Option | Effort | Notes |
|---|---|---|---|
| A | Implement in Part D | ~4 hours | Use `ical-generator` npm package; expose `/api/scheduling/ical/:staffId` Hono route; auth via per-user subscription token |
| B | Defer to v1.1 | 0 | Mark Phase 3 AC as conditionally met; document gap in PRODUCTION_READINESS_CHECKLIST |

**Recommendation:** Option B — staff don't subscribe to Google Calendar from the app today. Defer.

**Resolution:** _pending_

---

## [OPEN] — 6-tier contract reminder ladder (Phase 6 AC) — @kareem [DECISION]

**Opened:** 2026-05-12 by Claude Code (Part A audit)
**Context:** Master plan §8 Phase 6 requires "Contract end date triggers auto-generate 6 scheduled reminders (90/60/30/14/7/1 day)". Current code has `renewalReminderDays.default(60)` only — single-tier reminder. The 6-tier cadence is **not implemented**.

**Question:** Implement now (Part D scope) — and if so, as discrete `notifications` rows or as one cron job that fires per tier?

**Options:**

| # | Option | Notes |
|---|---|---|
| A | Implement in Part D — 6 discrete `notifications.created_at` rows at submission time, scheduled-for offsets | Most explicit; per-tier dismiss possible |
| B | Implement in Part D — one cron job per day that evaluates contracts and creates a notification when today matches one of 90/60/30/14/7/1 days before `end_date` | Simpler; less DB |
| C | Defer to v1.1 | Phase 6 AC explicitly unmet |

**Recommendation:** Option B — operationally simpler, no scheduled-job backlog to manage.

**Resolution:** _pending_

---

## [OPEN] — NOC shift enum drift (D/S/N/sick/off/al/ml vs current 5 title-case values) — @kareem [DECISION]

**Opened:** 2026-05-12 by Claude Code (Part A audit)
**Context:** `CLAUDE.md` and master plan §6.3 / §9.1 specify NOC shift types as 7 short-codes: `D / S / N / sick / off / al / ml` (Day / Split / Night / Sick / Off / Annual Leave / Maternity Leave). `packages/db/src/schema/noc-shifts.ts:15-21` actually has 5 title-case values: `"12hr Day"`, `"12hr Night"`, `"Off"`, `"Annual Leave"`, `"Sick Leave"`. **No Split shift (S), no Maternity Leave (ml).**

**Question:** keep current (5 title-case) or migrate to spec (7 short-codes)?

**Options:**

| # | Option | Notes |
|---|---|---|
| A | Keep current — update spec text in master plan to match shipped code | Lowest risk. Title-case is more human-readable. But no S / ml support |
| B | Migration to add `Split Shift` + `Maternity Leave` to enum (still title-case) | Adds missing types without enum-rename pain |
| C | Full rename + migration to short-codes | Spec-faithful but invasive; UI labels would need re-rendering |

**Recommendation:** Option B — add the two missing values, keep title-case for readability.

**Resolution:** _pending_

---

## [OPEN] — CSV import templates: 18 of 30+ shipped — @kareem [DECISION]

**Opened:** 2026-05-12 by Claude Code (Part A audit)
**Context:** Master plan §13 enumerates ~30 import templates. `apps/web/public/import-templates/` has 18 (one per `import_type` enum value). No `.example.csv` variants exist for any of them. Phase 12 AC: "30+ CSV templates ... Each has both header-only + example-rows variants."

**Question:** Generate missing 12 templates + 18 example variants in Part D?

**Options:**

| # | Option | Notes |
|---|---|---|
| A | Generate all in Part D — 30 file additions, no logic | ~30 min mechanical work |
| B | Add only `.example.csv` variants for the existing 18 (defer the 12 missing templates as v1.1) | Partial spec compliance |
| C | Defer all to v1.1 | Phase 12 AC remains unmet |

**Recommendation:** Option A — pure CSV files, no router changes needed.

**Resolution:** _pending_

---

## [OPEN] — `eom-calculator.ts` separation — @kareem [INFO]

**Opened:** 2026-05-12 by Claude Code (Part A audit)
**Context:** `CLAUDE.md` says "write only via `eom-calculator.ts` (Phase 5)" but the file does not exist as a separate module — `computeEOM` is inline in `packages/api/src/routers/noc-performance.ts:22`. Functionally identical; documentation drift.

**Question:** Extract to `packages/api/src/lib/eom-calculator.ts` for testability, or update `CLAUDE.md` prose to match shipped code?

**Recommendation:** Update `CLAUDE.md` prose. Inline is fine; no functional benefit to extraction unless we add unit tests (out of scope this session).

**Resolution:** _pending_ (no blocker; cosmetic)
