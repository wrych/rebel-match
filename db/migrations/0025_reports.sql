CREATE TABLE "reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"reporter_id" varchar(36),
	"reported_id" varchar(36) NOT NULL,
	"challenge_id" varchar(36),
	"request_id" varchar(36),
	"reason" "moderation_reason" NOT NULL,
	"comment" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	CONSTRAINT "ck_report_one_item" CHECK (("reports"."challenge_id" is null) <> ("reports"."request_id" is null))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_members_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_members_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_request_id_connection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."connection_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_challenge" ON "reports" USING btree ("reporter_id","challenge_id") WHERE "reports"."challenge_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_request" ON "reports" USING btree ("reporter_id","request_id") WHERE "reports"."request_id" is not null;--> statement-breakpoint
CREATE INDEX "ix_report_open" ON "reports" USING btree ("reported_id","handled_at");--> statement-breakpoint
CREATE INDEX "ix_report_reporter" ON "reports" USING btree ("reporter_id","created_at");