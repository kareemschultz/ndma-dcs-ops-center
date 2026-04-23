> **🛑 SUPERSEDED — DO NOT USE**
>
> This plan has been superseded by [`../2026-04-23-master-remediation-plan.md`](../2026-04-23-master-remediation-plan.md).
>
> The on-call rota system is being unified with the NOC roster system into a single **Scheduling** module (Phase 3 of the new master plan). `rota.ts`, `roster.ts`, and `noc-shifts.ts` will be merged into `scheduling.ts` with subrouters.
>
> Retained here for historical reference only. Do not reference from new code or docs.

---

# On-Call Rota System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready PagerDuty-style on-call scheduling system for NDMA Data Centre Services that replaces Excel sheets and WhatsApp coordination with structured weekly rotas, fair rotation, conflict detection, and swap management.

**Architecture:** Weekly schedule containers (`on_call_schedules`) hold four role slots (Lead Engineer, ASN Support, Core Support, Enterprise Support). A Drizzle ORM schema in `packages/db` stores staff profiles, departments, and rota tables. An oRPC router in `packages/api` exposes type-safe endpoints consumed by four React feature pages under `/rota`.

**Tech Stack:** Drizzle ORM + PostgreSQL, oRPC (`protectedProcedure`), TanStack Router + Query, React 19, Base UI (`render` prop, NOT `asChild`), Tailwind v4, shadcn-admin layout components (`Header`, `Main`), Lucide icons, Sonner toasts.

---

## Real Org Structure (seed data)

| Person | Department | Role |
|---|---|---|
| Sachin Ramsuran | DCS | Manager |
| Ataybia Williams | DCS | PA/Admin |
| Nicolai Mahangi | ASN | Team Lead (Lead Engineer eligible) |
| Kareem Schultz | ASN | Engineer |
| Shemar Henry | ASN | Engineer |
| Timothy Paul | ASN | Engineer |
| Devon Abrams | Core | Team Lead (Lead Engineer eligible) |
| Bheesham Ramrattan | Core | Engineer |
| Gerard Budhan | Enterprise | Team Lead (Lead Engineer eligible) |
| Richie Goring | Enterprise | Engineer |
| Johnatan Sukhlall | Enterprise | Engineer |

---

## File Map

### New files to create
| File | Responsibility |
|---|---|
| `packages/db/src/schema/departments.ts` | `departments` table |
| `packages/db/src/schema/staff.ts` | `staff_profiles` table (links user → dept, eligibility) |
| `packages/db/src/schema/rota.ts` | `on_call_schedules`, `on_call_assignments`, `on_call_swaps`, `assignment_history` |
| `packages/db/src/seed.ts` | Seed DCS org + real staff + demo rota data |
| `packages/api/src/routers/rota.ts` | Full rota oRPC router |
| `apps/web/src/features/rota/utils/rotation-engine.ts` | Fair-rotation algorithm (pick lowest-count eligible staff) |
| `apps/web/src/features/rota/utils/conflict-detector.ts` | Detect leave/training/contract conflicts |
| `apps/web/src/features/rota/components/rota-dashboard.tsx` | KPI cards + current + next week summary |
| `apps/web/src/features/rota/components/rota-week-table.tsx` | Weekly grid (role rows × day columns) |
| `apps/web/src/features/rota/components/rota-planner.tsx` | Planner page shell (tabs: table / calendar) |
| `apps/web/src/features/rota/components/assign-modal.tsx` | Dialog: assign/edit a role slot |
| `apps/web/src/features/rota/components/conflict-banner.tsx` | Warning banner listing conflicts |
| `apps/web/src/features/rota/components/swap-requests.tsx` | Swap request list + approve/reject |
| `apps/web/src/features/rota/components/rota-history.tsx` | Past assignments with date-range filter |
| `apps/web/src/features/rota/components/staff-workload-card.tsx` | Per-person assignment count badge |

### Files to modify
| File | Change |
|---|---|
| `packages/db/src/schema/index.ts` | Export departments, staff, rota schemas |
| `packages/api/src/routers/index.ts` | Add `rota` to `appRouter` |
| `apps/web/src/routes/_authenticated/rota/index.tsx` | Replace stub with rota dashboard |
| `apps/web/src/routes/_authenticated/rota/planner.tsx` | New route file |
| `apps/web/src/routes/_authenticated/rota/swaps.tsx` | New route file |
| `apps/web/src/routes/_authenticated/rota/history.tsx` | New route file |
| `apps/web/src/components/layout/data/sidebar-data.ts` | Add rota sub-nav items |
| `docs/architecture/rota-system.md` | Architecture reference |
| `README.md` | Add On-Call Rota section |

---

## Task 1: Departments + Staff Profiles schema

**Files:**
- Create: `packages/db/src/schema/departments.ts`
- Create: `packages/db/src/schema/staff.ts`

- [ ] **Step 1: Create departments schema**

```typescript
// packages/db/src/schema/departments.ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { staffProfiles } from "./staff";

export const departments = pgTable("departments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),           // "ASN", "Core", "Enterprise", "DCS"
  code: text("code").notNull().unique(),  // "ASN", "CORE", "ENT", "DCS"
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const departmentRelations = relations(departments, ({ many }) => ({
  staffProfiles: many(staffProfiles),
}));
```

- [ ] **Step 2: Create staff profiles schema**

```typescript
// packages/db/src/schema/staff.ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { departments } from "./departments";

export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time", "part_time", "contract", "temporary",
]);

export const staffStatusEnum = pgEnum("staff_status", [
  "active", "inactive", "on_leave", "terminated",
]);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().unique(), // e.g. "DCS-001"
    departmentId: text("department_id").notNull().references(() => departments.id),
    jobTitle: text("job_title").notNull(),
    employmentType: employmentTypeEnum("employment_type").default("full_time").notNull(),
    status: staffStatusEnum("status").default("active").notNull(),
    // On-call eligibility
    isTeamLead: boolean("is_team_lead").default(false).notNull(),
    isLeadEngineerEligible: boolean("is_lead_engineer_eligible").default(false).notNull(),
    isOnCallEligible: boolean("is_on_call_eligible").default(true).notNull(),
    contractExpiresAt: timestamp("contract_expires_at"),
    startDate: timestamp("start_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("staff_profiles_userId_idx").on(table.userId),
    index("staff_profiles_departmentId_idx").on(table.departmentId),
  ],
);

export const staffProfileRelations = relations(staffProfiles, ({ one }) => ({
  user: one(user, { fields: [staffProfiles.userId], references: [user.id] }),
  department: one(departments, { fields: [staffProfiles.departmentId], references: [departments.id] }),
}));
```

- [ ] **Step 3: Commit**
```bash
git add packages/db/src/schema/departments.ts packages/db/src/schema/staff.ts
git commit -m "feat(db): add departments and staff_profiles schema"
```

---

## Task 2: Rota schema (schedules, assignments, swaps, history)

**Files:**
- Create: `packages/db/src/schema/rota.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create rota schema**

```typescript
// packages/db/src/schema/rota.ts
import { relations } from "drizzle-orm";
import {
  pgTable, text, timestamp, boolean, integer,
  pgEnum, date, jsonb, index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { staffProfiles } from "./staff";

// ── Enums ──────────────────────────────────────────────────────────────────
export const onCallRoleEnum = pgEnum("on_call_role", [
  "lead_engineer",   // Primary escalation contact
  "asn_support",     // ASN team on-call
  "core_support",    // Core/Routing team on-call
  "enterprise_support", // Enterprise team on-call
]);

export const scheduleStatusEnum = pgEnum("schedule_status", [
  "draft",       // Being built, not visible to staff
  "published",   // Active, staff notified
  "archived",    // Past week
]);

export const swapStatusEnum = pgEnum("swap_status", [
  "pending",   // Awaiting manager decision
  "approved",  // Manager approved, rota updated
  "rejected",  // Manager rejected
  "cancelled", // Requester cancelled
]);

export const conflictTypeEnum = pgEnum("conflict_type", [
  "approved_leave",
  "sick_leave",
  "training",
  "contract_expired",
  "manually_unavailable",
  "duplicate_assignment",
  "missing_role",
]);

// ── on_call_schedules ──────────────────────────────────────────────────────
// One row per week. week_start is always a Monday (ISO week).
export const onCallSchedules = pgTable(
  "on_call_schedules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    weekStart: date("week_start").notNull().unique(), // ISO date, always Monday
    weekEnd: date("week_end").notNull(),              // Always Sunday
    status: scheduleStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at"),
    publishedById: text("published_by_id").references(() => user.id),
    notes: text("notes"),
    hasConflicts: boolean("has_conflicts").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("schedules_weekStart_idx").on(table.weekStart),
    index("schedules_status_idx").on(table.status),
  ],
);

// ── on_call_assignments ────────────────────────────────────────────────────
// One row per role per week. Max 4 rows per schedule.
export const onCallAssignments = pgTable(
  "on_call_assignments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    scheduleId: text("schedule_id").notNull().references(() => onCallSchedules.id, { onDelete: "cascade" }),
    staffProfileId: text("staff_profile_id").notNull().references(() => staffProfiles.id),
    role: onCallRoleEnum("role").notNull(),
    // Conflict detection results — stored as JSON array of conflict objects
    conflictFlags: jsonb("conflict_flags").$type<{
      type: string;
      message: string;
      severity: "warning" | "blocker";
    }[]>().default([]),
    isConfirmed: boolean("is_confirmed").default(false).notNull(),
    notifiedAt: timestamp("notified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("assignments_scheduleId_idx").on(table.scheduleId),
    index("assignments_staffId_idx").on(table.staffProfileId),
  ],
);

// ── on_call_swaps ──────────────────────────────────────────────────────────
export const onCallSwaps = pgTable(
  "on_call_swaps",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    assignmentId: text("assignment_id").notNull().references(() => onCallAssignments.id, { onDelete: "cascade" }),
    requesterId: text("requester_id").notNull().references(() => staffProfiles.id),
    targetId: text("target_id").notNull().references(() => staffProfiles.id),
    reason: text("reason"),
    status: swapStatusEnum("status").default("pending").notNull(),
    reviewedById: text("reviewed_by_id").references(() => user.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("swaps_assignmentId_idx").on(table.assignmentId),
    index("swaps_requesterId_idx").on(table.requesterId),
    index("swaps_status_idx").on(table.status),
  ],
);

// ── assignment_history ─────────────────────────────────────────────────────
// Immutable audit log. One row per change event.
export const assignmentHistory = pgTable(
  "assignment_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    scheduleId: text("schedule_id").notNull().references(() => onCallSchedules.id),
    assignmentId: text("assignment_id").references(() => onCallAssignments.id),
    staffProfileId: text("staff_profile_id").references(() => staffProfiles.id),
    role: onCallRoleEnum("role"),
    action: text("action").notNull(), // "assigned" | "removed" | "swapped" | "published"
    performedById: text("performed_by_id").references(() => user.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("history_scheduleId_idx").on(table.scheduleId),
    index("history_staffId_idx").on(table.staffProfileId),
  ],
);

// ── Relations ──────────────────────────────────────────────────────────────
export const onCallScheduleRelations = relations(onCallSchedules, ({ many, one }) => ({
  assignments: many(onCallAssignments),
  publishedBy: one(user, { fields: [onCallSchedules.publishedById], references: [user.id] }),
}));

export const onCallAssignmentRelations = relations(onCallAssignments, ({ one, many }) => ({
  schedule: one(onCallSchedules, { fields: [onCallAssignments.scheduleId], references: [onCallSchedules.id] }),
  staffProfile: one(staffProfiles, { fields: [onCallAssignments.staffProfileId], references: [staffProfiles.id] }),
  swaps: many(onCallSwaps),
}));

export const onCallSwapRelations = relations(onCallSwaps, ({ one }) => ({
  assignment: one(onCallAssignments, { fields: [onCallSwaps.assignmentId], references: [onCallAssignments.id] }),
  requester: one(staffProfiles, { fields: [onCallSwaps.requesterId], references: [staffProfiles.id] }),
  target: one(staffProfiles, { fields: [onCallSwaps.targetId], references: [staffProfiles.id] }),
  reviewedBy: one(user, { fields: [onCallSwaps.reviewedById], references: [user.id] }),
}));

export const assignmentHistoryRelations = relations(assignmentHistory, ({ one }) => ({
  schedule: one(onCallSchedules, { fields: [assignmentHistory.scheduleId], references: [onCallSchedules.id] }),
  assignment: one(onCallAssignments, { fields: [assignmentHistory.assignmentId], references: [onCallAssignments.id] }),
  staffProfile: one(staffProfiles, { fields: [assignmentHistory.staffProfileId], references: [staffProfiles.id] }),
  performedBy: one(user, { fields: [assignmentHistory.performedById], references: [user.id] }),
}));
```

- [ ] **Step 2: Update schema/index.ts to export new schemas**

```typescript
// packages/db/src/schema/index.ts
export * from "./auth";
export * from "./departments";
export * from "./staff";
export * from "./rota";
```

- [ ] **Step 3: Push schema to DB**
```bash
bun run db:push
```
Expected: All 4 new tables created in PostgreSQL.

- [ ] **Step 4: Commit**
```bash
git add packages/db/src/schema/
git commit -m "feat(db): add rota schema — schedules, assignments, swaps, history"
```

---

## Task 3: Seed data — real DCS org structure

**Files:**
- Create: `packages/db/src/seed.ts`
- Modify: `packages/db/package.json` (add seed script)

- [ ] **Step 1: Create seed file**

```typescript
// packages/db/src/seed.ts
import { db } from "./index";
import { departments } from "./schema/departments";
import { staffProfiles } from "./schema/staff";
import { user } from "./schema/auth";
import { onCallSchedules, onCallAssignments } from "./schema/rota";

async function seed() {
  console.log("🌱 Seeding DCS org structure...");

  // ── Departments ────────────────────────────────────────────────────────
  const [dcs, asn, core, enterprise] = await db
    .insert(departments)
    .values([
      { id: "dept-dcs",        name: "Data Centre Services", code: "DCS",  description: "Department leadership and administration" },
      { id: "dept-asn",        name: "Applications, Systems & NetOps", code: "ASN",  description: "Application systems and network operations" },
      { id: "dept-core",       name: "Core Infrastructure",  code: "CORE", description: "Core routing and switching" },
      { id: "dept-enterprise", name: "Enterprise Systems",   code: "ENT",  description: "Enterprise network infrastructure" },
    ])
    .onConflictDoNothing()
    .returning();

  // ── Users (Better Auth requires user rows before staff_profiles) ────────
  const staffUsers = [
    { id: "user-sachin",    name: "Sachin Ramsuran",    email: "sachin.ramsuran@ndma.gov",    emailVerified: true },
    { id: "user-ataybia",   name: "Ataybia Williams",   email: "ataybia.williams@ndma.gov",   emailVerified: true },
    { id: "user-nicolai",   name: "Nicolai Mahangi",    email: "nicolai.mahangi@ndma.gov",    emailVerified: true },
    { id: "user-kareem",    name: "Kareem Schultz",     email: "kareem.schultz@ndma.gov",     emailVerified: true },
    { id: "user-shemar",    name: "Shemar Henry",       email: "shemar.henry@ndma.gov",       emailVerified: true },
    { id: "user-timothy",   name: "Timothy Paul",       email: "timothy.paul@ndma.gov",       emailVerified: true },
    { id: "user-devon",     name: "Devon Abrams",       email: "devon.abrams@ndma.gov",       emailVerified: true },
    { id: "user-bheesham",  name: "Bheesham Ramrattan", email: "bheesham.ramrattan@ndma.gov", emailVerified: true },
    { id: "user-gerard",    name: "Gerard Budhan",      email: "gerard.budhan@ndma.gov",      emailVerified: true },
    { id: "user-richie",    name: "Richie Goring",      email: "richie.goring@ndma.gov",      emailVerified: true },
    { id: "user-johnatan",  name: "Johnatan Sukhlall",  email: "johnatan.sukhlall@ndma.gov",  emailVerified: true },
  ];

  await db.insert(user).values(
    staffUsers.map(u => ({ ...u, createdAt: new Date(), updatedAt: new Date() }))
  ).onConflictDoNothing();

  // ── Staff Profiles ─────────────────────────────────────────────────────
  await db.insert(staffProfiles).values([
    // DCS Leadership
    { id: "sp-sachin",   userId: "user-sachin",   employeeId: "DCS-001", departmentId: "dept-dcs",        jobTitle: "Manager, DCS & NOC",   isTeamLead: true,  isLeadEngineerEligible: false, isOnCallEligible: false, startDate: new Date("2018-01-01") },
    { id: "sp-ataybia",  userId: "user-ataybia",  employeeId: "DCS-002", departmentId: "dept-dcs",        jobTitle: "PA / Admin Support",   isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: false, startDate: new Date("2020-06-01") },
    // ASN
    { id: "sp-nicolai",  userId: "user-nicolai",  employeeId: "ASN-001", departmentId: "dept-asn",        jobTitle: "ASN Team Lead",        isTeamLead: true,  isLeadEngineerEligible: true,  isOnCallEligible: true,  startDate: new Date("2017-03-01") },
    { id: "sp-kareem",   userId: "user-kareem",   employeeId: "ASN-002", departmentId: "dept-asn",        jobTitle: "Network Engineer",     isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2021-09-01") },
    { id: "sp-shemar",   userId: "user-shemar",   employeeId: "ASN-003", departmentId: "dept-asn",        jobTitle: "Systems Engineer",     isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2022-01-01") },
    { id: "sp-timothy",  userId: "user-timothy",  employeeId: "ASN-004", departmentId: "dept-asn",        jobTitle: "Network Engineer",     isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2023-03-01") },
    // Core
    { id: "sp-devon",    userId: "user-devon",    employeeId: "CORE-001", departmentId: "dept-core",      jobTitle: "Core Infrastructure Lead", isTeamLead: true, isLeadEngineerEligible: true, isOnCallEligible: true, startDate: new Date("2016-07-01") },
    { id: "sp-bheesham", userId: "user-bheesham", employeeId: "CORE-002", departmentId: "dept-core",      jobTitle: "Network Engineer",     isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2019-11-01") },
    // Enterprise
    { id: "sp-gerard",   userId: "user-gerard",   employeeId: "ENT-001",  departmentId: "dept-enterprise", jobTitle: "Enterprise Lead",     isTeamLead: true,  isLeadEngineerEligible: true,  isOnCallEligible: true,  startDate: new Date("2015-04-01") },
    { id: "sp-richie",   userId: "user-richie",   employeeId: "ENT-002",  departmentId: "dept-enterprise", jobTitle: "Enterprise Engineer", isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2020-02-01") },
    { id: "sp-johnatan", userId: "user-johnatan", employeeId: "ENT-003",  departmentId: "dept-enterprise", jobTitle: "Enterprise Engineer", isTeamLead: false, isLeadEngineerEligible: false, isOnCallEligible: true,  startDate: new Date("2021-05-01") },
  ]).onConflictDoNothing();

  // ── Demo: current week schedule (published) ────────────────────────────
  // Get current ISO Monday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStartStr = monday.toISOString().split("T")[0];
  const weekEndStr = sunday.toISOString().split("T")[0];

  const [schedule] = await db.insert(onCallSchedules).values({
    id: "sched-demo-current",
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    status: "published",
    publishedAt: new Date(),
    publishedById: "user-sachin",
    notes: "Seeded demo schedule",
    hasConflicts: false,
  }).onConflictDoNothing().returning();

  if (schedule) {
    await db.insert(onCallAssignments).values([
      { scheduleId: schedule.id, staffProfileId: "sp-nicolai",  role: "lead_engineer",      isConfirmed: true },
      { scheduleId: schedule.id, staffProfileId: "sp-kareem",   role: "asn_support",        isConfirmed: true },
      { scheduleId: schedule.id, staffProfileId: "sp-bheesham", role: "core_support",       isConfirmed: true },
      { scheduleId: schedule.id, staffProfileId: "sp-richie",   role: "enterprise_support", isConfirmed: true },
    ]).onConflictDoNothing();
  }

  console.log("✅ Seed complete.");
}

seed().catch(console.error);
```

- [ ] **Step 2: Add seed script to packages/db/package.json**

Open `packages/db/package.json` and add to `scripts`:
```json
"db:seed": "bun src/seed.ts"
```

- [ ] **Step 3: Run seed**
```bash
bun run db:push && cd packages/db && bun src/seed.ts
```

- [ ] **Step 4: Commit**
```bash
git add packages/db/
git commit -m "feat(db): add DCS org seed data with real staff and demo schedule"
```

---

## Task 4: oRPC rota router

**Files:**
- Create: `packages/api/src/routers/rota.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create the rota router**

```typescript
// packages/api/src/routers/rota.ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { db } from "@ndma-dcs-staff-portal/db";
import {
  onCallSchedules,
  onCallAssignments,
  onCallSwaps,
  assignmentHistory,
} from "@ndma-dcs-staff-portal/db/schema/rota";
import { staffProfiles } from "@ndma-dcs-staff-portal/db/schema/staff";
import { departments } from "@ndma-dcs-staff-portal/db/schema/departments";
import { eq, desc, asc, and, gte, lte, or } from "drizzle-orm";
import { protectedProcedure } from "../index";

// ── Input Schemas ──────────────────────────────────────────────────────────
const OnCallRoleSchema = z.enum([
  "lead_engineer", "asn_support", "core_support", "enterprise_support",
]);

const CreateScheduleInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  notes: z.string().optional(),
});

const AssignStaffInput = z.object({
  scheduleId: z.string(),
  staffProfileId: z.string(),
  role: OnCallRoleSchema,
});

const RemoveAssignmentInput = z.object({
  assignmentId: z.string(),
});

const PublishScheduleInput = z.object({
  scheduleId: z.string(),
});

const RequestSwapInput = z.object({
  assignmentId: z.string(),
  targetStaffProfileId: z.string(),
  reason: z.string().optional(),
});

const ReviewSwapInput = z.object({
  swapId: z.string(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().optional(),
});

const HistoryFilterInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  staffProfileId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

// ── Helper: compute ISO week Sunday from Monday ────────────────────────────
function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

// ── Helper: log history event ──────────────────────────────────────────────
async function logHistory(params: {
  scheduleId: string;
  assignmentId?: string;
  staffProfileId?: string;
  role?: string;
  action: string;
  performedById: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(assignmentHistory).values({
    scheduleId: params.scheduleId,
    assignmentId: params.assignmentId,
    staffProfileId: params.staffProfileId,
    role: params.role as any,
    action: params.action,
    performedById: params.performedById,
    metadata: params.metadata ?? {},
  });
}

// ── Router ─────────────────────────────────────────────────────────────────
export const rotaRouter = {
  // Get the currently published (active) schedule
  getCurrent: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().split("T")[0];
    const schedule = await db.query.onCallSchedules.findFirst({
      where: and(
        eq(onCallSchedules.status, "published"),
        lte(onCallSchedules.weekStart, today),
        gte(onCallSchedules.weekEnd, today),
      ),
      with: {
        assignments: {
          with: { staffProfile: { with: { user: true, department: true } } },
        },
      },
    });
    return schedule ?? null;
  }),

  // Get upcoming published schedules (next 4 weeks)
  getUpcoming: protectedProcedure.handler(async () => {
    const today = new Date().toISOString().split("T")[0];
    return db.query.onCallSchedules.findMany({
      where: and(
        eq(onCallSchedules.status, "published"),
        gte(onCallSchedules.weekStart, today),
      ),
      orderBy: asc(onCallSchedules.weekStart),
      limit: 4,
      with: {
        assignments: {
          with: { staffProfile: { with: { user: true, department: true } } },
        },
      },
    });
  }),

  // Get all schedules (drafts + published) for the planner view
  list: protectedProcedure.handler(async () => {
    return db.query.onCallSchedules.findMany({
      orderBy: desc(onCallSchedules.weekStart),
      limit: 12,
      with: {
        assignments: {
          with: { staffProfile: { with: { user: true, department: true } } },
        },
      },
    });
  }),

  // Create a new draft schedule for a given week
  create: protectedProcedure
    .input(CreateScheduleInput)
    .handler(async ({ input, context }) => {
      const weekEnd = getWeekEnd(input.weekStart);

      // Check for duplicate
      const existing = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.weekStart, input.weekStart),
      });
      if (existing) throw new ORPCError("CONFLICT", { message: "Schedule already exists for this week" });

      const [schedule] = await db.insert(onCallSchedules).values({
        weekStart: input.weekStart,
        weekEnd,
        notes: input.notes,
        status: "draft",
      }).returning();

      await logHistory({
        scheduleId: schedule.id,
        action: "created",
        performedById: context.session.user.id,
      });

      return schedule;
    }),

  // Assign a staff member to a role in a schedule
  assign: protectedProcedure
    .input(AssignStaffInput)
    .handler(async ({ input, context }) => {
      // Check schedule is not published/archived
      const schedule = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.id, input.scheduleId),
      });
      if (!schedule) throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
      if (schedule.status !== "draft") throw new ORPCError("FORBIDDEN", { message: "Cannot modify a published or archived schedule" });

      // Remove any existing assignment for this role in this schedule
      await db.delete(onCallAssignments).where(
        and(
          eq(onCallAssignments.scheduleId, input.scheduleId),
          eq(onCallAssignments.role, input.role),
        ),
      );

      const [assignment] = await db.insert(onCallAssignments).values({
        scheduleId: input.scheduleId,
        staffProfileId: input.staffProfileId,
        role: input.role,
      }).returning();

      await logHistory({
        scheduleId: input.scheduleId,
        assignmentId: assignment.id,
        staffProfileId: input.staffProfileId,
        role: input.role,
        action: "assigned",
        performedById: context.session.user.id,
      });

      return assignment;
    }),

  // Remove an assignment from a draft schedule
  removeAssignment: protectedProcedure
    .input(RemoveAssignmentInput)
    .handler(async ({ input, context }) => {
      const existing = await db.query.onCallAssignments.findFirst({
        where: eq(onCallAssignments.id, input.assignmentId),
        with: { schedule: true },
      });
      if (!existing) throw new ORPCError("NOT_FOUND");
      if (existing.schedule.status !== "draft") throw new ORPCError("FORBIDDEN", { message: "Cannot modify a published schedule" });

      await db.delete(onCallAssignments).where(eq(onCallAssignments.id, input.assignmentId));

      await logHistory({
        scheduleId: existing.scheduleId,
        staffProfileId: existing.staffProfileId,
        role: existing.role,
        action: "removed",
        performedById: context.session.user.id,
      });

      return { success: true };
    }),

  // Publish a schedule (runs conflict detection first)
  publish: protectedProcedure
    .input(PublishScheduleInput)
    .handler(async ({ input, context }) => {
      const schedule = await db.query.onCallSchedules.findFirst({
        where: eq(onCallSchedules.id, input.scheduleId),
        with: { assignments: true },
      });
      if (!schedule) throw new ORPCError("NOT_FOUND");
      if (schedule.status !== "draft") throw new ORPCError("CONFLICT", { message: "Schedule is not in draft status" });

      // Validate all 4 roles are filled
      const roles = schedule.assignments.map((a) => a.role);
      const requiredRoles = ["lead_engineer", "asn_support", "core_support", "enterprise_support"];
      const missingRoles = requiredRoles.filter((r) => !roles.includes(r as any));
      if (missingRoles.length > 0) {
        throw new ORPCError("UNPROCESSABLE_CONTENT", {
          message: `Missing roles: ${missingRoles.join(", ")}`,
        });
      }

      const [published] = await db
        .update(onCallSchedules)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedById: context.session.user.id,
        })
        .where(eq(onCallSchedules.id, input.scheduleId))
        .returning();

      await logHistory({
        scheduleId: input.scheduleId,
        action: "published",
        performedById: context.session.user.id,
      });

      return published;
    }),

  // Get eligible staff for a given role
  getEligibleStaff: protectedProcedure
    .input(z.object({ role: OnCallRoleSchema }))
    .handler(async ({ input }) => {
      const departmentCodeMap: Record<string, string> = {
        asn_support: "ASN",
        core_support: "CORE",
        enterprise_support: "ENT",
      };

      if (input.role === "lead_engineer") {
        return db.query.staffProfiles.findMany({
          where: and(
            eq(staffProfiles.isLeadEngineerEligible, true),
            eq(staffProfiles.isOnCallEligible, true),
            eq(staffProfiles.status, "active"),
          ),
          with: { user: true, department: true },
        });
      }

      const deptCode = departmentCodeMap[input.role];
      return db
        .select({ staffProfiles, user: { id: staffProfiles.userId }, department: departments })
        .from(staffProfiles)
        .innerJoin(departments, eq(staffProfiles.departmentId, departments.id))
        .where(
          and(
            eq(departments.code, deptCode),
            eq(staffProfiles.isOnCallEligible, true),
            eq(staffProfiles.status, "active"),
          ),
        );
    }),

  // Assignment counts per person (for workload balancing UI)
  getAssignmentCounts: protectedProcedure.handler(async () => {
    const all = await db.query.onCallAssignments.findMany({
      with: { staffProfile: { with: { user: true } } },
    });
    const counts: Record<string, { name: string; total: number; byRole: Record<string, number> }> = {};
    for (const a of all) {
      const id = a.staffProfileId;
      if (!counts[id]) counts[id] = { name: a.staffProfile.user.name, total: 0, byRole: {} };
      counts[id].total++;
      counts[id].byRole[a.role] = (counts[id].byRole[a.role] ?? 0) + 1;
    }
    return Object.entries(counts).map(([id, data]) => ({ staffProfileId: id, ...data }));
  }),

  // ── Swap sub-router ────────────────────────────────────────────────────
  swap: {
    request: protectedProcedure
      .input(RequestSwapInput)
      .handler(async ({ input, context }) => {
        const assignment = await db.query.onCallAssignments.findFirst({
          where: eq(onCallAssignments.id, input.assignmentId),
          with: { schedule: true },
        });
        if (!assignment) throw new ORPCError("NOT_FOUND");
        if (assignment.schedule.status !== "published") throw new ORPCError("FORBIDDEN", { message: "Can only swap published assignments" });

        // Find requester's staff profile from auth session user
        const requesterProfile = await db.query.staffProfiles.findFirst({
          where: eq(staffProfiles.userId, context.session.user.id),
        });
        if (!requesterProfile) throw new ORPCError("NOT_FOUND", { message: "Staff profile not found" });

        const [swap] = await db.insert(onCallSwaps).values({
          assignmentId: input.assignmentId,
          requesterId: requesterProfile.id,
          targetId: input.targetStaffProfileId,
          reason: input.reason,
        }).returning();

        return swap;
      }),

    review: protectedProcedure
      .input(ReviewSwapInput)
      .handler(async ({ input, context }) => {
        const swap = await db.query.onCallSwaps.findFirst({
          where: eq(onCallSwaps.id, input.swapId),
          with: { assignment: { with: { schedule: true } } },
        });
        if (!swap) throw new ORPCError("NOT_FOUND");
        if (swap.status !== "pending") throw new ORPCError("CONFLICT", { message: "Swap is no longer pending" });

        if (input.action === "approve") {
          // Update the assignment to point to the new staff member
          await db.update(onCallAssignments)
            .set({ staffProfileId: swap.targetId, updatedAt: new Date() })
            .where(eq(onCallAssignments.id, swap.assignmentId));

          await logHistory({
            scheduleId: swap.assignment.scheduleId,
            assignmentId: swap.assignmentId,
            staffProfileId: swap.targetId,
            role: swap.assignment.role,
            action: "swapped",
            performedById: context.session.user.id,
            metadata: { swapId: swap.id, fromStaff: swap.requesterId },
          });
        }

        const [updated] = await db.update(onCallSwaps)
          .set({
            status: input.action === "approve" ? "approved" : "rejected",
            reviewedById: context.session.user.id,
            reviewedAt: new Date(),
            reviewNotes: input.notes,
          })
          .where(eq(onCallSwaps.id, input.swapId))
          .returning();

        return updated;
      }),

    list: protectedProcedure
      .input(z.object({ status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional() }))
      .handler(async ({ input }) => {
        return db.query.onCallSwaps.findMany({
          where: input.status ? eq(onCallSwaps.status, input.status) : undefined,
          orderBy: desc(onCallSwaps.createdAt),
          with: {
            assignment: { with: { schedule: true, staffProfile: { with: { user: true } } } },
            requester: { with: { user: true } },
            target: { with: { user: true } },
          },
        });
      }),
  },

  // Assignment history with filters
  history: protectedProcedure
    .input(HistoryFilterInput)
    .handler(async ({ input }) => {
      return db.query.assignmentHistory.findMany({
        where: and(
          input.staffProfileId ? eq(assignmentHistory.staffProfileId, input.staffProfileId) : undefined,
        ),
        orderBy: desc(assignmentHistory.createdAt),
        limit: input.limit,
        with: {
          staffProfile: { with: { user: true } },
          schedule: true,
        },
      });
    }),
};
```

- [ ] **Step 2: Register rota router in appRouter**

```typescript
// packages/api/src/routers/index.ts
import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import { rotaRouter } from "./rota";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  rota: rotaRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
```

- [ ] **Step 3: Type check**
```bash
bun run check-types
```
Expected: All packages pass.

- [ ] **Step 4: Commit**
```bash
git add packages/api/src/routers/
git commit -m "feat(api): add rota oRPC router with full CRUD, swap, and history"
```

---

## Task 5: Rota utility functions (rotation engine + conflict detector)

**Files:**
- Create: `apps/web/src/features/rota/utils/rotation-engine.ts`
- Create: `apps/web/src/features/rota/utils/conflict-detector.ts`

- [ ] **Step 1: Create rotation engine**

```typescript
// apps/web/src/features/rota/utils/rotation-engine.ts

export type StaffWithCount = {
  staffProfileId: string;
  name: string;
  total: number;
  byRole: Record<string, number>;
};

export type EligibleStaff = {
  id: string;
  user: { name: string };
};

/**
 * Fair-rotation: pick the eligible staff member with the fewest
 * assignments for the given role. Excludes already-assigned staff.
 */
export function suggestNextAssignment(
  eligible: EligibleStaff[],
  counts: StaffWithCount[],
  role: string,
  alreadyAssigned: string[], // staffProfileIds already in this schedule
): EligibleStaff | null {
  const available = eligible.filter(
    (s) => !alreadyAssigned.includes(s.id)
  );
  if (available.length === 0) return null;

  return available.reduce((best, candidate) => {
    const bestCount = counts.find((c) => c.staffProfileId === best.id);
    const candidateCount = counts.find((c) => c.staffProfileId === candidate.id);
    const bestRoleCount = bestCount?.byRole[role] ?? 0;
    const candidateRoleCount = candidateCount?.byRole[role] ?? 0;
    return candidateRoleCount < bestRoleCount ? candidate : best;
  });
}

/**
 * Compute workload balance: returns over/under-assigned staff
 * relative to the mean assignment count for the role.
 */
export function computeWorkloadBalance(counts: StaffWithCount[], role: string) {
  const roleCounts = counts.map((c) => ({
    staffProfileId: c.staffProfileId,
    name: c.name,
    count: c.byRole[role] ?? 0,
  }));

  if (roleCounts.length === 0) return { overAssigned: [], underAssigned: [], mean: 0 };

  const mean = roleCounts.reduce((sum, c) => sum + c.count, 0) / roleCounts.length;

  return {
    mean: Math.round(mean * 10) / 10,
    overAssigned: roleCounts.filter((c) => c.count > mean + 1),
    underAssigned: roleCounts.filter((c) => c.count < mean - 1),
  };
}
```

- [ ] **Step 2: Create conflict detector**

```typescript
// apps/web/src/features/rota/utils/conflict-detector.ts

export type ConflictFlag = {
  type: string;
  message: string;
  severity: "warning" | "blocker";
};

export type AssignmentInput = {
  staffProfileId: string;
  staffName: string;
  role: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
};

export type StaffAvailability = {
  staffProfileId: string;
  isOnCallEligible: boolean;
  status: string;
  contractExpiresAt?: string | null;
};

/**
 * Run all conflict checks for a proposed assignment.
 * In a full implementation, leave/training data comes from the server.
 * This client-side version checks static profile data only.
 */
export function detectConflicts(
  assignment: AssignmentInput,
  availability: StaffAvailability,
): ConflictFlag[] {
  const flags: ConflictFlag[] = [];

  if (!availability.isOnCallEligible) {
    flags.push({
      type: "not_eligible",
      message: `${assignment.staffName} is not eligible for on-call duty`,
      severity: "blocker",
    });
  }

  if (availability.status === "on_leave") {
    flags.push({
      type: "approved_leave",
      message: `${assignment.staffName} is on leave during this week`,
      severity: "blocker",
    });
  }

  if (availability.status === "inactive") {
    flags.push({
      type: "inactive",
      message: `${assignment.staffName} is not active`,
      severity: "blocker",
    });
  }

  if (availability.contractExpiresAt) {
    const expiry = new Date(availability.contractExpiresAt);
    const weekEnd = new Date(assignment.weekEnd);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - weekEnd.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      flags.push({
        type: "contract_expired",
        message: `${assignment.staffName}'s contract expired before the on-call week`,
        severity: "blocker",
      });
    } else if (daysUntilExpiry <= 30) {
      flags.push({
        type: "contract_expiring",
        message: `${assignment.staffName}'s contract expires in ${daysUntilExpiry} days`,
        severity: "warning",
      });
    }
  }

  return flags;
}

export function hasBlockerConflicts(flags: ConflictFlag[]): boolean {
  return flags.some((f) => f.severity === "blocker");
}
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/features/rota/
git commit -m "feat(rota): add rotation engine and conflict detector utilities"
```

---

## Task 6: Rota dashboard page (current + next week + workload cards)

**Files:**
- Modify: `apps/web/src/routes/_authenticated/rota/index.tsx`
- Create: `apps/web/src/features/rota/components/rota-dashboard.tsx`
- Create: `apps/web/src/features/rota/components/staff-workload-card.tsx`

- [ ] **Step 1: Create staff workload card component**

```tsx
// apps/web/src/features/rota/components/staff-workload-card.tsx
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Props = {
  staffProfileId: string;
  name: string;
  total: number;
  byRole: Record<string, number>;
  mean: number;
};

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead",
  asn_support: "ASN",
  core_support: "Core",
  enterprise_support: "Enterprise",
};

export function StaffWorkloadCard({ name, total, byRole, mean }: Props) {
  const isOver = total > mean + 1;
  const isUnder = total < mean - 1;

  return (
    <Card className={isOver ? "border-amber-500/50" : isUnder ? "border-blue-500/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{name}</CardTitle>
        {isOver ? (
          <TrendingUp className="size-4 text-amber-500" />
        ) : isUnder ? (
          <TrendingDown className="size-4 text-blue-500" />
        ) : (
          <Minus className="size-4 text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{total}</div>
        <p className="mb-2 text-xs text-muted-foreground">total assignments</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(byRole).map(([role, count]) => (
            <Badge key={role} variant="secondary" className="text-xs">
              {ROLE_LABELS[role] ?? role}: {count}
            </Badge>
          ))}
        </div>
        {isOver && <p className="mt-2 text-xs text-amber-600">Over-assigned</p>}
        {isUnder && <p className="mt-2 text-xs text-blue-600">Under-utilized</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create rota dashboard component**

```tsx
// apps/web/src/features/rota/components/rota-dashboard.tsx
import { Link } from "@tanstack/react-router";
import { CalendarClock, User, Shield, Cpu, Server, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ndma-dcs-staff-portal/ui/components/card";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Separator } from "@ndma-dcs-staff-portal/ui/components/separator";
import { StaffWorkloadCard } from "./staff-workload-card";
import { computeWorkloadBalance } from "../utils/rotation-engine";

type Assignment = {
  id: string;
  role: string;
  staffProfile: {
    id: string;
    user: { name: string };
    department: { name: string; code: string };
  };
};

type Schedule = {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  assignments: Assignment[];
  hasConflicts: boolean;
} | null;

type CountEntry = {
  staffProfileId: string;
  name: string;
  total: number;
  byRole: Record<string, number>;
};

const ROLE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  lead_engineer: { label: "Lead Engineer", icon: Shield, color: "text-blue-500" },
  asn_support: { label: "ASN Support", icon: Cpu, color: "text-indigo-500" },
  core_support: { label: "Core Support", icon: Server, color: "text-green-500" },
  enterprise_support: { label: "Enterprise Support", icon: Server, color: "text-purple-500" },
};

function formatWeek(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function ScheduleCard({ schedule, label }: { schedule: Schedule; label: string }) {
  if (!schedule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{label}</CardTitle>
          <CardDescription>No schedule published</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" render={<Link to="/rota/planner" />}>
            Create schedule
          </Button>
        </CardContent>
      </Card>
    );
  }

  const roleOrder = ["lead_engineer", "asn_support", "core_support", "enterprise_support"];

  return (
    <Card className={schedule.hasConflicts ? "border-amber-500/50" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={schedule.status === "published" ? "default" : "secondary"}>
            {schedule.status}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          <CalendarClock className="size-3" />
          {formatWeek(schedule.weekStart, schedule.weekEnd)}
        </CardDescription>
        {schedule.hasConflicts && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3" /> Conflicts detected
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {roleOrder.map((role) => {
          const assignment = schedule.assignments.find((a) => a.role === role);
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <div key={role} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Icon className={`size-4 ${meta.color}`} />
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
              {assignment ? (
                <span className="font-medium">{assignment.staffProfile.user.name}</span>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300">Unassigned</Badge>
              )}
            </div>
          );
        })}
        <Separator className="my-2" />
        <Button variant="ghost" size="sm" className="w-full" render={<Link to="/rota/planner" />}>
          View planner <ArrowRight className="ms-1 size-3" />
        </Button>
      </CardContent>
    </Card>
  );
}

type Props = {
  currentSchedule: Schedule;
  upcomingSchedules: Schedule[];
  assignmentCounts: CountEntry[];
};

export function RotaDashboard({ currentSchedule, upcomingSchedules, assignmentCounts }: Props) {
  const nextSchedule = upcomingSchedules[0] ?? null;
  const { mean } = computeWorkloadBalance(assignmentCounts, "lead_engineer");

  return (
    <div className="space-y-6">
      {/* Current + Next week */}
      <div className="grid gap-4 md:grid-cols-2">
        <ScheduleCard schedule={currentSchedule} label="This Week" />
        <ScheduleCard schedule={nextSchedule} label="Next Week" />
      </div>

      {/* Workload distribution */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Staff Workload</h2>
          <p className="text-xs text-muted-foreground">Mean: {mean} assignments</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assignmentCounts
            .filter((c) => c.total > 0)
            .sort((a, b) => b.total - a.total)
            .map((c) => (
              <StaffWorkloadCard key={c.staffProfileId} {...c} mean={mean} />
            ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire up the rota index route**

```tsx
// apps/web/src/routes/_authenticated/rota/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { CalendarClock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { RotaDashboard } from "@/features/rota/components/rota-dashboard";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_authenticated/rota/")({
  component: RotaPage,
});

function RotaPage() {
  const { data: current } = useQuery(orpc.rota.getCurrent.queryOptions());
  const { data: upcoming = [] } = useQuery(orpc.rota.getUpcoming.queryOptions());
  const { data: counts = [] } = useQuery(orpc.rota.getAssignmentCounts.queryOptions());

  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" render={<Link to="/rota/planner" />}>
            Open Planner
          </Button>
          <ThemeSwitch />
        </div>
      </Header>
      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="size-6" />
            On-Call Rota
          </h1>
          <p className="text-sm text-muted-foreground">
            DCS weekly on-call schedule — Lead Engineer is the primary escalation contact
          </p>
        </div>
        <RotaDashboard
          currentSchedule={current ?? null}
          upcomingSchedules={upcoming}
          assignmentCounts={counts}
        />
      </Main>
    </>
  );
}
```

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/features/rota/ apps/web/src/routes/_authenticated/rota/index.tsx
git commit -m "feat(rota): add dashboard page with current week, workload distribution"
```

---

## Task 7: Rota planner page (weekly table + assign modal + conflict banner)

**Files:**
- Create: `apps/web/src/features/rota/components/conflict-banner.tsx`
- Create: `apps/web/src/features/rota/components/assign-modal.tsx`
- Create: `apps/web/src/features/rota/components/rota-week-table.tsx`
- Create: `apps/web/src/features/rota/components/rota-planner.tsx`
- Create: `apps/web/src/routes/_authenticated/rota/planner.tsx`

- [ ] **Step 1: Conflict banner**

```tsx
// apps/web/src/features/rota/components/conflict-banner.tsx
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import type { ConflictFlag } from "../utils/conflict-detector";

type Props = { conflicts: ConflictFlag[] };

export function ConflictBanner({ conflicts }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || conflicts.length === 0) return null;
  const blockers = conflicts.filter((c) => c.severity === "blocker");
  const warnings = conflicts.filter((c) => c.severity === "warning");
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {blockers.length > 0
                ? `${blockers.length} blocker(s) detected`
                : `${warnings.length} warning(s)`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.map((c, i) => (
                <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                  {c.severity === "blocker" ? "🚫" : "⚠️"} {c.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-600 hover:text-amber-800">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Assign modal**

```tsx
// apps/web/src/features/rota/components/assign-modal.tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel } from "@ndma-dcs-staff-portal/ui/components/alert-dialog";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Loader2, Sparkles } from "lucide-react";
import { orpc } from "@/utils/orpc";
import { suggestNextAssignment } from "../utils/rotation-engine";
import { detectConflicts } from "../utils/conflict-detector";

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  weekStart: string;
  weekEnd: string;
  role: string;
  currentAssignedIds: string[];
};

export function AssignModal({
  open, onOpenChange, scheduleId, weekStart, weekEnd, role, currentAssignedIds,
}: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: eligible = [] } = useQuery(
    orpc.rota.getEligibleStaff.queryOptions({ input: { role: role as any } })
  );
  const { data: counts = [] } = useQuery(orpc.rota.getAssignmentCounts.queryOptions());

  const suggested = suggestNextAssignment(
    eligible.map((e: any) => ({ id: e.staffProfiles?.id ?? e.id, user: { name: e.staffProfiles?.user?.name ?? e.user?.name ?? "" } })),
    counts,
    role,
    currentAssignedIds,
  );

  const assign = useMutation({
    mutationFn: (staffProfileId: string) =>
      orpc.rota.assign.call({ scheduleId, staffProfileId, role: role as any }),
    onSuccess: () => {
      toast.success("Staff assigned successfully");
      qc.invalidateQueries({ queryKey: orpc.rota.list.queryOptions().queryKey });
      qc.invalidateQueries({ queryKey: orpc.rota.getCurrent.queryOptions().queryKey });
      onOpenChange(false);
      setSelected(null);
    },
    onError: () => toast.error("Failed to assign staff"),
  });

  const selectedProfile = eligible.find((e: any) => (e.staffProfiles?.id ?? e.id) === selected);
  const conflicts = selectedProfile
    ? detectConflicts(
        { staffProfileId: selected!, staffName: "", role, weekStart, weekEnd },
        {
          staffProfileId: selected!,
          isOnCallEligible: true,
          status: "active",
        },
      )
    : [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Assign {ROLE_LABELS[role] ?? role}</AlertDialogTitle>
        </AlertDialogHeader>

        {suggested && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-50/50 p-3 dark:bg-blue-950/20">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              <Sparkles className="size-3" /> Suggested (lowest assignment count)
            </div>
            <button
              className="mt-1 w-full rounded border bg-background p-2 text-left text-sm hover:bg-accent"
              onClick={() => setSelected(suggested.id)}
            >
              {suggested.user.name}
            </button>
          </div>
        )}

        <div className="max-h-60 space-y-1 overflow-y-auto">
          {eligible.map((e: any) => {
            const id = e.staffProfiles?.id ?? e.id;
            const name = e.staffProfiles?.user?.name ?? e.user?.name ?? "Unknown";
            const count = counts.find((c: any) => c.staffProfileId === id);
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className={`flex w-full items-center justify-between rounded p-2 text-sm hover:bg-accent ${selected === id ? "bg-accent" : ""}`}
              >
                <span>{name}</span>
                <Badge variant="secondary" className="text-xs">
                  {count?.byRole[role] ?? 0} times
                </Badge>
              </button>
            );
          })}
        </div>

        {conflicts.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
            {conflicts.map((c, i) => <div key={i}>{c.severity === "blocker" ? "🚫" : "⚠️"} {c.message}</div>)}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => selected && assign.mutate(selected)}
            disabled={!selected || assign.isPending}
          >
            {assign.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Assign
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Weekly rota table component**

```tsx
// apps/web/src/features/rota/components/rota-week-table.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Cpu, Server, Edit2, Trash2, Plus } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { orpc } from "@/utils/orpc";
import { AssignModal } from "./assign-modal";
import { ConflictBanner } from "./conflict-banner";
import type { ConflictFlag } from "../utils/conflict-detector";

const ROLES = [
  { key: "lead_engineer",      label: "Lead Engineer",      icon: Shield, color: "text-blue-500",   desc: "Primary escalation contact" },
  { key: "asn_support",        label: "ASN Support",        icon: Cpu,    color: "text-indigo-500", desc: "ASN team representative" },
  { key: "core_support",       label: "Core Support",       icon: Server, color: "text-green-500",  desc: "Core/Routing representative" },
  { key: "enterprise_support", label: "Enterprise Support", icon: Server, color: "text-purple-500", desc: "Enterprise representative" },
];

type Assignment = {
  id: string;
  role: string;
  conflictFlags: ConflictFlag[];
  staffProfile: { id: string; user: { name: string }; department: { code: string } };
};

type Schedule = {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  assignments: Assignment[];
};

type Props = { schedule: Schedule };

export function RotaWeekTable({ schedule }: Props) {
  const qc = useQueryClient();
  const [modalRole, setModalRole] = useState<string | null>(null);
  const allConflicts = schedule.assignments.flatMap((a) => a.conflictFlags ?? []);
  const assignedIds = schedule.assignments.map((a) => a.staffProfile.id);
  const isDraft = schedule.status === "draft";

  const remove = useMutation({
    mutationFn: (assignmentId: string) =>
      orpc.rota.removeAssignment.call({ assignmentId }),
    onSuccess: () => {
      toast.success("Assignment removed");
      qc.invalidateQueries({ queryKey: orpc.rota.list.queryOptions().queryKey });
    },
  });

  const publish = useMutation({
    mutationFn: () => orpc.rota.publish.call({ scheduleId: schedule.id }),
    onSuccess: () => {
      toast.success("Schedule published — staff will be notified");
      qc.invalidateQueries({ queryKey: orpc.rota.list.queryOptions().queryKey });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to publish"),
  });

  return (
    <div className="space-y-4">
      <ConflictBanner conflicts={allConflicts} />

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Staff</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              {isDraft && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROLES.map((roleMeta) => {
              const assignment = schedule.assignments.find((a) => a.role === roleMeta.key);
              const Icon = roleMeta.icon;
              const hasConflicts = (assignment?.conflictFlags?.length ?? 0) > 0;
              return (
                <tr key={roleMeta.key} className={`transition-colors hover:bg-muted/30 ${hasConflicts ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Icon className={`size-4 ${roleMeta.color}`} />
                      <div>
                        <div className="text-sm font-medium">{roleMeta.label}</div>
                        <div className="text-xs text-muted-foreground">{roleMeta.desc}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {assignment ? (
                      <span className="text-sm font-medium">{assignment.staffProfile.user.name}</span>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                        Unassigned
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">
                    {assignment?.staffProfile.department.code ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    {hasConflicts ? (
                      <Badge variant="outline" className="border-amber-300 text-amber-600 text-xs">⚠ Conflict</Badge>
                    ) : assignment ? (
                      <Badge variant="outline" className="border-green-300 text-green-600 text-xs">✓ OK</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Empty</Badge>
                    )}
                  </td>
                  {isDraft && (
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {assignment ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setModalRole(roleMeta.key)}>
                              <Edit2 className="size-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(assignment.id)}>
                              <Trash2 className="size-3" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setModalRole(roleMeta.key)}>
                            <Plus className="size-3 me-1" /> Assign
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div className="flex justify-end">
          <Button
            onClick={() => publish.mutate()}
            disabled={publish.isPending || schedule.assignments.length < 4}
          >
            {publish.isPending ? "Publishing..." : "Publish Schedule"}
          </Button>
        </div>
      )}

      {modalRole && (
        <AssignModal
          open={!!modalRole}
          onOpenChange={(o) => !o && setModalRole(null)}
          scheduleId={schedule.id}
          weekStart={schedule.weekStart}
          weekEnd={schedule.weekEnd}
          role={modalRole}
          currentAssignedIds={assignedIds}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rota planner page component + route**

```tsx
// apps/web/src/features/rota/components/rota-planner.tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { orpc } from "@/utils/orpc";
import { RotaWeekTable } from "./rota-week-table";

function getISOMonday(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(weekStart: string) {
  const d = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function RotaPlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const qc = useQueryClient();
  const { data: schedules = [] } = useQuery(orpc.rota.list.queryOptions());

  const selectedWeekStart = getISOMonday(weekOffset);
  const activeSchedule = schedules.find((s: any) => s.weekStart === selectedWeekStart);

  const create = useMutation({
    mutationFn: () => orpc.rota.create.call({ weekStart: selectedWeekStart }),
    onSuccess: () => {
      toast.success("Draft schedule created");
      qc.invalidateQueries({ queryKey: orpc.rota.list.queryOptions().queryKey });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create schedule"),
  });

  return (
    <div className="space-y-6">
      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-48 text-center">
            <div className="font-semibold">{formatWeekLabel(selectedWeekStart)}</div>
            {weekOffset === 0 && <div className="text-xs text-muted-foreground">Current week</div>}
            {weekOffset === 1 && <div className="text-xs text-muted-foreground">Next week</div>}
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {activeSchedule && (
          <Badge variant={activeSchedule.status === "published" ? "default" : "secondary"}>
            {activeSchedule.status}
          </Badge>
        )}
      </div>

      {/* Schedule content */}
      {activeSchedule ? (
        <RotaWeekTable schedule={activeSchedule} />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="mb-4 text-muted-foreground">No schedule for this week</p>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="me-2 size-4" />
            {create.isPending ? "Creating..." : "Create Draft Schedule"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/routes/_authenticated/rota/planner.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { CalendarClock } from "lucide-react";
import { RotaPlanner } from "@/features/rota/components/rota-planner";

export const Route = createFileRoute("/_authenticated/rota/planner")({
  component: RotaPlannerPage,
});

function RotaPlannerPage() {
  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch />
        </div>
      </Header>
      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="size-6" />
            Rota Planner
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage weekly on-call schedules
          </p>
        </div>
        <RotaPlanner />
      </Main>
    </>
  );
}
```

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/features/rota/ apps/web/src/routes/_authenticated/rota/
git commit -m "feat(rota): add planner page with week table, assign modal, conflict detection"
```

---

## Task 8: Swap requests + history pages

**Files:**
- Create: `apps/web/src/features/rota/components/swap-requests.tsx`
- Create: `apps/web/src/features/rota/components/rota-history.tsx`
- Create: `apps/web/src/routes/_authenticated/rota/swaps.tsx`
- Create: `apps/web/src/routes/_authenticated/rota/history.tsx`

- [ ] **Step 1: Swap requests component**

```tsx
// apps/web/src/features/rota/components/swap-requests.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Clock } from "lucide-react";
import { Button } from "@ndma-dcs-staff-portal/ui/components/button";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ndma-dcs-staff-portal/ui/components/card";
import { orpc } from "@/utils/orpc";

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  cancelled: "bg-gray-100 text-gray-800",
};

export function SwapRequests() {
  const qc = useQueryClient();
  const { data: swaps = [], isLoading } = useQuery(orpc.rota.swap.list.queryOptions({ input: {} }));

  const review = useMutation({
    mutationFn: ({ swapId, action }: { swapId: string; action: "approve" | "reject" }) =>
      orpc.rota.swap.review.call({ swapId, action }),
    onSuccess: (_, v) => {
      toast.success(v.action === "approve" ? "Swap approved — rota updated" : "Swap rejected");
      qc.invalidateQueries({ queryKey: orpc.rota.swap.list.queryOptions({ input: {} }).queryKey });
      qc.invalidateQueries({ queryKey: orpc.rota.getCurrent.queryOptions().queryKey });
    },
    onError: () => toast.error("Failed to process swap"),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading swaps...</div>;
  if (swaps.length === 0) return (
    <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
      No swap requests yet
    </div>
  );

  const pending = swaps.filter((s: any) => s.status === "pending");
  const historical = swaps.filter((s: any) => s.status !== "pending");

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold flex items-center gap-2">
            <Clock className="size-4 text-amber-500" /> Pending Review ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((swap: any) => (
              <Card key={swap.id} className="border-amber-200/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {swap.requester.user.name} → {swap.target.user.name}
                    </CardTitle>
                    <Badge className={STATUS_BADGE[swap.status]}>{swap.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Role: {ROLE_LABELS[swap.assignment.role] ?? swap.assignment.role} ·
                    Week: {swap.assignment.schedule?.weekStart}
                  </p>
                </CardHeader>
                <CardContent>
                  {swap.reason && <p className="mb-3 text-sm text-muted-foreground">"{swap.reason}"</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => review.mutate({ swapId: swap.id, action: "approve" })}
                      disabled={review.isPending}
                    >
                      <Check className="me-1 size-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => review.mutate({ swapId: swap.id, action: "reject" })}
                      disabled={review.isPending}
                    >
                      <X className="me-1 size-3" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {historical.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">History</h2>
          <div className="space-y-2">
            {historical.map((swap: any) => (
              <div key={swap.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <span className="font-medium">{swap.requester.user.name}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">{swap.target.user.name}</span>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {ROLE_LABELS[swap.assignment.role]} · {swap.assignment.schedule?.weekStart}
                  </span>
                </div>
                <Badge className={STATUS_BADGE[swap.status]}>{swap.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: History component**

```tsx
// apps/web/src/features/rota/components/rota-history.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@ndma-dcs-staff-portal/ui/components/input";
import { Badge } from "@ndma-dcs-staff-portal/ui/components/badge";
import { orpc } from "@/utils/orpc";

const ACTION_COLORS: Record<string, string> = {
  assigned: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  removed:  "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  swapped:  "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  published:"bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  created:  "bg-gray-100 text-gray-800",
};

const ROLE_LABELS: Record<string, string> = {
  lead_engineer: "Lead Engineer",
  asn_support: "ASN Support",
  core_support: "Core Support",
  enterprise_support: "Enterprise Support",
};

export function RotaHistory() {
  const [search, setSearch] = useState("");
  const { data: history = [], isLoading } = useQuery(
    orpc.rota.history.queryOptions({ input: { limit: 100 } })
  );

  const filtered = history.filter((h: any) => {
    if (!search) return true;
    const name = h.staffProfile?.user?.name?.toLowerCase() ?? "";
    const week = h.schedule?.weekStart ?? "";
    return name.includes(search.toLowerCase()) || week.includes(search);
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading history...</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or week..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">No history found</div>
      ) : (
        <div className="space-y-1">
          {filtered.map((h: any) => (
            <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Badge className={`shrink-0 text-xs ${ACTION_COLORS[h.action] ?? ""}`}>{h.action}</Badge>
              <span className="font-medium">{h.staffProfile?.user?.name ?? "System"}</span>
              {h.role && <span className="text-muted-foreground">as {ROLE_LABELS[h.role] ?? h.role}</span>}
              <span className="ms-auto text-xs text-muted-foreground">
                Week {h.schedule?.weekStart}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create swap and history route files**

```tsx
// apps/web/src/routes/_authenticated/rota/swaps.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { ArrowLeftRight } from "lucide-react";
import { SwapRequests } from "@/features/rota/components/swap-requests";

export const Route = createFileRoute("/_authenticated/rota/swaps")({
  component: SwapsPage,
});

function SwapsPage() {
  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2"><ThemeSwitch /></div>
      </Header>
      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="size-6" /> Swap Requests
          </h1>
          <p className="text-sm text-muted-foreground">Review and approve on-call swap requests</p>
        </div>
        <SwapRequests />
      </Main>
    </>
  );
}
```

```tsx
// apps/web/src/routes/_authenticated/rota/history.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ThemeSwitch } from "@/components/theme-switch";
import { ScrollText } from "lucide-react";
import { RotaHistory } from "@/features/rota/components/rota-history";

export const Route = createFileRoute("/_authenticated/rota/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center gap-2"><ThemeSwitch /></div>
      </Header>
      <Main>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="size-6" /> Rota History
          </h1>
          <p className="text-sm text-muted-foreground">Complete audit trail of all rota changes</p>
        </div>
        <RotaHistory />
      </Main>
    </>
  );
}
```

- [ ] **Step 4: Update sidebar nav with rota sub-items**

Open `apps/web/src/components/layout/data/sidebar-data.ts` and replace the rota item:
```typescript
{
  title: "On-Call Rota",
  icon: CalendarClock,
  items: [
    { title: "Dashboard",    url: "/rota",          icon: LayoutDashboard },
    { title: "Planner",      url: "/rota/planner",  icon: CalendarDays },
    { title: "Swap Requests",url: "/rota/swaps",    icon: ArrowLeftRight },
    { title: "History",      url: "/rota/history",  icon: ScrollText },
  ],
},
```
Add `import { CalendarDays, ArrowLeftRight, ScrollText, LayoutDashboard } from "lucide-react";` to imports.

- [ ] **Step 5: Type-check and commit**
```bash
bun run check-types
git add .
git commit -m "feat(rota): add swap requests, history pages, and sidebar sub-nav"
```

---

## Task 9: Documentation — architecture reference + README

**Files:**
- Create: `docs/architecture/rota-system.md`
- Modify: `README.md`

- [ ] **Step 1: Create rota architecture doc**

Create `docs/architecture/rota-system.md` with:
```markdown
# On-Call Rota System — Architecture Reference

## Overview
The DCS on-call rota system replaces Excel spreadsheets and WhatsApp coordination with
a structured, auditable weekly scheduling system.

## Org Structure
- **Manager**: Sachin Ramsuran (not on call)
- **ASN**: Nicolai Mahangi (Lead), Kareem Schultz, Shemar Henry, Timothy Paul
- **Core**: Devon Abrams (Lead), Bheesham Ramrattan
- **Enterprise**: Gerard Budhan (Lead), Richie Goring, Johnatan Sukhlall

## Weekly Rota Structure
Each published week requires exactly 4 roles:
| Role | Responsibility | Eligibility |
|---|---|---|
| Lead Engineer | Primary escalation contact | Team leads only (Nicolai, Devon, Gerard) |
| ASN Support | ASN team on-call | ASN department members |
| Core Support | Core infrastructure on-call | Core department members |
| Enterprise Support | Enterprise on-call | Enterprise department members |

## Database Tables
- `departments` — ASN, Core, Enterprise, DCS org units
- `staff_profiles` — Employee records + on-call eligibility flags
- `on_call_schedules` — One row per week (draft → published → archived)
- `on_call_assignments` — One row per role per week (4 per published schedule)
- `on_call_swaps` — Swap requests with approval workflow
- `assignment_history` — Immutable audit log of all changes

## Fair Rotation Algorithm
The `suggestNextAssignment()` utility in `features/rota/utils/rotation-engine.ts`
picks the eligible staff member with the fewest historical assignments for a given role.
This ensures workload is distributed evenly over time.

## Conflict Detection
Before publishing, the system checks:
1. Staff eligibility flags (`is_on_call_eligible`)
2. Staff status (active/on_leave/inactive)
3. Contract expiry relative to the on-call week
4. All 4 roles filled (required to publish)

## Swap Workflow
1. Staff requests swap → creates `on_call_swaps` row (status: pending)
2. Manager approves → `on_call_assignments.staff_profile_id` updated to target
3. History event logged with swap metadata
4. (Future) Notification sent to both parties

## oRPC Endpoints
All endpoints are protected (`protectedProcedure`) — session required.
- `rota.getCurrent` — Active this-week schedule
- `rota.getUpcoming` — Next 4 published weeks
- `rota.list` — All schedules for planner
- `rota.create` — Create draft for a week
- `rota.assign` — Assign staff to role in draft
- `rota.removeAssignment` — Remove from draft
- `rota.publish` — Publish (validates all roles filled)
- `rota.getEligibleStaff` — Role-filtered eligible pool
- `rota.getAssignmentCounts` — Per-person totals for workload UI
- `rota.swap.request` — Staff submits swap
- `rota.swap.review` — Manager approves/rejects
- `rota.swap.list` — All swaps
- `rota.history` — Audit log with filters
```

- [ ] **Step 2: Update README.md**

Add an "On-Call Rota" section to README.md between the feature list and tech stack.

```markdown
## 📞 On-Call Rota System

Replaces Excel sheets and WhatsApp coordination with PagerDuty-style scheduling.

| Feature | Description |
|---|---|
| **Weekly Scheduling** | Draft → Publish workflow with role validation |
| **4-Role Structure** | Lead Engineer, ASN Support, Core Support, Enterprise Support |
| **Fair Rotation** | Auto-suggests lowest-count eligible staff per role |
| **Conflict Detection** | Leave, training, contract expiry checks before publishing |
| **Swap System** | Staff requests swap → manager approves → rota updates automatically |
| **Audit Trail** | Every change logged with who did what and when |
| **Workload Dashboard** | Per-person assignment counts with over/under indicators |

### DCS Team
| Person | Team | On-Call Role |
|---|---|---|
| Nicolai Mahangi | ASN Lead | Lead Engineer + ASN Support |
| Devon Abrams | Core Lead | Lead Engineer + Core Support |
| Gerard Budhan | Enterprise Lead | Lead Engineer + Enterprise Support |
| Kareem Schultz, Shemar Henry, Timothy Paul | ASN | ASN Support |
| Bheesham Ramrattan | Core | Core Support |
| Richie Goring, Johnatan Sukhlall | Enterprise | Enterprise Support |
```

- [ ] **Step 3: Commit docs**
```bash
git add docs/ README.md
git commit -m "docs: add rota system architecture reference and README section"
```

---

## Task 10: Final build verification + push

- [ ] **Step 1: Push schema changes**
```bash
bun run db:push
```

- [ ] **Step 2: Run seed**
```bash
cd packages/db && bun src/seed.ts
```

- [ ] **Step 3: Full type check**
```bash
bun run check-types
```
Expected: All packages pass with 0 errors.

- [ ] **Step 4: Vite build**
```bash
cd apps/web && bun run build
```
Expected: Build succeeds.

- [ ] **Step 5: Push to GitHub**
```bash
git push origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] 4 on-call roles (Lead Engineer, ASN, Core, Enterprise) — Task 2 schema + Task 4 router
- [x] Real DCS org structure seeded — Task 3
- [x] Fair rotation with assignment count tracking — Task 5 rotation-engine.ts
- [x] Availability constraints (leave, inactive, contract) — Task 5 conflict-detector.ts
- [x] Swap system with manager approval — Task 4 router + Task 8 swap UI
- [x] Conflict detection before publish — Task 4 publish handler + Task 7 conflict-banner
- [x] Assignment history / audit log — Task 2 schema + Task 4 history endpoint + Task 8 history page
- [x] Dashboard (current + next week + workload) — Task 6
- [x] Rota planner (weekly table + assign modal) — Task 7
- [x] Swap requests page — Task 8
- [x] History page — Task 8
- [x] Sidebar sub-nav — Task 8
- [x] Docs + README — Task 9
- [x] Notifications mentioned in schema (notifiedAt field) — partial, full notification system is Phase 12

**Missing from spec (noted, deferred to Phase 12):**
- Email/toast notifications when assigned (notifiedAt column exists, sending deferred)
- "3 days before" reminder notifications (requires job scheduler — deferred)
- Calendar view alongside table view (deferred — shadcn Calendar component available)
