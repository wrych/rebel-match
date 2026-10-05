ALTER TYPE "public"."outbox_kind" ADD VALUE 'connection_added';--> statement-breakpoint
ALTER TABLE "connection_requests" ADD COLUMN "target_seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "connection_requests" SET "target_seen_at" = "responded_at" WHERE "status" = 'accepted';
