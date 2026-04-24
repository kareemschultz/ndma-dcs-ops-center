import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const platforms = pgTable("platforms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  category: text("category"),
  authType: text("auth_type"),
  syncMode: text("sync_mode").default("manual_only"),
  syncAdapterId: text("sync_adapter_id"),
  apiCapabilities: jsonb("api_capabilities"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});
