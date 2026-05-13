-- Phase 16 — Master plan §6.3 / §9.1 spec alignment
-- Add "Split Shift" + "Maternity Leave" to noc_shift_type enum.
-- "Split Shift" inserted after "12hr Night"; "Maternity Leave" inserted after "Sick Leave".
-- PostgreSQL ALTER TYPE ... ADD VALUE BEFORE/AFTER for ordering.

ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Split Shift' AFTER '12hr Night';
ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Maternity Leave' AFTER 'Sick Leave';
