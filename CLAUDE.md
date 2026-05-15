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

## ⚠️ KNOWN GOTCHAS — DO NOT REPEAT

### Better-T Stack CLI
- **NEVER** combine `--yes` with explicit stack flags — they are mutually exclusive.
  The `--yes` flag uses defaults ONLY when no other flags are given.
- **Always** specify `--payments none --web-deploy none --server-deploy none --examples none`
  to avoid interactive prompts when running non-interactively.
- The `fumadocs` addon triggers an interactive template prompt that cannot be bypassed
  with flags alone. Add Fumadocs separately using `bunx create-fumadocs-app`.
- Correct reproduce command (from scaffold output):
  ```
  bun create better-t-stack@latest <name> --frontend tanstack-router --backend hono
    --runtime bun --database postgres --orm drizzle --api orpc --auth better-auth
    --payments none --addons turborepo --examples none --db-setup docker
    --web-deploy none --server-deploy none --git --package-manager bun --no-install
  ```

### oRPC
- The scaffold puts oRPC procedures in `packages/api/` (not `apps/server/`).
- `appRouter` must export `AppRouter` type for web client type inference.
- Both `RPCHandler` (/rpc/*) and `OpenAPIHandler` (/api-reference/*) are mounted in server.
- `createContext()` in `packages/api/src/context.ts` injects auth session.

### oRPC `queryOptions` — ALWAYS wrap input in `{ input: { ... } }` (CRITICAL)
- **WRONG:** `orpc.staff.list.queryOptions({ limit: 100, offset: 0 })`
- **CORRECT:** `orpc.staff.list.queryOptions({ input: { limit: 100, offset: 0 } })`
- The flat-args pattern is BOTH a TypeScript error AND a silent runtime bug (input never sent to server).
- Procedures with **no `.input()` call** use `queryOptions()` with no args — do NOT pass an empty object.
  - Examples: `orpc.services.list.queryOptions()`, `orpc.rota.getCurrent.queryOptions()`, `orpc.dashboard.opsReadiness.queryOptions()`, `orpc.leave.types.list.queryOptions()`
- `mutationOptions({ onSuccess, onError })` is unaffected — input goes in `mutation.mutate(input)`.
- `queryClient.invalidateQueries({ queryKey: orpc.X.list.key() })` is correct (no args to `key()`).
- Root cause: `@orpc/tanstack-query` `QueryKeyOptions<TInput>` type requires an `input:` key when `TInput` is not undefined.

### Zod v4 `z.record` — requires two arguments
- **WRONG:** `z.record(z.string())` — TypeScript infers value type as `unknown`
- **CORRECT:** `z.record(z.string(), z.string())` — explicit key + value types

### Better Auth
- Auth config in `packages/auth/src/index.ts`, NOT in apps/server.
- `sameSite: "none"` + `secure: true` on cookies — requires HTTPS in production.
  For local dev, may need to change to `sameSite: "lax"` + `secure: false`.
- When adding the Admin plugin, regenerate DB schema: `bunx @better-auth/cli generate`.

### Base UI — `render` prop, NOT `asChild`
- `packages/ui` uses **`@base-ui/react`** primitives (not Radix UI) for all interactive
  components: DropdownMenu, AlertDialog, Collapsible, Sidebar, etc.
- Base UI uses a `render` prop for element composition. `asChild` does NOT exist.
- **Pattern:** `<DropdownMenuTrigger render={<Button />}>children</DropdownMenuTrigger>`
- **NOT:** `<DropdownMenuTrigger asChild><Button>children</Button></DropdownMenuTrigger>`
- Similarly: `<SidebarMenuButton render={<Link to="/" />}>` not `asChild`.
- Base UI open state attributes: `data-open` / `data-closed` (not `data-[state=open]`).
- Tailwind classes must use `data-open:` / `group-data-[open]/name:` variants accordingly.

### Shared `Button` — no `asChild` prop
- The `Button` in `@ndma-dcs-staff-portal/ui` (shadcn button) does NOT support `asChild`.
- **WRONG:** `<Button asChild><Link to="/foo">Go</Link></Button>`
- **CORRECT:** Style the Link directly, or wrap Button's click handler with `useNavigate()`.
- For navigation buttons, prefer: `<Button onClick={() => navigate({ to: "/foo" })}>Go</Button>`
- Or use a plain styled `<Link>` (TanStack Router) with Tailwind button-like classes.

### External links — use `buttonVariants()` helper, NOT `Button render={<a>}`
- `Button render={<a href="...">}` triggers "nativeButton: true" Base UI warning and may break in some browsers.
- **CORRECT pattern for external links:**
  ```tsx
  import { buttonVariants } from "@ndma-dcs-staff-portal/ui/components/button";
  <a href="https://example.com" target="_blank" rel="noopener noreferrer"
     className={buttonVariants({ variant: "outline", size: "sm" })}>
    Open
  </a>
  ```
- This renders a real `<a>` tag styled like a Button without violating Base UI's component model.

### Design — Primary color is blue/indigo (no green in the palette)
- CSS variables in `globals.css` are already blue/indigo (`oklch(0.546 0.245 262.881)`).
- **Never introduce `bg-green-*`, `text-green-*`, `border-green-*`, `ring-green-*` Tailwind classes.** Use blue equivalents.
- **Chart hex colors:** use `#3b82f6` (blue-500) and `#2563eb` (blue-700) — NOT `#22c55e` / `#16a34a`.
- Status mapping: `approved`/`completed`/`done`/`active`/`light_load`/`synced` → **blue**, not green.

### TanStack Router — `Link to=` must match registered routes
- The `to` prop on `<Link>` is strictly typed against the generated `routeTree.gen.ts`.
- **NEVER** use `to="/cycles/$cycleId"` if that route file doesn't exist yet — it will cause a TS error.
- When adding a new page, create the route file FIRST, then add sidebar links and inter-page links.
- If a feature isn't ready, use a disabled button (`<Button disabled>`) instead of a broken link.
- The route tree is auto-generated by Vite on `dev` or `build` — no manual registration needed.

### Drizzle self-referential tables (parentId / subtasks)
- Drizzle v0.x has limited support for self-referential FK constraints in `pgTable`.
- For `parentId` (e.g., work item subtasks): define as bare `text("parent_id")` with NO `.references()` call.
- The actual FK constraint is created by PostgreSQL when `db:push` runs, but Drizzle's type system won't infer the relation.
- **DO NOT** try to add a `.references(() => sameTable.id)` — Drizzle will crash on circular references.

### Drizzle relations — named relations for self-joins
- When a table has TWO relations to the same target table (e.g., `workItemDependencies` has
  `workItemId` and `dependsOnId` both pointing at `workItems`), you MUST use `relationName`:
  ```typescript
  // In workItemsRelations:
  blockedBy: many(workItemDependencies, { relationName: "dependsOn" }),
  blocking: many(workItemDependencies, { relationName: "workItem" }),
  // In workItemDependenciesRelations:
  workItem: one(workItems, { ..., relationName: "workItem" }),
  dependsOn: one(workItems, { ..., relationName: "dependsOn" }),
  ```
- Mismatched or missing `relationName` causes Drizzle to throw at query time.

### PostgreSQL container auth — scram-sha-256
- The Postgres 18 Docker container uses `scram-sha-256` for all TCP connections by default.
- If you recreate the container with a different `POSTGRES_PASSWORD`, the existing password hash
  on disk (from the old volume) won't match. `db:push` will hang with "Pulling schema from database...".
- **Fix:** `docker exec <container> psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'password'"`
- If that also fails, destroy the volume: `docker compose down -v && docker compose up -d`

### date-fns with ISO date strings
- Drizzle returns `date` columns as plain strings (`"2026-04-12"`), not Date objects.
- Always parse before using date-fns: `format(parseISO(item.dueDate), "d MMM yyyy")`
- **WRONG:** `format(item.dueDate, "d MMM yyyy")` — will error on a string input.
- For `.toISOString().slice(0, 10)` vs `.split("T")[0]`: prefer `.slice(0, 10)` — it's the same but more explicit.

### Recharts — per-bar coloring
- Use `<Cell>` inside `<Bar>` to color individual bars differently:
  ```tsx
  <Bar dataKey="value">
    {data.map((entry, index) => (
      <Cell key={index} fill={colorMap[entry.name]} />
    ))}
  </Bar>
  ```
- Wrap in `<ResponsiveContainer width="100%" height={300}>` for fluid width.
- For horizontal bars: `<BarChart layout="vertical">` with `<XAxis type="number">` and `<YAxis type="category" dataKey="name">`.

### Zod `.default()` — NEVER use on form schema fields
- **WRONG:** `status: z.enum(["active"]).default("active")` in a form schema
- React Hook Form + zodResolver: `.default()` doesn't populate `defaultValues` — it silently breaks validation.
- **CORRECT:** Define `defaultValues` in `useForm({ defaultValues: { status: "active" } })` and keep the Zod schema without `.default()`.
- Exception: `.default()` is fine in API INPUT schemas (not form schemas) since those go through direct Zod parsing.

### z.coerce.number() — returns `unknown` in Zod v4
- **WRONG:** `z.coerce.number()` — Zod v4 returns `unknown` type
- **CORRECT:** `z.number()` with `{ valueAsNumber: true }` in the register call:
  ```tsx
  <input type="number" {...register("amount", { valueAsNumber: true })} />
  ```

### Tailwind CSS
- This project uses **Tailwind CSS v4** (not v3).
- v4 uses CSS-first config (`@import "tailwindcss"` in CSS, no `tailwind.config.ts`).
- shadcn/ui components are configured for Tailwind v4.

### Workload router return shape — DO NOT confuse with browser session stub
- Our `workload.get` returns `{ staff: { id, name, email, department }, openWorkItems, overdueWorkItems, onCallRole, onLeave, overdueChanges, loadScore, loadLevel }`
- **NOT** `{ staffProfileId, staffName, itemCount, loadLevel }` — that was a simplified browser-session stub that was discarded
- In dashboard/workload UI, always use `entry.staff.name`, `entry.staff.id`, `entry.loadScore`

### Cycles router data shape
- `cycles.list` returns full Drizzle records including `cycleWorkItems: [{ workItem: { id, status } }]`
- `totalItems = cycle.cycleWorkItems.length`, `doneItems = cycle.cycleWorkItems.filter(cwi => cwi.workItem?.status === "done").length`
- Compute these client-side — the router does NOT add totalItems/doneItems fields

### Automation rules — fireAutomationRules call pattern
- Import: `import { fireAutomationRules } from "../lib/automation";`
- Call AFTER successful DB mutation: `await fireAutomationRules("work", "created", item as Record<string, unknown>)`
- Modules: `"work"`, `"incident"`, `"leave"`, `"temp_changes"`, `"procurement"`, `"rota"`
- Events per module: work→(created/status_changed/assigned/overdue), incident→(created/status_changed/resolved), leave→(requested/approved/rejected), temp_changes→(created/overdue/removed), procurement→(submitted/approved/rejected), rota→(published/swap_approved)
- Conditions evaluate against the payload's flat fields — use the actual DB column names as field names
- `{{fieldName}}` placeholders in action title/body are replaced with payload values at fire-time

### Login route is `/login`, NOT `/sign-in`
- The auth route is `apps/web/src/routes/login.tsx` → URL is `/login`
- Playwright tests and any deep-links to the auth page must use `/login`

### E2E Playwright tests — auth flow tests need empty storageState
- All smoke tests use the stored session from `tests/.auth/user.json`
- Auth flow tests (testing unauthenticated behavior) MUST use `test.use({ storageState: { cookies: [], origins: [] } })`
- Otherwise the stored session auto-redirects `/login` → `/` and the login form never appears

### import type enum
- The `import_type` DB enum values (18 as of Phase 8):
  `"staff" | "training" | "contracts" | "work" | "operations_work_update" | "roster" | "platform_accounts" | "leave" | "ppe" | "attendance" | "callouts" | "appraisals" | "calendar_events" | "promotions" | "exam_schedule" | "onboarding" | "policy" | "forms"`
- Leave imports: 2026 dates only (schema validation enforces `^2026-\d{2}-\d{2}$`), existing staff only (never creates new users)
- PPE imports: `staffEmail` + `ppeItemCode` (must match a code in `ppe_items`), camelCase column names
- **`attendance` and `callouts` import types remain in the enum despite Phase 0 dropping the live tables.** Attendance/callout imports now route through `tosd_records` (Phase 2) — verify routing before relying on these import types.
- 30+ CSV import templates are SPEC'd in master plan §7 / Phase 12 but **not yet shipped** at `apps/web/public/import-templates/` — only the README exists.

### appraisals.reject — field is `rejectionReason`, NOT `reason`
- The `reject` procedure input uses `rejectionReason` (not `reason`).
- **CORRECT:** `mutate({ id, rejectionReason: "..." })`
- The DB column is also `rejection_reason`.

### NOC shift schedule vs DCS on-call rota — Phase 3 unified, cutover pending
- **Current state:** Phase 3 shipped a unified `scheduling.ts` schema/router. Old `rota.ts` (DCS) and `roster.ts` (NOC) + standalone `noc-shifts.ts` run in parallel during the 7-day shadow window per master plan §6.3.
- **DCS weekly on-call:** `scheduling.dcsOnCall.*` (4 roles: lead / asn / enterprise / core) → `dcs_on_call_weeks` table. URL: `/scheduling/dcs-oncall`. Legacy `/rota/*` still mounted.
- **NOC 24/7 shift schedule:** `scheduling.nocShifts.*` (D / S / N / sick / off / al / ml grid) → `noc_shifts` table. URL: `/scheduling/noc-shifts`. Legacy `/roster/*` still mounted.
- **Quarterly maintenance:** `scheduling.maintenance.*` → `quarterly_maintenance_tasks` table.
- **Cutover gate (per master plan §6.3 + §8 Phase 3 acceptance):** delete `rota.ts` + `roster.ts` + `noc-shifts.ts` schemas / routers / routes only after 7 consecutive days zero 5xx in `scheduling.*` AND zero open `scheduling-regression` bugs.
- Until cutover: write new code against `scheduling.*` only. Sidebar may still show legacy entries — confirm against current `apps/web/src/components/layout/data/sidebar-data.ts`.

### contracts.getExpiringSoon input field name
- The input field is `withinDays` (not `daysAhead`).
- **CORRECT:** `orpc.contracts.getExpiringSoon.queryOptions({ input: { withinDays: 90 } })`

### git commit — pre-commit hook runs `bat`
- The pre-commit hook tries to run `bat` (a cat alternative) to show diffs — fails if not installed
- **Fix:** `git commit -m "your message here"` using `-m` flag directly (NOT heredoc syntax with `cat <<'EOF'`)

### Dev server hot-reload does NOT watch shared packages
- `apps/server` runs `bun run --hot src/index.ts`; `--hot` only watches files inside `apps/server/`.
- Edits to `packages/api` (routers) or `packages/db` (schema) do **NOT** hot-reload — the server keeps the old code, causing stale-API bugs (e.g. a 400/500 that "shouldn't" happen).
- **After any `packages/api` or `packages/db` change, manually restart the server.** The web Vite dev server hot-reloads frontend changes fine.

### DB migrations — `drizzle-kit push` is blocked; apply SQL directly
- `bunx drizzle-kit push` aborts on a "duplicated view name" warning (`appraisal_tracker_view`, a `pgView().existing()`), so it cannot sync schema.
- Migration files are idempotent (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`). Apply a pending migration directly: connect with `bun -e` + `pg` to `DATABASE_URL` and run the `.sql` file.

### Design system modernization is queued as Phase 17
- A full-app shadcn/theming/TanStack-Form modernization is planned as the **final polish pass** — see `docs/DESIGN_SYSTEM_MODERNIZATION.md`. Do not start it ad-hoc; it runs after major feature work.

### Lateness records — month must be full name, exact match
- The `lateness_records.month` column stores full month names: "January", "February", … "December"
- The unique constraint is `(staff_profile_id, year, month)` — exact string match, case-sensitive
- **WRONG:** storing "Jan", "jan", "JANUARY" — these bypass the unique constraint and create duplicate records
- **CORRECT:** always call `expandMonth()` / use the MONTH_ABBREV map before inserting
- **Dedup SQL (run on prod if duplicates exist):**
  ```sql
  DELETE FROM lateness_records a USING lateness_records b
  WHERE a.id > b.id
    AND a.staff_profile_id = b.staff_profile_id
    AND a.year = b.year
    AND a.month = b.month;
  ```

### Post-phase 16 feature work is on branch `claude/inspiring-morse-bdf638`
- 5 commits ahead of main (as of 2026-05-14): timesheets CRUD, attendance clock log CRUD, lateness Excel import
- **Merge this branch before starting new features** — open a PR against main
- **Pending tasks on that branch:** monthly timesheets UI, prod data dump (needs LAN access to 10.6.104.13)
- See AGENT_LOG.md 2026-05-14 entry for full details

### Security Best Practices
- Always validate on the server (oRPC procedures) even when validating on the client.
- Use `protectedProcedure` for every endpoint that touches user/org data.
- Never trust client-supplied role or permission claims — always read from session.
- CORS_ORIGIN must be set to the exact web app origin (port 3001 locally).
- Content Security Policy headers should be added at the Hono server level.
- Audit log every mutation — who did what and when.

### Environment Variables
- Server env: validated via `@ndma-dcs-staff-portal/env/server`
- Web env: validated via `@ndma-dcs-staff-portal/env/web` (only VITE_ prefixed vars)
- NEVER import server env in web app code.

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
