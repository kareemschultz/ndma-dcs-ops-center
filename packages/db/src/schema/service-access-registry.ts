import { boolean, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { platforms } from "./platforms";
import { staffProfiles } from "./staff";
import { syncAdapterRuns } from "./sync-adapter-runs";

export const serviceAccessRegistry = pgTable(
  "service_access_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    platformId: text("platform_id")
      .notNull()
      .references(() => platforms.id),
    accountUsername: text("account_username"),
    accountType: text("account_type"),
    accountActive: boolean("account_active").default(true),
    privilegeLevel: text("privilege_level"),
    privilegeGroups: text("privilege_groups").array().default([]),
    privilegeCustomNotes: text("privilege_custom_notes"),
    usernameSource: text("username_source").default("manual"),
    accountTypeSource: text("account_type_source").default("manual"),
    privilegeSource: text("privilege_source").default("manual"),
    groupsSource: text("groups_source").default("manual"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncAdapterRunId: text("last_sync_adapter_run_id").references(() => syncAdapterRuns.id),
    manualOverrideReason: text("manual_override_reason"),
    manualOverriddenAt: timestamp("manual_overridden_at"),
    manualOverriddenBy: text("manual_overridden_by").references(() => staffProfiles.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (table) => [unique("service_access_registry_staff_platform_unique").on(table.staffId, table.platformId)],
);
