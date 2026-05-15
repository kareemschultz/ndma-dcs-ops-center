# CLAUDE.md — DCS Ops Center

> **⚠️ Before working on this repo, read `IMPLEMENTATION_PLAN.md` at repo root first.**
> It contains the phase status, hard invariants, and session protocols. Do not begin work without following the starting-work protocol in `IMPLEMENTATION_PLAN.md`.
>
> Authoritative spec: [`docs/superpowers/plans/2026-04-23-master-remediation-plan.md`](docs/superpowers/plans/2026-04-23-master-remediation-plan.md)

## ⚠️ Lessons learned (2026-04-25 course correction)

A multi-agent confusion in late April 2026 caused Phase 0 migrations to sit unmerged on a branch for ~2 days while the CHANGELOG and gate ceremony commit on main claimed Phase 0 was 🟢 Done. Codex then started Phase 1 (PR #15) on a main that didn't actually have the Phase 0 migrations, violating Hard Invariant #1.

**To prevent recurrence, every agent MUST:**

1. **Trust the SHA, not the prose.** Before claiming a phase is done or branching the next phase:
   - Read `IMPLEMENTATION_PLAN.md` Phase status table — note the gate commit SHA
   - Run `git log <SHA> --stat` and verify the SHA actually contains the migration files / schema deletions / etc. that the phase was supposed to ship
   - If the SHA on main doesn't match what the prose claims, the prose is wrong — fix the docs, don't start the next phase
2. **Don't write CHANGELOG entries before merge.** Aspirational entries are dangerous — follow-up agents read them and trust them. Either (a) write the CHANGELOG entry as part of the gate-ceremony commit AFTER the phase merges, or (b) prefix aspirational text with `⚠️ ASPIRATIONAL — not yet shipped`.
3. **One PR per phase.** If a branch's PR is merged but the branch is re-pushed with new commits afterward, those commits are STRANDED — open a new PR. Never assume "the branch is merged" means "the latest commits on the branch are on main".
4. **CI typecheck > local typecheck.** Turbo can cache stale results. When verifying before final merge, `rm -rf .turbo && bun run check-types` to force a clean run, or rely on the GitHub Actions CI run.
5. **Read AGENT_LOG.md "last 3 entries" literally.** The starting-work protocol says read 3 entries because the most recent one might be a course correction overriding the entry below it. Don't skim — read.

**Stale Codex branches NOT to merge from:** `codex/phase1-foundation`, `codex/phase2-appraisals`, `codex/phase3-operational-hr`, `codex/phase4-shift-scheduling`, `codex/phase5-leave-policy`. These are pre-2026-04-23-planning work with phase numbering that does NOT match the new master plan. Treat as historical reference only.

## Project Overview
Enterprise internal operations platform for NDMA Data Centre Services (DCS).
Modules: Work Management · Incident Management · On-Call Rota · Procurement · Leave · Staff/Compliance · Audit · Access Management · Temporary Changes · Analytics · Import Pipeline.

See `/docs/architecture/` for detailed reference docs.

---

## Monorepo Structure
```
apps/web/          → React + TanStack Router frontend (Vite, port 3001)
apps/server/       → Hono backend (port 3000)
apps/docs/         → Fumadocs documentation (Next.js, port 4000)
packages/api/      → oRPC procedures + context (shared by server)
packages/auth/     → Better Auth config (shared by server + web)
packages/db/       → Drizzle ORM schema + migrations
packages/env/      → Zod env validation (server.ts + web.ts)
packages/ui/       → Shared shadcn/ui components
packages/config/   → Shared tsconfig base
```

## Key Package Names (workspace imports)
- `@ndma-dcs-staff-portal/api` — oRPC routers + procedures
- `@ndma-dcs-staff-portal/auth` — Better Auth instance
- `@ndma-dcs-staff-portal/db` — Drizzle db connection + schema
- `@ndma-dcs-staff-portal/env/server` — server env vars
- `@ndma-dcs-staff-portal/env/web` — web env vars
- `@ndma-dcs-staff-portal/ui` — shared UI components

## Dev Commands
```bash
bun run dev           # Start all apps via Turborepo
bun run dev:web       # Web only (port 5173)
bun run dev:server    # Server only (port 3000)
bun run db:start      # Start PostgreSQL Docker container
bun run db:push       # Push schema changes (dev)
bun run db:generate   # Generate migration files
bun run db:migrate    # Apply migrations
bun run db:studio     # Open Drizzle Studio
bun run check-types   # TypeScript type check all packages

# E2E tests (from apps/web/)
bun run test:e2e      # Run Playwright smoke tests (dev server must be running)
bun run test:e2e:ui   # Run with Playwright UI mode
```

## Adding oRPC Procedures
1. Create router file in `packages/api/src/routers/`
2. Import and add to `appRouter` in `packages/api/src/routers/index.ts`
3. Use `requireRole(resource, action)` for mutations; `protectedProcedure` for reads
4. Call `logAudit()` with `actorRole: context.userRole ?? undefined, correlationId: context.requestId` on every mutation
5. Client auto-gets types via `AppRouter` type inference

## Adding shadcn/ui Components
```bash
# To apps/web (main app)
cd apps/web && bunx shadcn@latest add <component>
# To packages/ui (shared)
cd packages/ui && bunx shadcn@latest add <component>
```

## Database Schema Pattern
- All schemas in `packages/db/src/schema/`
- Export from `packages/db/src/schema/index.ts`
- Use `pgTable`, Drizzle relations, proper indexes
- Auth tables ALREADY exist in `schema/auth.ts` — do NOT recreate

## Auth Pattern
- Better Auth config: `packages/auth/src/index.ts`
- oRPC context: `packages/api/src/context.ts` (session injected here)
- Use `protectedProcedure` for auth-gated API calls
- Auth Admin plugin adds `role` field to user table
- Client auth: `apps/web/src/lib/auth-client.ts`

---

## Auth Design Rules

### Local Admin Account (MANDATORY)
Even though LDAP / Active Directory will be the primary login method, the system
MUST always support a local email+password admin account. This serves as:
- Emergency fallback if AD is unreachable
- Initial setup account before AD integration is configured
- Break-glass admin access

`emailAndPassword: { enabled: true }` must ALWAYS remain in the Better Auth config.
Do NOT disable it when adding LDAP.

The login page must show BOTH:
1. Email + Password form (always visible)
2. "Sign in with Active Directory" button (LDAP, can be disabled/enabled via feature flag)

---

## RBAC Enforcement — MANDATORY

**ALL mutation procedures MUST use `requireRole`, NOT `protectedProcedure`.**

```typescript
import { requireRole } from "../index";

// WRONG — protectedProcedure on a mutation skips RBAC entirely:
create: protectedProcedure.input(...).handler(...)

// CORRECT — requireRole gates by resource + action:
create: requireRole("work", "create").input(...).handler(...)
```

The `requireRole` factory is exported from `packages/api/src/index.ts`. It:
1. Checks session exists (inherits from `protectedProcedure`)
2. Reads `context.userRole` (set by `createContext()` from the Better Auth user object)
3. Calls `ac.check({ role, resource, action })` against the 13-resource RBAC table in `packages/auth/src/index.ts`
4. Throws `ORPCError("FORBIDDEN")` if not allowed

**Context fields available in ALL procedures (set in `packages/api/src/context.ts`):**
- `context.session` — Better Auth session (user, expires, etc.)
- `context.userRole` — user's role string (or `null` if unauthenticated)
- `context.requestId` — UUID for log correlation (from `x-request-id` header or generated)
- `context.ipAddress` — client IP (from `x-forwarded-for` or `x-real-ip`)
- `context.userAgent` — user agent string

**Every logAudit call MUST include:**
```typescript
actorRole: context.userRole ?? undefined,
correlationId: context.requestId,
```

---

## ⚠️ Critical gotchas

> **Full gotchas reference:** [`docs/architecture/gotchas.md`](docs/architecture/gotchas.md) — oRPC, Zod v4, Drizzle, Base UI, dates, Recharts, router field-name gotchas, import enum, scheduling cutover, etc. **Read it before any non-trivial work.**

The highest-value ones — internalise these to avoid the most common/expensive mistakes:

- **oRPC queries:** always `orpc.X.queryOptions({ input: { ... } })`; procedures with no `.input()` take no args (no empty object). Flat args are a TS error AND a silent runtime bug.
- **All mutations** use `requireRole(resource, action)` (never `protectedProcedure`) and call `logAudit(...)` with `actorRole` + `correlationId`.
- **No green Tailwind classes** — blue/indigo palette only; chart hex `#3b82f6` / `#2563eb`, never `#22c55e` / `#16a34a`.
- **`packages/ui` is Base UI** (`@base-ui/react`, not Radix) — use the `render` prop, NOT `asChild`; the shared shadcn `Button` also has no `asChild` (use `buttonVariants()` for links / `useNavigate()` for nav).
- **Server (`bun --hot`) does NOT hot-reload `packages/` changes** — restart it manually after any `packages/api` or `packages/db` edit.
- **`drizzle-kit push` is blocked** (duplicated view `appraisal_tracker_view`) — apply migration `.sql` directly via `bun -e` + `pg`.
- **Dev DB is `localhost:5432/ndma_dcs_portal`** — not a one-off docker container.
- **`staff_profiles.id` is a `sp-…` slug** — never display it; use `employeeId`.
- **Lateness `month` is a full name** ("January"), exact-match unique constraint — `expandMonth()` before insert.
- **Tailwind v4** (CSS-first, no `tailwind.config.ts`); **login route is `/login`** (not `/sign-in`).

---

## Naming Conventions

- **Roster, NOT Rota** — User-facing text always uses "Roster" (e.g., "On-Call Roster", "Roster Planner"). Code identifiers (`/rota` URL paths, `orpc.rota.*`, schema table names) remain as-is for backwards compatibility.
- **DCS Ops Center** — Official product name (not "Staff Portal")
- **NDMA** = National Data Management Authority; **DCS** = Data Centre Services

---

## Design System
- **Colors:** Blue (primary), Green (success/available), Amber (warning), Red (danger/on-leave), Indigo (info)
- **Status badges:** Active=Green, On Leave=Red, On Call=Blue, Training=Purple
- **Icons:** Lucide icons ONLY (`lucide-react`)
- **Dark/Light mode:** Supported via `next-themes` + CSS variables
- **Tailwind first:** Use Tailwind utilities for all styling. No custom CSS unless unavoidable.

## Docs Structure
- `/docs/architecture/` — internal developer reference docs
- `/apps/docs/` — user-facing Fumadocs documentation site
- Keep CLAUDE.md concise; detailed references go in `/docs/architecture/`

---

## Database Schema Files (packages/db/src/schema/)

> **Full per-file table/router inventory:** [`docs/architecture/schema-and-routers.md`](docs/architecture/schema-and-routers.md)

~50 schema files — **browse `packages/db/src/schema/` for the full inventory**; every file's
tables/enums are re-exported via `schema/index.ts`. Only the non-obvious bits live here:

- `auth.ts` — Better Auth tables (user, session, account, verification). **DO NOT MODIFY.**
- **⚠️ Legacy (Phase 3 cutover gate pending):** `rota.ts` + `roster.ts` superseded by
  `scheduling.ts` + `noc-shifts.ts`. `operational-overlays.ts` — tables were renamed
  `overlay_*` → `routine_maintenance_*`; the file/variable names still say "overlay" (cosmetic).
- **Attendance has two models** (must reconcile — see CURRENT_PHASE.md audit item):
  `daily_attendance` (roll-call 10-status grid, feeds Monthly Grid) vs `attendance-logs.ts`
  (`attendance_logs` clock in/out, fed by the timesheet-PDF import). `lateness-records.ts` is
  a separate quarterly grid; `tosd-records.ts` is the Time-Off/Sick-Days register (preserves
  Phase-0-deleted callouts as `type='callout_legacy'`).
- `appraisal-tracker-view.ts` — a **read-only DB VIEW** (`pgView().existing()`); this is what
  breaks `drizzle-kit push` (see the migrations gotcha above).
- `staff.ts` — `staff_profiles.id` is a `sp-…` slug; **never display it** — use `employeeId`.

**⛔ Deleted in Phase 0 (migration 0009) — DO NOT recreate:** `attendance-exceptions.ts`,
`callouts.ts` (callout rows preserved in `tosd_records`).

---

## API Routers (packages/api/src/routers/)

> **Full router/procedure inventory:** [`docs/architecture/schema-and-routers.md`](docs/architecture/schema-and-routers.md)

~41 routers — **browse `packages/api/src/routers/`**; all registered in `routers/index.ts`,
and each procedure's signature is the source of truth. Only the non-obvious bits here:

- **⚠️ Legacy:** `rota.ts`, `roster.ts`, `overlays.ts` — superseded by `scheduling.ts` /
  `noc-shifts.ts`; Phase 3 cutover gate pending.
- `attendance-time.ts` is the **hub** linking clock logs ↔ lateness ↔ timesheets.
- `commendations.ts` + `noc-performance-journal.ts` use the `performance_journal` RBAC resource.
- `staff.list` input `limit` caps at **500**; mutation procedures use `requireRole` + `logAudit`.

**⛔ Deleted in Phase 0 — DO NOT recreate:** `attendance-exceptions.ts`, `callouts.ts` routers.

**Shared API utilities:**
- `packages/api/src/lib/audit.ts` — `logAudit(params)` — call from EVERY mutation procedure
- `packages/api/src/lib/notify.ts` — `createNotification(params)` — call when notifying a user
- `packages/api/src/lib/automation.ts` — `fireAutomationRules(module, event, payload)` — call after mutations to trigger rules
- `packages/api/src/lib/sync/types.ts` — `SyncConnector` / `ExternalAccount` / `SyncResult` interfaces
- `packages/api/src/lib/sync/index.ts` — `runSyncJob(syncJobId)` — processor called after triggerSync
- `packages/api/src/lib/sync/connectors/ipam.ts` — phpIPAM REST connector
- `packages/api/src/lib/sync/connectors/ldap.ts` — AD/LDAP connector (optional `ldapts` peer dep)

**Context (packages/api/src/context.ts):** Provides `session`, `ipAddress`, `userAgent`, `userRole`, `requestId` to all procedures.

---

## RBAC Resources (packages/auth/src/index.ts)

Resources: `staff`, `work`, `leave`, `rota`, `compliance`, `contract`, `appraisal`, `report`, `audit`, `settings`, `procurement`, `notification`, `access`, `appraisal_cycle`, `promotion_letter`, `performance_journal`, `career_path`, `ppe`, `callout`, `timesheet`, `shift`, `feedback`

Roles: `admin`, `hrAdminOps`, `manager`, `teamLead`, `personalAssistant`, `staff`, `viewer`

Scope helper: `packages/api/src/lib/scope.ts` — `canAccessStaffPrivate(ctx, staffProfileId)`, `getManagedStaffIds(ctx)`, `getCallerStaffProfile(ctx)`, `getDirectReports(teamLeadStaffProfileId)`

---

## Deployment

### Docker (production)

```bash
# Build and start (copy .env.example → .env, fill in secrets first)
docker compose -f docker-compose.prod.yml up -d --build

# Apply DB schema on first run
docker compose -f docker-compose.prod.yml exec app bun run db:push
```

**Key files:**
- `Dockerfile` — multi-stage build (deps → web-builder → server-builder → runner); final image is `oven/bun:1.3-slim` running as non-root `bun` user
- `docker-compose.prod.yml` — PostgreSQL 16-alpine + app container; no external ports on postgres
- Static web assets are built in CI and served directly by the Hono server

**Required env vars (production):**
- `DATABASE_URL` — full PostgreSQL connection string
- `BETTER_AUTH_SECRET` — 32+ char random secret
- `BETTER_AUTH_URL` — the public URL of the server (e.g. `https://ops.ndma.gov.gh`)
- `CORS_ORIGIN` — exact web app origin

### CI/CD

GitHub Actions: `.github/workflows/ci.yml` — type-check + build on every push/PR to `main`.

---

## Audit Logging Rule

**Every mutation procedure MUST call `logAudit()`** with:
- `actorId` + `actorName` from `context.session.user`
- `actorRole: context.userRole ?? undefined` — required for audit trail completeness
- `correlationId: context.requestId` — ties the log entry to the HTTP request
- `action` in dot-notation: `"module.resource.verb"` (e.g. `"work_item.create"`, `"rota.schedule.publish"`)
- `module`, `resourceType`, `resourceId`
- `beforeValue` + `afterValue` for updates (fetch the record first; omit `beforeValue` for creates)
- `ipAddress` + `userAgent` from context

## Multi-View Pages Pattern (List/Kanban/Grid/Calendar)

When a page supports multiple views (e.g., Work Register):
- Use a single `useQuery()` for data — all views share it
- Store `viewMode` in `useState<"list" | "kanban" | "grid">("list")`
- Render a toggle button group in the Header to switch modes
- Extract each view as a **separate component** (`WorkListView`, `WorkKanbanView`, etc.)
- Kanban grouping: client-side `array.filter(item => item.status === col)` per column — fast enough for ≤200 items
- `LoadingSkeleton` must adapt its rendering based on the active view mode
- Kanban columns should be horizontally scrollable: `flex overflow-x-auto gap-4`
