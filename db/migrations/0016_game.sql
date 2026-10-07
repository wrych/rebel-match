CREATE TYPE "public"."game_outcome" AS ENUM('won', 'lost', 'abandoned');--> statement-breakpoint
CREATE TABLE "game_days" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"level" integer NOT NULL,
	"outcome" "game_outcome" NOT NULL,
	"play_seconds" integer NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"member_id" varchar(36) PRIMARY KEY NOT NULL,
	"pseudonym" varchar(40) NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"highest_level" integer DEFAULT 1 NOT NULL,
	"best_level" integer,
	"best_seconds" integer,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"hints_seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_players_pseudonym_unique" UNIQUE("pseudonym")
);
--> statement-breakpoint
ALTER TABLE "game_days" ADD CONSTRAINT "game_days_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_game_days_member" ON "game_days" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_game_players_board" ON "game_players" USING btree ("best_level","best_seconds");