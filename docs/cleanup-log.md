# Phase 13 — Docs cleanup log

> Append-only log of all files deleted, archived, or updated in Phase 13.

## 2026-05-06

### Deleted (superseded)

These root-level files were created by a pre-master-plan audit session and are fully superseded
by the current `IMPLEMENTATION_PLAN.md` + phase plan docs in `docs/superpowers/plans/`:

- `AUDIT_REPORT.md` — pre-master-plan repo audit (findings resolved or tracked in phase gates)
- `REMEDIATION_BACKLOG.md` — pre-master-plan backlog (superseded by per-phase acceptance criteria)
- `CLAUDE_FIX_TASKS.md` — agent task list from pre-master-plan audit (superseded by phase plans)
- `PRODUCTION_READINESS_CHECKLIST.md` — pre-master-plan readiness checklist (superseded by phase gate criteria in IMPLEMENTATION_PLAN.md)

### Fumadocs MDX updates (`apps/docs/content/docs/`)

**`appraisals.mdx`**
- Updated status lifecycle string from `scheduled → in_progress → completed → cancelled`
  to `draft → self_review → manager_review → hr_review → approved → completed / rejected`
- Expanded status table from 4 rows to 7 rows matching the Phase 0 collapsed enum
- Updated overdue definition to use current statuses (`draft`, `self_review`, `manager_review`)

**`compliance.mdx`**
- Added note at top of page directing users to the dedicated PPE and Training modules
  (shipped in Phase 8 / Phase 7 respectively) for granular issuance and certification tracking

**`import.mdx`**
- Expanded supported import types table from 2 types to all 18 currently registered types
- Added note that CSV templates are planned in Phase 12 but not yet available for download
- Updated leave CSV date note to document the 2026-only date validation constraint
