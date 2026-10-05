ALTER TYPE "public"."token_kind" ADD VALUE 'restore';--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "erase_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "status_before_deletion" "member_status";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "deleted_by_self" boolean;