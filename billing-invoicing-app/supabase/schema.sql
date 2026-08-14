-- ============================================================================
-- Billing & Invoicing App - Initial Schema (Phase 1)
-- Single-tenant: no company_id / tenant isolation columns anywhere.
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto on older Postgres; Supabase ships it
-- pre-enabled on new projects, but this makes the script safe to re-run.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- CLIENTS  (Party Master)
-- ============================================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  gstin text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists clients_set_updated_at on clients;
create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

create index if not exists clients_name_idx on clients (name);

-- ============================================================================
-- ITEMS  (Product / Service Master)
-- ============================================================================
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hsn_sac_code text,
  unit text not null default 'unit',
  price numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0, -- percentage, e.g. 18 = 18%
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row
  execute function set_updated_at();

create index if not exists items_name_idx on items (name);

-- ============================================================================
-- INVOICES
-- ============================================================================

-- Backs the human-readable invoice_number default (INV-00001, INV-00002, ...).
create sequence if not exists invoice_number_seq start 1;

create or replace function generate_invoice_number()
returns text
language plpgsql
as $$
begin
  return 'INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0');
end;
$$;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default generate_invoice_number(),
  client_id uuid not null references clients (id) on delete restrict,

  invoice_date date not null default current_date,
  due_date date,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled')),

  -- Money fields are computed and stored (not recalculated on every read)
  -- by the app layer whenever line items change. See Phase 4 (Invoice Engine).
  subtotal numeric(12, 2) not null default 0,
  discount_type text not null default 'fixed'
    check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,

  notes text,
  terms text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at
  before update on invoices
  for each row
  execute function set_updated_at();

create index if not exists invoices_client_id_idx on invoices (client_id);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_invoice_date_idx on invoices (invoice_date);

-- ============================================================================
-- INVOICE LINE ITEMS
-- ============================================================================
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  item_id uuid references items (id) on delete set null,

  -- Snapshot fields: copied from `items` at the time the line is added, so
  -- editing/deleting an item later never rewrites historical invoices.
  description text not null,
  hsn_sac_code text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,

  line_subtotal numeric(12, 2) not null default 0,
  line_tax_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_line_items_invoice_id_idx
  on invoice_line_items (invoice_id);

-- ============================================================================
-- Row Level Security
--
-- Single-tenant app, one shared "admin" role for all logged-in users -- so
-- the rule is simply "authenticated users can do anything, anonymous users
-- can do nothing." No per-row ownership checks are needed anywhere.
-- ============================================================================
alter table clients enable row level security;
alter table items enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

drop policy if exists "Authenticated full access" on clients;
create policy "Authenticated full access" on clients
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated full access" on items;
create policy "Authenticated full access" on items
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated full access" on invoices;
create policy "Authenticated full access" on invoices
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated full access" on invoice_line_items;
create policy "Authenticated full access" on invoice_line_items
  for all
  to authenticated
  using (true)
  with check (true);
