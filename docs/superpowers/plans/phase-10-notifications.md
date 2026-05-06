# Phase 10 — Notifications & Calendar

**Branch:** `phase/10-notifications`
**Based on:** c72f127 (Phase 9 WIP gate)
**Status:** 🔵 In Progress (started 2026-05-06)
**Master plan ref:** §5.8 Notifications, §8 Phase 10

## Acceptance criteria

- [x] Leave approved/rejected → in-app notification to requester
- [x] Work item assigned → in-app notification to assignee
- [x] Appraisal approved/rejected/submitted → in-app notification to appraisee + reviewer
- [ ] Cron/poll engine for scheduled reminders (contract expiry, exam voucher expiry)
- [ ] Calendar event creation for leave approvals
- [ ] Notification bell badge count in UI header

## Triggers wired

All triggers were already present in the codebase at the time Phase 10 was opened.
This phase verifies and documents the complete set:

### Leave router (`packages/api/src/routers/leave.ts`)

| Handler | Trigger | Recipient |
|---------|---------|-----------|
| `requests.approve` | `createNotification` after balance update | `staffProfile.userId` (the requester) |
| `requests.reject` | `createNotification` after status update | `staffProfile.userId` (the requester) |

### Work router (`packages/api/src/routers/work.ts`)

| Handler | Trigger | Recipient |
|---------|---------|-----------|
| `create` | `createNotification` when `assignedToId` is set at creation | assigned staff's `userId` |
| `assign` | `createNotification` after `assignedToId` update | newly assigned staff's `userId` |
| `assignees.add` | `createNotification` when a contributor is added | added staff's `userId` |

### Appraisals router (`packages/api/src/routers/appraisals.ts`)

| Handler | Trigger | Recipients |
|---------|---------|-----------|
| `submit` | `notifyRelatedPeople()` | appraisee + reviewer + teamLead |
| `approve` | `notifyRelatedPeople()` | appraisee + reviewer + teamLead |
| `reject` | `notifyRelatedPeople()` | appraisee + reviewer + teamLead |
| `workflow.submit` | `createNotification` | reviewer (or session user as fallback) |
| `workflow.approve` | `createNotification` | session user (approver) |
| `workflow.process` | `createNotification` | session user (processor) |

## Remaining work

- Cron engine for scheduled reminders (needs Phase 15 server-side cron support)
  - Contract expiry 30/7/1-day-before
  - Exam voucher expiry warnings
  - Overdue work item daily digest
- Calendar event auto-creation on leave approval (link to `calendar_events` table)
- Notification bell badge count in UI header (`notifications.list` already returns `unreadCount`)
- Push notifications (Phase 15)
- Email channel delivery (currently all notifications have `channel: "in_app"`)
