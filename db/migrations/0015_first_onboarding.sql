ALTER TABLE "members" ADD COLUMN "first_onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "usage_answered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "members" SET "first_onboarded_at" = "consent_at", "usage_answered_at" = "consent_at" WHERE "consent_at" IS NOT NULL;
