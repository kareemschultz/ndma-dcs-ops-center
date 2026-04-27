import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { staffProfiles } from "./staff";
import { user } from "./auth";

export const ppeIssuanceStatusEnum = pgEnum("ppe_issuance_status", [
  "issued",
  "not_issued",
  "n_a",
  "stolen",
  "lost",
  "damaged",
  "returned",
  "replaced",
]);

export const ppeItems = pgTable(
  "ppe_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    description: text("description"),
    defaultSize: text("default_size"),
    hasSize: boolean("has_size").notNull().default(false),
    hasAssetTag: boolean("has_asset_tag").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("ppe_items_code_unique").on(table.code),
    index("ppe_items_isActive_idx").on(table.isActive),
  ],
);

export const ppeIssuances = pgTable(
  "ppe_issuances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ppeItemId: text("ppe_item_id")
      .notNull()
      .references(() => ppeItems.id, { onDelete: "cascade" }),
    staffProfileId: text("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    issuedById: text("issued_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    returnedById: text("returned_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    serialNumber: text("serial_number"),
    assetTag: text("asset_tag"),
    size: text("size"),
    issuedDate: date("issued_date").notNull(),
    dueDate: date("due_date"),
    returnedDate: date("returned_date"),
    condition: text("condition").notNull().default("good"),
    status: ppeIssuanceStatusEnum("status").notNull().default("issued"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("ppe_issuances_staff_item_date_unique").on(
      table.staffProfileId,
      table.ppeItemId,
      table.issuedDate,
    ),
    index("ppe_issuances_staffProfileId_idx").on(table.staffProfileId),
    index("ppe_issuances_ppeItemId_idx").on(table.ppeItemId),
    index("ppe_issuances_status_idx").on(table.status),
    index("ppe_issuances_dueDate_idx").on(table.dueDate),
  ],
);

export const ppeItemsRelations = relations(ppeItems, ({ many }) => ({
  issuances: many(ppeIssuances),
}));

export const ppeIssuancesRelations = relations(ppeIssuances, ({ one }) => ({
  ppeItem: one(ppeItems, {
    fields: [ppeIssuances.ppeItemId],
    references: [ppeItems.id],
  }),
  staffProfile: one(staffProfiles, {
    fields: [ppeIssuances.staffProfileId],
    references: [staffProfiles.id],
  }),
  issuedBy: one(user, {
    fields: [ppeIssuances.issuedById],
    references: [user.id],
    relationName: "ppeIssuanceIssuedBy",
  }),
  returnedBy: one(user, {
    fields: [ppeIssuances.returnedById],
    references: [user.id],
    relationName: "ppeIssuanceReturnedBy",
  }),
}));
