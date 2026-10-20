CREATE TABLE "badge_launch" (
	"done_at" timestamp with time zone PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_badges" (
	"member_id" varchar(36) NOT NULL,
	"row_key" varchar(10) NOT NULL,
	"level" smallint NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "member_badges_member_id_row_key_level_pk" PRIMARY KEY("member_id","row_key","level")
);
--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;