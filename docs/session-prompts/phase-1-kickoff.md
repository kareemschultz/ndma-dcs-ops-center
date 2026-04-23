# Phase 1 Kickoff — Session Prompt Template

> Paste the content below into a fresh Claude Code session **after** Phase 0 is 🟢 Done in `IMPLEMENTATION_PLAN.md` and merged to `main`. Do not use this prompt before Phase 0's gate ceremony is complete.
>
> **⏸ Planned work pause:** Phase 1 is the end of the current work cycle. **Phases 2-15 are deferred** and will resume in a future session / sprint. When Phase 1 completes (gate ceremony done, merged to main, `IMPLEMENTATION_PLAN.md` shows Phase 1 → 🟢 Done), **STOP**. Do NOT auto-chain into Phase 2. The Phase 2 kickoff will be scheduled separately by Kareem.

---

```
Starting Phase 1 — People & Access Registry.

Follow §11.3 starting-work protocol from IMPLEMENTATION_PLAN.md.

PRE-FLIGHT (mandatory):
1. Verify Phase 0 status: IMPLEMENTATION_PLAN.md must show Phase 0 → 🟢 Done
2. Verify CURRENT_PHASE.md is cleared (no active phase)
3. Pull latest main, confirm migrations 0008-0015 are applied
4. bun run check-types — must pass
5. cd apps/web && bun run test:e2e — must pass baseline
6. Claim the phase: overwrite CURRENT_PHASE.md with Phase 1 claim
7. Branch: git checkout -b phase/1-access-registry main

MANDATORY PRE-READS (in order):
1. IMPLEMENTATION_PLAN.md — phase status + 10 hard invariants
2. AGENT_LOG.md — Phase 0 entry to understand what shipped
3. docs/superpowers/plans/2026-04-23-master-remediation-plan.md §5.2 — 3-layer hybrid sync model (THIS IS AUTHORITATIVE)
4. docs/superpowers/plans/2026-04-23-master-remediation-plan.md §13.1 — Phase 15 stretch scope (for understanding what Phase 1 does NOT build)
5. source-of-truth/00-access-and-accounts/README.md — the XLSX structure
6. source-of-truth/00-access-and-accounts/AccountManagementMarch_20260312.xlsx > Services — the 13-platform matrix canonical structure
7. packages/api/src/lib/sync/connectors/ldap.ts — existing connector code (will be reused in Phase 15 stretch, Phase 1 leaves it untouched)

SCOPE (Phase 1 deliverables):

A. Data model
   - platforms table (Layer 1, with category/auth_type/sync_mode/api_capabilities/notes)
   - sync_adapters table (Layer 2, schema only — zero rows in Phase 1)
   - service_access_registry table (Layer 3, all per-field provenance + manual override fields)
   - sync_adapter_runs table (Layer 2b, schema only — zero rows in Phase 1)
   - Migrations 0016+ with UP/DOWN per migration, one commit per migration
   - Repo type convention: text PKs/FKs with $defaultFn UUID (NOT Postgres uuid type) — see master plan §5.2.1

B. Staff extension
   - Extend staff with: phoneNumber, cugPhoneNumber, cugSimNumber, mifiAssetTag, birthday (date), employmentStatus enum('Active','Dormant','OnLeave','Left'), hireDate, contractEndDate, currentAppointment (title)
   - Migration with backfill defaults
   - Staff directory UI shows phoneNumber (per Ataybia sticky-note feedback)

C. oRPC routers
   - platforms.* — list, create, update, disable
   - accessRegistry.* — listByStaff, listByPlatform, create, update (with per-field source tracking), bulkImport
   - Deprecate or fold existing access.ts router
   - Every procedure + requireRole() + logAudit() + RBAC matrix row

D. UI — manual entry only
   - /access/platforms — admin: add/edit platforms, see sync_mode per platform
   - /access/registry — matrix view: staff × platform with privilege_level cells
   - /access/registry/:staffId — per-staff detail: all their platform accesses, edit privilege/account_type/groups
   - Staff profile integration: access section shows platforms + privilege_level (read-only for self-view)
   - All new records default all _source fields to 'manual'

E. Seed support
   - Prepare seed function for Phase 14 to populate platforms + service_access_registry from AccountManagementMarch_20260312.xlsx
   - Seed function is written/tested but NOT run in Phase 1 (Phase 14 runs it)
   - Phase 1 uses manual test data + fixtures for development

F. RBAC scope
   - Staff sees own access records (read-only)
   - Team leads see direct reports' access
   - HR (Ataybia) + managers (Sachin) see all
   - Admin role can edit platforms table + bulk operations
   - All mutations logged via logAudit()

OUT OF SCOPE FOR PHASE 1 (Phase 15 stretch):
- Any sync adapter implementation
- Conflict detection logic
- /access/sync-conflicts UI
- Scheduling / cron for adapters
- Write-back to external platforms
- LDAP connector activation (code stays in repo untouched)
- Secrets management integration

HARD RULES (same as all phases):
- One logical unit = one commit: `phase(1): {brief description}`
- NO squashing within phase
- Every migration has UP + DOWN
- Upsert-by-natural-key for seed functions, never raw INSERT
- RBAC matrix gets rows for every new procedure in the same PR
- If context tight, commit at logical boundary, update CURRENT_PHASE.md, stop

PAUSE POINTS FOR MY REVIEW:
- After data model migrations land locally: show schema ERD (mermaid is fine)
- Before running bulk-import seed fixture: show me the fixture rows
- Before merging to main: show me the RBAC matrix additions + test output
- If any ambiguity on privilege_level enum values for a specific platform: ask me

FINAL SESSION OUTPUT:
- All commits on phase/1-access-registry pushed
- typecheck + e2e + RBAC matrix tests green
- Report back before staging apply + merge ceremony

DO NOT:
- Touch Phase 15 stretch scope (no sync implementations)
- Skip the 3-layer model (don't "simplify" by collapsing platforms + sync_adapters)
- Remove per-field provenance fields ("we can add them later") — schema is forward-compatible by design
- Merge to main without gate ceremony
- **Start Phase 2** — Phase 1 is the end of the current work cycle. After Phase 1 gate ceremony, STOP and await Kareem's scheduling for Phase 2+.

Confirm pre-reads complete, paste Phase 0 completion status from IMPLEMENTATION_PLAN.md, then begin with the data model migrations.
```

---

## Notes on using this prompt

- The prompt references §5.2 and §13.1 of the master plan. Both are stable and won't move.
- If §5.2 or §13.1 numbering shifts in a future edit, update this prompt template BEFORE the Phase 1 session opens.
- The "migrations 0016+" number assumes Phase 0 lands migrations 0008-0015 and no other phase lands intermediate migrations. If that changes, adjust the starting number.
- Pre-read #5 references `source-of-truth/00-access-and-accounts/README.md` which exists in the unzipped archive.
