ALTER TABLE "connection_requests" ADD COLUMN "note_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD COLUMN "note_hidden_by" varchar(36);--> statement-breakpoint
ALTER TABLE "connection_requests" ADD COLUMN "note_hidden_reason" "moderation_reason";--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_note_hidden_by_members_id_fk" FOREIGN KEY ("note_hidden_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;