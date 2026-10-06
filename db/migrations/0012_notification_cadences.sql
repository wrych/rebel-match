CREATE TYPE "public"."notification_cadence" AS ENUM('immediately', 'every_15_minutes', 'hourly', 'daily', 'in_app', 'off');--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'notification_digest';--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"member_id" varchar(36) NOT NULL,
	"type" "notification_type" NOT NULL,
	"cadence" "notification_cadence" NOT NULL,
	CONSTRAINT "notification_settings_member_id_type_pk" PRIMARY KEY("member_id","type")
);
--> statement-breakpoint
CREATE TABLE "outbox_quotes" (
	"outbox_id" varchar(36) NOT NULL,
	"member_id" varchar(36) NOT NULL,
	CONSTRAINT "outbox_quotes_outbox_id_member_id_pk" PRIMARY KEY("outbox_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_quotes" ADD CONSTRAINT "outbox_quotes_outbox_id_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_quotes" ADD CONSTRAINT "outbox_quotes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_outbox_quotes_member" ON "outbox_quotes" USING btree ("member_id");