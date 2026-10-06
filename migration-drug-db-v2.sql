-- TinyDose — מבנה מאגר חדש (שלב 1): תרופות, תכשירים, המלצות
-- ראו CLAUDE.md סעיף 9. נוסף לצד הטבלאות הקיימות; הטבלה הישנה medications לא נוגעים בה.
--
-- drugs           — תרופה (שם גנרי / חומר פעיל)
-- products        — תכשיר (שם מסחרי + ריכוז), שייך לתרופה
-- recommendations — אפשרות טיפול אחת לאבחנה: אבחנה + תרופה + קו טיפול + מינון
--
-- רשומות המלצה בסטטוס 'draft' (טיוטה) גלויות רק למשתמש מחובר (מסך הניהול).

create table if not exists drugs (
  id                 uuid primary key default uuid_generate_v4(),
  name_he            text not null,
  name_en            text,
  search_aliases     text,                -- שמות נוספים לחיפוש, מופרדים בפסיק
  max_daily_dose_mg  numeric check (max_daily_dose_mg is null or max_daily_dose_mg > 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists products (
  id           uuid primary key default uuid_generate_v4(),
  drug_id      uuid not null references drugs(id) on delete restrict,
  brand_name   text not null,
  conc_mg      numeric not null check (conc_mg > 0),   -- ריכוז: X מ"ג ...
  conc_ml      numeric not null check (conc_ml > 0),   -- ... ב-Y מ"ל
  parent_note  text,                                   -- הכנה, שמירה וכו'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists recommendations (
  id                      uuid primary key default uuid_generate_v4(),
  indication_id           uuid not null references indications(id) on delete restrict,
  drug_id                 uuid not null references drugs(id) on delete restrict,
  treatment_line          text not null default 'first'
                          check (treatment_line in ('first', 'alternative', 'allergy')),
  dose_min_mg_per_kg_day  numeric not null check (dose_min_mg_per_kg_day > 0),
  dose_max_mg_per_kg_day  numeric check (dose_max_mg_per_kg_day is null or dose_max_mg_per_kg_day >= dose_min_mg_per_kg_day),
  doses_per_day           integer not null check (doses_per_day between 1 and 6),
  duration_days           integer check (duration_days is null or duration_days > 0),
  doctor_note             text,
  parent_note             text,
  source                  text,
  status                  text not null default 'draft' check (status in ('draft', 'verified')),
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists products_drug_id_idx on products(drug_id);
create index if not exists recommendations_indication_id_idx on recommendations(indication_id);
create index if not exists recommendations_drug_id_idx on recommendations(drug_id);

-- הרשאות: קריאה לכולם, כתיבה רק למשתמש מחובר. המלצות בטיוטה — רק למחובר.
alter table drugs           enable row level security;
alter table products        enable row level security;
alter table recommendations enable row level security;

create policy "Public read drugs"    on drugs for select using (true);
create policy "Auth insert drugs"    on drugs for insert with check ((select auth.role()) = 'authenticated');
create policy "Auth update drugs"    on drugs for update using ((select auth.role()) = 'authenticated');
create policy "Auth delete drugs"    on drugs for delete using ((select auth.role()) = 'authenticated');

create policy "Public read products" on products for select using (true);
create policy "Auth insert products" on products for insert with check ((select auth.role()) = 'authenticated');
create policy "Auth update products" on products for update using ((select auth.role()) = 'authenticated');
create policy "Auth delete products" on products for delete using ((select auth.role()) = 'authenticated');

create policy "Read verified or auth recommendations" on recommendations for select
  using (status = 'verified' or (select auth.role()) = 'authenticated');
create policy "Auth insert recommendations" on recommendations for insert with check ((select auth.role()) = 'authenticated');
create policy "Auth update recommendations" on recommendations for update using ((select auth.role()) = 'authenticated');
create policy "Auth delete recommendations" on recommendations for delete using ((select auth.role()) = 'authenticated');

-- שלב 1ב (2026-10-06): חיפוש תכשיר לפי שמות שונים
alter table products add column if not exists brand_name_en text;    -- שם מסחרי באנגלית
alter table products add column if not exists search_aliases text;   -- שמות נוספים לחיפוש, מופרדים בפסיק
