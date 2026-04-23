# Historical Seed Coverage

This document records the historical archive coverage that the master seed uses as the source of truth.

## Required archives

- `Shared-leave.zip`
- `Shared-training.zip`
- `Shared-timesheets-2021.zip`
- `Shared-timesheets-2023.zip`
- `Shared-timesheets-2024.zip`
- `Shared-timesheets-2025.zip`
- `Shared-timesheets-2026.zip`
- `DCS.zip`
- `NOC.zip`

## Historical ranges

- Leave history: 2021-2026
- Training history: 2024-2026
- Attendance / timesheets: 2021-2026
- Appraisals: historical DCS and NOC workbooks
- Work management: legacy `WorkUpdate_20240118_v01.xlsx` plus temporary tracker and routine sheets

## Preservation rules

- Keep `year` and `period` on every period-based record.
- Keep `notes` and `comments` from the source workbook wherever the workbook exposes them.
- Keep DCS and NOC records separated in schedules, appraisals, attendance, and promotion history.
- Map legacy labels forward explicitly rather than dropping old records.

## Seed contract

The master seed in `scripts/seed-current-data.ts` validates that the required archives exist before seeding. If any required archive is missing, the seed fails early instead of silently skipping historical data.
