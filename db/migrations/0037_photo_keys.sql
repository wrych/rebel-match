ALTER TABLE "member_photos" ADD COLUMN "key" varchar(43);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_photos_key" ON "member_photos" USING btree ("key");--> statement-breakpoint
UPDATE "member_photos" SET "key" = substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 43) WHERE "key" IS NULL;
