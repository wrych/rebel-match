CREATE TABLE "invite_opens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"invite_id" varchar(36) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_opens" ADD CONSTRAINT "invite_opens_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_open_invite" ON "invite_opens" USING btree ("invite_id");