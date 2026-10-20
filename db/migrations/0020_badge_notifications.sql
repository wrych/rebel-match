ALTER TYPE "public"."notification_type" ADD VALUE 'badge';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'badge';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "badge_row" varchar(10);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "badge_level" smallint;