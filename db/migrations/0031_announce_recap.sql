ALTER TYPE "public"."notification_type" ADD VALUE 'recap';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'recap';--> statement-breakpoint
CREATE TABLE "recap_announcement" (
	"done_at" timestamp with time zone PRIMARY KEY NOT NULL
);
