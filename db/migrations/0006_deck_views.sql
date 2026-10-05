CREATE TABLE "deck_views" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"challenge_id" varchar(36) NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deck_views" ADD CONSTRAINT "deck_views_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_views" ADD CONSTRAINT "deck_views_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_view_challenge" ON "deck_views" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "ix_view_member" ON "deck_views" USING btree ("member_id");