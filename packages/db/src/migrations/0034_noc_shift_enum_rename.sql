-- Rename existing noc_shift_type enum values and add new ones
ALTER TYPE noc_shift_type RENAME VALUE '12hr Day' TO 'Day Shift';
ALTER TYPE noc_shift_type RENAME VALUE '12hr Night' TO 'Night Shift';
ALTER TYPE noc_shift_type RENAME VALUE 'Split Shift' TO 'Swing Shift';
ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Training Half Day' AFTER 'Training';
ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Outreach' AFTER 'Custom';
