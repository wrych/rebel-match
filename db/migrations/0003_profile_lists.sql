CREATE TABLE "company_sizes" (
	"key" varchar(20) PRIMARY KEY NOT NULL,
	"label" varchar(40) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"label" varchar(80) NOT NULL
);
--> statement-breakpoint
INSERT INTO "sectors" ("key", "label") VALUES
	('agency-consulting', 'Agency & consulting'),
	('construction', 'Construction'),
	('education', 'Education'),
	('energy-utilities', 'Energy & utilities'),
	('financial-services', 'Financial services'),
	('food-agriculture', 'Food & agriculture'),
	('government', 'Government & public sector'),
	('healthcare', 'Healthcare'),
	('hospitality', 'Hospitality'),
	('industrial-services', 'Industrial services'),
	('logistics', 'Logistics'),
	('manufacturing', 'Manufacturing'),
	('media-creative', 'Media & creative'),
	('nonprofit', 'Nonprofit'),
	('retail', 'Retail'),
	('software-technology', 'Software & technology'),
	('telecom', 'Telecom'),
	('other', 'Other');--> statement-breakpoint
INSERT INTO "company_sizes" ("key", "label") VALUES
	('1-10', '1–10 employees'),
	('11-50', '11–50 employees'),
	('51-250', '51–250 employees'),
	('251-1000', '251–1,000 employees'),
	('1001+', '1,001+ employees');--> statement-breakpoint
UPDATE "members" SET "sector" = "sectors"."key" FROM "sectors" WHERE "members"."sector" = "sectors"."label";--> statement-breakpoint
UPDATE "members" SET "sector" = NULL WHERE "sector" NOT IN (SELECT "key" FROM "sectors");--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "sector" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "company_size" varchar(20);--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_sector_sectors_key_fk" FOREIGN KEY ("sector") REFERENCES "public"."sectors"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_company_size_company_sizes_key_fk" FOREIGN KEY ("company_size") REFERENCES "public"."company_sizes"("key") ON DELETE set null ON UPDATE no action;