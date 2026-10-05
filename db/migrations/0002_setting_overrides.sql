CREATE TABLE "setting_overrides" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	"changed_by" varchar(36),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "setting_overrides" ADD CONSTRAINT "setting_overrides_changed_by_members_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;