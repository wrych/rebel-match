CREATE TABLE "badge_crowns" (
	"row_key" varchar(10) PRIMARY KEY NOT NULL,
	"member_id" varchar(36),
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "badge_crowns" ADD CONSTRAINT "badge_crowns_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;