// config.js — site-wide switches. Loaded as a classic (non-module) script in
// <head> so it runs before the page renders, avoiding any flicker.

// FREE_CALC_ONLY — temporary mode while the drug database is being built.
// true:  the site offers only the free (manual-entry) calculation. The home
//        page sends visitors straight to it, catalog links fall back to it,
//        and nothing is read from Supabase.
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
