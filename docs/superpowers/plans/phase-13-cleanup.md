# Phase 13 — Obsolete docs cleanup

**Branch:** `phase/13-cleanup`
**Based on:** c72f127 (Phase 9 WIP gate)
**Status:** 🔵 In Progress (started 2026-05-06)
**Master plan ref:** §8 Phase 13

## Acceptance criteria

- [x] Delete stale root-level docs superseded by master-plan-era docs
- [x] Audit Fumadocs MDX content for outdated references
- [x] docs/cleanup-log.md created (Phase 13 formal audit trail)
- [ ] All links in docs/ verified working

## Files deleted

The following root-level files were created by a pre-master-plan audit session and have been
fully superseded by `IMPLEMENTATION_PLAN.md`, `AGENT_LOG.md`, and the master remediation plan
at `docs/superpowers/plans/2026-04-23-master-remediation-plan.md`:

- `AUDIT_REPORT.md` — pre-master-plan repository audit; findings tracked in IMPLEMENTATION_PLAN
- `REMEDIATION_BACKLOG.md` — pre-master-plan backlog; superseded by phase plan docs
- `CLAUDE_FIX_TASKS.md` — agent-ready task list from pre-master-plan audit; superseded by phase plans
- `PRODUCTION_READINESS_CHECKLIST.md` — pre-master-plan readiness checklist; superseded by phase gate criteria

## MDX files audited

All 19 MDX files under `apps/docs/content/docs/` were reviewed:

| File | Action | Notes |
|------|--------|-------|
| `index.mdx` | No change | Accurate overview |
| `staff.mdx` | No change | Accurate |
| `roster.mdx` | No change | Accurate for DCS on-call |
| `leave.mdx` | No change | Accurate |
| `access.mdx` | No change | Accurate |
| `settings.mdx` | No change | Accurate |
| `audit.mdx` | No change | Accurate |
| `notifications.mdx` | No change | Accurate |
| `analytics.mdx` | No change | Accurate |
| `automation.mdx` | No change | Accurate (rota trigger is correct per code) |
| `cycles.mdx` | No change | Accurate |
| `incidents.mdx` | No change | Accurate |
| `procurement.mdx` | No change | Accurate |
| `temp-changes.mdx` | No change | Accurate |
| `work.mdx` | No change | Accurate |
| `appraisals.mdx` | **Updated** | Status enum expanded from 4 to 7 values (Phase 0 collapse) |
| `compliance.mdx` | **Updated** | Added note that Phase 8 shipped dedicated PPE and Training modules |
| `import.mdx` | **Updated** | Expanded supported import types from 2 to 18; added 2026-date note for leave imports |

## Remaining work

- Verify all internal links across MDX files (no broken `/docs/*` hrefs)
- Add MDX pages for modules added in Phases 4-9 that have no docs yet: PPE, Training (Phase 7),
  Lateness, TOSD records, NOC Performance, Commendations, Career Progression, Contracts lifecycle
- Review `docs/architecture/` files for any references to deleted tables
  (`attendance_exceptions`, `callouts`) or stale phase numbering
