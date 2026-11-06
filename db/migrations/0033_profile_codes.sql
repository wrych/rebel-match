CREATE TABLE "profile_codes" (
	"member_id" varchar(36) PRIMARY KEY NOT NULL,
	"token" varchar(43) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_codes" ADD CONSTRAINT "profile_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profile_code_token" ON "profile_codes" USING btree ("token");