import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { platforms } from "./platforms";

export const syncAdapters = pgTable(
  "sync_adapters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    platformId: text("platform_id").references(() => platforms.id),
    adapterType: text("adapter_type"),
    connectionConfig: jsonb("connection_config"),
    syncFrequency: text("sync_frequency").default("manual_trigger_only"),
    enabled: boolean("enabled").default(false),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (table) => [
    uniqueIndex("sync_adapters_platform_id_enabled_idx")
      .on(table.platformId)
      .where(sql`${table.enabled} = true`),
  ],
);
