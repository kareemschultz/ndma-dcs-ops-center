# AGENTS.md — DCS Ops Center

> **For non-Claude AI assistants (OpenAI Codex, GitHub Copilot Workspace, others).**
>
> Project guidance is **canonical in `CLAUDE.md`**. This file is intentionally slim — read the targets it points at.

---

## Reading order (MANDATORY before any work)

1. **`IMPLEMENTATION_PLAN.md`** — phase status table + 10 hard invariants + starting/ending/blocked/escalation protocols
2. **`CURRENT_PHASE.md`** — who's working on what right now (claim it before starting)
3. **`AGENT_LOG.md`** last 3 entries (most recent may override the entry below it)
4. **`CLAUDE.md`** — gotchas, schema/router tables, RBAC enforcement rules, naming conventions, design system
5. **`docs/superpowers/plans/2026-04-23-master-remediation-plan.md`** — authoritative spec (1,403 lines)
6. **`docs/superpowers/plans/phase-{N}-{slug}.md`** — your phase's checklist
7. **`source-of-truth/10-handoff-docs/CLAUDE_CODE_PLANNING_HANDOFF.md`** — for scope questions
8. **`source-of-truth/10-handoff-docs/DEEP_DIVE_ANALYSIS.md`** — for data-shape questions

> **`source-of-truth/`** lives outside the worktree (gitignored at `.gitignore` line 45). Path: `<repo-root>/source-of-truth/`. Two zip mirrors at `<repo-root>/ndma-source-of-truth-{full,lean}.zip`.

---

## Hard rules from 2026-04-25 course correction

These multi-agent failure modes apply to every agent (Codex, Copilot, Claude, etc.):

1. **Verify by SHA, not by prose.** Before claiming a phase is done or starting the next phase, run `git log <gate-SHA> --stat` to confirm the migration files are actually in the commit. CHANGELOG / AGENT_LOG can be aspirational.
2. **No aspirational CHANGELOG entries.** Write the CHANGELOG as part of the gate-ceremony commit AFTER the phase merges, OR prefix with `⚠️ ASPIRATIONAL — not yet shipped`.
3. **One PR per phase.** If a branch's PR is merged but new commits land on that branch afterward, those commits are stranded — open a new PR.
4. **CI > local typecheck.** Turbo caches stale results. `rm -rf .turbo` before final verification, or rely on GitHub Actions CI.
5. **Read AGENT_LOG's last 3 entries literally.** The most recent entry may override the one below it (e.g., a course correction).

**Do NOT merge from these stale Codex branches:** `codex/phase1-foundation`, `codex/phase2-appraisals`, `codex/phase3-operational-hr`, `codex/phase4-shift-scheduling`, `codex/phase5-leave-policy`. Their phase numbering predates and does NOT match the 2026-04-23 master plan. Treat them as historical reference only.

---

## Critical rules (full detail in `CLAUDE.md`)

### RBAC enforcement is MANDATORY
**Every mutation procedure MUST use `requireRole(resource, action)`, NOT `protectedProcedure`.** See `CLAUDE.md` "RBAC Enforcement — MANDATORY" for the full pattern. The RBAC matrix test at `packages/api/tests/rbac-matrix.test.ts` is a blocking CI gate per Hard Invariant #4.

### Audit logging is MANDATORY
Every mutation calls `logAudit()` with `actorRole: context.userRole ?? undefined`, `correlationId: context.requestId`, plus standard fields. See `CLAUDE.md` "Audit Logging Rule".

### Source of truth is read-only
`source-of-truth/` (XLSX/DOCX archive, 200+ files) is read-only per Hard Invariant #10. Never modify; re-parse from the seed script.

---

## Quick repo facts

- **Stack:** Bun 1.3 + Turborepo + React 19 + TanStack Router + Hono + oRPC + Drizzle + Better Auth + PostgreSQL 16 + Tailwind v4 + shadcn/ui (Base UI primitives)
- **Workspace import prefix:** `@ndma-dcs-staff-portal/{api,auth,db,env,ui,config}` (the prefix is legacy — package was renamed to "DCS Ops Center" but workspace names stayed)
- **Dev ports:** web 3001, server 3000, docs 4000
- **Migrations:** `packages/db/src/migrations/` — currently 28 forward (8 with `.down.sql`); next index is 0029
- **Phase status (snapshot 2026-05-04):** Phases 0-8 🟢 Done; Phases 9-15 ⬜ Queued. Authoritative table in `IMPLEMENTATION_PLAN.md`.

---

## Adding new code

### oRPC procedures
1. Create router file in `packages/api/src/routers/`
2. Import + add to `appRouter` in `packages/api/src/routers/index.ts`
3. **Mutations:** `requireRole(resource, action)` — NEVER `protectedProcedure`
4. **Reads:** `protectedProcedure` is acceptable; consider `requireRole(resource, "read")` for sensitive endpoints
5. Every mutation calls `logAudit({ actorRole, correlationId, ... })`
6. Add a row to `packages/api/tests/rbac-matrix.test.ts` in the same PR (CI fails otherwise — Hard Invariant #5)

### Schemas
- All in `packages/db/src/schema/`; export from `index.ts`
- See `CLAUDE.md` schema table for current 49 files (post-Phase-8) and known cleanup items
- ⛔ Never recreate `attendance-exceptions.ts` or `callouts.ts` (deleted in Phase 0 migration 0009)

### UI components
- Shared lives in `packages/ui` and uses `@base-ui/react` primitives — `render` prop, NOT `asChild` (see `CLAUDE.md` "Base UI" gotcha)
- App-local lives in `apps/web/src/components/`

---

## Where things are

| Thing | Path |
|---|---|
| Phase status + invariants | `IMPLEMENTATION_PLAN.md` |
| Per-phase checklist | `docs/superpowers/plans/phase-{N}-{slug}.md` (created at phase start) |
| Authoritative spec | `docs/superpowers/plans/2026-04-23-master-remediation-plan.md` |
| Architecture reference | `docs/architecture/*.md` |
| ADRs | `docs/decisions/ADR-*.md` |
| Open questions for Kareem | `docs/plan-questions.md` |
| State-of-project audit (2026-05-04) | `docs/audit/STATE-AUDIT-2026-05-04.md` |
| RBAC matrix test (CI gate) | `packages/api/tests/rbac-matrix.test.ts` |
| `logAudit` helper | `packages/api/src/lib/audit.ts` |
| `createNotification` helper | `packages/api/src/lib/notify.ts` |
| `fireAutomationRules` helper | `packages/api/src/lib/automation.ts` |
| Sync connectors (Phase 15 stretch) | `packages/api/src/lib/sync/connectors/{ipam,ldap}.ts` |

---

## When in doubt

Ask in `docs/plan-questions.md` with `@kareem [DECISION]` tag and block. Do NOT improvise scope beyond the master plan §5-§7. See `IMPLEMENTATION_PLAN.md` "Escalation" for the full list of decisions that require Kareem's sign-off.
