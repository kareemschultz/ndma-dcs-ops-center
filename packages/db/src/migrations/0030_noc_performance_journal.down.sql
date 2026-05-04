-- Down migration for 0030 — drop noc_performance_journal table + enum

DROP INDEX IF EXISTS "noc_performance_journal_category_idx";
DROP INDEX IF EXISTS "noc_performance_journal_year_month_idx";
DROP INDEX IF EXISTS "noc_performance_journal_staffProfileId_idx";
DROP TABLE IF EXISTS "noc_performance_journal";
DROP TYPE IF EXISTS "noc_perf_journal_category";
