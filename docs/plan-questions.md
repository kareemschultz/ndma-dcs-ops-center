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

## [OPEN] — `performance_journal_entries` naming alignment with master plan §5.3 — @kareem [DECISION]

**Opened:** 2026-05-04 by Claude Code (Phase 4-5 spec follow-up session)
**Phase blocked:** Phase 5 follow-up + Phase 14 seed step 10 (cannot ingest mistake-matrix XLSX without target table)

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
