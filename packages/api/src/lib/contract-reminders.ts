/**
 * Contract expiry reminder ladder — Phase 6 spec compliance.
 *
 * Master plan §8 Phase 6 acceptance criterion:
 *   "Contract end date triggers auto-generate 6 scheduled reminders
 *   (90/60/30/14/7/1 day) + appraisal_1/_2 dates + follow-ups"
 *
 * This module exposes `fireContractReminders()` — an idempotent function
 * that walks active contracts and, for each contract whose end_date is
 * EXACTLY {90, 60, 30, 14, 7, 1} days from today, creates a notification
 * for the staff member + their manager + Sachin + Ataybia + HR.
 *
 * Idempotency: a notification with the same (recipient_id, resource_id,
 * resource_type='contract_reminder', title) is treated as already-sent
 * via a duplicate-check before insertion. Run as a daily cron via the
 * `automation` rules engine.
 *
 * Trigger registration: register `module='contract'`, `event='daily_check'`
 * in `lib/automation.ts` and wire the daily check into your scheduler
 * (e.g., a Hono cron route hit by Cloudflare/Render/Vercel cron at 09:00 GYT).
 */

import { and, eq, sql } from "drizzle-orm";
import {
  contracts,
  db,
  notifications,
  staffProfiles,
  user,
} from "@ndma-dcs-staff-portal/db";

import { createNotification } from "./notify";

export const REMINDER_TIERS = [90, 60, 30, 14, 7, 1] as const;
export type ReminderTier = (typeof REMINDER_TIERS)[number];

/** All 6 tiers expressed in days. Master plan §8 Phase 6 AC. */
export function reminderTierForDaysOut(daysOut: number): ReminderTier | null {
  for (const tier of REMINDER_TIERS) {
    if (tier === daysOut) return tier;
  }
  return null;
}

/**
 * Compute calendar-day delta between today and `endDate` (YYYY-MM-DD).
 * Returns positive integer days remaining; 0 = expires today; negative = past.
 */
export function daysUntil(endDate: string, today: Date = new Date()): number {
  const end = new Date(`${endDate}T00:00:00Z`);
  const t = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((end.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

interface ContractRow {
  id: string;
  staffProfileId: string;
  endDate: string;
  renewalReminderDays: number;
}

interface FireResult {
  scanned: number;
  reminded: number;
  skipped: number;
  errors: string[];
}

/**
 * Walk all active contracts, fire reminders for any that fall on a 90/60/30/14/7/1 day mark.
 * Idempotent: re-running on the same day produces no duplicate notifications.
 *
 * @param now - injectable for testing; defaults to current date
 * @returns counts of contracts scanned + reminders fired + skipped
 */
export async function fireContractReminders(
  now: Date = new Date(),
): Promise<FireResult> {
  const result: FireResult = { scanned: 0, reminded: 0, skipped: 0, errors: [] };

  // Pull all contracts whose end_date is within the largest tier window
  const maxTier = REMINDER_TIERS[0]; // 90
  const todayIso = now.toISOString().slice(0, 10);

  const rows = (await db
    .select({
      id: contracts.id,
      staffProfileId: contracts.staffProfileId,
      endDate: contracts.endDate,
      renewalReminderDays: contracts.renewalReminderDays,
    })
    .from(contracts)
    .where(
      and(
        sql`${contracts.endDate} >= ${todayIso}`,
        sql`${contracts.endDate} <= ${todayIso}::date + ${maxTier}::int`,
      ),
    )) as unknown as ContractRow[];

  result.scanned = rows.length;

  for (const row of rows) {
    const days = daysUntil(row.endDate, now);
    const tier = reminderTierForDaysOut(days);
    if (tier === null) {
      result.skipped++;
      continue;
    }

    try {
      // Resolve staff + their manager via reports_to chain
      const staff = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, row.staffProfileId),
      });
      if (!staff) {
        result.errors.push(`No staff profile for contract ${row.id}`);
        continue;
      }

      const recipients = new Set<string>();
      let staffDisplayName = "staff member";
      // Staff member themselves (via user_id)
      const staffUser = await db.query.user.findFirst({
        where: eq(user.id, staff.userId),
      });
      if (staffUser) {
        recipients.add(staffUser.id);
        staffDisplayName = staffUser.name ?? staffDisplayName;
      }

      // Manager via reports_to
      if (staff.reportsTo) {
        const mgrProfile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.id, staff.reportsTo),
        });
        if (mgrProfile) {
          const mgrUser = await db.query.user.findFirst({ where: eq(user.id, mgrProfile.userId) });
          if (mgrUser) recipients.add(mgrUser.id);
        }
      }

      // All hrAdminOps + admin users (HR + Ataybia + Sachin equivalents)
      const adminUsers = await db.query.user.findMany({
        where: sql`${user.role} IN ('admin', 'hrAdminOps')`,
      });
      for (const u of adminUsers) recipients.add(u.id);

      const title = `Contract renewal: ${tier} day(s) until expiry`;
      const body = `Contract ID ${row.id} for ${staffDisplayName} expires on ${row.endDate}.`;

      // Idempotency check: don't double-create the same tier reminder today
      for (const recipientId of recipients) {
        const dupKey = `contract_reminder:${row.id}:${tier}`;
        const existing = await db.query.notifications.findFirst({
          where: and(
            eq(notifications.recipientId, recipientId),
            eq(notifications.resourceType, "contract_reminder"),
            eq(notifications.resourceId, dupKey),
          ),
        });
        if (existing) continue;

        await createNotification({
          recipientId,
          title,
          body,
          module: "contract",
          resourceType: "contract_reminder",
          resourceId: dupKey,
          linkUrl: `/contracts/${row.id}`,
        });
        result.reminded++;
      }
    } catch (err) {
      result.errors.push(`Contract ${row.id}: ${String(err)}`);
    }
  }

  return result;
}
