import { date, integer, pgView, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Appraisal tracker view — read-only DB VIEW joining appraisals + staff_profiles + user.
 * Master plan §5.3.
 *
 * Source of truth (XLSX shape mirrored): `DCS/appraisal-tracker/APPRAISAL TRACKER DCS.xlsx`
 * + `NOC/appraisals/AppraisalTracker_20241210_v01.xlsx` (both have identical 3-column shape:
 * Name | Percentage | Period). DCS sheet has 63 rows; NOC has 80; total ~130+ historical entries.
 *
 * Filters to `status='completed'` per master plan §5.3 spec.
 *
 * Phase 14 acceptance gate (master plan §9):
 *   gateAssertions["appraisalTrackerView.rowCount"] >= 130
 *
 * The actual VIEW DDL lives in migration `0029_appraisal_view_commendations.sql`;
 * this file only declares the view's column shape so Drizzle can produce typed
 * `db.select().from(appraisalTrackerView)` queries.
 */
export const appraisalTrackerView = pgView("appraisal_tracker_view", {
  appraisalId: text("appraisal_id"),
  staffProfileId: text("staff_profile_id"),
  staffName: text("staff_name"),
  percentage: integer("percentage"),
  period: text("period"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  year: integer("year"),
  status: text("status"),
  completedDate: date("completed_date"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
}).existing();
