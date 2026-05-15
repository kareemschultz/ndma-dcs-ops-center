# Schema & Router Inventory

Full reference inventory of database schema files and API routers. `CLAUDE.md` keeps only the
non-obvious notes (to stay lean — it loads into every session); this doc holds the complete
tables. Snapshot updated 2026-05-04 (post-Phase-8) — the actual `packages/db/src/schema/` and
`packages/api/src/routers/` directories are the source of truth; verify against them.

> ⚠️ = legacy / cleanup pending.

## Database Schema Files (`packages/db/src/schema/`)

| File | Tables / Enums |
|------|----------------|
| `auth.ts` | user, session, account, verification (Better Auth — DO NOT MODIFY) |
| `audit.ts` | audit_logs (append-only) |
| `notifications.ts` | notifications + channel/status enums |
| `departments.ts` | departments (self-referential `parentId` — ASN/Enterprise/Core nest under DCS) |
| `staff.ts` | staff_profiles (`reportsTo` self-ref — `team_lead_id` dropped in migration 0010) + employment_type / staff_status enums |
| `staff-promotions.ts` | staff_promotions |
| `department-assignments.ts` | department_assignments + department_assignment_history (role enum: manager / pa / team_lead / supervisor) |
| `rota.ts` ⚠️ | on_call_schedules, on_call_assignments, on_call_swaps, assignment_history — legacy DCS, superseded by `scheduling.ts` (Phase 3 cutover gate pending) |
| `roster.ts` ⚠️ | roster_schedules, roster_assignments, roster_swap_requests, maintenance_assignments — legacy NOC, superseded by `scheduling.ts` + `noc-shifts.ts` |
| `scheduling.ts` | dcs_on_call_weeks (4-role: lead / asn / enterprise / core), quarterly_maintenance_tasks, dcs_oncall_swaps + status enums (Phase 3) |
| `noc-shifts.ts` | noc_shifts (D / S / N / sick / off / al / ml grid), shift_swaps + status enums (Phase 3) |
| `escalation.ts` | escalation_policies, escalation_steps, on_call_overrides |
| `incidents.ts` | services, incidents, incident_affected_services, incident_responders, incident_timeline, post_incident_reviews |
| `work.ts` | work_initiatives, work_items, work_item_comments, work_item_weekly_updates, work_item_dependencies, work_item_templates + type / status / priority enums |
| `cycles.ts` | cycles, cycle_work_items + cycleStatus / cyclePeriod enums |
| `automation.ts` | automation_rules, automation_rule_logs + automation_trigger_module enum |
| `leave.ts` | leave_types, leave_balances, leave_requests (+ override_reason / overridden_by / violations jsonb — Phase 2) + leave_request_status enum |
| `leave-policies.ts` | leave_policies (Phase 0 migration 0014 added `blocked_months text[]` + `allow_rollover bool`) |
| `tosd-records.ts` | tosd_records — Time Off / Sick Days register; 7 types: reported_sick / medical / absent / time_off / work_from_home / lateness / callout_legacy (Phase 2; preserves Phase 0-deleted callouts as `callout_legacy`) |
| `procurement.ts` | purchase_requisitions, pr_line_items, pr_approvals + pr_status / pr_priority enums |
| `temp-changes.ts` | temporary_changes, temp_change_history, temp_change_links + tempChangeCategoryEnum / RiskEnum / OwnerTypeEnum |
| `access.ts` | external_contacts, platform_accounts, access_groups, account_group_memberships, access_reviews, platform_integrations, sync_jobs, reconciliation_issues, service_owners + enums |
| `platforms.ts` | platforms — Layer 1 reference table (Phase 1 §5.2 3-layer access registry) |
| `sync-adapters.ts` | sync_adapters — Layer 2 (schema-only in Phase 1; populated in Phase 15 stretch) |
| `sync-adapter-runs.ts` | sync_adapter_runs — Layer 2b ledger |
| `service-access-registry.ts` | service_access_registry — Layer 3 (one row per (staff, platform); per-field `_source` provenance) |
| `contracts.ts` | contracts (+ renewal_letter_due_date, appraisal_1_due_date, appraisal_2_due_date, submitted_to_hr_at, renewal_outcome — Phase 6) + contract_status enum |
| `career-progression.ts` | career_progression_plans (multi-year per-staff progression — Phase 6) |
| `appraisals.ts` | appraisals (Phase 4 fields + Phase-17/official-form columns: category_comments, responsibilities_comment, areas_of_strength, improvements_made, areas_for_development, development_actions, goal_indicators — migration 0037) + appraisal_status enum |
| `appraisal-ratings.ts` | appraisal_ratings, appraisal_responsibilities, appraisal_achievements, appraisal_goals, appraisal_signatures (Phase 4 sub-tables) |
| `appraisal-cycles.ts` | appraisal_cycles (year, half, openedAt, closedAt, status) |
| `appraisal-followups.ts` | appraisal_followups (three_month / six_month, pending / done / skipped) |
| `noc-performance.ts` | noc_ticket_activity, noc_monthly_metrics, employee_of_the_month — write only via `eom-calculator.ts` (Phase 5) |
| `commendations.ts` | commendations — per-staff per-month positive recognition narrative; unique on (staff_profile_id, year, month). Migration 0029. |
| `noc-performance-journal.ts` | noc_performance_journal + noc_perf_journal_category enum — NOC monthly mistake-matrix tracker; per-(staff, year, month, category) count + narrative; unique 4-tuple. Migration 0030. Distinct from `performance_journal_entries` in `hr-docs.ts`. |
| `appraisal-tracker-view.ts` | `appraisal_tracker_view` — **read-only DB VIEW** (Drizzle `pgView().existing()`); joins appraisals + staff_profiles + user filtered to status='completed'. Migration 0029. **Breaks `drizzle-kit push`.** |
| `hr-docs.ts` | promotion_recommendations, promotion_letters, performance_journal_entries (appraisal-period feedback log), career_path_plans, career_path_years, staff_feedback |
| `ppe.ts` | ppe_items (17 canonical, has_size + has_asset_tag flags), ppe_issuances (matrix; status: issued / not_issued / n_a / stolen / lost / damaged / returned; unique on staff+item+date) — Phase 8 |
| `lateness-records.ts` | lateness_records (quarterly grid; total_time_late, days_late, days_missing_from_attendance, days_on_schedule; unique on staff+year+month) — Phase 8 |
| `attendance-logs.ts` | attendance_logs — clock in/out times (fed by the timesheet-PDF import) |
| `daily-attendance` (in schema) | daily_attendance — roll-call 10-status grid; feeds Monthly Grid. Migration 0036. |
| `advance-requests` (in schema) | advance_requests + advance_expense_lines. Migration 0035. |
| `timesheet-documents.ts` | timesheet_documents (HR timesheet PDF/Excel upload — stores file as data URL; office: castellani / liliendaal) — Phase 8 |
| `timesheets.ts` | timesheets, timesheet_entries + timesheetStatusEnum |
| `training.ts` | training_records (legacy facade; Phase 7 work lives in `training-phase7.ts`) |
| `training-phase7.ts` | training_plans, certification_catalog, exam_vouchers, training_events, training_event_participants, in_house_training_log, training_syllabi, assessment_questions, onboarding_task_templates (Phase 7) |
| `exam-schedule.ts` | exam_schedule (Phase 0 migration 0012; Phase 7 added window_start / window_end / exam_voucher_id) |
| `onboarding-tasks.ts` | onboarding_tasks (Phase 7 added template_id FK to onboarding_task_templates) |
| `certification-budgets.ts` | certification_budgets |
| `compliance.ts` | training_records, ppe_records, policy_acknowledgements + compliance_item_status enum (legacy facade — superseded by `training-phase7.ts` + `ppe.ts`) |
| `company-policies.ts` | company_policies |
| `company-forms.ts` | company_forms |
| `calendar-events.ts` | calendar_events (event_type enum, 12 values: birthday / public_holiday / training / exam / contract_renewal / appraisal_due / appraisal_followup / ppe_review / routine_maintenance / server_room_cleaning / custom / …) |
| `operational-overlays.ts` ⚠️ | Tables renamed `overlay_*` → `routine_maintenance_*` (Phase 0 migration 0013); FILE + variable names still say "overlay" (cosmetic) |
| `imports.ts` | import_jobs + import_job_status / import_type enums |

**⛔ Deleted in Phase 0 migration 0009 — DO NOT recreate:** `attendance-exceptions.ts`,
`callouts.ts` (callout rows preserved in `tosd_records` with `type='callout_legacy'`).

## API Routers (`packages/api/src/routers/`)

| File | Key Procedures |
|------|----------------|
| `audit.ts` | list, getByResource (gated `audit:read`) |
| `notifications.ts` | list, markRead, markAllRead, dismiss |
| `rota.ts` ⚠️ | DCS on-call legacy — superseded by `scheduling.ts`; cutover gate pending |
| `roster.ts` ⚠️ | NOC roster legacy — superseded by `scheduling.ts` + `noc-shifts.ts` |
| `scheduling.ts` | nocShifts.{list,bulkSet,update}, dcsOnCall.{list,get,upsertWeek}, maintenance.{list,upsert}, swaps.{noc,dcs}.{request,review} (Phase 3) |
| `noc-shifts.ts` | NOC monthly grid + shift swap helpers (Phase 3) |
| `escalation.ts` | policies.{list,get,create,update,delete}, steps.{add,update,delete}, overrides.{list,create,update,delete} |
| `work.ts` | list, get, create, update, assign, addComment, addWeeklyUpdate, getOverdue, getWeeklyReport, stats, initiatives.*, dependencies.*, templates.* |
| `cycles.ts` | list, get, create, update, addWorkItem, removeWorkItem, stats |
| `workload.ts` | get (per-engineer load → loadScore / loadLevel) |
| `incidents.ts` | list, get, create, update, addTimelineEntry, addResponder, removeResponder, linkService, unlinkService, createPIR, getActive, stats |
| `services.ts` | list, get, create, update |
| `leave.ts` | types.*, balances.{getByStaff,adjust}, requests.{list,create,approve,reject,cancel}, validateRequest, tosd.{list,create,update,delete}, getTeamCalendar (Phase 2) |
| `leave-policies.ts` | leave_policy CRUD + evaluator helpers |
| `procurement.ts` | list, get, create, update, submit, approve, reject, markOrdered, markReceived, getMyRequests, getPendingApprovals, stats |
| `temp-changes.ts` | list, get, create, update, markRemoved, getOverdue, getPublicIPs, getExpiringSoon, stats, statsExtended, getHistory, addLink |
| `analytics.ts` | overview (cross-module, year-filterable) |
| `access.ts` | accounts.*, externalContacts.*, groups.*, reviews.*, integrations.*, syncJobs.list, reconciliation.*, serviceOwners.* |
| `access-registry.ts` | listByStaff, listByPlatform, create, update, bulkImport (Phase 1 Layer-3) |
| `platforms.ts` | list, create, update, disable (Phase 1 Layer-1 reference) |
| `staff.ts` | list (`limit` max 500), get, create, update, deactivate, getDepartments (hierarchically sorted), setTeamLead, canAccessPrivate, getMyDirectReports, search |
| `contracts.ts` | list, get, create, update, getExpiringSoon, setLifecycleDates, submitToHR, setOutcome, getTimeline (Phase 6) |
| `career-progression.ts` | list, upsert, delete (Phase 6) |
| `appraisals.ts` | list, get, create, update, getOverdue, getByStaff, setRatings, setResponsibilities, setAchievements, setGoals, setOfficialForm, submit, approve, reject, sign, getDetail, listFollowups |
| `appraisal-cycles.ts` | list, get, create, close |
| `noc-performance.ts` | metrics.{list,upsert}, tickets.{list,create}, eom.{get,compute} (Phase 5) |
| `commendations.ts` | commendations.{list,get,create,update,delete} (RBAC `performance_journal`) + appraisalTracker.list |
| `noc-performance-journal.ts` | nocPerformanceJournal.{list,upsert,delete} (RBAC `performance_journal`) |
| `department-assignments.ts` | list, create, update, delete |
| `ppe.ts` | items.{list,create,update}, issuances.{list,upsert,matrix,markReturned,markDamaged,markLost} (Phase 8) |
| `lateness.ts` | list, quarterlyGrid, upsert, delete, stats (Phase 8) |
| `attendance-time.ts` | clock-log CRUD (logs.{create,update,delete,bulkCreate}) — **hub linking clock logs ↔ lateness ↔ timesheets** |
| `timesheets.ts` | list, create, approve, reject |
| `timesheet-documents.ts` | list, create, update, delete (HR timesheet upload) |
| `training.ts` | legacy compliance training; Phase 7 work in `training-phase7.ts` |
| `training-phase7.ts` | trainingPlans.*, certCatalog.*, examVouchers.*, trainingEvents.*, inHouseLog.*, syllabi.list, assessmentQuestions.list, onboarding.* (Phase 7) |
| `hr-docs.ts` | promotionRecommendations.*, promotionLetters.*, performanceJournal.*, careerPath.*, feedback.* |
| `compliance.ts` | training.*, ppe.*, policyAck.*, getExpiringItems (legacy facade) |
| `policy.ts` | policies.*, forms.* |
| `dashboard.ts` | main, opsReadiness, recentActivity |
| `import.ts` | execute, getHistory (18 import types) |
| `automation.ts` | list, get, create, update, toggle, delete, getLogs, stats |
| `overlays.ts` ⚠️ | operational overlays (maintenance windows) |

**⛔ Deleted in Phase 0 — DO NOT recreate:** `attendance-exceptions.ts`, `callouts.ts` routers.

### Shared API utilities
- `packages/api/src/lib/audit.ts` — `logAudit(params)` — call from EVERY mutation procedure
- `packages/api/src/lib/notify.ts` — `createNotification(params)` — call when notifying a user
- `packages/api/src/lib/automation.ts` — `fireAutomationRules(module, event, payload)` — after mutations
- `packages/api/src/lib/sync/` — `SyncConnector` types, `runSyncJob`, ipam + ldap connectors
- **Context** (`packages/api/src/context.ts`) provides `session`, `ipAddress`, `userAgent`, `userRole`, `requestId` to all procedures.
