ALTER TYPE "public"."member_status" ADD VALUE 'banned';--> statement-breakpoint
ALTER TYPE "public"."moderation_action_kind" ADD VALUE 'ban';--> statement-breakpoint
ALTER TYPE "public"."moderation_action_kind" ADD VALUE 'unban';