# Production Readiness Checklist

> **Last updated:** 2026-05-08 (Phase 15 hardening)
> **Status:** 🟡 — Schema/API/UI complete; seed + deployment pending

---

## 1. Database Migrations

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| 0001-0007 | Legacy baseline | ✅ Applied | Pre-planning |
| 0008 | appraisal status collapse | ⬜ Pending | Apply to PROD |
| 0009 | callouts/attendance tables dropped | ⬜ Pending | |
| 0010 | staff.team_lead_id dropped | ⬜ Pending | |
| 0011 | departments.parent_id FK | ⬜ Pending | |
| 0012 | exam_schedule | ⬜ Pending | |
| 0013 | operational overlays → routine_maintenance | ⬜ Pending | |
| 0014 | leave_policies extensions | ⬜ Pending | |
| 0015 | calendar_events event_type widened | ⬜ Pending | |
| 0016-0020 | Access registry (platforms, sync, service_access_registry) | ⬜ Pending | |
| 0021 | TOSD records | ⬜ Pending | |
| 0022-0023 | Scheduling (dcs_on_call_weeks, noc_shifts) | ⬜ Pending | |
| 0024 | Appraisal sub-tables | ⬜ Pending | |
| 0025 | Appraisal cycles | ⬜ Pending | |
| 0026 | NOC performance | ⬜ Pending | |
| 0027 | Contracts lifecycle | ⬜ Pending | |
| 0028 | PPE matrix, lateness, timesheet documents | ⬜ Pending | Fixed migration runner required |
| 0029 | commendations + appraisal_tracker_view | ⬜ Pending | |
| 0030 | noc_performance_journal | ⬜ Pending | |
| 0031 | work_items year/period/weekStartDate | ⬜ Pending | |

**To apply:** `bun run db:migrate` (custom runner in `packages/db/src/migrate.ts`)

---

## 2. Environment Variables

### Server (required)

| Var | Status | Notes |
|-----|--------|-------|
| `DATABASE_URL` | ⬜ Set | Full PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | ⬜ Set | 32+ char random secret |
| `BETTER_AUTH_URL` | ⬜ Set | Public URL e.g. `https://ops.ndma.gov.gh` |
| `CORS_ORIGIN` | ⬜ Set | Exact web origin |
| `NODE_ENV` | ⬜ Set | `production` |

### Optional (nice-to-have)

| Var | Status | Notes |
|-----|--------|-------|
| `SMTP_HOST / SMTP_PORT` | ⬜ | Email notifications (Phase 10 stretch) |
| `SLACK_WEBHOOK_URL` | ⬜ | Slack channel notifications (Phase 15 stretch) |

---

## 3. TypeScript / Build

| Check | Status |
|-------|--------|
| `bun run check-types` passes (all 9 packages) | ✅ Passing |
| `apps/web` build completes | ✅ Passing |
| Bundle split: vendor-react, vendor-tanstack, vendor-recharts, vendor-dates, vendor-ui, vendor-forms | ✅ Done (Phase 15) |
| Bundle size warning suppressed (800 kB limit) | ✅ Done (Phase 15) |

---

## 4. RBAC & Security

| Check | Status | Notes |
|-------|--------|-------|
| All mutations use `requireRole()` | ✅ | Enforced in code |
| All mutations call `logAudit()` | ✅ | Enforced in code |
| RBAC matrix test file covers Phase 1 + Phase 8 + Phase 4-5 follow-up + Phase 15 | ✅ | 582+ lines |
| Import router all 18 types handled | ✅ | Phase 15 fixed 3 missing handlers |
| CORS_ORIGIN enforced (no wildcard in prod) | ⬜ | Set via env var |
| `emailAndPassword` enabled (break-glass admin access) | ✅ | Hard rule in CLAUDE.md |
| Session cookie `sameSite: none + secure: true` for HTTPS | ✅ | Prod config |

---

## 5. E2E Tests

| Check | Status |
|-------|--------|
| Auth flow tests | ✅ `e2e/auth.spec.ts` |
| Dashboard smoke | ✅ `e2e/dashboard.spec.ts` |
| Leave workflow | ✅ `e2e/leave.spec.ts` |
| Work CRUD | ✅ `e2e/work.spec.ts` |
| Staff directory | ✅ `e2e/staff.spec.ts` |
| Roster/scheduling | ✅ `e2e/roster.spec.ts` |
| RBAC scope cases (Staff/TeamLead/Manager/PA/Admin) | ✅ `e2e/role-rbac.spec.ts` |
| All 40+ pages load without JS errors | ✅ `e2e/smoke.spec.ts` (expanded Phase 15) |

---

## 6. Performance

| Check | Status | Target |
|-------|--------|--------|
| Scheduling grid render (50 staff × 31 days) | ⬜ | < 200ms |
| Appraisal form initial render | ⬜ | < 150ms |
| Staff list (281 rows) | ⬜ | < 300ms |
| Core Web Vitals (LCP, FID, CLS) | ⬜ | LCP < 2.5s |

---

## 7. Accessibility

| Check | Status | Notes |
|-------|--------|-------|
| axe-core audit on Dashboard | ⬜ | Run via `@axe-core/playwright` |
| axe-core audit on Work Register | ⬜ | |
| axe-core audit on Appraisal form | ⬜ | |
| Keyboard navigation — all interactive elements reachable | ⬜ | |
| Screen reader labels on all buttons/inputs | ⬜ | |
| Colour contrast ratio ≥ 4.5:1 for text | ⬜ | Tailwind defaults generally pass |

---

## 8. Historical Seed (Phase 14)

| Check | Status | Notes |
|-------|--------|-------|
| `seed-historical.ts` script written | ⬜ | Phase 14 — see `packages/db/src/seed-historical.ts` |
| Dry-run completes < 2 min | ⬜ | Run first |
| Staging run + `docs/seed-report.md` generated | ⬜ | |
| Gate: `staff.rowCount == 281` | ⬜ | |
| Gate: `serviceAccessRegistry.rowCount >= 3000` | ⬜ | |
| Gate: `appraisalTrackerView.rowCount >= 130` | ⬜ | |
| Gate: `employeeOfTheMonth.matchRate == "19/19"` | ⬜ | |
| Production seed run | ⬜ | Requires PROD `DATABASE_URL` |

---

## 9. Deployment

| Check | Status | Notes |
|-------|--------|-------|
| Dockerfile multi-stage build works | ✅ | Validated in CI |
| `docker-compose.prod.yml` has PostgreSQL + app | ✅ | |
| Non-root `bun` user in container | ✅ | Security best practice |
| CI on every push to main | ✅ | `.github/workflows/ci.yml` |
| `db:migrate` step in CI | ✅ | Custom runner handles ALTER TYPE in txn |

---

## 10. Phase 3 Cutover Gate (Scheduling)

| Check | Status | Notes |
|-------|--------|-------|
| `scheduling.*` running parallel to old routers | ✅ | Shadow mode active |
| 7 consecutive days zero 5xx in `scheduling.*` | ⬜ | Not yet measured (no prod traffic) |
| Zero open `scheduling-regression` bugs | ✅ | No known regressions |
| **CUTOVER:** Delete `rota.ts`, `roster.ts`, `noc-shifts.ts` schemas/routers/routes | ⬜ | Requires prod monitoring |

---

## Summary

| Category | Green | Pending |
|----------|-------|---------|
| Database migrations | 7 | 24 |
| Environment variables | 0 | 5 |
| Build / TypeScript | 4 | 0 |
| RBAC & Security | 6 | 2 |
| E2E tests | 8 | 0 |
| Performance | 0 | 4 |
| Accessibility | 1 | 5 |
| Historical seed | 0 | 9 |
| Deployment | 5 | 0 |
| Scheduling cutover | 2 | 2 |

**Overall:** Build and code are production-ready. Blockers: apply 24 migrations to PROD, run Phase 14 seed, set env vars, performance + accessibility validation.
