# Design System Modernization — Final Polish Initiative

> **Status:** ⬜ Queued. Do this **after** the major feature/page work is complete — it is the
> final polish pass, not a feature phase. Tracked as Phase 17 in `IMPLEMENTATION_PLAN.md`.
>
> **Goal:** the app should look and feel **modern and premium**, with one consistent design
> language across every page — no drifting card styles, no inconsistent forms.

## Why this exists

Feature work has been built fast across many sessions. The result is functional but visually
uneven — appraisal cards, dashboard tiles, list pages and forms don't all share the same
language. This initiative consolidates everything onto the **latest shadcn/ui** with a single
theme, modern blocks, and a consistent form stack.

## Reference material (fetch these when starting)

- Skills: <https://ui.shadcn.com/docs/skills>
- MCP server: <https://ui.shadcn.com/docs/mcp>
- Components: <https://ui.shadcn.com/docs/components>
- Blocks: <https://ui.shadcn.com/blocks>
- Registry directory: <https://ui.shadcn.com/docs/directory>
- Forms: <https://ui.shadcn.com/docs/forms> · TanStack Form: <https://ui.shadcn.com/docs/forms/tanstack-form>
- Theming: <https://ui.shadcn.com/docs/theming>
- Component variants — Radix vs Base UI (example): <https://ui.shadcn.com/docs/components/radix/alert-dialog> · <https://ui.shadcn.com/docs/components/base/alert-dialog>
- Print / PDF generation: <https://ds.shadcn.com/docs/examples/print> · PDFX component: <https://allshadcn.com/components/pdfx/>

### PDF / print generation note
The appraisal report PDF and timesheet exports currently use `html2canvas` + `jsPDF`.
shadcn/designer offers a purpose-built print path — `DesignerStaticFrame` for a static
render + the `mql` package to produce the PDF, with DPI (96–600) and paper-size (A4/Letter/…)
controls. During Phase 17, evaluate migrating PDF generation to that approach (or the PDFX
component) for cleaner, higher-fidelity output than canvas snapshots.

## Primitive choice — RESOLVED

`packages/ui` uses **Base UI** (`@base-ui/react`) primitives, not Radix (see `CLAUDE.md` →
"Base UI — `render` prop, NOT `asChild`"). shadcn now ships **per-primitive component
variants** — every component has a Radix version and a Base UI version, e.g.:
- Radix: <https://ui.shadcn.com/docs/components/radix/alert-dialog>
- Base UI: <https://ui.shadcn.com/docs/components/base/alert-dialog>

**Decision: keep Base UI. Adopt shadcn's `base/` (Base UI) component variants** — no Radix
migration. When pulling components via the shadcn CLI/MCP, always select the Base UI variant
so it stays consistent with the existing `packages/ui` primitives. Do **not** mix Radix and
Base UI versions of the same primitive.

## Workstreams

### 0. Tooling & verification setup (do first)
- Install Playwright browsers and build a **screenshot harness** with a stored auth session
  (`apps/web/tests/.auth/user.json` already exists) so every change can be eyeballed.
- Wire up the **shadcn MCP server** so agents can browse/add components and blocks directly.

### 1. Theming pass
- One consistent token set in `apps/web/src/index.css` / `globals.css` — base color, radius,
  oklch palette. Primary stays NDMA blue/indigo (`oklch(0.52 0.158 240)`). **No green.**
- Light + dark mode parity. Verify every page against the tokens; kill one-off hex/colors.

### 2. Component upgrade
- Audit `packages/ui` against the latest shadcn components. Upgrade outdated primitives.
- Replace ad-hoc cards/tiles/badges with consistent shared components.

### 3. Form stack — migrate to TanStack Form
- Standardise on **TanStack Form** (`@tanstack/react-form` + shadcn's TanStack Form adapter).
- Migrate every form module-by-module: appraisals, staff, leave, contracts, training,
  procurement, timesheets. Mechanical but large — one module per PR, screenshot-verified.

### 4. Blocks adoption
- Use shadcn **blocks** for high-value surfaces: dashboard, sidebar, login, data tables,
  detail layouts. Re-skin to NDMA tokens.

### 5. Final visual QA
- Playwright screenshot sweep of every route, light + dark, against the design language.
- Reconcile appraisal cards + report against the design handoff.

## Execution rules

- **One module at a time**, each screenshot-verified before moving on. Never a big-bang rewrite.
- Keep all functionality working — this is a visual/structural pass, not a feature change.
- `bun run check-types` must pass after every module.
- Respect existing repo gotchas in `CLAUDE.md` (oRPC input wrapping, no green, etc.).
