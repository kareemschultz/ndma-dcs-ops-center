import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";
import { syncAdapters } from "./sync-adapters";

export const syncAdapterRuns = pgTable("sync_adapter_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  syncAdapterId: text("sync_adapter_id").references(() => syncAdapters.id),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status"),
  recordsProcessed: integer("records_processed").default(0),
  recordsAdded: integer("records_added").default(0),
  recordsUpdated: integer("records_updated").default(0),
  recordsConflicted: integer("records_conflicted").default(0),
  errorDetail: text("error_detail"),
  triggeredBy: text("triggered_by"),
  triggeredByStaffId: text("triggered_by_staff_id").references(() => staffProfiles.id),
});

export const syncAdapterRunsRelations = relations(syncAdapterRuns, ({ one }) => ({
  syncAdapter: one(syncAdapters, {
    fields: [syncAdapterRuns.syncAdapterId],
    references: [syncAdapters.id],
  }),
  triggeredByStaff: one(staffProfiles, {
    fields: [syncAdapterRuns.triggeredByStaffId],
    references: [staffProfiles.id],
  }),
}));
