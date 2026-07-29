-- TinyDose — Supabase schema (v2)
-- Run this in the Supabase SQL editor
--
-- ═══════════════════════════════════════════════════════════════════
-- IF YOU ALREADY RAN A PREVIOUS VERSION OF THIS SCHEMA AND HAVE DATA:
-- Do NOT run this whole file — it will try to re-create the table and
-- fail (or silently skip, since `create table if not exists` does
-- nothing if the table is already there — your new columns will be
-- missing). Instead, scroll down to the "MIGRATION" block near the
-- bottom of this file and run ONLY that block.
--
-- IF THIS IS A BRAND NEW, EMPTY SUPABASE PROJECT:
-- Run this entire file top to bottom, as-is.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

create table if not exists medications (
  id                        uuid primary key default uuid_generate_v4(),
  indication_he             text not null,
  indication_en             text,
  drug_name                 text not null,
  -- Free-text label for the specific product/strength, e.g. '125mg/5ml'.
  -- Lets the same drug+indication exist multiple times for different
  -- bottle strengths, distinguishable to the prescriber at a glance.
  concentration_label       text,
  dose_min_mg_per_kg_day    numeric not null check (dose_min_mg_per_kg_day > 0),
  dose_max_mg_per_kg_day    numeric check (dose_max_mg_per_kg_day is null or dose_max_mg_per_kg_day >= dose_min_mg_per_kg_day),
  concentration_mg_per_ml   numeric not null check (concentration_mg_per_ml > 0),
  doses_per_day             integer not null check (doses_per_day >= 1 and doses_per_day <= 6),
  -- Optional treatment length in days. Left null if unknown/variable.
  duration_days             integer check (duration_days is null or duration_days > 0),
  max_daily_dose_mg         numeric not null check (max_daily_dose_mg > 0),
  -- Adult ceiling, in mg/day. When the weight-based child dose exceeds
  -- max_daily_dose_mg, the app divides THIS number by doses_per_day and
  -- by concentration_mg_per_ml to auto-compute the adult ml-per-dose —
  -- using the SAME syrup concentration and SAME doses_per_day as the
  -- child regimen (per Dr. Devir: adult dosing here assumes the same
  -- bottle, just at adult quantities).
  adult_max_daily_dose_mg   numeric check (adult_max_daily_dose_mg is null or adult_max_daily_dose_mg > 0),
  -- Free-text fallback / extra clarification, shown alongside (or instead
  -- of) the auto-computed adult dose — useful when the adult formulation
  -- genuinely differs (e.g. switches to tablets) and auto-calculation
  -- from the child's syrup concentration would be wrong.
  adult_dose_note           text,
  notes                     text,
  is_shortcut               boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- RLS
alter table medications enable row level security;

-- Anyone can read
create policy "Public read"
  on medications for select
  using (true);

-- Only authenticated users can write
create policy "Auth insert"
  on medications for insert
  with check (auth.role() = 'authenticated');

create policy "Auth update"
  on medications for update
  using (auth.role() = 'authenticated');

create policy "Auth delete"
  on medications for delete
  using (auth.role() = 'authenticated');

-- ── Sample data ──
-- NOTE: These are TECHNICAL TEST RECORDS ONLY — meant to verify the app's
-- structure and the "exceeds max dose" flow work correctly. They are NOT
-- clinical recommendations. Dr. Devir will populate the real medication
-- catalog through the admin screen with verified clinical values.
insert into medications
  (indication_he, indication_en, drug_name, concentration_label,
   dose_min_mg_per_kg_day, dose_max_mg_per_kg_day,
   concentration_mg_per_ml, doses_per_day, duration_days, max_daily_dose_mg,
   adult_max_daily_dose_mg, adult_dose_note, notes, is_shortcut)
values
  -- Test record 1: normal-range calculation, no range, no overflow expected
  -- for typical pediatric weights. Use this to verify the basic flow.
  ('בדיקה — מינון תקין', 'Test — Normal Dose', '[בדיקה] תרופה לדוגמה', '125mg/5ml',
   10, 20,
   25, 3, 7, 2000,
   1500, null,
   'רשומת בדיקה טכנית בלבד — אינה המלצה קלינית. החלף/מחק לפני שימוש אמיתי.',
   true),

  -- Test record 2: deliberately low max_daily_dose_mg so that even a
  -- modest weight (e.g. 15kg) triggers the "exceeded" / adult-dose flow.
  -- Use this to verify the warning UI and the auto-computed adult dose.
  ('בדיקה — חריגת מינון', 'Test — Dose Exceeded', '[בדיקה] תרופה לבדיקת חריגה', '100mg/5ml',
   30, 40,
   20, 2, 5, 300,
   400, null,
   'רשומת בדיקה טכנית בלבד — בודקת את תרחיש החריגה ממינון מקסימלי. החלף/מחק לפני שימוש אמיתי.',
   false);


-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION — run ONLY this block if you already have the table from
-- a previous version, and want to keep your existing data/edits.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════
--
-- alter table medications
--   add column if not exists concentration_label text,
--   add column if not exists duration_days integer,
--   add column if not exists adult_max_daily_dose_mg numeric;
--
-- alter table medications
--   add constraint medications_duration_check
--     check (duration_days is null or duration_days > 0);
--
-- alter table medications
--   add constraint medications_adult_max_check
--     check (adult_max_daily_dose_mg is null or adult_max_daily_dose_mg > 0);
--
-- ═══════════════════════════════════════════════════════════════════
