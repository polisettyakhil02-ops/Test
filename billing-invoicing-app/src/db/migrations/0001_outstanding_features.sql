DROP INDEX "outbox_undelivered_idx";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "irn" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ack_no" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ack_date" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "signed_qr_code" text;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "last_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_undelivered_idx" ON "outbox" USING btree ("delivered_at","next_attempt_at");