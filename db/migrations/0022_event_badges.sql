CREATE TABLE "event_badges" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"ticket_line" varchar(10) NOT NULL,
	"big_line" varchar(6) NOT NULL,
	"logo_svg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "event_badge_id" varchar(36);--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_event_badge_id_event_badges_id_fk" FOREIGN KEY ("event_badge_id") REFERENCES "public"."event_badges"("id") ON DELETE no action ON UPDATE no action;