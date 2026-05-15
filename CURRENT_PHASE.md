# Current Phase / Session Handoff

> **NEXT AGENT — START HERE. Read these first, in order, before touching anything:**
> 1. `IMPLEMENTATION_PLAN.md` — phase status, hard invariants, protocols
> 2. `CLAUDE.md` — repo conventions + the **gotchas** section (oRPC, Base UI, dev-server
>    hot-reload, drizzle-kit, etc.) — read it fully, it will save you from real bugs
> 3. This file (below) — what just shipped and what remains
> 4. `docs/DESIGN_SYSTEM_MODERNIZATION.md` — the queued Phase 17 plan
> 5. `AGENT_LOG.md` — last few entries for deeper history

**Active phase:** None — Phases 0-16 complete; post-Phase-16 feature/UX work done directly on `main` (this session, 2026-05-15). Phase 17 (design modernization) is **queued, not started**.

---

## What shipped this session (2026-05-15) — all committed on `main`

Post-Phase-16 feature, UX and bug-fix work. Committed directly to `main` (not phase branches — this was polish/feature work outside the phase structure).

- **DB:** applied migrations **0035** (advance_requests), **0036** (daily_attendance + 5 staff_profiles columns), **0037** (appraisal official-form columns) directly to the dev DB.
- **Attendance:** consistent 5-tab sub-nav across all attendance pages; new **Analytics tab** (interactive lateness/time charts); **timesheet PDF upload** — parses the DC Electronic Time Card PDF (clock in/out by x-coordinate, hours, lateness >08:15), preview dialog, bulk import.
- **Appraisals:** full official-NDMA-form CRUD edit page, Excel export, visual report + PDF, KPI strip, Analytics view.
- **People CRUD:** Leave TOSD/Balances, Career Progression, Contracts — completed create/edit/delete; new Leave **Balances** tab.
- **Departments:** ASN/Enterprise/Core correctly nested under DCS in all pickers; Directory filter includes sub-departments of a selected parent.
- **Directory + Staff Profile** aligned to design; **Training** revamped into a task-first hub.
- **Bug fixes:** `staff.list` limit cap 200→500 (was causing 400s); timesheet import dialog rebuilt.
- **Timesheet documents:** HR-timesheet PDF/Excel upload + view tab.

## ⚠️ Environment notes the next agent MUST know
- Dev DB is **`localhost:5432/ndma_dcs_portal`** — NOT the `docker exec` container (there are two Postgres instances; verifying schema via the wrong one wasted hours this session).
- The **server does not hot-reload `packages/` changes** — restart it after any `packages/api` or `packages/db` edit (see CLAUDE.md gotcha).
- Dev DB migration journal may be **out of sync** — 0035-0037 were applied directly. Use `bun -e` + `pg` to apply pending migration `.sql` files; do not rely on `drizzle-kit push` (blocked).
- Dev servers: web `:3001` (LAN `10.6.104.23:3001`), server `:3000`, docs `:4000`.

## TODO — what remains

| Priority | Item | Where to look |
|---|---|---|
| High | **Phase 17 — design system modernization** (latest shadcn `base/` variants, TanStack Form migration, consistent theming, Playwright visual QA, evaluate shadcn print/PDF) | `docs/DESIGN_SYSTEM_MODERNIZATION.md` |
| Med | Visually verify this session's pages once Playwright is set up (Phase 17 step 0) | — |
| Med | **Attendance integration audit** — confirm the two attendance data models reconcile: `daily_attendance` (roll-call 10-status, feeds Monthly Grid) vs `attendance_logs` (clock in/out, fed by the timesheet-PDF import). Verify PDF-imported lateness flows into the Lateness register (`lateness_records`) and that "Generate from Attendance" timesheets pull the right source | `packages/api/src/routers/attendance-time.ts` |
| Med | "Other department" PR-tracking tool — review screenshots for anything worth borrowing | — |
| Low (pre-existing) | Production deployment | `PRODUCTION_READINESS_CHECKLIST.md` |
| Low (pre-existing) | Phase 14 seed stubs; Phase 3 legacy `rota.ts`/`roster.ts` cutover; 3 stub import handlers (`platform_accounts`/`attendance`/`callouts`) | `IMPLEMENTATION_PLAN.md` |
