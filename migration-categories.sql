-- migration-categories.sql
-- TinyDose — add categories table + link medications to categories
--
-- HOW TO RUN:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. This migration is additive — it does NOT touch existing medication rows
--      (category_id defaults to NULL, which the UI treats as "כללי / לא ממוין")
--   4. Safe to re-run: all statements use "IF NOT EXISTS" or "IF NOT EXISTS" guards
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ── New table: categories ─────────────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  name_he     text not null,
  name_en     text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table categories enable row level security;

create policy "Public read categories"
  on categories for select
  using (true);

create policy "Auth insert categories"
  on categories for insert
  with check (auth.role() = 'authenticated');

create policy "Auth update categories"
  on categories for update
  using (auth.role() = 'authenticated');

create policy "Auth delete categories"
  on categories for delete
  using (auth.role() = 'authenticated');

-- ── Link medications → categories ────────────────────────────────────────────
-- NULL = uncategorised ("כללי / לא ממוין") — intentional, no migration needed
alter table medications
  add column if not exists category_id uuid references categories(id) on delete set null;
