# Hotel Yuli Expense Tracker

This project keeps the current Hotel Yuli interface and adds a cleaner accounting structure, improved invoice extraction, and accountant-ready Excel export.

## Before deployment

1. In Supabase, run `database/supabase_tables.sql` in the SQL Editor.
2. If the current database contains the old category names, review and run `database/migrate_legacy_categories.sql`.
3. In Vercel, configure the variables listed in `.env.example`.
4. Deploy the project root.

## Scanner configuration

The scanner API key must be stored as `ANTHROPIC_API_KEY` in Vercel. Do not use a `VITE_` prefix because that would expose the secret to browsers.

The scanner now extracts the total, currency, vendor, date, invoice number, subtotal, tax, document type, category, description, and confidence. Staff must review the extracted information before submitting it.

## Excel export

The Excel download contains:

- `Expense Register`: detailed approved expenses sorted by accounting category and date.
- `Category Summary`: monthly USD-equivalent totals by category.
- `Missing Documents`: approved records that do not have an invoice attachment.

The exchange rate entered on the Reports screen is used only for the USD-equivalent columns. Original USD and CRC amounts remain unchanged in the register.

## Important security step

The current project still uses the original name selector and client-side admin PIN. Before using the app as the permanent accounting archive, replace this with authenticated staff accounts and private document storage. The Supabase anonymous key may be public, but database access must be controlled by Row Level Security policies.
