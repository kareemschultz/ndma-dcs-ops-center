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

---

## [OPEN] — temp-tracker.md fate — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Context:** `docs/superpowers/plans/temp-tracker.md` (7.3 KB) is an in-progress design for temporary infrastructure changes. The master plan §4.3 flagged it as "review / migrate". Blocks: Phase 1 scope decision.

**Question:** Three options:
1. **Fold into Phase 1** — expand temp-tracker spec into the Phase 1 checklist. The `temp_changes` schema + router already exist and Phase 1 extends them.
2. **Keep as standalone pending plan** — leave the file in place; revisit after Phase 9 (self-service).
3. **Archive** — move to `_archive/` with SUPERSEDED banner; the feature is abandoned / subsumed by scheduling.

**Recommendation:** Option 1 — the existing `temp_changes` schema is already wired into the codebase and the sticky-note feedback didn't ask to remove it.

**Resolution:** _(pending)_

---

## [OPEN] — Appraisal signature model — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Context:** Planning handoff §2 says "design for both digital and wet-sign placeholder". Master plan §5.3 models `appraisal_signatures` with optional `signature_svg`. Blocks: Phase 4 UX decisions (signature pad component choice, print flow).

**Question:** Is the signature policy:
1. **Per-org (single toggle):** NDMA-wide choice — either all appraisals are digital (SVG signature pad) or all are wet-sign (blank placeholder printed for manual signing)
2. **Per-cycle toggle:** each appraisal cycle can be configured digital or wet-sign independently
3. **Per-signatory toggle:** employee signs digitally, GM/DGM/HR sign wet (hybrid)

**Recommendation:** Option 1 initially, with Option 3 as a Phase 15 enhancement if Kareem decides during Phase 4 pilot that hybrid is useful.

**Resolution:** _(pending)_

---

## [OPEN] — Biometric + physical door sync — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Context:** Master plan §5.2 models `biometric_registration` + `physical_access_register` tables. Phase 1 populates them. Blocks: Phase 1 scope (connector vs manual entry UI).

**Question:** Are biometric + physical door records:
1. **Manual entry only** — Admin + Ataybia enter data via UI; source of truth stays in NDMA's existing systems (door controller DB, Liliendaal access DB); our tables are snapshots
2. **Synced from door controller via connector** — Phase 1 builds a connector similar to `packages/api/src/lib/sync/connectors/ldap.ts`; our tables are mirror
3. **Synced one-way XLSX import** — Ataybia uploads the AccountManagement XLSX monthly; import job updates our tables

**Recommendation:** Option 1 initially (manual entry + audit log). Phase 1 delivers the UI. Option 2 or 3 can be added later as a stretch goal (planning handoff §17 "Biometric access visualizer").

**Resolution:** _(pending)_

---

## [OPEN] — Extra schemas in worktree (reconciliation) — @kareem [INFO / PER-SCHEMA DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Context:** 11 schemas exist in the worktree that the planning handoff did not mention. Phase 0 Step 1 is the schema reconciliation audit. Master plan §3.5 proposes defaults:

| Schema | Default decision | Rationale |
|---|---|---|
| `exam-dates.ts` | Extend | Handoff §6.10 specifies `examSchedule` — reuse this table |
| `company-forms.ts` | Keep | Handoff §6.12 references companyForms catalogue |
| `company-policies.ts` | Keep | Handoff §6.12 references companyPolicies |
| `certification-budgets.ts` | Review | Not in handoff; may be pre-existing work unrelated |
| `attendance-time.ts` | Review | Overlaps with §6.8 attendanceLogs |
| `leave-policies.ts` | Extend | Handoff §6.6 specifies leavePolicies table |
| `policy.ts` | Merge | Review against companyPolicies; may be duplicate |
| `calendar-events.ts` | Extend | Handoff §6.12 adds eventType enum |
| `staff-promotions.ts` | Extend | Handoff §6.5 references staffPromotions |
| `onboarding-tasks.ts` | Extend | Handoff §6.11 references onboardingTasks |
| `operational-overlays.ts` | Review | Not in handoff; preserve if feature is live |

**Question:** Confirm or override per-schema defaults. Particularly `certification-budgets.ts` and `operational-overlays.ts` — do these feature areas exist in production and matter?

**Resolution:** _(pending — Phase 0 agent will follow up on each "Review" default)_

---

## [OPEN] — Slack/WhatsApp webhook priority — @kareem [DECISION]

**Opened:** 2026-04-23 by Claude Code (planning session)
**Context:** Planning handoff §12 + master plan §6.6 mention Slack/WhatsApp as "optional" notification channels. Phase 10 scope decision.

**Question:**
1. **In Phase 10** — build the webhook as part of the notification engine
2. **Deferred to Phase 15 or stretch** — core notifications (in-app + email) in Phase 10; webhooks later
3. **Not needed** — remove from plan entirely; NDMA uses email + in-app only

**Recommendation:** Option 2 — core engine ships Phase 10; webhook is a Phase 15 stretch.

**Resolution:** _(pending)_

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
