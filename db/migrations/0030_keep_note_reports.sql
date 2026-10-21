ALTER TABLE "reports" DROP CONSTRAINT "ck_report_one_item";--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_request_id_connection_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "note_text" varchar(600);--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_request_id_connection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."connection_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Note reports made before this keep a copy of their note from now on.
UPDATE "reports" SET "note_text" = coalesce("connection_requests"."message", '') FROM "connection_requests" WHERE "connection_requests"."id" = "reports"."request_id";--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "ck_report_one_item" CHECK (("reports"."challenge_id" is not null and "reports"."request_id" is null and "reports"."note_text" is null) or ("reports"."challenge_id" is null and "reports"."note_text" is not null));