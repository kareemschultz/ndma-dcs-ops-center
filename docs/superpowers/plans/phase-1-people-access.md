# Phase 1 — People & Access Registry

> **[BACKFILL — created 2026-05-04 by State Audit]** This file did not exist when Phase 1 shipped. Reconstructed from `AGENT_LOG.md` Phase 1 entries + `CHANGELOG.md` + master plan §5.1-§5.2.

**Branch:** `phase/1-people-access` → split into `phase/1-schema-api` (PR #18) + `phase/1-ui` (PR #20) + `phase/1-polish` (PR #22)
**Based on:** Phase 0 gate commit `3916721`
**Gate commits (main):** `c8fdd3e` (#18 schema/API) → `fea4835` (#20 UI) → `2972287` (#22 polish — used as canonical Phase 1 gate)
**Master plan ref:** §5.1 (staff extension), §5.2 (3-layer access registry)

## Acceptance Criteria

### Schema + API + UI (shipped)
- [x] `staff_profiles` has `phone_number`, `cug_phone_number`, `cug_sim_number`, `mifi_asset_tag`, `birthday`, `employment_status`, `hire_date`, `contract_end_date`, `current_appointment` (migration 0016)
- [x] `platforms` reference table — Layer 1 (migration 0017)
- [x] `sync_adapters` table — Layer 2 schema-only (migration 0018; rows populated in Phase 15 stretch)
- [x] `sync_adapter_runs` ledger — Layer 2b schema-only (migration 0019)
- [x] `service_access_registry` table — Layer 3 with per-field `_source` provenance (migration 0020)
- [x] `platforms.*` router (list / create / update / disable)
- [x] `accessRegistry.*` router (listByStaff / listByPlatform / create / update / bulkImport)
- [x] `/access/platforms` admin UI with category / auth_type / sync_mode dropdowns
- [x] `/access/registry` matrix (staff × platform; per-row source badge)
- [x] `/access/registry/$staffId` per-staff detail page
- [x] Staff profile Access tab (6th tab; visible to self + leads + HR)
- [x] Sidebar entries: "Access Registry" + "Platforms" under Changes & Access
- [x] `/hr/ppe` redirected to `/compliance/ppe` (sidebar duplicate fix per Ataybia 2026-04-21 sticky note)
- [x] RBAC matrix tests for `platforms.*` + `accessRegistry.*` (`packages/api/tests/rbac-matrix.test.ts`)

### Deferred to Phase 14 (historical seed)
- [ ] `service_access_registry` seeded with 281 staff × 13 services from `AccountManagementMarch_20260312.xlsx`
- [ ] VPN group memberships (MikroTik + Fortigate) seeded
- [ ] uPortal accounts seeded
- [ ] Biometric + physical-door registry seeded from `LiliendaalStaffBiometricAccessControl_20250606_v01.xlsx`

### Deferred to Phase 15 stretch (sync connectors)
- [ ] LDAP sync adapter (Fortigate + AD-integrated platforms)
- [ ] Fortigate / Zabbix / Grafana / Radius adapters
- [ ] `/access/sync-conflicts` review UI
- [ ] Sync scheduling cron

## What Shipped

### Migrations
- **0016** — `extend_staff_profiles` (9 new columns)
- **0017** — `platforms_reference_table`
- **0018** — `sync_adapters_table` (empty in Phase 1)
- **0019** — `sync_adapter_runs_table` (empty in Phase 1)
- **0020** — `service_access_registry_table`

### Schemas
- `packages/db/src/schema/staff.ts` (extended)
- `packages/db/src/schema/platforms.ts`
- `packages/db/src/schema/sync-adapters.ts`
- `packages/db/src/schema/sync-adapter-runs.ts`
- `packages/db/src/schema/service-access-registry.ts`

### Routers
- `packages/api/src/routers/platforms.ts`
- `packages/api/src/routers/access-registry.ts`

### UI
- `apps/web/src/routes/_authenticated/access/platforms.tsx`
- `apps/web/src/routes/_authenticated/access/registry.tsx`
- `apps/web/src/routes/_authenticated/access/registry.$staffId.tsx`
- `apps/web/src/routes/_authenticated/staff/$staffId.tsx` (Access tab added)

### Tests
- `packages/api/tests/rbac-matrix.test.ts` (new — Phase 1 polish PR #22)

## Notes

Phase 1 was originally planned as a single phase but split across three PRs (schema/API → UI → polish) due to scope. The canonical gate SHA `2972287` reflects the post-polish state. PR #18 schema-only commit was `c8fdd3e`; PR #20 UI commit was `fea4835`.

Per master plan §5.2.4, Phase 1 ships the **manual-only** baseline. Sync adapters, conflict detection, and the conflict review UI are deferred to Phase 15 stretch (§13.1 of master plan). Schema is forward-compatible with the stretch scope.
