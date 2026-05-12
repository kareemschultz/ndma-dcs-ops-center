# Historical Seed Report

**Date:** 2026-05-12T19:06:55.160Z
**Dry run:** false

## Step Results

| Step | Entity | Upserted | Skipped | Errors | Duration |
|------|--------|---------|---------|--------|----------|
| 1 | departments | 7 | 0 | 0 | 81ms |
| 2 | staff_profiles | 0 | 0 | 0 | 178ms |
| 3 | service_access_registry | 0 | 0 | 0 | 140ms |
| 5 | contracts | 122 | 38 | 0 | 1505ms |
| 11 | commendations | 11 | 2 | 0 | 870ms |
| 14 | noc_monthly_metrics | 202 | 1 | 0 | 2948ms |
| 17 | noc_shifts | 453 | 1 | 0 | 1469ms |
| 20 | leave_requests | 0 | 0 | 1 | 1ms |
| 21 | tosd_records | 125 | 466 | 0 | 1824ms |
| 22 | lateness_records | 0 | 1 | 0 | 0ms |
| 23 | ppe_items | 17 | 0 | 0 | 53ms |
| 24 | ppe_issuances | 0 | 27 | 0 | 206ms |
| 34 | onboarding_task_templates | 8 | 0 | 0 | 22ms |

**Total:** 945 upserted, 536 skipped, 1 errors in 9297ms

## Gate Assertions

- **serviceAccessRegistry.rowCount:** 0
- **staff.rowCount:** 23
- **appraisalTrackerView.rowCount:** 0
- **employeeOfTheMonth.monthsCovered:** 19
- **employeeOfTheMonth.matchRate:** Computed at runtime — requires eom-calculator.ts validation