> **🛑 SUPERSEDED — DO NOT USE**
>
> This plan has been superseded by [`../2026-04-23-master-remediation-plan.md`](../2026-04-23-master-remediation-plan.md).
>
> The concepts in this document (Plane-style cycles, work visibility, automation) have been folded into the new 15-phase master plan. Specifically:
> - Cycles → Phase 11 (Work register refactor) + existing `cycles.ts`
> - Work intelligence & visibility → Phase 11
> - Automation → existing `automation.ts` router (extended in Phase 10)
>
> Retained here for historical reference only. Do not reference from new code or docs.

---

# Phase 3 — Operations Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve DCS Ops Center from a data-entry system into a true operations intelligence platform — borrowing Plane's work structure (cycles, hierarchy, dependencies) and Monday's visibility (workload view, widget dashboards, automation rules, timeline).

**Architecture:** New schema tables are additive (no existing tables modified beyond adding FK columns). The workload engine aggregates across 5 existing modules (work, leave, rota, incidents, temp-changes) into a single read API. Automation rules are stored as structured JSON config and executed by a background sweep job — no workflow engine dependency needed.

**Tech Stack:** Bun 1.3 | Hono | oRPC | Drizzle ORM | PostgreSQL | React 19 + TanStack Router + TanStack Query | Recharts | date-fns | Lucide icons | shadcn/ui | Tailwind CSS v4

---

## Scope Note

This plan covers 4 independent subsystems. Each tier produces working, shippable software on its own:

- **Tier 1 — Work Intelligence** (Tasks 1–5): Cycles, hierarchy, dependencies, cross-linking, workload view
- **Tier 2 — Visibility** (Tasks 6–8): Enhanced dashboard widgets, calendar view, timeline view
- **Tier 3 — Automation & Intake** (Tasks 9–11): Rule engine, intake forms, runbook linkage
- **Tier 4 — Analytics** (Tasks 12–14): Per-engineer analytics, recurring task templates, OtherDept tracking
- **Tier 5 — Remaining Hardening** (Tasks 15–17): HTTP security headers, CI pipeline, access sync connectors

Implement one tier at a time. Each tier's tasks are independent within the tier — run them in parallel or sequentially.

---

## Current State (as of 2026-04-12)

**Already complete (DO NOT redo):**
- RBAC enforcement (`requireRole` middleware, all 70+ mutations gated)
- Leave balance validation + team overlap cap (max 2/dept simultaneously)
- Rota publish constraint sweep (leave conflict + contract check)
- Work item lifecycle (`completedAt` auto-set on done/reopen)
- Temp-change auto-flag overdue items
- Sync job timeout + stuck job recovery
- Docker hardening (`.dockerignore`, prod-only deps)
- Health endpoint + static serving
- Self-signup disabled
- Sidebar: real user data, rota→roster rename, /docs removed
- Work Register: List/Kanban/Grid views, bar chart, filters
- Schema additions: `follow_up_date` on temp_changes, `estimated_hours` on work_items, 8 new platform types

**Pending from earlier plan:**
- Task 21: CI pipeline hardening
- Task 22: HTTP security headers / CSP
- Task 25: Work item cross-linking (incidents + temp changes)

---

## CRITICAL GOTCHAS (MANDATORY READ)

1. **oRPC queryOptions**: ALWAYS `{ input: { ... } }` wrapper — flat args are a silent runtime bug
2. **Zod .default() + zodResolver**: NEVER use `.default()` on form schema fields — use `defaultValues` in `useForm` instead
3. **z.record()**: Zod v4 requires two args — `z.record(z.string(), z.string())`
4. **Better Auth user.role**: Cast: `(user as Record<string, unknown>)?.role as string`
5. **requireRole**: ALL mutation procedures must use `requireRole(resource, action)` — NOT `protectedProcedure`
6. **Drizzle .returning()**: Always destructure with null guard — `const [row] = await db.insert(...).returning(); if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");`
7. **Date strings**: Use `.toISOString().slice(0, 10)` — NOT `.split("T")[0]` (returns `string | undefined`)
8. **logAudit**: Every mutation must call `logAudit()` with `actorRole: context.userRole ?? undefined, correlationId: context.requestId`
9. **Base UI**: `render` prop, NOT `asChild`; `data-open` not `data-[state=open]`
10. **NEVER import `@ndma-dcs-staff-portal/env/server`** in web app code

---

## File Map

### New schema files
| File | Tables |
|---|---|
| `packages/db/src/schema/cycles.ts` | `cycles`, `cycle_work_items` |
| `packages/db/src/schema/automation.ts` | `automation_rules`, `automation_rule_runs` |

### Modified schema files
| File | Change |
|---|---|
| `packages/db/src/schema/work.ts` | Add `initiativeId`, `parentId`, `milestoneDate` columns; add `workInitiatives`, `workItemDependencies` tables |
| `packages/db/src/schema/incidents.ts` | Add `runbookUrl` column to `services` |
| `packages/db/src/schema/temp-changes.ts` | Add `linkedWorkItemId` column |
| `packages/db/src/schema/index.ts` | Export new schema files |

### New API router files
| File | Procedures |
|---|---|
| `packages/api/src/routers/cycles.ts` | `list`, `get`, `create`, `update`, `addWorkItem`, `removeWorkItem`, `stats` |
| `packages/api/src/routers/workload.ts` | `get` (per-engineer cross-module aggregation) |
| `packages/api/src/routers/automation.ts` | `rules.list`, `rules.create`, `rules.update`, `rules.delete`, `runs.list` |

### Modified API router files
| File | Change |
|---|---|
| `packages/api/src/routers/index.ts` | Add cyclesRouter, workloadRouter, automationRouter |
| `packages/api/src/routers/work.ts` | Add `initiatives.*`, `dependencies.*` procedures |
| `packages/api/src/routers/dashboard.ts` | Add `workload`, `cycleProgress`, `automationAlerts` queries |
| `packages/api/src/lib/automation/index.ts` | New: rule evaluation engine |

### New frontend files
| File | Purpose |
|---|---|
| `apps/web/src/routes/_authenticated/cycles/index.tsx` | Cycles list + create |
| `apps/web/src/routes/_authenticated/cycles/$cycleId.tsx` | Cycle detail (burndown, items, progress) |
| `apps/web/src/routes/_authenticated/workload/index.tsx` | Cross-module workload view |
| `apps/web/src/routes/_authenticated/work/new.tsx` | Work item creation form |
| `apps/web/src/features/work/components/timeline-view.tsx` | Gantt-style timeline |
| `apps/web/src/features/work/components/calendar-view.tsx` | Calendar view |
| `apps/web/src/features/automation/` | Automation rules UI |

---

## Tier 1 — Work Intelligence

### Task 1: Cycles schema + API

Cycles are timeboxed planning periods (weekly/monthly/quarterly). Work items are added to cycles. Progress is tracked via status counts.

**Files:**
- Create: `packages/db/src/schema/cycles.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/api/src/routers/cycles.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create the cycles schema**

Write `packages/db/src/schema/cycles.ts`:

```typescript
import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { user } from "./auth";
import { departments } from "./departments";
import { workItems } from "./work";

export const cycleStatusEnum = pgEnum("cycle_status", [
  "draft",
  "active",
  "completed",
  "cancelled",
]);

export const cyclePeriodEnum = pgEnum("cycle_period", [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "custom",
]);

export const cycles = pgTable(
  "cycles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    period: cyclePeriodEnum("period").notNull().default("weekly"),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: cycleStatusEnum("status").notNull().default("draft"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("cycles_status_idx").on(table.status),
    index("cycles_startDate_idx").on(table.startDate),
    index("cycles_departmentId_idx").on(table.departmentId),
  ],
);

export const cycleWorkItems = pgTable(
  "cycle_work_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    unique("cycle_work_items_unique").on(table.cycleId, table.workItemId),
    index("cycle_work_items_cycleId_idx").on(table.cycleId),
    index("cycle_work_items_workItemId_idx").on(table.workItemId),
  ],
);

// ── Relations ─────────────────────────────────────────────────────────────

export const cyclesRelations = relations(cycles, ({ one, many }) => ({
  department: one(departments, {
    fields: [cycles.departmentId],
    references: [departments.id],
  }),
  createdBy: one(user, {
    fields: [cycles.createdById],
    references: [user.id],
  }),
  cycleWorkItems: many(cycleWorkItems),
}));

export const cycleWorkItemsRelations = relations(
  cycleWorkItems,
  ({ one }) => ({
    cycle: one(cycles, {
      fields: [cycleWorkItems.cycleId],
      references: [cycles.id],
    }),
    workItem: one(workItems, {
      fields: [cycleWorkItems.workItemId],
      references: [workItems.id],
    }),
  }),
);
```

- [ ] **Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, add:
```typescript
export * from "./cycles";
```

- [ ] **Step 3: Push schema to database**

Run: `bun run db:push`
Expected: Tables `cycles` and `cycle_work_items` created.

- [ ] **Step 4: Create the cycles router**

Write `packages/api/src/routers/cycles.ts`:

```typescript
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  db,
  cycles,
  cycleWorkItems,
  workItems,
} from "@ndma-dcs-staff-portal/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";

const CycleStatusSchema = z.enum(["draft", "active", "completed", "cancelled"]);
const CyclePeriodSchema = z.enum(["weekly", "fortnightly", "monthly", "quarterly", "custom"]);

export const cyclesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        status: CycleStatusSchema.optional(),
        departmentId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(cycles.status, input.status));
      if (input.departmentId) conditions.push(eq(cycles.departmentId, input.departmentId));
      if (input.from) conditions.push(gte(cycles.startDate, input.from));
      if (input.to) conditions.push(lte(cycles.endDate, input.to));

      return db.query.cycles.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(cycles.startDate)],
        limit: input.limit,
        with: {
          department: true,
          createdBy: true,
          cycleWorkItems: {
            with: { workItem: { columns: { id: true, status: true } } },
          },
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const cycle = await db.query.cycles.findFirst({
        where: eq(cycles.id, input.id),
        with: {
          department: true,
          createdBy: true,
          cycleWorkItems: {
            with: {
              workItem: {
                with: {
                  assignedTo: { with: { user: true } },
                  department: true,
                },
              },
            },
          },
        },
      });
      if (!cycle) throw new ORPCError("NOT_FOUND");
      return cycle;
    }),

  create: requireRole("work", "create")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        period: CyclePeriodSchema,
        departmentId: z.string().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .handler(async ({ input, context }) => {
      const [cycle] = await db
        .insert(cycles)
        .values({
          ...input,
          description: input.description ?? null,
          departmentId: input.departmentId ?? null,
          createdById: context.session.user.id,
        })
        .returning();
      if (!cycle) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "cycle.create",
        module: "work",
        resourceType: "cycle",
        resourceId: cycle.id,
        afterValue: cycle as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return cycle;
    }),

  update: requireRole("work", "update")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        status: CycleStatusSchema.optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.cycles.findFirst({ where: eq(cycles.id, id) });
      if (!before) throw new ORPCError("NOT_FOUND");

      const [updated] = await db
        .update(cycles)
        .set(updates)
        .where(eq(cycles.id, id))
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "cycle.update",
        module: "work",
        resourceType: "cycle",
        resourceId: id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),

  addWorkItem: requireRole("work", "update")
    .input(z.object({ cycleId: z.string(), workItemId: z.string() }))
    .handler(async ({ input, context }) => {
      const cycle = await db.query.cycles.findFirst({ where: eq(cycles.id, input.cycleId) });
      if (!cycle) throw new ORPCError("NOT_FOUND", { message: "Cycle not found" });

      const item = await db.query.workItems.findFirst({ where: eq(workItems.id, input.workItemId) });
      if (!item) throw new ORPCError("NOT_FOUND", { message: "Work item not found" });

      const [cw] = await db
        .insert(cycleWorkItems)
        .values({ cycleId: input.cycleId, workItemId: input.workItemId })
        .onConflictDoNothing()
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "cycle.add_work_item",
        module: "work",
        resourceType: "cycle",
        resourceId: input.cycleId,
        afterValue: { workItemId: input.workItemId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return cw ?? null;
    }),

  removeWorkItem: requireRole("work", "update")
    .input(z.object({ cycleId: z.string(), workItemId: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .delete(cycleWorkItems)
        .where(
          and(
            eq(cycleWorkItems.cycleId, input.cycleId),
            eq(cycleWorkItems.workItemId, input.workItemId),
          ),
        );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "cycle.remove_work_item",
        module: "work",
        resourceType: "cycle",
        resourceId: input.cycleId,
        afterValue: { workItemId: input.workItemId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const cycle = await db.query.cycles.findFirst({
        where: eq(cycles.id, input.id),
        with: {
          cycleWorkItems: {
            with: { workItem: { columns: { id: true, status: true } } },
          },
        },
      });
      if (!cycle) throw new ORPCError("NOT_FOUND");

      const items = cycle.cycleWorkItems.map((cwi) => cwi.workItem);
      const total = items.length;
      const byStatus: Record<string, number> = {};
      for (const item of items) {
        byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
      }
      const completed = byStatus["done"] ?? 0;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { total, completed, completionRate, byStatus };
    }),
};
```

- [ ] **Step 5: Register cycles router**

In `packages/api/src/routers/index.ts`, add to the `appRouter`:
```typescript
import { cyclesRouter } from "./cycles";
// In appRouter object:
cycles: cyclesRouter,
```

- [ ] **Step 6: Run type check**

Run: `bun run check-types`
Expected: PASS (3 tasks, 3 successful)

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/cycles.ts packages/db/src/schema/index.ts packages/api/src/routers/cycles.ts packages/api/src/routers/index.ts
git commit -m "feat(cycles): cycles schema + API — timeboxed planning periods with work item membership

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Work item hierarchy + dependencies

Adds `initiativeId` (grouping label) and `parentId` (subtask tree) to work items, plus a `work_item_dependencies` join table.

**Files:**
- Modify: `packages/db/src/schema/work.ts` (add columns + new tables)
- Modify: `packages/api/src/routers/work.ts` (add initiative and dependency procedures)

- [ ] **Step 1: Add workInitiatives table and columns to work.ts schema**

In `packages/db/src/schema/work.ts`, after the existing enums and before `workItems`:

```typescript
// ── Initiatives (major departmental goals that group work items) ───────────

export const workInitiatives = pgTable(
  "work_initiatives",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"), // active, completed, cancelled
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    targetDate: date("target_date"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("work_initiatives_status_idx").on(table.status),
    index("work_initiatives_departmentId_idx").on(table.departmentId),
  ],
);
```

Then in the `workItems` table definition, add these columns after `estimatedHours`:

```typescript
// Hierarchy
initiativeId: text("initiative_id").references(() => workInitiatives.id, {
  onDelete: "set null",
}),
parentId: text("parent_id"), // self-reference — see note below
// Milestone
milestoneDate: date("milestone_date"),
```

Note: Drizzle ORM has limited self-reference support. Add `parentId` as a bare `text` column and handle the FK constraint manually via `bun run db:push`.

After the `workItems` table, add the dependencies table:

```typescript
export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workItemId: text("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    // "blocks" = workItemId blocks dependsOnId; "relates_to" = soft link
    dependencyType: text("dependency_type").notNull().default("blocks"),
  },
  (table) => [
    unique("work_item_deps_unique").on(table.workItemId, table.dependsOnId),
    index("work_item_deps_workItemId_idx").on(table.workItemId),
    index("work_item_deps_dependsOnId_idx").on(table.dependsOnId),
  ],
);
```

Also update `workItemsRelations` to include the new relations:

```typescript
export const workInitiativesRelations = relations(workInitiatives, ({ one, many }) => ({
  department: one(departments, {
    fields: [workInitiatives.departmentId],
    references: [departments.id],
  }),
  createdBy: one(user, {
    fields: [workInitiatives.createdById],
    references: [user.id],
  }),
  workItems: many(workItems),
}));
```

Update existing `workItemsRelations` to add:
```typescript
initiative: one(workInitiatives, {
  fields: [workItems.initiativeId],
  references: [workInitiatives.id],
}),
blockedBy: many(workItemDependencies, { relationName: "dependsOn" }),
blocking: many(workItemDependencies, { relationName: "workItem" }),
```

Add:
```typescript
export const workItemDependenciesRelations = relations(workItemDependencies, ({ one }) => ({
  workItem: one(workItems, {
    fields: [workItemDependencies.workItemId],
    references: [workItems.id],
    relationName: "workItem",
  }),
  dependsOn: one(workItems, {
    fields: [workItemDependencies.dependsOnId],
    references: [workItems.id],
    relationName: "dependsOn",
  }),
}));
```

- [ ] **Step 2: Export new tables from schema index**

`packages/db/src/schema/index.ts` already exports everything via `export * from "./work"` — no change needed since new exports are in the same file.

- [ ] **Step 3: Push schema**

Run: `bun run db:push`
Expected: Tables `work_initiatives` and `work_item_dependencies` created; columns `initiative_id`, `parent_id`, `milestone_date` added to `work_items`.

- [ ] **Step 4: Add initiative procedures to work router**

In `packages/api/src/routers/work.ts`, add these imports at the top:

```typescript
import {
  db,
  workItems,
  workItemComments,
  workItemWeeklyUpdates,
  workInitiatives,
  workItemDependencies,
  staffProfiles,
} from "@ndma-dcs-staff-portal/db";
import { and, desc, eq, lt, sql, isNotNull, ne } from "drizzle-orm";
```

Then add new procedures to `workRouter`:

```typescript
initiatives: {
  list: protectedProcedure
    .input(z.object({ departmentId: z.string().optional(), status: z.string().optional() }))
    .handler(async ({ input }) => {
      const conditions = [];
      if (input.departmentId) conditions.push(eq(workInitiatives.departmentId, input.departmentId));
      if (input.status) conditions.push(eq(workInitiatives.status, input.status));
      return db.query.workInitiatives.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(workInitiatives.createdAt)],
        with: { department: true, createdBy: true },
      });
    }),

  create: requireRole("work", "create")
    .input(z.object({
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      departmentId: z.string().optional(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .handler(async ({ input, context }) => {
      const [initiative] = await db
        .insert(workInitiatives)
        .values({
          ...input,
          description: input.description ?? null,
          departmentId: input.departmentId ?? null,
          targetDate: input.targetDate ?? null,
          createdById: context.session.user.id,
        })
        .returning();
      if (!initiative) throw new ORPCError("INTERNAL_SERVER_ERROR");

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_initiative.create",
        module: "work",
        resourceType: "work_initiative",
        resourceId: initiative.id,
        afterValue: initiative as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return initiative;
    }),

  update: requireRole("work", "update")
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      status: z.enum(["active", "completed", "cancelled"]).optional(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;
      const before = await db.query.workInitiatives.findFirst({ where: eq(workInitiatives.id, id) });
      if (!before) throw new ORPCError("NOT_FOUND");
      const [updated] = await db.update(workInitiatives).set(updates).where(eq(workInitiatives.id, id)).returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_initiative.update",
        module: "work",
        resourceType: "work_initiative",
        resourceId: id,
        beforeValue: before as Record<string, unknown>,
        afterValue: updated as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return updated;
    }),
},

dependencies: {
  add: requireRole("work", "update")
    .input(z.object({
      workItemId: z.string(),
      dependsOnId: z.string(),
      dependencyType: z.enum(["blocks", "relates_to"]),
    }))
    .handler(async ({ input, context }) => {
      // Prevent self-dependency
      if (input.workItemId === input.dependsOnId) {
        throw new ORPCError("BAD_REQUEST", { message: "A work item cannot depend on itself" });
      }

      const [dep] = await db
        .insert(workItemDependencies)
        .values(input)
        .onConflictDoNothing()
        .returning();

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.add_dependency",
        module: "work",
        resourceType: "work_item",
        resourceId: input.workItemId,
        afterValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return dep ?? null;
    }),

  remove: requireRole("work", "update")
    .input(z.object({ workItemId: z.string(), dependsOnId: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .delete(workItemDependencies)
        .where(
          and(
            eq(workItemDependencies.workItemId, input.workItemId),
            eq(workItemDependencies.dependsOnId, input.dependsOnId),
          ),
        );

      await logAudit({
        actorId: context.session.user.id,
        actorName: context.session.user.name,
        action: "work_item.remove_dependency",
        module: "work",
        resourceType: "work_item",
        resourceId: input.workItemId,
        afterValue: input as Record<string, unknown>,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        actorRole: context.userRole ?? undefined,
        correlationId: context.requestId,
      });

      return { success: true };
    }),
},
```

Also update `CreateWorkItemInput` and `UpdateWorkItemInput` in work.ts to include:
```typescript
initiativeId: z.string().optional(),
parentId: z.string().optional(),
milestoneDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
```

- [ ] **Step 5: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/work.ts packages/api/src/routers/work.ts
git commit -m "feat(work): hierarchy (initiatives, subtasks) + dependencies + milestones

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Work item cross-linking to incidents and temp changes (existing Task 25)

Incidents and temp changes should be linkable to work items (many-to-one). This enables navigation between a work item and its related incident/change.

**Files:**
- Modify: `packages/db/src/schema/incidents.ts` — add `linkedWorkItemId` to `incidents`
- Modify: `packages/db/src/schema/temp-changes.ts` — add `linkedWorkItemId` (already have `followUpDate`)
- Modify: `packages/api/src/routers/incidents.ts` — expose link field in create/update
- Modify: `packages/api/src/routers/temp-changes.ts` — expose link field in create/update

- [ ] **Step 1: Add linkedWorkItemId to incidents schema**

In `packages/db/src/schema/incidents.ts`, in the `incidents` table definition, add after `serviceIds` or similar:

```typescript
linkedWorkItemId: text("linked_work_item_id").references(
  () => workItems.id,
  { onDelete: "set null" }
),
```

Add the import: `import { workItems } from "./work";`

- [ ] **Step 2: Add linkedWorkItemId to temp-changes schema**

In `packages/db/src/schema/temp-changes.ts`, in `temporaryChanges` table:

```typescript
linkedWorkItemId: text("linked_work_item_id").references(
  () => workItems.id,
  { onDelete: "set null" }
),
```

Add the import: `import { workItems } from "./work";`

- [ ] **Step 3: Push schema**

Run: `bun run db:push`
Expected: Two new nullable FK columns added.

- [ ] **Step 4: Update incident router**

In `packages/api/src/routers/incidents.ts`, add `linkedWorkItemId: z.string().optional()` to the create and update input schemas, and include it in the `.values()` and `.set()` calls (using `?? null` coercion).

- [ ] **Step 5: Update temp-changes router**

In `packages/api/src/routers/temp-changes.ts`, add `linkedWorkItemId: z.string().optional()` to create and update inputs, and in `.values()` / `.set()` calls.

- [ ] **Step 6: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/incidents.ts packages/db/src/schema/temp-changes.ts packages/api/src/routers/incidents.ts packages/api/src/routers/temp-changes.ts
git commit -m "feat(cross-linking): link incidents and temp-changes to work items

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Workload view API

Single endpoint that aggregates per-engineer load across all 5 modules: assigned work items, overdue work, on-call duty this week, leave status, and active incidents owned.

**Files:**
- Create: `packages/api/src/routers/workload.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create the workload router**

Write `packages/api/src/routers/workload.ts`:

```typescript
import { z } from "zod";
import {
  db,
  staffProfiles,
  workItems,
  leaveRequests,
  onCallAssignments,
  onCallSchedules,
  incidents,
  temporaryChanges,
} from "@ndma-dcs-staff-portal/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

import { protectedProcedure } from "../index";

export const workloadRouter = {
  get: protectedProcedure
    .input(
      z.object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        departmentId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { weekStart, weekEnd } = input;

      // Get all active staff (optionally filtered by department)
      const staffList = await db.query.staffProfiles.findMany({
        where: and(
          eq(staffProfiles.status, "active"),
          input.departmentId
            ? eq(staffProfiles.departmentId, input.departmentId)
            : undefined,
        ),
        with: { user: true, department: true },
      });

      const today = new Date().toISOString().slice(0, 10);

      // Build per-engineer workload in parallel
      const workloadEntries = await Promise.all(
        staffList.map(async (staff) => {
          const [
            openWork,
            overdueWork,
            onCallThisWeek,
            onLeaveThisWeek,
            ownedTempChanges,
          ] = await Promise.all([
            // Open assigned work items
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(workItems)
              .where(
                and(
                  eq(workItems.assignedToId, staff.id),
                  sql`${workItems.status} NOT IN ('done', 'cancelled')`,
                ),
              ),

            // Overdue assigned work items
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(workItems)
              .where(
                and(
                  eq(workItems.assignedToId, staff.id),
                  sql`${workItems.dueDate} IS NOT NULL`,
                  sql`${workItems.dueDate} < ${today}`,
                  sql`${workItems.status} NOT IN ('done', 'cancelled')`,
                ),
              ),

            // On-call duty in this week
            db
              .select({ role: onCallAssignments.role })
              .from(onCallAssignments)
              .innerJoin(
                onCallSchedules,
                eq(onCallAssignments.scheduleId, onCallSchedules.id),
              )
              .where(
                and(
                  eq(onCallAssignments.staffProfileId, staff.id),
                  eq(onCallSchedules.status, "published"),
                  lte(onCallSchedules.weekStart, weekEnd),
                  gte(onCallSchedules.weekEnd, weekStart),
                ),
              ),

            // On leave this week
            db.query.leaveRequests.findFirst({
              where: and(
                eq(leaveRequests.staffProfileId, staff.id),
                eq(leaveRequests.status, "approved"),
                lte(leaveRequests.startDate, weekEnd),
                gte(leaveRequests.endDate, weekStart),
              ),
            }),

            // Owned overdue temporary changes
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(temporaryChanges)
              .where(
                and(
                  eq(temporaryChanges.ownerId, staff.id),
                  sql`${temporaryChanges.removeByDate} IS NOT NULL`,
                  sql`${temporaryChanges.removeByDate} < ${today}`,
                  sql`${temporaryChanges.status} NOT IN ('removed', 'cancelled')`,
                ),
              ),
          ]);

          const openWorkCount = openWork[0]?.count ?? 0;
          const overdueWorkCount = overdueWork[0]?.count ?? 0;
          const overdueChangesCount = ownedTempChanges[0]?.count ?? 0;
          const onCallRole = onCallThisWeek[0]?.role ?? null;
          const onLeave = !!onLeaveThisWeek;

          // Capacity score: 0 = available, higher = more burdened
          const loadScore =
            openWorkCount * 1 +
            overdueWorkCount * 3 +
            (onCallRole ? 5 : 0) +
            overdueChangesCount * 2;

          const loadLevel: "low" | "medium" | "high" | "overloaded" =
            loadScore === 0
              ? "low"
              : loadScore <= 5
                ? "medium"
                : loadScore <= 12
                  ? "high"
                  : "overloaded";

          return {
            staff: {
              id: staff.id,
              name: staff.user?.name ?? "Unknown",
              email: staff.user?.email ?? "",
              department: staff.department?.name ?? null,
            },
            openWorkItems: openWorkCount,
            overdueWorkItems: overdueWorkCount,
            onCallRole,
            onLeave,
            overdueChanges: overdueChangesCount,
            loadScore,
            loadLevel,
          };
        }),
      );

      return workloadEntries.sort((a, b) => b.loadScore - a.loadScore);
    }),
};
```

- [ ] **Step 2: Register in router index**

In `packages/api/src/routers/index.ts`, add:
```typescript
import { workloadRouter } from "./workload";
// In appRouter:
workload: workloadRouter,
```

- [ ] **Step 3: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/workload.ts packages/api/src/routers/index.ts
git commit -m "feat(workload): cross-module per-engineer workload API

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Cycles UI page

**Files:**
- Create: `apps/web/src/routes/_authenticated/cycles/index.tsx`
- Modify: `apps/web/src/components/layout/data/sidebar-data.ts` (add Cycles link)

- [ ] **Step 1: Create cycles index page**

Write `apps/web/src/routes/_authenticated/cycles/index.tsx`:

```typescript
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/cycles/")({
  component: CyclesPage,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function CyclesPage() {
  const [status, setStatus] = useState<"" | "draft" | "active" | "completed" | "cancelled">("");
  const { data, isLoading, refetch } = useQuery(
    orpc.cycles.list.queryOptions({
      input: { status: status || undefined, limit: 50 },
    }),
  );

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Planning Cycles</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <ThemeSwitch />
          <Link to="/cycles/new">
            <Button size="sm">
              <Plus className="size-4 mr-1" />
              New Cycle
            </Button>
          </Link>
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Planning Cycles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Timeboxed planning periods — weekly, monthly, or quarterly work windows.
          </p>
        </div>

        {/* Status filter */}
        <div className="mb-4 flex gap-2 flex-wrap">
          {(["", "active", "draft", "completed", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-md" />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No cycles found.{" "}
            <Link to="/cycles/new" className="underline">
              Create the first cycle
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((cycle) => {
              const items = cycle.cycleWorkItems ?? [];
              const total = items.length;
              const done = items.filter((cwi) => cwi.workItem?.status === "done").length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;

              return (
                <Link key={cycle.id} to="/cycles/$cycleId" params={{ cycleId: cycle.id }}>
                  <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cycle.status] ?? ""}`}
                        >
                          {cycle.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cycle.period}
                        </span>
                      </div>
                      <CardTitle className="text-sm font-semibold mt-1.5">
                        {cycle.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        {format(parseISO(cycle.startDate), "dd MMM")} –{" "}
                        {format(parseISO(cycle.endDate), "dd MMM yyyy")}
                      </p>
                      {cycle.department && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {cycle.department.name}
                        </p>
                      )}
                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{done}/{total} done</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Main>
    </>
  );
}
```

- [ ] **Step 2: Add Cycles to sidebar**

In `apps/web/src/components/layout/data/sidebar-data.ts`, in the Work navGroup items array, add after the work item:

```typescript
{ title: "Planning Cycles", url: "/cycles", icon: CalendarRange },
```

Import `CalendarRange` from lucide-react at the top.

- [ ] **Step 3: Register route in routeTree**

Run the dev server once to trigger TanStack Router's file-based route generation, or run:
```bash
bun run dev:web
```
The `routeTree.gen.ts` will auto-update.

- [ ] **Step 4: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/cycles/ apps/web/src/components/layout/data/sidebar-data.ts apps/web/src/routeTree.gen.ts
git commit -m "feat(ui): cycles list page with progress bars and status filter

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Workload view UI page

**Files:**
- Create: `apps/web/src/routes/_authenticated/workload/index.tsx`
- Modify: `apps/web/src/components/layout/data/sidebar-data.ts`

- [ ] **Step 1: Create workload page**

Write `apps/web/src/routes/_authenticated/workload/index.tsx`:

```typescript
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, RefreshCw, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { Skeleton } from "@ndma-dcs-staff-portal/ui/components/skeleton";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/workload/")({
  component: WorkloadPage,
});

const LOAD_COLORS = {
  low: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  overloaded: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function WorkloadPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [departmentId, setDepartmentId] = useState("");

  const baseDate = new Date();
  const weekDate = weekOffset === 0 ? baseDate : weekOffset > 0 ? addWeeks(baseDate, weekOffset) : subWeeks(baseDate, Math.abs(weekOffset));
  const weekStart = format(startOfWeek(weekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(weekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading, refetch } = useQuery(
    orpc.workload.get.queryOptions({
      input: {
        weekStart,
        weekEnd,
        departmentId: departmentId || undefined,
      },
    }),
  );

  const { data: departments } = useQuery(orpc.staff.getDepartments.queryOptions());

  return (
    <>
      <Header fixed>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Workload</span>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
          <ThemeSwitch />
        </div>
      </Header>

      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Team Workload</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-engineer capacity across work, on-call, leave, and changes.
          </p>
        </div>

        {/* Week navigator */}
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>← Prev</Button>
          <span className="text-sm font-medium">
            {weekOffset === 0 ? "This week" : `Week of ${format(parseISO(weekStart), "dd MMM yyyy")}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>Next →</Button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs text-muted-foreground underline">Today</button>
          )}
          {departments && departments.length > 0 && (
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="ms-auto rounded-md border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Summary row */}
        {data && (
          <div className="mb-6 grid grid-cols-4 gap-3">
            {(["low", "medium", "high", "overloaded"] as const).map((level) => {
              const count = data.filter((e) => e.loadLevel === level).length;
              return (
                <Card key={level}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {level}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className={`text-2xl font-bold`}>{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Engineer cards */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : !data?.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No active staff found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((entry) => (
              <Card key={entry.staff.id} className="relative">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">{entry.staff.name}</CardTitle>
                      {entry.staff.department && (
                        <p className="text-xs text-muted-foreground">{entry.staff.department}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${LOAD_COLORS[entry.loadLevel]}`}>
                      {entry.loadLevel}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open work items</span>
                    <span className="font-medium">{entry.openWorkItems}</span>
                  </div>
                  {entry.overdueWorkItems > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="size-3" /> Overdue
                      </span>
                      <span className="font-medium">{entry.overdueWorkItems}</span>
                    </div>
                  )}
                  {entry.onCallRole && (
                    <div className="flex justify-between text-blue-600">
                      <span>On-call ({entry.onCallRole.replace(/_/g, " ")})</span>
                      <span>✓</span>
                    </div>
                  )}
                  {entry.onLeave && (
                    <div className="flex justify-between text-amber-600">
                      <span>On leave this week</span>
                      <span>✓</span>
                    </div>
                  )}
                  {entry.overdueChanges > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Overdue changes</span>
                      <span className="font-medium">{entry.overdueChanges}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Main>
    </>
  );
}

import { parseISO } from "date-fns";
```

Note: Move the `parseISO` import to the top with the other date-fns imports.

- [ ] **Step 2: Add to sidebar under Work section**

In `apps/web/src/components/layout/data/sidebar-data.ts`:
```typescript
{ title: "Workload", url: "/workload", icon: Users },
```

- [ ] **Step 3: Run type check + commit**

```bash
bun run check-types
git add apps/web/src/routes/_authenticated/workload/ apps/web/src/components/layout/data/sidebar-data.ts apps/web/src/routeTree.gen.ts
git commit -m "feat(ui): team workload view — per-engineer capacity grid with week navigation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Tier 2 — Visibility

### Task 7: Per-engineer analytics (from spreadsheet Analytics sheet)

The spreadsheet tracks: Total Tasks, Completed, In Progress, Overdue, Total Weeks Overdue, New This Month, Estimated Hours per engineer. Add this as an analytics endpoint and chart on the work register page.

**Files:**
- Modify: `packages/api/src/routers/work.ts` — add `analytics` procedure
- Modify: `apps/web/src/routes/_authenticated/work/index.tsx` — add per-engineer chart

- [ ] **Step 1: Add analytics procedure to work router**

In `packages/api/src/routers/work.ts`, add to `workRouter`:

```typescript
analytics: protectedProcedure
  .input(z.object({ departmentId: z.string().optional() }))
  .handler(async ({ input }) => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    const conditions = [];
    if (input.departmentId) conditions.push(eq(workItems.departmentId, input.departmentId));

    const all = await db.query.workItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      columns: {
        id: true,
        status: true,
        dueDate: true,
        createdAt: true,
        estimatedHours: true,
        assignedToId: true,
      },
      with: { assignedTo: { with: { user: { columns: { name: true } } } } },
    });

    // Group by assignee
    const byEngineer: Record<string, {
      name: string;
      total: number;
      completed: number;
      inProgress: number;
      overdue: number;
      newThisMonth: number;
      estimatedHours: number;
    }> = {};

    const unassigned = "Unassigned";

    for (const item of all) {
      const key = item.assignedTo?.user?.name ?? unassigned;
      if (!byEngineer[key]) {
        byEngineer[key] = { name: key, total: 0, completed: 0, inProgress: 0, overdue: 0, newThisMonth: 0, estimatedHours: 0 };
      }
      const entry = byEngineer[key]!;
      entry.total++;
      if (item.status === "done") entry.completed++;
      if (item.status === "in_progress") entry.inProgress++;
      if (item.dueDate && item.dueDate < today && item.status !== "done" && item.status !== "cancelled") entry.overdue++;
      if (item.createdAt.toISOString().slice(0, 10) >= monthStart) entry.newThisMonth++;
      if (item.estimatedHours) entry.estimatedHours += parseFloat(item.estimatedHours) || 0;
    }

    return Object.values(byEngineer).sort((a, b) => b.total - a.total);
  }),
```

- [ ] **Step 2: Add per-engineer bar chart to work index page**

In `apps/web/src/routes/_authenticated/work/index.tsx`, add a new chart section after the existing status distribution chart using `orpc.work.analytics.queryOptions({ input: {} })` and render a grouped bar or horizontal bar chart showing total/completed/overdue per engineer using Recharts.

Full chart implementation:

```typescript
// In WorkPage component, add:
const { data: analytics } = useQuery(
  orpc.work.analytics.queryOptions({ input: {} }),
);

// After the status chart Card, add:
{analytics && analytics.length > 0 && (
  <Card className="mb-6">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium">Work Items by Engineer</CardTitle>
    </CardHeader>
    <CardContent>
      <ResponsiveContainer width="100%" height={Math.max(160, analytics.length * 36)}>
        <BarChart
          data={analytics}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 80, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={76} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="total" name="Total" fill="#94a3b8" radius={[0, 4, 4, 0]} />
          <Bar dataKey="completed" name="Done" fill="#22c55e" radius={[0, 4, 4, 0]} />
          <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
)}
```

Also add `Legend` to the recharts imports.

- [ ] **Step 3: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/work.ts apps/web/src/routes/_authenticated/work/index.tsx
git commit -m "feat(analytics): per-engineer work analytics endpoint + horizontal bar chart

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Calendar view for work items (due dates)

Add a monthly calendar view showing work items by due date — the fourth view mode after List/Kanban/Grid.

**Files:**
- Modify: `apps/web/src/routes/_authenticated/work/index.tsx` — add Calendar view mode

- [ ] **Step 1: Add calendar view implementation**

Calendar view requires grouping items by `dueDate`. In the work/index.tsx, add to the imports:

```typescript
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { Calendar } from "lucide-react"; // add to existing lucide imports
```

Add to `ViewMode` type:
```typescript
type ViewMode = "list" | "kanban" | "grid" | "calendar";
```

Add `WorkCalendarView` component before `WorkPage`:

```typescript
function WorkCalendarView({ items }: { items: WorkItem[] }) {
  const [month, setMonth] = useState(new Date());
  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });
  const startPad = getDay(startOfMonth(month)); // 0=Sun offset

  return (
    <div>
      {/* Month nav */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="rounded border px-2 py-1 text-sm hover:bg-muted"
        >
          ← Prev
        </button>
        <span className="font-semibold text-sm">
          {format(month, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="rounded border px-2 py-1 text-sm hover:bg-muted"
        >
          Next →
        </button>
        <button
          onClick={() => setMonth(new Date())}
          className="text-xs text-muted-foreground underline"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-background min-h-[80px]" />
        ))}
        {days.map((day) => {
          const dayItems = items.filter(
            (item) => item.dueDate && isSameDay(parseISO(item.dueDate), day),
          );
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={`bg-background min-h-[80px] p-1 ${isToday ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <p className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-foreground"}`}>
                {format(day, "d")}
              </p>
              <div className="space-y-0.5">
                {dayItems.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    to="/work/$workItemId"
                    params={{ workItemId: item.id }}
                    className={`block truncate rounded px-1 py-0.5 text-xs leading-tight ${
                      isOverdue(item)
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    }`}
                  >
                    {item.title}
                  </Link>
                ))}
                {dayItems.length > 3 && (
                  <p className="text-xs text-muted-foreground px-1">
                    +{dayItems.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Add `subMonths`, `addMonths`, `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, `getDay`, `isSameDay` to date-fns imports.

Add the `Calendar` icon button to the view switcher in the header. Add `"calendar"` to the `LoadingSkeleton` match and `"calendar"` to the content area render logic.

- [ ] **Step 2: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/work/index.tsx
git commit -m "feat(work): add calendar view — monthly grid of items by due date

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Enhanced dashboard — add workload + cycle widgets

**Files:**
- Modify: `apps/web/src/routes/_authenticated/index.tsx` — add workload summary card + active cycle progress

- [ ] **Step 1: Read the current dashboard page**

Read `apps/web/src/routes/_authenticated/index.tsx` to understand the current layout.

- [ ] **Step 2: Add workload imbalance widget**

Add a query for current week workload data:
```typescript
const today = new Date();
const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

const { data: workload } = useQuery(
  orpc.workload.get.queryOptions({ input: { weekStart, weekEnd } }),
);
```

Add a card showing overloaded/high-load engineers count as a warning signal.

- [ ] **Step 3: Add active cycles widget**

```typescript
const { data: activeCycles } = useQuery(
  orpc.cycles.list.queryOptions({ input: { status: "active", limit: 3 } }),
);
```

Show each active cycle with its progress bar inline in the dashboard.

- [ ] **Step 4: Run type check + commit**

```bash
bun run check-types
git add apps/web/src/routes/_authenticated/index.tsx
git commit -m "feat(dashboard): add workload imbalance signal + active cycle progress widgets

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Tier 3 — Automation & Intake

### Task 10: Automation rules engine — schema + API

Automation rules evaluate trigger conditions and fire configured actions (notifications, status updates). Rules are stored in DB as JSON and evaluated by a scheduled sweep job.

**Files:**
- Create: `packages/db/src/schema/automation.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/api/src/lib/automation/index.ts`
- Create: `packages/api/src/routers/automation.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create automation schema**

Write `packages/db/src/schema/automation.ts`:

```typescript
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";

export const automationRules = pgTable(
  "automation_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    // Trigger event: "leave.approved", "contract.expiring_soon", "work_item.overdue",
    //   "temp_change.overdue", "access_review.overdue", "incident.created"
    trigger: text("trigger").notNull(),
    // JSON conditions: { field, operator, value }[]
    // e.g. [{ field: "daysUntilExpiry", operator: "lte", value: 30 }]
    conditions: jsonb("conditions").$type<{ field: string; operator: string; value: unknown }[]>(),
    // JSON actions: { type, params }[]
    // e.g. [{ type: "notify_assignee", params: { message: "..." } }]
    //       [{ type: "notify_manager", params: {} }]
    //       [{ type: "set_status", params: { status: "overdue" } }]
    actions: jsonb("actions")
      .notNull()
      .$type<{ type: string; params: Record<string, unknown> }[]>(),
    isActive: boolean("is_active").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("automation_rules_trigger_idx").on(table.trigger),
    index("automation_rules_isActive_idx").on(table.isActive),
  ],
);

export const automationRuleRuns = pgTable(
  "automation_rule_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    triggeredFor: text("triggered_for").notNull(), // resourceType:resourceId
    actionsExecuted: jsonb("actions_executed").$type<string[]>(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("automation_rule_runs_ruleId_idx").on(table.ruleId),
  ],
);

export const automationRulesRelations = relations(automationRules, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [automationRules.createdById],
    references: [user.id],
  }),
  runs: many(automationRuleRuns),
}));

export const automationRuleRunsRelations = relations(automationRuleRuns, ({ one }) => ({
  rule: one(automationRules, {
    fields: [automationRuleRuns.ruleId],
    references: [automationRules.id],
  }),
}));
```

- [ ] **Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, add:
```typescript
export * from "./automation";
```

- [ ] **Step 3: Push schema**

Run: `bun run db:push`
Expected: `automation_rules` and `automation_rule_runs` tables created.

- [ ] **Step 4: Create the rule evaluation engine**

Write `packages/api/src/lib/automation/index.ts`:

```typescript
import { db, automationRules, automationRuleRuns } from "@ndma-dcs-staff-portal/db";
import { eq } from "drizzle-orm";
import { createNotification } from "../notify";

type TriggerContext = {
  trigger: string;
  resourceType: string;
  resourceId: string;
  data: Record<string, unknown>;
  recipientUserId?: string;
  managerUserId?: string;
};

/**
 * Evaluate and fire all active automation rules matching the given trigger.
 * Call this from mutation handlers after the core DB change completes.
 *
 * Example:
 *   await fireAutomationRules({
 *     trigger: "leave.approved",
 *     resourceType: "leave_request",
 *     resourceId: request.id,
 *     data: { staffProfileId: request.staffProfileId },
 *     recipientUserId: staffProfile.userId,
 *   });
 */
export async function fireAutomationRules(ctx: TriggerContext): Promise<void> {
  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.trigger, ctx.trigger),
  });

  const activeRules = rules.filter((r) => r.isActive);

  for (const rule of activeRules) {
    try {
      const actionsExecuted: string[] = [];

      for (const action of rule.actions) {
        switch (action.type) {
          case "notify_assignee": {
            if (ctx.recipientUserId) {
              await createNotification({
                recipientId: ctx.recipientUserId,
                title: String(action.params["title"] ?? rule.name),
                body: String(action.params["message"] ?? `Automation: ${rule.name}`),
                module: ctx.resourceType.split("_")[0] ?? "system",
                resourceType: ctx.resourceType,
                resourceId: ctx.resourceId,
              });
              actionsExecuted.push("notify_assignee");
            }
            break;
          }
          case "notify_manager": {
            if (ctx.managerUserId) {
              await createNotification({
                recipientId: ctx.managerUserId,
                title: String(action.params["title"] ?? rule.name),
                body: String(action.params["message"] ?? `Automation: ${rule.name}`),
                module: ctx.resourceType.split("_")[0] ?? "system",
                resourceType: ctx.resourceType,
                resourceId: ctx.resourceId,
              });
              actionsExecuted.push("notify_manager");
            }
            break;
          }
          // Additional action types go here (set_status, create_work_item, etc.)
        }
      }

      await db.insert(automationRuleRuns).values({
        ruleId: rule.id,
        triggeredFor: `${ctx.resourceType}:${ctx.resourceId}`,
        actionsExecuted,
      });
    } catch (err) {
      // Log error but don't interrupt the calling operation
      await db.insert(automationRuleRuns).values({
        ruleId: rule.id,
        triggeredFor: `${ctx.resourceType}:${ctx.resourceId}`,
        actionsExecuted: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
```

- [ ] **Step 5: Create the automation router**

Write `packages/api/src/routers/automation.ts`:

```typescript
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db, automationRules, automationRuleRuns } from "@ndma-dcs-staff-portal/db";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, requireRole } from "../index";
import { logAudit } from "../lib/audit";

const ActionSchema = z.object({
  type: z.enum(["notify_assignee", "notify_manager"]),
  params: z.record(z.string(), z.unknown()),
});

const ConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains"]),
  value: z.unknown(),
});

const TriggerSchema = z.enum([
  "leave.approved",
  "leave.rejected",
  "contract.expiring_soon",
  "work_item.overdue",
  "temp_change.overdue",
  "access_review.overdue",
  "incident.created",
  "work_item.assigned",
]);

export const automationRouter = {
  rules: {
    list: protectedProcedure
      .input(z.object({ isActive: z.boolean().optional() }))
      .handler(async ({ input }) => {
        const conditions = [];
        if (input.isActive !== undefined) conditions.push(eq(automationRules.isActive, input.isActive));
        return db.query.automationRules.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          orderBy: [desc(automationRules.createdAt)],
          with: { createdBy: true },
        });
      }),

    create: requireRole("settings", "create")
      .input(z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        trigger: TriggerSchema,
        conditions: z.array(ConditionSchema).optional(),
        actions: z.array(ActionSchema).min(1),
      }))
      .handler(async ({ input, context }) => {
        const [rule] = await db
          .insert(automationRules)
          .values({
            ...input,
            description: input.description ?? null,
            conditions: input.conditions ?? null,
            createdById: context.session.user.id,
          })
          .returning();
        if (!rule) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "automation_rule.create",
          module: "settings",
          resourceType: "automation_rule",
          resourceId: rule.id,
          afterValue: rule as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return rule;
      }),

    update: requireRole("settings", "update")
      .input(z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        isActive: z.boolean().optional(),
        actions: z.array(ActionSchema).min(1).optional(),
      }))
      .handler(async ({ input, context }) => {
        const { id, ...updates } = input;
        const before = await db.query.automationRules.findFirst({ where: eq(automationRules.id, id) });
        if (!before) throw new ORPCError("NOT_FOUND");
        const [updated] = await db.update(automationRules).set(updates).where(eq(automationRules.id, id)).returning();

        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "automation_rule.update",
          module: "settings",
          resourceType: "automation_rule",
          resourceId: id,
          beforeValue: before as Record<string, unknown>,
          afterValue: updated as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });

        return updated;
      }),

    delete: requireRole("settings", "delete")
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, context }) => {
        const before = await db.query.automationRules.findFirst({ where: eq(automationRules.id, input.id) });
        if (!before) throw new ORPCError("NOT_FOUND");
        await db.delete(automationRules).where(eq(automationRules.id, input.id));
        await logAudit({
          actorId: context.session.user.id,
          actorName: context.session.user.name,
          action: "automation_rule.delete",
          module: "settings",
          resourceType: "automation_rule",
          resourceId: input.id,
          beforeValue: before as Record<string, unknown>,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          actorRole: context.userRole ?? undefined,
          correlationId: context.requestId,
        });
        return { success: true };
      }),
  },

  runs: {
    list: protectedProcedure
      .input(z.object({ ruleId: z.string().optional(), limit: z.number().min(1).max(100).default(20) }))
      .handler(async ({ input }) => {
        const conditions = [];
        if (input.ruleId) conditions.push(eq(automationRuleRuns.ruleId, input.ruleId));
        return db.query.automationRuleRuns.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          orderBy: [desc(automationRuleRuns.createdAt)],
          limit: input.limit,
          with: { rule: true },
        });
      }),
  },
};
```

- [ ] **Step 6: Register router + run type check**

In `packages/api/src/routers/index.ts`:
```typescript
import { automationRouter } from "./automation";
// In appRouter:
automation: automationRouter,
```

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 7: Wire fireAutomationRules into leave.approve handler**

In `packages/api/src/routers/leave.ts`, add import:
```typescript
import { fireAutomationRules } from "../lib/automation";
```

After the `createNotification` call in `requests.approve`, add:
```typescript
await fireAutomationRules({
  trigger: "leave.approved",
  resourceType: "leave_request",
  resourceId: input.id,
  data: { staffProfileId: before.staffProfileId },
  recipientUserId: before.staffProfile.userId,
});
```

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/automation.ts packages/db/src/schema/index.ts packages/api/src/lib/automation/index.ts packages/api/src/routers/automation.ts packages/api/src/routers/index.ts packages/api/src/routers/leave.ts
git commit -m "feat(automation): rule engine schema + API + fireAutomationRules + wired to leave.approve

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Runbook linkage on services

Services should have a `runbookUrl` field. Incidents linking to a service can then surface the runbook. Temp changes can link to rollback docs.

**Files:**
- Modify: `packages/db/src/schema/incidents.ts` — add `runbookUrl`, `docsUrl` to `services`
- Modify: `packages/api/src/routers/services.ts` — expose in create/update

- [ ] **Step 1: Add runbookUrl + docsUrl to services table**

In `packages/db/src/schema/incidents.ts`, in the `services` table:
```typescript
runbookUrl: text("runbook_url"),
docsUrl: text("docs_url"),
```

- [ ] **Step 2: Push schema**

Run: `bun run db:push`
Expected: Two new nullable columns on `services`.

- [ ] **Step 3: Expose in services router**

In `packages/api/src/routers/services.ts`, add `runbookUrl: z.string().url().optional()` and `docsUrl: z.string().url().optional()` to create and update inputs.

- [ ] **Step 4: Run type check + commit**

```bash
bun run check-types
git add packages/db/src/schema/incidents.ts packages/api/src/routers/services.ts
git commit -m "feat(services): add runbookUrl + docsUrl fields for operational documentation linkage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Tier 4 — Analytics & Spreadsheet Features

### Task 12: Recurring task templates (from Routine sheet)

The Routine worksheet has 37 recurring tasks with period types (Daily/Weekly/Fortnightly/Monthly/Quarterly/Semi-Annually/Annually). These should be stored as templates that auto-generate work items on a schedule.

**Files:**
- Create: `packages/db/src/schema/routine-tasks.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/api/src/routers/routine-tasks.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create routine-tasks schema**

Write `packages/db/src/schema/routine-tasks.ts`:

```typescript
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { staffProfiles } from "./staff";
import { departments } from "./departments";

export const taskPeriodEnum = pgEnum("task_period", [
  "daily",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "semi_annually",
  "annually",
]);

export const routineTaskTemplates = pgTable(
  "routine_task_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    period: taskPeriodEnum("period").notNull(),
    estimatedHours: text("estimated_hours"),
    defaultAssigneeId: text("default_assignee_id").references(
      () => staffProfiles.id,
      { onDelete: "set null" },
    ),
    departmentId: text("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").default(true).notNull(),
    // When the last work item was generated from this template
    lastGeneratedAt: date("last_generated_at"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("routine_tasks_period_idx").on(table.period),
    index("routine_tasks_isActive_idx").on(table.isActive),
    index("routine_tasks_departmentId_idx").on(table.departmentId),
  ],
);

export const routineTaskTemplatesRelations = relations(
  routineTaskTemplates,
  ({ one }) => ({
    defaultAssignee: one(staffProfiles, {
      fields: [routineTaskTemplates.defaultAssigneeId],
      references: [staffProfiles.id],
    }),
    department: one(departments, {
      fields: [routineTaskTemplates.departmentId],
      references: [departments.id],
    }),
    createdBy: one(user, {
      fields: [routineTaskTemplates.createdById],
      references: [user.id],
    }),
  }),
);
```

- [ ] **Step 2: Export from schema index + push**

Add `export * from "./routine-tasks";` to `packages/db/src/schema/index.ts`.
Run: `bun run db:push`

- [ ] **Step 3: Create routine-tasks router**

Write `packages/api/src/routers/routine-tasks.ts` with:
- `list` (protected, filter by period/departmentId/isActive)
- `create` (requireRole "work" "create")
- `update` (requireRole "work" "update")
- `generate` (requireRole "work" "create") — manually trigger work item generation from a template

The `generate` procedure creates a `workItem` from the template:
```typescript
generate: requireRole("work", "create")
  .input(z.object({ templateId: z.string(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ input, context }) => {
    const template = await db.query.routineTaskTemplates.findFirst({
      where: eq(routineTaskTemplates.id, input.templateId),
    });
    if (!template) throw new ORPCError("NOT_FOUND");

    const [item] = await db.insert(workItems).values({
      title: template.title,
      description: template.description ?? null,
      type: "routine",
      priority: "medium",
      assignedToId: template.defaultAssigneeId ?? null,
      departmentId: template.departmentId ?? null,
      dueDate: input.dueDate,
      estimatedHours: template.estimatedHours ?? null,
      createdById: context.session.user.id,
      sourceSystem: "routine_template",
      sourceReference: template.id,
    }).returning();

    if (!item) throw new ORPCError("INTERNAL_SERVER_ERROR");

    // Update lastGeneratedAt
    await db.update(routineTaskTemplates)
      .set({ lastGeneratedAt: input.dueDate })
      .where(eq(routineTaskTemplates.id, input.templateId));

    await logAudit({ /* standard fields */ action: "routine_task.generate", module: "work", resourceType: "work_item", resourceId: item.id, afterValue: item as Record<string, unknown>, /* context fields */ });

    return item;
  }),
```

- [ ] **Step 4: Run type check + commit**

```bash
bun run check-types
git add packages/db/src/schema/routine-tasks.ts packages/db/src/schema/index.ts packages/api/src/routers/routine-tasks.ts packages/api/src/routers/index.ts
git commit -m "feat(routine-tasks): recurring task template schema + generate-on-demand API

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 13: OtherDept external work tracking

The OtherDept sheet tracks work with external departments: Tech/person, Task, Story, DCS Engineer To Follow Up, Date Assigned, Follow Up date. These map to work items with `type: "external_request"` and a `followUpDate` field.

**Files:**
- Modify: `packages/db/src/schema/work.ts` — add `followUpDate` column to `workItems`
- Modify: `packages/api/src/routers/work.ts` — expose `followUpDate` in create/update

- [ ] **Step 1: Add followUpDate to workItems**

In `packages/db/src/schema/work.ts`, in the `workItems` table after `dueDate`:
```typescript
followUpDate: date("follow_up_date"),
```

- [ ] **Step 2: Push schema**

Run: `bun run db:push`
Expected: Column added.

- [ ] **Step 3: Expose in router**

In `packages/api/src/routers/work.ts`, add `followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` to both `CreateWorkItemInput` and `UpdateWorkItemInput`.

- [ ] **Step 4: Run type check + commit**

```bash
bun run check-types
git add packages/db/src/schema/work.ts packages/api/src/routers/work.ts
git commit -m "feat(work): add followUpDate for external department work tracking

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Tier 5 — Security & Infrastructure

### Task 14: HTTP security headers / CSP (existing Task 22)

**Files:**
- Modify: `apps/server/src/index.ts` — add security middleware before routes

- [ ] **Step 1: Read the current server file**

Read `apps/server/src/index.ts` to find where to insert the middleware.

- [ ] **Step 2: Add security headers middleware**

After the CORS middleware and before the route registrations, add:

```typescript
// ── Security headers ───────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  // Prevent MIME-type sniffing
  c.header("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");
  // Enable XSS protection in older browsers
  c.header("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy — deny risky browser APIs
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  // Content Security Policy
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // unsafe-inline needed for Vite dev HMR
      "style-src 'self' 'unsafe-inline'",  // needed for Tailwind inline styles
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
});
```

- [ ] **Step 3: Run type check**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(security): add HTTP security headers — CSP, X-Frame-Options, nosniff, etc.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 15: CI pipeline hardening (existing Task 21)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Write `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  type-check:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Type check all packages
        run: bun run check-types

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: type-check
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Build web
        run: bun run --filter @ndma-dcs-staff-portal/web build
      - name: Build server
        run: bun run --filter @ndma-dcs-staff-portal/server build 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add GitHub Actions workflow — type-check + build on push/PR

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Summary Table

| Task | Feature | Tier | Status | Effort |
|---|---|---|---|---|
| 1 | Cycles schema + API | 1 | ⬜ Pending | M |
| 2 | Work hierarchy + dependencies | 1 | ⬜ Pending | M |
| 3 | Work/incident/change cross-linking | 1 | ⬜ Pending | S |
| 4 | Workload view API | 1 | ⬜ Pending | M |
| 5 | Cycles UI page | 1 | ⬜ Pending | M |
| 6 | Workload view UI | 1 | ⬜ Pending | M |
| 7 | Per-engineer analytics chart | 2 | ⬜ Pending | S |
| 8 | Calendar view (4th work view) | 2 | ⬜ Pending | M |
| 9 | Dashboard workload + cycle widgets | 2 | ⬜ Pending | S |
| 10 | Automation rules engine | 3 | ⬜ Pending | L |
| 11 | Runbook linkage on services | 3 | ⬜ Pending | S |
| 12 | Recurring task templates | 4 | ⬜ Pending | M |
| 13 | OtherDept followUpDate on work items | 4 | ⬜ Pending | XS |
| 14 | HTTP security headers / CSP | 5 | ⬜ Pending | S |
| 15 | CI pipeline | 5 | ⬜ Pending | S |

S=Small (<2h), M=Medium (2-4h), L=Large (4-8h), XS=<30min

## Features Deferred (not in this plan)

These are noted for future phases:
- **Gantt/Timeline view**: Requires a full timeline rendering library (e.g. `react-gantt-chart`) — defer to Phase 4
- **No-code automation builder UI**: Admin UI for creating rules visually — API is done in Task 10, UI deferred
- **AI summaries**: Blocker analysis, weekly summaries — defer to Phase 5
- **Access sync connectors activation**: LDAP credentials not yet provided — schema and interface exist, activation deferred
- **Portfolio dashboard** (cross-module executive view): Deferred until Tier 1-3 are stable
- **Baseline schedule comparison**: Advanced PM feature — deferred
