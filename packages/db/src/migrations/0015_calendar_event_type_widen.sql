ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'public_holiday';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'exam';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'contract_renewal';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'appraisal_due';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'appraisal_followup';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'ppe_review';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'routine_maintenance';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'server_room_cleaning';--> statement-breakpoint
ALTER TYPE "calendar_event_type" ADD VALUE IF NOT EXISTS 'custom';
