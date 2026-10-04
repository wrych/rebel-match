ALTER TABLE "members" ADD COLUMN "analytics_consent_version" varchar(20);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "analytics_consent_at" timestamp with time zone;