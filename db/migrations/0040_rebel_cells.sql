CREATE TABLE "rebel_cells" (
	"key" varchar(20) PRIMARY KEY NOT NULL,
	"label" varchar(40) NOT NULL
);
--> statement-breakpoint
INSERT INTO "rebel_cells" ("key", "label") VALUES
	('belgium', 'Belgium'),
	('berlin', 'Berlin'),
	('france', 'France'),
	('germany', 'Germany'),
	('global', 'Global'),
	('italy', 'Italy'),
	('japan', 'Japan'),
	('latin-america', 'Latin America'),
	('lithuania', 'Lithuania'),
	('netherlands', 'Netherlands'),
	('north-america', 'North America'),
	('poland', 'Poland'),
	('spain', 'Spain'),
	('sweden', 'Sweden'),
	('switzerland', 'Switzerland');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "rebel_cell" varchar(20);--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_rebel_cell_rebel_cells_key_fk" FOREIGN KEY ("rebel_cell") REFERENCES "public"."rebel_cells"("key") ON DELETE set null ON UPDATE no action;