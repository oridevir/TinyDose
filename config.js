// config.js — site-wide switches. Loaded as a classic (non-module) script in
// <head> so it runs before the page renders, avoiding any flicker.

// FREE_CALC_ONLY — temporary mode while the drug database is being built.
// true:  the site offers only the free (manual-entry) calculation. The home
//        page sends visitors straight to it, catalog links fall back to it,
//        and nothing is read from Supabase (except by "בחירה מהמאגר", below).
// false: normal behavior — search, categories and the drug catalog.
window.FREE_CALC_ONLY = true;

if (window.FREE_CALC_ONLY) {
  document.documentElement.classList.add('free-calc-only');
}

// SHOW_DEV_BANNER — the "site under development" strip at the top of every page.
// true: shown.  false: hidden (the banner stays in the pages, ready to return).
window.SHOW_DEV_BANNER = false;

if (!window.SHOW_DEV_BANNER) {
  document.documentElement.classList.add('hide-dev-banner');
}

// DB_PICKER — the "📚 בחירה מהמאגר" button in the free calculation (db-picker.js):
// browse the drug database and fill the calculation fields from a chosen option.
// false: hidden. A preview is still possible with ?db=1 in the address.
// Visitors see verified options only (Supabase rule); a signed-in admin also sees drafts.
window.DB_PICKER = true;

// ALLOWED_SYRUPS — in "בחירה מהמאגר", offer only the preparations marked for the
// chosen option (recommendations.allowed_product_ids; empty = all of the drug's).
// false: all preparations of the drug, in every diagnosis. A preview is possible with ?exp=1.
window.ALLOWED_SYRUPS = true;
