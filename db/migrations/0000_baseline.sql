CREATE TYPE "public"."challenge_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."connection_kind" AS ENUM('same_boat', 'been_there');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('applicant', 'active', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."outbox_kind" AS ENUM('magic_link', 'approval', 'connection_request', 'admin_notice');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('recorded', 'sent', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."swipe_action" AS ENUM('same_boat', 'been_there', 'follow', 'skip');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('self_service', 'approval');--> statement-breakpoint
CREATE TABLE "cases" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"trend_id" char(2) NOT NULL,
	"org" varchar(120) NOT NULL,
	"url" varchar(400) NOT NULL,
	"takeaway" varchar(400) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"body" text NOT NULL,
	"trend_id" char(2),
	"auto_trend" char(2),
	"overridden" boolean DEFAULT false NOT NULL,
	"status" "challenge_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"requester_id" varchar(36) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"challenge_id" varchar(36),
	"kind" "connection_kind" NOT NULL,
	"message" varchar(600),
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"member_id" varchar(36) NOT NULL,
	"trend_id" char(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_member_id_trend_id_pk" PRIMARY KEY("member_id","trend_id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"max_uses" bigint NOT NULL,
	"uses" bigint DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"kind" "token_kind" DEFAULT 'self_service' NOT NULL,
	"next_path" varchar(512),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_expertise" (
	"member_id" varchar(36) NOT NULL,
	"trend_id" char(2) NOT NULL,
	"note" varchar(400),
	CONSTRAINT "member_expertise_member_id_trend_id_pk" PRIMARY KEY("member_id","trend_id")
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"member_id" varchar(36) NOT NULL,
	"role_key" varchar(40) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" varchar(36),
	CONSTRAINT "member_roles_member_id_role_key_pk" PRIMARY KEY("member_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(120),
	"job_title" varchar(120),
	"org" varchar(160),
	"sector" varchar(160),
	"status" "member_status" DEFAULT 'applicant' NOT NULL,
	"requested_name" varchar(120),
	"requested_org" varchar(160),
	"joined_via_invite_id" varchar(36),
	"consent_version" varchar(20),
	"consent_at" timestamp with time zone,
	"analytics_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"member_id" varchar(36),
	"to_email" varchar(320) NOT NULL,
	"kind" "outbox_kind" NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"status" "outbox_status" DEFAULT 'recorded' NOT NULL,
	"error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"role_key" varchar(40) PRIMARY KEY NOT NULL,
	"label" varchar(80) NOT NULL,
	"description" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" varchar(128) PRIMARY KEY NOT NULL,
	"expires" bigint NOT NULL,
	"data" text
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"member_id" varchar(36) NOT NULL,
	"challenge_id" varchar(36) NOT NULL,
	"action" "swipe_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_member_id_challenge_id_action_pk" PRIMARY KEY("member_id","challenge_id","action")
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" char(2) PRIMARY KEY NOT NULL,
	"short" varchar(80) NOT NULL,
	"from_label" varchar(80) NOT NULL,
	"peers" integer DEFAULT 0 NOT NULL,
	"keywords" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_auto_trend_trends_id_fk" FOREIGN KEY ("auto_trend") REFERENCES "public"."trends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_requester_id_members_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_target_id_members_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_tokens" ADD CONSTRAINT "magic_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_expertise" ADD CONSTRAINT "member_expertise_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_expertise" ADD CONSTRAINT "member_expertise_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_key_roles_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("role_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_granted_by_members_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_joined_via_invite_id_invites_id_fk" FOREIGN KEY ("joined_via_invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_case_trend_url" ON "cases" USING btree ("trend_id","url");--> statement-breakpoint
CREATE INDEX "ix_challenge_member" ON "challenges" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_challenge_trend" ON "challenges" USING btree ("trend_id");--> statement-breakpoint
CREATE INDEX "ix_req_target" ON "connection_requests" USING btree ("target_id","status");--> statement-breakpoint
CREATE INDEX "ix_req_requester" ON "connection_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pending" ON "connection_requests" USING btree ("requester_id","target_id",coalesce("challenge_id", '-')) WHERE "connection_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invites_token" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_magic_tokens_hash" ON "magic_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_magic_tokens_member" ON "magic_tokens" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_expertise_trend" ON "member_expertise" USING btree ("trend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_members_email" ON "members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_members_analytics_id" ON "members" USING btree ("analytics_id");--> statement-breakpoint
CREATE INDEX "ix_members_status" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_outbox_created" ON "outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_outbox_to" ON "outbox" USING btree ("to_email");--> statement-breakpoint
CREATE INDEX "ix_outbox_status" ON "outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_sessions_expires" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "ix_swipe_challenge" ON "swipes" USING btree ("challenge_id");