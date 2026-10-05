ALTER TYPE "public"."outbox_kind" ADD VALUE 'connection_accepted';--> statement-breakpoint
ALTER TABLE "connection_requests" ADD COLUMN "requester_seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "connection_requests" SET "requester_seen_at" = "responded_at" WHERE "status" = 'accepted';
