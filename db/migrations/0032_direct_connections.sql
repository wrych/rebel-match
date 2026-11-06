ALTER TYPE "public"."connection_kind" ADD VALUE 'direct';--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "findable" boolean DEFAULT true NOT NULL;