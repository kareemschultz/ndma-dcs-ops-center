> **🛑 SUPERSEDED — DO NOT USE**
>
> This plan has been superseded by [`../2026-04-23-master-remediation-plan.md`](../2026-04-23-master-remediation-plan.md).
>
> The Temporary Tracker feature's schema (`temp_changes`) and router remain in production and are preserved as-is. Decision on further development (if any) deferred until after Phase 9 (self-service) per Phase 0 reconciliation in `docs/superpowers/plans/phase-0-stabilise.md`.
>
> Retained here for historical reference only. Do not reference from new code or docs.

---

# Temporary Tracker System — Full Implementation Plan

> **Status:** In progress (session 3, 2026-04-13)
> **For agentic workers:** Use superpowers:executing-plans to implement tasks sequentially.

## Goal

Replace spreadsheet-based temporary change tracking with a fully accountable, auditable system covering:
- Temporary technical changes
- Public IP exposures
- Temporary service/access grants
- Expiry and cleanup enforcement

---

## Architecture

**Extends existing:** `packages/db/src/schema/temp-changes.ts` + `packages/api/src/routers/temp-changes.ts` + `/changes` UI route.

**New tables:** `tempChangeHistory`, `tempChangeLinks` (alongside existing `temporaryChanges`).

**Approach:** Extend existing `temporaryChanges` table with new columns via `db:push`. Do NOT recreate from scratch.

---

## DB Schema Extensions (packages/db/src/schema/temp-changes.ts)

### Extend `temporaryChanges` table with:

```typescript
// Category of temporary record
category: tempChangeCategoryEnum("category").notNull().default("temporary_change"),
// Enum values: public_ip_exposure | temporary_service | temporary_access | temporary_change | other

// Risk level (auto-derived but overridable)
riskLevel: tempChangeRiskEnum("risk_level").notNull().default("medium"),
// Enum values: low | medium | high | critical

// Network/IP details
environment: text("environment").default("production"), // prod | test | dev
systemName: text("system_name"),
publicIp: text("public_ip"),
internalIp: text("internal_ip"),
port: text("port"),
protocol: text("protocol"), // tcp | udp | both
externalExposure: boolean("external_exposure").default(false).notNull(),

// Owner model (who is responsible for cleanup)
ownerType: tempChangeOwnerTypeEnum("owner_type").default("internal_staff"),
// Enum: internal_staff | external_contact | department | system
externalContactId: text("external_contact_id").references(() => externalContacts.id, { onDelete: "set null" }),
externalAgencyName: text("external_agency_name"),
externalAgencyType: text("external_agency_type"),
// Enum: government | vendor | contractor | partner | other

// Requester
requestedByType: text("requested_by_type").default("internal_staff"),
requestedByExternal: text("requested_by_external"),
requestedById: text("requested_by_id").references(() => staffProfiles.id, { onDelete: "set null" }),

// Department linkage
departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),

// Existing field `engineer` remains for simple name reference
```

### New table: `tempChangeHistory`

```typescript
export const tempChangeHistory = pgTable("temp_change_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tempChangeId: text("temp_change_id").notNull().references(() => temporaryChanges.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // created | updated | status_changed | removed | overdue_flagged
  performedById: text("performed_by_id").references(() => staffProfiles.id, { onDelete: "set null" }),
  performedByName: text("performed_by_name"),
  oldValues: jsonb("old_values").$type<Record<string, unknown>>(),
  newValues: jsonb("new_values").$type<Record<string, unknown>>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### New table: `tempChangeLinks`

```typescript
export const tempChangeLinks = pgTable("temp_change_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tempChangeId: text("temp_change_id").notNull().references(() => temporaryChanges.id, { onDelete: "cascade" }),
  workItemId: text("work_item_id").references(() => workItems.id, { onDelete: "set null" }),
  incidentId: text("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  serviceId: text("service_id").references(() => services.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

## API Router Extensions (packages/api/src/routers/temp-changes.ts)

### New/Extended procedures:

- `tempChanges.list` — add filters: category, riskLevel, ownerType, externalExposure, departmentId, searchQuery
- `tempChanges.get` — return with history + links
- `tempChanges.create` — include all new fields + auto-derive riskLevel + create history entry
- `tempChanges.update` — diff and record history entry
- `tempChanges.markRemoved` — mark removed + require confirmation notes + history entry
- `tempChanges.getOverdue` — auto-flag + return with owner details
- `tempChanges.getPublicIPs` — filter where publicIp IS NOT NULL
- `tempChanges.getExpiringSoon` — remove_by_date within 7 days, not yet removed
- `tempChanges.stats` — counts by status, risk, category, owner type
- `tempChanges.history.list` — get history for a record
- `tempChanges.links.add` — link to work/incident/service
- `tempChanges.links.remove` — unlink

### Risk auto-derivation logic:
```
critical if: externalExposure=true AND (publicIp present OR port exposed) AND environment=production
high if: externalExposure=true OR publicIp present OR production environment
medium if: internal changes, test/dev environment
low if: dev environment, no external exposure
```

---

## UI Pages

### /changes (main list) — Tabs:
1. **All Records** — filterable table with status/risk/category/owner filters + search
2. **Overdue** — red-highlighted list of overdue records needing action
3. **Expiring Soon** — records within 7 days of remove_by_date
4. **Public IPs** — table of all records with publicIp field, filterable by risk
5. **Calendar** — monthly view of upcoming removal dates

### /changes/new — Create record form (full fields)
### /changes/$id — Detail page with:
- Full record info with all fields
- Risk badge + external exposure indicator
- History timeline
- Linked items (work/incident/service)
- "Mark as Removed" button
- "Extend Deadline" option

---

## Dashboard Widgets (add to /index.tsx)

- Active temp records count (with overdue highlighted in red)
- Expiring this week count
- High/critical risk exposure count
- Public IPs exposed count

---

## Visual Design

**Status badges:**
- ACTIVE = green
- EXPIRING SOON = amber (within 7 days)
- OVERDUE = red
- PENDING REMOVAL = orange
- REMOVED = gray

**Risk badges:**
- LOW = green
- MEDIUM = amber
- HIGH = orange
- CRITICAL = red (bold)

**Owner type badges:**
- INTERNAL = blue
- EXTERNAL = purple
- DEPARTMENT = indigo
- SYSTEM = slate

---

## Key Business Rules

1. Every record MUST have owner (staff, department, or system)
2. External exposure MUST include agency name or justification
3. Public IP MUST include remove_by_date and owner
4. Auto-flag overdue on every `getOverdue` call
5. All status changes logged to history
6. External agency involvement always logged in audit

---

## Implementation Order

- [ ] Step 1: Extend DB schema (temp-changes.ts) + new tables + db:push
- [ ] Step 2: Extend API router with new procedures + risk derivation
- [ ] Step 3: Rebuild /changes page with tabs and new fields
- [ ] Step 4: Create /changes/new and /changes/$id pages
- [ ] Step 5: Add dashboard widgets
- [ ] Step 6: Run type check
