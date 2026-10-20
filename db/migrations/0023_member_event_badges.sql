CREATE TABLE "member_event_badges" (
	"member_id" varchar(36) NOT NULL,
	"event_badge_id" varchar(36) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "member_event_badges_member_id_event_badge_id_pk" PRIMARY KEY("member_id","event_badge_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_badge_id" varchar(36);--> statement-breakpoint
ALTER TABLE "member_event_badges" ADD CONSTRAINT "member_event_badges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_event_badges" ADD CONSTRAINT "member_event_badges_event_badge_id_event_badges_id_fk" FOREIGN KEY ("event_badge_id") REFERENCES "public"."event_badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_badge_id_event_badges_id_fk" FOREIGN KEY ("event_badge_id") REFERENCES "public"."event_badges"("id") ON DELETE cascade ON UPDATE no action;