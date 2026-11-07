CREATE TABLE "live_codes" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"usable_until" timestamp with time zone NOT NULL,
	"spent_at" timestamp with time zone,
	"spent_by" varchar(36),
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_codes" ADD CONSTRAINT "live_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_codes" ADD CONSTRAINT "live_codes_spent_by_members_id_fk" FOREIGN KEY ("spent_by") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_live_codes_member" ON "live_codes" USING btree ("member_id","spent_at");