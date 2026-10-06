CREATE TYPE "public"."notification_mail_status" AS ENUM('waiting', 'mailed', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('connection_request', 'new_connection', 'trend_challenge', 'applicant');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipient_id" varchar(36) NOT NULL,
	"type" "notification_type" NOT NULL,
	"about_member_id" varchar(36),
	"connection_id" varchar(36),
	"challenge_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"mail_status" "notification_mail_status" DEFAULT 'waiting' NOT NULL,
	"skipped_reason" varchar(20),
	"mailed_at" timestamp with time zone,
	"mailed_cadence" varchar(20),
	"outbox_id" varchar(36),
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_about_member_id_members_id_fk" FOREIGN KEY ("about_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_connection_id_connection_requests_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_outbox_id_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_note_recipient" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_note_waiting" ON "notifications" USING btree ("mail_status","next_attempt_at");