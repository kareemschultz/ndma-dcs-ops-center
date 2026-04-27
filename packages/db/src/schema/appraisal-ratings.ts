import { integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { appraisals } from "./appraisals";
import { staffProfiles } from "./staff";

// ── appraisal_ratings ─────────────────────────────────────────────────────
// Stores per-category and per-responsibility ratings (1–5) for a given appraisal.

export const appraisalRatings = pgTable(
  "appraisal_ratings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"category" | "responsibility">().notNull(),
    category: text("category"),
    responsibilitySeq: integer("responsibility_seq"),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique("appraisal_ratings_category_unique").on(t.appraisalId, t.category),
    unique("appraisal_ratings_resp_unique").on(t.appraisalId, t.responsibilitySeq),
  ],
);

export const appraisalRatingsRelations = relations(appraisalRatings, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalRatings.appraisalId],
    references: [appraisals.id],
  }),
}));

// ── appraisal_responsibilities ────────────────────────────────────────────

export const appraisalResponsibilities = pgTable(
  "appraisal_responsibilities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("appraisal_resp_unique").on(t.appraisalId, t.seq)],
);

export const appraisalResponsibilitiesRelations = relations(appraisalResponsibilities, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalResponsibilities.appraisalId],
    references: [appraisals.id],
  }),
}));

// ── appraisal_achievements ────────────────────────────────────────────────

export const appraisalAchievements = pgTable(
  "appraisal_achievements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
  },
  (t) => [unique("appraisal_ach_unique").on(t.appraisalId, t.seq)],
);

export const appraisalAchievementsRelations = relations(appraisalAchievements, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalAchievements.appraisalId],
    references: [appraisals.id],
  }),
}));

// ── appraisal_goals ───────────────────────────────────────────────────────

export const appraisalGoals = pgTable(
  "appraisal_goals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
  },
  (t) => [unique("appraisal_goals_unique").on(t.appraisalId, t.seq)],
);

export const appraisalGoalsRelations = relations(appraisalGoals, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalGoals.appraisalId],
    references: [appraisals.id],
  }),
}));

// ── appraisal_signatures ────────────────────────────────────────────────���─

export const appraisalSignerRoleEnum = pgEnum("appraisal_signer_role", [
  "employee",
  "manager_director",
  "hr_manager",
  "deputy_gm",
  "gm",
]);

export const appraisalSignatures = pgTable(
  "appraisal_signatures",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    appraisalId: text("appraisal_id")
      .notNull()
      .references(() => appraisals.id, { onDelete: "cascade" }),
    role: appraisalSignerRoleEnum("role").notNull(),
    signedBy: text("signed_by").references(() => staffProfiles.id, { onDelete: "set null" }),
    signedAt: timestamp("signed_at"),
    signatureSvg: text("signature_svg"),
  },
  (t) => [unique("appraisal_sig_unique").on(t.appraisalId, t.role)],
);

export const appraisalSignaturesRelations = relations(appraisalSignatures, ({ one }) => ({
  appraisal: one(appraisals, {
    fields: [appraisalSignatures.appraisalId],
    references: [appraisals.id],
  }),
  signer: one(staffProfiles, {
    fields: [appraisalSignatures.signedBy],
    references: [staffProfiles.id],
  }),
}));
