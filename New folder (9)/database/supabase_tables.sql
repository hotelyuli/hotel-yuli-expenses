-- Run this file once in Supabase SQL Editor before deploying the revised app.
create table if not exists expenses (
  id text primary key,
  amount numeric not null,
  currency text not null check (currency in ('USD', 'CRC')),
  category text,
  vendor text,
  description text,
  date date not null,
  payment_method text,
  bank_account text,
  submitted_by text not null,
  submitted_at timestamptz default now(),
  status text not null default 'pending',
  invoice_attached boolean default false,
  invoice_file_name text,
  invoice_thumb text,
  invoice_thumb_truncated boolean default false,
  extra_invoices jsonb default '[]'::jsonb,
  matched boolean default false,
  month_key text,
  ai_scanned boolean default false,
  invoice_number text,
  subtotal numeric,
  tax_amount numeric,
  document_type text,
  scan_confidence text
);

alter table expenses add column if not exists invoice_number text;
alter table expenses add column if not exists subtotal numeric;
alter table expenses add column if not exists tax_amount numeric;
alter table expenses add column if not exists document_type text;
alter table expenses add column if not exists scan_confidence text;

create index if not exists expenses_month_key_idx on expenses(month_key);
create index if not exists expenses_status_idx on expenses(status);
create index if not exists expenses_category_idx on expenses(category);

-- Bank transactions from BCR / LAFISE statements
create table if not exists bank_transactions (
  id text primary key,
  upload_id text not null,           -- groups transactions from same upload
  bank text not null,                -- 'BCR' or 'LAFISE'
  account_currency text not null,    -- 'USD' or 'CRC'
  transaction_date text not null,    -- DD/MM/YYYY as stored in file
  document_number text,
  description text,
  amount_original numeric not null,  -- original currency amount (always positive)
  exchange_rate numeric default 1,   -- CRC/USD rate on that date
  amount_crc numeric,                -- converted to CRC
  matched_expense_id text,           -- links to expenses.id if matched
  uploaded_by text,
  uploaded_at timestamptz default now()
);

-- Accountant records from Annual Report Excel
create table if not exists accountant_records (
  id text primary key,
  upload_id text not null,
  document_number text,
  currency text,
  exchange_rate numeric,
  document_type text,
  transaction_date text,
  receptor text,
  proveedor text,
  id_proveedor text,
  total_general numeric,
  total_crc numeric,                 -- always in CRC (total_general * exchange_rate)
  subtotal numeric,
  total_impuestos numeric,
  uploaded_by text,
  uploaded_at timestamptz default now()
);
