-- Down migration for 0035_advance_requests.sql

DROP TABLE IF EXISTS "advance_expense_lines";
DROP TABLE IF EXISTS "advance_requests";
DROP TYPE IF EXISTS "advance_expense_kind";
DROP TYPE IF EXISTS "advance_status";
