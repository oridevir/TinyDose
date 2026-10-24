-- מקסימום יומי לפי אבחנה (הוחלט 2026-10-24, הורץ במאגר באותו יום)
-- לאותה תרופה יש מקסימום שונה לפי אבחנה (למשל אמוקסיצילין: 3000 אוזן, 1500 שתן, 1000 גרון).
-- אם מולא — גובר על drugs.max_daily_dose_mg. ריק = המקסימום של התרופה.
alter table recommendations
  add column max_daily_dose_mg numeric
  check (max_daily_dose_mg is null or max_daily_dose_mg > 0);
comment on column recommendations.max_daily_dose_mg is 'מקסימום יומי לאבחנה הזאת (מ"ג). אם מולא — גובר על drugs.max_daily_dose_mg';

-- ביטול:
-- alter table recommendations drop column max_daily_dose_mg;
