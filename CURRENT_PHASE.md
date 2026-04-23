# Current Phase

**Active phase:** — (none)
**Status:** 🟡 Not Started
**Branch:** —
**Agent:** —
**Model:** —
**Started:** —
**Last update:** 2026-04-23 (plan approved by Kareem)

## What's done this session

- Master plan approved at `docs/superpowers/plans/2026-04-23-master-remediation-plan.md`
- Agent coordination files created at repo root (this file, `IMPLEMENTATION_PLAN.md`, `AGENT_LOG.md`)
- Open questions seeded in `docs/plan-questions.md`
- 3 prior superpowers plans archived with SUPERSEDED banners

## What's next

**Phase 0 — Stabilise & delete.** Follow `docs/superpowers/plans/phase-0-stabilise.md` (to be created at phase start).

**Before starting Phase 0:**
1. Unpack `ndma-source-of-truth-full.zip` to `source-of-truth/` at repo root if not already
2. Run pre-flight check (master plan §2.5):
   ```bash
   test -d source-of-truth && \
   test -r source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md && \
   test -r source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md && \
   test $(find source-of-truth -name '*.xlsx' | wc -l) -ge 200 && \
   test $(find source-of-truth -name '*.docx' | wc -l) -ge 29 && \
   echo "✅ Pre-flight passed"
   ```
3. Review master plan §3.5 and record schema reconciliation decisions (11 extra schemas) as Phase 0 Step 1
4. Answer open questions in `docs/plan-questions.md` where they block Phase 0 (questions 1, 4 especially)

## Handoff notes

- Plan approved 2026-04-23 by Kareem
- Source of truth must be unzipped at `source-of-truth/` at repo root (NOT in worktree)
- No agent currently active
- Next agent: **overwrite this file** with your session details using the template below

---

## Template — on session start, REPLACE this file with:

```markdown
# Current Phase

**Active phase:** 0 — Stabilise & delete
**Status:** 🔵 In Progress
**Branch:** `phase/0-stabilise`
**Agent:** Claude Code  (or: Codex / human contributor)
**Model:** claude-opus-4-7 (opusplan)  (or equivalent)
**Started:** 2026-04-__ HH:MM UTC
**Last update:** 2026-04-__ HH:MM UTC

## What's done this session

- Pre-flight check passed (or: failed — see plan-questions.md)
- Schema reconciliation decisions recorded for 11 extra schemas
- Migration 0008 drafted (not yet applied)
- ...

## What's next

- Apply migration 0008 in staging
- Delete callouts + attendance-exceptions schemas + routers + route files
- Update sidebar-data.ts

## Handoff notes for next agent

- Migration 0008 needs UP/DOWN symmetry verification before apply
- Callout legacy rows are 47 in prod — migration plan has them going to `tosd_records` with `type='callout_legacy'`
- RBAC matrix needs no changes in Phase 0 (no new routers)
```
