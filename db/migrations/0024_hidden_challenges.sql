CREATE TYPE "public"."moderation_reason" AS ENUM('spam', 'inappropriate', 'other');--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "hidden_by" varchar(36);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "hidden_reason" "moderation_reason";--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_hidden_by_members_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;