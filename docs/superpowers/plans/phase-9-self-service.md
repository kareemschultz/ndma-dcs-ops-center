# Phase 9 — Self-service + policies + forms

**Branch:** `phase/9-self-service`
**Based on:** Phase 8 gate commit (post-rebase `fb46d00`); current main `f859216` (Phase 5 follow-up Option B)
**Status:** 🔵 In Progress (started 2026-05-04)
**Master plan ref:** §5.12 (company/policy/calendar — Phase 9-10), §6.5 (self-service scope), §8 Phase 9 acceptance

## Audit of pre-existing surface (2026-05-04)

Phase 9 was substantially scaffolded before this session even started, but several master plan §8 acceptance criteria are not fully met:

- **`apps/web/src/routes/_authenticated/profile.tsx`** — 647 lines; renders ~5 of the 16 sections from handoff §11. Already includes: identity, name editor, password change, contact details (now expanded — see below), recent leave requests, recent open work items.
- **`packages/api/src/routers/staff.ts`** — `staff.updateSelf` exists with audit log (action `staff.self_update`).
- **`apps/web/src/routes/_authenticated/policy/index.tsx`** — 390 lines, 2 tabs (NDMA Policies + Internal Forms).
- **`packages/api/src/routers/policy.ts`** — `policies.{list,create,update,delete}` + `forms.{list,create,update,delete}` per `assertDocumentAdmin` gate (admin / hrAdminOps / manager / personalAssistant).
- **`packages/api/src/lib/scope.ts`** — already has `canAccessStaffPrivate`, `getManagedStaffIds`, `getCallerStaffProfile`, `getDirectReports` helpers used across the codebase for the team-lead-sees-direct-reports pattern.

## Acceptance criteria (master plan §8 Phase 9)

- [ ] **"My Everything" page renders all 15 sections for caller's own data** (handoff §11)
  - [x] Identity (name, title, department, hire date, employment status)
  - [x] Contact details — phoneNumber + emergencyContacts (already shipped)
  - [x] Contact details — **CUG phone + CUG SIM + MiFi asset tag editing** (shipped THIS session — server `staff.updateSelf` accepts all 5 fields with audit log; UI form has 3 new Inputs)
  - [x] Recent open work items
  - [x] Recent leave requests
  - [ ] Their shift / on-call (next 4 weeks)
  - [ ] Their leave balance + history + pending + calendar
  - [ ] Their TOSD history
  - [ ] Their lateness history
  - [ ] Their appraisal history
  - [ ] Their performance journal entries (now `noc_performance_journal`)
  - [ ] Their commendations
  - [ ] Their training plan + in-house log + exam schedule + vouchers
  - [ ] Their PPE issued (17-item matrix per-staff view)
  - [ ] Their access register entries (13 services + VPN + biometric + physical doors)
  - [ ] Their onboarding progress (if new hire)
  - [ ] Their career progression plan
- [ ] **Team Lead view shows direct reports only** — scope.ts `getDirectReports` exists; UI route(s) for /staff/$id with TL scoping needs verification
- [ ] **Sachin / Ataybia see all DCS + NOC** — admin / hrAdminOps gates on staff.list etc.; verify `personalAssistant` role has correct scope
- [x] **Profile editor (phone, CUG, emergency contact) writes audit log** ✅ — shipped this session: `staff.updateSelf` covers `phoneNumber` + `cugPhoneNumber` + `cugSimNumber` + `mifiAssetTag` + `emergencyContacts`; audit logged with `actorRole` + `correlationId`
- [x] **Policies > Documents (PDFs upload)** — policy.ts has `policies.create({ documentUrl })` ✅ (URL string only; binary upload to R2 / S3 deferred to Phase 15 if needed)
- [x] **Policies > Forms (download catalog)** — policy.ts has `forms.list/create/update/delete` ✅
- [ ] **Policies > My Profile (self-service edit)** — policy/index.tsx has 2 tabs (Policies + Forms) but the "My Profile" tab from master plan is not present in the policy page; `/profile` page is the equivalent. **Decision needed:** add a "My Profile" tab pointing to /profile, or accept /profile as the canonical self-service entry point.

## What shipped THIS session (2026-05-04 WIP commit)

### Server
- Extended `staff.updateSelf` mutation to accept `cugPhoneNumber`, `cugSimNumber`, `mifiAssetTag` (3 new fields) — master plan §6.5 requires these be self-editable. All write through to `staff_profiles` columns added in migration 0016 (Phase 1). Audit log unchanged (already covered by `staff.self_update` action).

### UI
- `apps/web/src/routes/_authenticated/profile.tsx` — added 3-field grid for CUG phone / CUG SIM / MiFi asset tag below the existing phone-number input. Optimistic update + form-validation schema updated.

## Remaining work (for follow-up Phase 9 sessions)

### A. Profile page expansion (high-value)
Add the 11 missing self-service sections to `/profile.tsx` per handoff §11. Each is a Card with a useQuery against the relevant router (most queries already exist):
- **Shift / on-call:** `orpc.scheduling.nocShifts.list({ staffProfileId, ... })` + `orpc.scheduling.dcsOnCall.list({ ... })`
- **Leave:** `orpc.leave.balances.getByStaff` + `orpc.leave.tosd.list` (TOSD already separate)
- **Lateness:** `orpc.lateness.list({ staffProfileId, year })`
- **Appraisals:** `orpc.appraisals.getByStaff({ staffProfileId })`
- **Performance journal:** `orpc.nocPerformanceJournal.list({ staffProfileId })` (shipped today)
- **Commendations:** `orpc.commendations.list({ staffProfileId })` (shipped today)
- **Training:** `orpc.trainingPlans.list({ staffProfileId })` + `orpc.examVouchers.list({ assignedStaffId })` + `orpc.inHouseLog.list({ staffProfileId })`
- **PPE:** `orpc.ppe.issuances.matrix({ staffProfileId })`
- **Access registry:** `orpc.accessRegistry.listByStaff({ staffProfileId })`
- **Onboarding:** `orpc.onboarding.tasksList({ staffProfileId })` (verify procedure name)
- **Career progression:** `orpc.careerProgression.list({ staffProfileId })`

### B. Team Lead / Manager scoped views (RBAC verification)
- Audit `apps/web/src/routes/_authenticated/staff/$staffId.tsx` for the `canAccessStaffPrivate` enforcement (some private fields should be hidden when caller lacks access)
- Verify `personalAssistant` role gets DCS+NOC-wide read scope on staff/leave/training queries
- Add e2e Playwright tests covering the 4 RBAC scope cases (staff sees own only / TL sees direct reports / manager sees team / PA sees all)

### C. Policies > My Profile tab decision
- Either add a third tab on `/policy` linking to /profile, OR accept /profile as canonical and remove "My Profile" from the master plan §8 Phase 9 acceptance list.

### D. RBAC matrix tests
- Add tests for `staff.updateSelf` (only protectedProcedure but verifies audit log fires + correct fields written)
- Add tests for `policies.{create,update,delete}` denied for staff role

### E. e2e smoke tests
- Login as staff → /profile → edit CUG fields → save → verify mutation
- Login as admin → /policy → upload doc → verify
- Login as PA → /staff → verify list shows all DCS+NOC

## Notes for next agent

- `bun run check-types` baseline must be green before adding more sections (PR #32 fixed pre-existing errors; new sections must not regress)
- Each new section in /profile.tsx should follow the existing pattern: useQuery with `enabled: !!staffProfileId`, loading skeleton, empty-state card, sorted/limited list
- For the Performance journal + Commendations sections specifically: those queries are NEW (shipped today via PR #31 + #33), so they have no UI consumers yet
- Master plan §6.5 is clear that `staff` role can ONLY see their own data — never another staff member's. Use `staffProfileId === ownStaff.id` checks in any shared UI pulled into /profile
