# NDMA DCS Ops Center — Implementation Plan

> **For any agent starting work on this repo:** read this file first, then follow the links.
> This is the **navigational entry point** — not a task list. The task list (per-phase checklists) lives in `docs/superpowers/plans/phase-{N}-{slug}.md`.

## Reading order

1. **This file** (orientation + phase status + hard invariants + protocols)
2. `CURRENT_PHASE.md` (what's active right now)
3. `AGENT_LOG.md` — last 3 entries minimum
4. `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` (authoritative spec)
5. `docs/superpowers/plans/phase-{N}-{slug}.md` (your phase's checklist)
6. `CLAUDE.md` + `AGENTS.md` (general repo guidance)
7. `source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md` (for scope questions)
8. `source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md` (for data-shape questions)

## Phase status

| # | Phase | Status | Branch | Agent | Gate commit | Date |
|---|---|---|---|---|---|---|
| — | Planning session | 🟢 Done | `planning/2026-04-23-master` | Claude Code opusplan + Claude web opus-4.7 audit | (this commit) | 2026-04-23 |
| 0 | Stabilise & delete | 🟢 Done | — | Claude Code + Codex (course-corrected) | 3916721 | 2026-04-25 |
| 1 | People & access registry | 🟡 Schema+API done, UI pending | `phase/1-rebase` (merged) | Codex (rebased by Claude Code) | c8fdd3e | 2026-04-25 |
| 2 | Leave refactor | ⬜ Queued | — | — | — | — |
| 3 | Scheduling unification | ⬜ Queued | — | — | — | — |
| 4 | Appraisal system | ⬜ Queued | — | — | — | — |
| 5 | NOC performance | ⬜ Queued | — | — | — | — |
| 6 | Contracts lifecycle | ⬜ Queued | — | — | — | — |
| 7 | Training | ⬜ Queued | — | — | — | — |
| 8 | PPE, lateness, timesheets, TOSD | ⬜ Queued | — | — | — | — |
| 9 | Self-service + policies + forms | ⬜ Queued | — | — | — | — |
| 10 | Notifications & calendar | ⬜ Queued | — | — | — | — |
| 11 | Work register refactor | ⬜ Queued | — | — | — | — |
| 12 | Import module | ⬜ Queued | — | — | — | — |
| 13 | Obsolete docs cleanup | ⬜ Queued | — | — | — | — |
| 14 | Final historical seed | ⬜ Queued | — | — | — | — |
| 15 | Hardening | ⬜ Queued | — | — | — | — |

**Legend:** ⬜ Queued · 🟡 Not Started · 🔵 In Progress · 🟠 Blocked · 🟢 Done · 🔴 Reverted

## Hard invariants (DO NOT violate)

1. **Phase 0 must merge to main before Phase 1 branches.** If Phase 0 ≠ 🟢 Done, do not start Phase 1+. Escalate.
2. **Seed scripts use upsert-by-natural-key, never raw INSERT.** Keys in master plan §10.2. `INSERT INTO` outside `seed.ts` bootstrap is a SEVERE VIOLATION.
3. **Appraisal rating parser reads raw X-position (B-F columns), not formula result.** openpyxl does not evaluate formulas. See master plan §10.3.
4. **All mutations call `requireRole()` + `logAudit()`.** RBAC matrix in `packages/api/tests/rbac-matrix.test.ts` is a blocking CI gate.
5. **Every new router procedure gets a row in the RBAC matrix in the same PR.** CI fails if a procedure has no entry.
6. **Historical data is preserved.** Deleted features (Callouts, Attendance Exceptions) migrate their rows to `tosd_records` with `type='callout_legacy'` — never dropped.
7. **One gate commit per phase, on a `phase/{N}-{slug}` branch.** No mid-phase commits to main.
8. **After every phase, `AGENT_LOG.md` gets an entry and `CHANGELOG.md` gets a bullet.** No exceptions.
9. **When starting work, write to `CURRENT_PHASE.md`. When ending (even mid-phase), update it.**
10. **`source-of-truth/` is read-only.** Never modify the XLSX/DOCX. Re-parse from the seed script.

## Starting-work protocol

```bash
git pull
cat CURRENT_PHASE.md              # is anyone already on this phase?
tail -100 AGENT_LOG.md             # recent context
bun run check-types                # baseline must be clean before you change things
cd apps/web && bun run test:e2e    # baseline e2e must pass
```

Then:
1. **Claim the phase** — overwrite `CURRENT_PHASE.md` with your session info (template in that file)
2. **Branch correctly:**
   - Phase 0: `git checkout -b phase/0-stabilise main`
   - Phase N (N≥1): `git checkout -b phase/{N}-{slug} {previous-phase-merged-commit}`
3. **Create the phase checklist:** `docs/superpowers/plans/phase-{N}-{slug}.md` — copy acceptance criteria from master plan §8

## Ending-work protocol

### Phase complete
1. `git commit -m "phase({N}): {summary}"` on phase branch
2. Squash-merge to main (via PR or direct merge)
3. Update phase status table above (🟢 Done, commit SHA, date)
4. Append full entry to `AGENT_LOG.md` (template in that file)
5. Append user-facing bullets to `CHANGELOG.md`
6. Clear `CURRENT_PHASE.md` (reset to "none active")

### Session ending mid-phase
1. `git commit -m "phase({N}): WIP - {what's done}"` on phase branch
2. Keep phase status 🔵 In Progress
3. Update `CURRENT_PHASE.md` with: what got done, what's next, handoff notes
4. Append `[WIP]` entry to `AGENT_LOG.md` (brief)

### Blocked
1. Change phase status to 🟠 Blocked
2. Append `[BLOCKED]` entry to `AGENT_LOG.md`
3. Document in `docs/plan-questions.md` tagged `@kareem [DECISION]`
4. Do NOT proceed to next phase

## Escalation (Kareem's decision required)

- Any scope change beyond master plan §5-§7
- Deleting/skipping any seed step in Phase 14
- Loosening any RBAC rule (tightening is fine)
- Adding new external runtime dependencies
- Any change to `source-of-truth/` structure
- Any deviation from the 10 hard invariants above

Tag in `docs/plan-questions.md` with `@kareem [DECISION]` and block on response.

## Key paths

| Path | Purpose |
|---|---|
| `IMPLEMENTATION_PLAN.md` | This file — agent navigation |
| `CURRENT_PHASE.md` | Who's doing what right now |
| `AGENT_LOG.md` | Per-phase work log (append-only) |
| `CHANGELOG.md` | User-facing changes |
| `CLAUDE.md` | Claude Code repo guidance (gotchas, patterns) |
| `AGENTS.md` | Cross-agent guidance |
| `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` | **Authoritative spec** |
| `docs/superpowers/plans/phase-{N}-*.md` | Per-phase checklist (created at phase start) |
| `docs/superpowers/plans/_archive/` | Superseded plans (do not reference) |
| `docs/plan-questions.md` | Open questions for Kareem |
| `docs/cleanup-log.md` | Phase 13 audit trail (created in Phase 13) |
| `docs/seed-report.md` / `.json` | Phase 14 seed observability outputs |
| `source-of-truth/` | **Read-only** XLSX/DOCX archive |

## Quick links

- **Run typecheck across all packages:** `bun run check-types`
- **Run e2e tests:** `cd apps/web && bun run test:e2e`
- **Start dev:** `bun run dev` (all apps via Turbo)
- **Push DB schema (dev):** `bun run db:push`
- **Generate migration:** `bun run db:generate`
- **Apply migration:** `bun run db:migrate`
- **Drizzle studio:** `bun run db:studio`
- **Run final historical seed (Phase 14):** `bun run db:seed:historical` (`--dry-run` to preview)
