# Known Gotchas — DCS Ops Center

> Full detailed reference for pitfalls discovered during development. CLAUDE.md keeps
> only the ~10 highest-value items inline; everything else lives here. **DO NOT REPEAT
> these mistakes.**

---

## Scaffolding & stack

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

### Tailwind CSS
- This project uses **Tailwind CSS v4** (not v3).
- v4 uses CSS-first config (`@import "tailwindcss"` in CSS, no `tailwind.config.ts`).
- shadcn/ui components are configured for Tailwind v4.

---

## oRPC

### oRPC general
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

---

## Zod v4

### Zod v4 `z.record` — requires two arguments
- **WRONG:** `z.record(z.string())` — TypeScript infers value type as `unknown`
- **CORRECT:** `z.record(z.string(), z.string())` — explicit key + value types

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

---

## Better Auth

- Auth config in `packages/auth/src/index.ts`, NOT in apps/server.
- `sameSite: "none"` + `secure: true` on cookies — requires HTTPS in production.
  For local dev, may need to change to `sameSite: "lax"` + `secure: false`.
- When adding the Admin plugin, regenerate DB schema: `bunx @better-auth/cli generate`.

### Login route is `/login`, NOT `/sign-in`
- The auth route is `apps/web/src/routes/login.tsx` → URL is `/login`
- Playwright tests and any deep-links to the auth page must use `/login`

---

## UI / components

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

### Design system modernization is queued as Phase 17
- A full-app shadcn/theming/TanStack-Form modernization is planned as the **final polish pass** — see `docs/DESIGN_SYSTEM_MODERNIZATION.md`. Do not start it ad-hoc; it runs after major feature work.

---

## TanStack Router

### `Link to=` must match registered routes
- The `to` prop on `<Link>` is strictly typed against the generated `routeTree.gen.ts`.
- **NEVER** use `to="/cycles/$cycleId"` if that route file doesn't exist yet — it will cause a TS error.
- When adding a new page, create the route file FIRST, then add sidebar links and inter-page links.
- If a feature isn't ready, use a disabled button (`<Button disabled>`) instead of a broken link.
- The route tree is auto-generated by Vite on `dev` or `build` — no manual registration needed.

---

## Drizzle ORM

### Self-referential tables (parentId / subtasks)
- Drizzle v0.x has limited support for self-referential FK constraints in `pgTable`.
- For `parentId` (e.g., work item subtasks): define as bare `text("parent_id")` with NO `.references()` call.
- The actual FK constraint is created by PostgreSQL when `db:push` runs, but Drizzle's type system won't infer the relation.
- **DO NOT** try to add a `.references(() => sameTable.id)` — Drizzle will crash on circular references.

### Named relations for self-joins
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

### date-fns with ISO date strings
- Drizzle returns `date` columns as plain strings (`"2026-04-12"`), not Date objects.
- Always parse before using date-fns: `format(parseISO(item.dueDate), "d MMM yyyy")`
- **WRONG:** `format(item.dueDate, "d MMM yyyy")` — will error on a string input.
- For `.toISOString().slice(0, 10)` vs `.split("T")[0]`: prefer `.slice(0, 10)` — it's the same but more explicit.

---

## Database / migrations

### `drizzle-kit push` is blocked; apply SQL directly
- `bunx drizzle-kit push` aborts on a "duplicated view name" warning (`appraisal_tracker_view`, a `pgView().existing()`), so it cannot sync schema.
- Migration files are idempotent (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`). Apply a pending migration directly: connect with `bun -e` + `pg` to `DATABASE_URL` and run the `.sql` file.

### PostgreSQL container auth — scram-sha-256
- The Postgres 18 Docker container uses `scram-sha-256` for all TCP connections by default.
- If you recreate the container with a different `POSTGRES_PASSWORD`, the existing password hash
  on disk (from the old volume) won't match. `db:push` will hang with "Pulling schema from database...".
- **Fix:** `docker exec <container> psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'password'"`
- If that also fails, destroy the volume: `docker compose down -v && docker compose up -d`

---

## Dev environment

### Dev server hot-reload does NOT watch shared packages
- `apps/server` runs `bun run --hot src/index.ts`; `--hot` only watches files inside `apps/server/`.
- Edits to `packages/api` (routers) or `packages/db` (schema) do **NOT** hot-reload — the server keeps the old code, causing stale-API bugs (e.g. a 400/500 that "shouldn't" happen).
- **After any `packages/api` or `packages/db` change, manually restart the server.** The web Vite dev server hot-reloads frontend changes fine.

### git commit — pre-commit hook runs `bat`
- The pre-commit hook tries to run `bat` (a cat alternative) to show diffs — fails if not installed
- **Fix:** `git commit -m "your message here"` using `-m` flag directly (NOT heredoc syntax with `cat <<'EOF'`)

### Environment Variables
- Server env: validated via `@ndma-dcs-staff-portal/env/server`
- Web env: validated via `@ndma-dcs-staff-portal/env/web` (only VITE_ prefixed vars)
- NEVER import server env in web app code.

### Security Best Practices
- Always validate on the server (oRPC procedures) even when validating on the client.
- Use `protectedProcedure` for every endpoint that touches user/org data.
- Never trust client-supplied role or permission claims — always read from session.
- CORS_ORIGIN must be set to the exact web app origin (port 3001 locally).
- Content Security Policy headers should be added at the Hono server level.
- Audit log every mutation — who did what and when.

---

## E2E tests

### Playwright auth flow tests need empty storageState
- All smoke tests use the stored session from `tests/.auth/user.json`
- Auth flow tests (testing unauthenticated behavior) MUST use `test.use({ storageState: { cookies: [], origins: [] } })`
- Otherwise the stored session auto-redirects `/login` → `/` and the login form never appears

---

## Router-specific data shapes & field names

### Workload router return shape — DO NOT confuse with browser session stub
- Our `workload.get` returns `{ staff: { id, name, email, department }, openWorkItems, overdueWorkItems, onCallRole, onLeave, overdueChanges, loadScore, loadLevel }`
- **NOT** `{ staffProfileId, staffName, itemCount, loadLevel }` — that was a simplified browser-session stub that was discarded
- In dashboard/workload UI, always use `entry.staff.name`, `entry.staff.id`, `entry.loadScore`

### Cycles router data shape
- `cycles.list` returns full Drizzle records including `cycleWorkItems: [{ workItem: { id, status } }]`
- `totalItems = cycle.cycleWorkItems.length`, `doneItems = cycle.cycleWorkItems.filter(cwi => cwi.workItem?.status === "done").length`
- Compute these client-side — the router does NOT add totalItems/doneItems fields

### appraisals.reject — field is `rejectionReason`, NOT `reason`
- The `reject` procedure input uses `rejectionReason` (not `reason`).
- **CORRECT:** `mutate({ id, rejectionReason: "..." })`
- The DB column is also `rejection_reason`.

### contracts.getExpiringSoon input field name
- The input field is `withinDays` (not `daysAhead`).
- **CORRECT:** `orpc.contracts.getExpiringSoon.queryOptions({ input: { withinDays: 90 } })`

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

---

## Automation rules — fireAutomationRules call pattern
- Import: `import { fireAutomationRules } from "../lib/automation";`
- Call AFTER successful DB mutation: `await fireAutomationRules("work", "created", item as Record<string, unknown>)`
- Modules: `"work"`, `"incident"`, `"leave"`, `"temp_changes"`, `"procurement"`, `"rota"`
- Events per module: work→(created/status_changed/assigned/overdue), incident→(created/status_changed/resolved), leave→(requested/approved/rejected), temp_changes→(created/overdue/removed), procurement→(submitted/approved/rejected), rota→(published/swap_approved)
- Conditions evaluate against the payload's flat fields — use the actual DB column names as field names
- `{{fieldName}}` placeholders in action title/body are replaced with payload values at fire-time

---

## Import pipeline — import type enum
- The `import_type` DB enum values (18 as of Phase 8):
  `"staff" | "training" | "contracts" | "work" | "operations_work_update" | "roster" | "platform_accounts" | "leave" | "ppe" | "attendance" | "callouts" | "appraisals" | "calendar_events" | "promotions" | "exam_schedule" | "onboarding" | "policy" | "forms"`
- Leave imports: 2026 dates only (schema validation enforces `^2026-\d{2}-\d{2}$`), existing staff only (never creates new users)
- PPE imports: `staffEmail` + `ppeItemCode` (must match a code in `ppe_items`), camelCase column names
- **`attendance` and `callouts` import types remain in the enum despite Phase 0 dropping the live tables.** Attendance/callout imports now route through `tosd_records` (Phase 2) — verify routing before relying on these import types.
- 30+ CSV import templates are SPEC'd in master plan §7 / Phase 12 but **not yet shipped** at `apps/web/public/import-templates/` — only the README exists.

---

## NOC shift schedule vs DCS on-call rota — Phase 3 unified, cutover pending
- **Current state:** Phase 3 shipped a unified `scheduling.ts` schema/router. Old `rota.ts` (DCS) and `roster.ts` (NOC) + standalone `noc-shifts.ts` run in parallel during the 7-day shadow window per master plan §6.3.
- **DCS weekly on-call:** `scheduling.dcsOnCall.*` (4 roles: lead / asn / enterprise / core) → `dcs_on_call_weeks` table. URL: `/scheduling/dcs-oncall`. Legacy `/rota/*` still mounted.
- **NOC 24/7 shift schedule:** `scheduling.nocShifts.*` (D / S / N / sick / off / al / ml grid) → `noc_shifts` table. URL: `/scheduling/noc-shifts`. Legacy `/roster/*` still mounted.
- **Quarterly maintenance:** `scheduling.maintenance.*` → `quarterly_maintenance_tasks` table.
- **Cutover gate (per master plan §6.3 + §8 Phase 3 acceptance):** delete `rota.ts` + `roster.ts` + `noc-shifts.ts` schemas / routers / routes only after 7 consecutive days zero 5xx in `scheduling.*` AND zero open `scheduling-regression` bugs.
- Until cutover: write new code against `scheduling.*` only. Sidebar may still show legacy entries — confirm against current `apps/web/src/components/layout/data/sidebar-data.ts`.

---

## Branch state — post-phase 16 feature work
- Feature work is on branch `claude/inspiring-morse-bdf638` — 5 commits ahead of main (as of 2026-05-14): timesheets CRUD, attendance clock log CRUD, lateness Excel import.
- **Merge this branch before starting new features** — open a PR against main.
- **Pending tasks on that branch:** monthly timesheets UI, prod data dump (needs LAN access to 10.6.104.13).
- See AGENT_LOG.md 2026-05-14 entry for full details.
