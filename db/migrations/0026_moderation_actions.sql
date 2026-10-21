CREATE TYPE "public"."moderation_action_kind" AS ENUM('hide', 'unhide', 'dismiss');--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"actor_id" varchar(36),
	"kind" "moderation_action_kind" NOT NULL,
	"challenge_id" varchar(36),
	"request_id" varchar(36),
	"reason" "moderation_reason",
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_request_id_connection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."connection_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_moderation_member" ON "moderation_actions" USING btree ("member_id","created_at");