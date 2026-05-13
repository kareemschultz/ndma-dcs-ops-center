-- Add Training and Custom shift types to noc_shift_type enum
ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Training' AFTER 'Maternity Leave';
ALTER TYPE noc_shift_type ADD VALUE IF NOT EXISTS 'Custom' AFTER 'Training';
