CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('draft', 'posted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('invoice', 'credit_note', 'payment');--> statement-breakpoint
CREATE TYPE "public"."period_state" AS ENUM('open', 'soft_closed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'accountant', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."supply_kind" AS ENUM('intra_state', 'inter_state', 'exempt');--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"state" "period_state" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "periods_range_valid" CHECK ("accounting_periods"."ends_on" >= "accounting_periods"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"parent_id" uuid,
	"is_postable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_document_id" uuid NOT NULL,
	"to_document_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_positive" CHECK ("allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"actor_id" uuid,
	"actor_email" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_line_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_line_id" uuid NOT NULL,
	"component" text NOT NULL,
	"rate_percent" text NOT NULL,
	"taxable_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_percent" text DEFAULT '0' NOT NULL,
	"income_account_id" uuid,
	"line_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"line_discount_minor" bigint DEFAULT 0 NOT NULL,
	"line_tax_minor" bigint DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "document_lines_amounts_non_negative" CHECK ("document_lines"."line_subtotal_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"doc_number" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"party_id" uuid NOT NULL,
	"party_snapshot" jsonb NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fx_rate" text DEFAULT '1' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"discount_type" text DEFAULT 'fixed' NOT NULL,
	"discount_value" text DEFAULT '0' NOT NULL,
	"supply_kind" "supply_kind" DEFAULT 'intra_state' NOT NULL,
	"place_of_supply" text DEFAULT '' NOT NULL,
	"corrects_document_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_posted_has_number" CHECK (("documents"."status" <> 'posted') OR ("documents"."doc_number" IS NOT NULL AND "documents"."posted_at" IS NOT NULL)),
	CONSTRAINT "documents_totals_non_negative" CHECK ("documents"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"address_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL,
	"functional_currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"default_tax_rate_percent" text DEFAULT '0' NOT NULL,
	"tax_code_id" uuid,
	"income_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_price_non_negative" CHECK ("items"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"memo" text DEFAULT '' NOT NULL,
	"reversal_of_id" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"party_id" uuid,
	"debit_minor" bigint DEFAULT 0 NOT NULL,
	"credit_minor" bigint DEFAULT 0 NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	CONSTRAINT "journal_lines_one_sided" CHECK ("journal_lines"."debit_minor" = 0 OR "journal_lines"."credit_minor" = 0),
	CONSTRAINT "journal_lines_non_negative" CHECK ("journal_lines"."debit_minor" >= 0 AND "journal_lines"."credit_minor" >= 0),
	CONSTRAINT "journal_lines_not_empty" CHECK ("journal_lines"."debit_minor" > 0 OR "journal_lines"."credit_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"fiscal_year" text NOT NULL,
	"prefix" text NOT NULL,
	"padding" integer DEFAULT 5 NOT NULL,
	"next_value" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "series_next_positive" CHECK ("number_series"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_customer" boolean DEFAULT true NOT NULL,
	"is_vendor" boolean DEFAULT false NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"billing_address" jsonb DEFAULT '{"line1":"","line2":"","city":"","state":"","postalCode":"","country":"India"}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_code_id" uuid NOT NULL,
	"rate_percent" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_from_document_id_documents_id_fk" FOREIGN KEY ("from_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_to_document_id_documents_id_fk" FOREIGN KEY ("to_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_taxes" ADD CONSTRAINT "document_line_taxes_document_line_id_document_lines_id_fk" FOREIGN KEY ("document_line_id") REFERENCES "public"."document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_taxes" ADD CONSTRAINT "document_line_taxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_income_account_id_accounts_id_fk" FOREIGN KEY ("income_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_income_account_id_accounts_id_fk" FOREIGN KEY ("income_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periods_entity_start_key" ON "accounting_periods" USING btree ("entity_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_entity_code_key" ON "accounts" USING btree ("entity_id","code");--> statement-breakpoint
CREATE INDEX "allocations_to_idx" ON "allocations" USING btree ("to_document_id");--> statement-breakpoint
CREATE INDEX "allocations_from_idx" ON "allocations" USING btree ("from_document_id");--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_log" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_lines_doc_no_key" ON "document_lines" USING btree ("document_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_entity_number_key" ON "documents" USING btree ("entity_id","doc_type","doc_number") WHERE "documents"."doc_number" is not null;--> statement-breakpoint
CREATE INDEX "documents_party_idx" ON "documents" USING btree ("party_id","issue_date");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("entity_id","doc_type","status");--> statement-breakpoint
CREATE INDEX "items_entity_name_idx" ON "items" USING btree ("entity_id","name");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entries_period_idx" ON "journal_entries" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_party_idx" ON "journal_lines" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_key" ON "number_series" USING btree ("entity_id","doc_type","fiscal_year");--> statement-breakpoint
CREATE INDEX "outbox_undelivered_idx" ON "outbox" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "parties_entity_name_idx" ON "parties" USING btree ("entity_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_codes_entity_code_key" ON "tax_codes" USING btree ("entity_id","code");--> statement-breakpoint
CREATE INDEX "tax_rates_code_from_idx" ON "tax_rates" USING btree ("tax_code_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));