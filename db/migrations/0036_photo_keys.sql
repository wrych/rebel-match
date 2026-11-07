ALTER TABLE "member_photos" ADD COLUMN "key" varchar(43);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_photos_key" ON "member_photos" USING btree ("key");