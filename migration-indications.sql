-- migration-indications.sql
-- TinyDose — extract indications into a dedicated table
--
-- PREREQUISITE: migration-categories.sql must already have been run.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 1 — Run immediately. Safe to re-run (IF NOT EXISTS guards).       │
-- │  Creates the new table, migrates data, and links medications via FK.    │
-- │  Does NOT alter or drop any existing columns yet.                       │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── Step 1: Create the indications table ─────────────────────────────────
create table if not exists indications (
  id          uuid primary key default uuid_generate_v4(),
  name_he     text not null,
  name_en     text,
  category_id uuid references categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table indications enable row level security;

create policy "Public read indications"
  on indications for select
  using (true);

create policy "Auth insert indications"
  on indications for insert
  with check (auth.role() = 'authenticated');

create policy "Auth update indications"
  on indications for update
  using (auth.role() = 'authenticated');

create policy "Auth delete indications"
  on indications for delete
  using (auth.role() = 'authenticated');

-- ── Step 2: Add indication_id to medications (nullable for now) ──────────
-- on delete restrict: a medication without an indication is clinically
-- meaningless, so we prevent orphaning rather than silently nulling it.
alter table medications
  add column if not exists indication_id uuid references indications(id) on delete restrict;

-- ── Step 3: Populate indications from unique indication_he values ─────────
-- DISTINCT ON selects one row per indication_he.
-- ORDER BY ... category_id nulls last means a row with a non-null category_id
-- is preferred over a null one (so existing category assignments are preserved).
-- If two rows for the same indication_he have *different* category_ids, the
-- first non-null value wins — check manually if this matters for your data.
insert into indications (name_he, name_en, category_id)
select distinct on (indication_he)
  indication_he,
  indication_en,
  category_id
from medications
order by indication_he, category_id nulls last;

-- ── Step 4: Link each medication row to its matching indication ───────────
update medications m
set indication_id = i.id
from indications i
where m.indication_he = i.name_he;

-- ── Verification query — run this and confirm the result is 0 ────────────
-- select count(*) from medications where indication_id is null;
--
-- If the count is 0, all medications are linked and you may proceed to
-- Part 2 below. If the count is > 0, check those rows manually before
-- continuing (they may have indication_he values that don't match any
-- indication, e.g. trailing spaces or encoding differences).


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 2 — Run ONLY after verifying the count above is 0.               │
-- │  Removes old text columns from medications.                             │
-- │  THIS IS DESTRUCTIVE AND IRREVERSIBLE — back up first if unsure.        │
-- └─────────────────────────────────────────────────────────────────────────┘

-- alter table medications alter column indication_id set not null;
-- alter table medications drop column if exists indication_he;
-- alter table medications drop column if exists indication_en;
-- alter table medications drop column if exists category_id;
