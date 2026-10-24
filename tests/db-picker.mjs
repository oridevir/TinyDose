// "📚 בחירה מהמאגר" in the free calculation (db-picker.js + calculator.html), against an
// in-memory mock of Supabase — the real database is never touched. Run:
//   node tests/db-picker.mjs        (needs the local supabase-js copy, see tests/README.md)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.resolve(HERE, '..');
let pw;
try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node-tools/node_modules/playwright/index.js')).default; }
const { chromium } = pw;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const UMD = process.env.SUPABASE_UMD || path.join(HERE, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
if (!fs.existsSync(UMD)) { console.error('Missing supabase-js copy. Run: npm install --prefix tests @supabase/supabase-js@2'); process.exit(2); }
const umd = fs.readFileSync(UMD, 'utf8');

const R = (id, ind, drug, line, dmin, dmax, dpd, days, max, extra = {}) => ({ id, indication_id: ind, drug_id: drug, treatment_line: line,
  dose_min_mg_per_kg_day: dmin, dose_max_mg_per_kg_day: dmax, doses_per_day: dpd, duration_days: days, max_daily_dose_mg: max,
  status: 'verified', sort_order: 0, doctor_note: null, parent_note: null, source: 'DAG', ...extra });
const db = {
  categories: [{ id: 'c1', name_he: 'אף-אוזן-גרון', sort_order: 0 }, { id: 'c2', name_he: 'דרכי שתן', sort_order: 0 }],
  indications: [{ id: 'i1', name_he: 'אוטיטיס מדיה', name_en: 'Otitis Media', category_id: 'c1' }, { id: 'i2', name_he: 'טונסיליטיס', category_id: 'c1' },
    { id: 'i3', name_he: 'אוטיטיס אקסטרנה', category_id: 'c1' }, { id: 'i4', name_he: 'זיהום בדרכי השתן', category_id: 'c2' }],
  drugs: [{ id: 'd1', name_he: 'אמוקסיצילין', name_en: 'Amoxicillin', search_aliases: 'מוקסיפן, Moxypen', max_daily_dose_mg: 4000 },
    { id: 'd2', name_he: 'אמוקסיצילין-קלבולנט', name_en: 'Amoxicillin-Clavulanate', search_aliases: 'אוגמנטין', max_daily_dose_mg: null },
    { id: 'd3', name_he: 'אזיתרומיצין', name_en: 'Azithromycin', search_aliases: 'אזניל', max_daily_dose_mg: null },
    { id: 'd4', name_he: 'ציפרופלוקסצין', name_en: 'Ciprofloxacin', search_aliases: null, max_daily_dose_mg: null }],
  products: [{ id: 'p1', drug_id: 'd1', brand_name: 'מוקסיפן 250', conc_mg: 250, conc_ml: 5 },
    { id: 'p2', drug_id: 'd2', brand_name: 'אוגמנטין 400', conc_mg: 400, conc_ml: 5 }, { id: 'p3', drug_id: 'd2', brand_name: 'אוגמנטין ES 600', conc_mg: 600, conc_ml: 5 },
    { id: 'p4', drug_id: 'd3', brand_name: 'אזניל 200', conc_mg: 200, conc_ml: 5 }],
  recommendations: [
    R('r1', 'i1', 'd1', 'first', 60, 90, 2, 5, 3000, { doctor_note: 'משך לפי DAG: 5–10 ימים.' }),
    R('r2', 'i1', 'd2', 'alternative', 80, null, 2, 7, null),
    R('r3', 'i2', 'd3', 'allergy', 6, null, 1, 5, 250, { parent_note: 'ביום הראשון של הטיפול ניתנת מנה גדולה יותר.', status: 'draft' }),
    R('r4', 'i2', 'd1', 'first', 50, null, 2, 10, 1000),
    R('r5', 'i4', 'd4', 'alternative', 30, null, 2, 3, 1000),
  ],
};

const b = await chromium.launch(); const errs = []; const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? 'ok   ' : 'FAIL ') + msg); };
async function page(url, vp = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.route('https://tinydose.test/**', r => { const p = new URL(r.request().url()).pathname; const f = path.join(ROOT, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'var self=globalThis;' + umd + '\nexport const createClient = supabase.createClient;' }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('https://orvizmgloskvqfsralxc.supabase.co/**', route => {
    const m = new URL(route.request().url()).pathname.match(/\/rest\/v1\/(\w+)/);
    if (route.request().method() !== 'GET' || !m) { errs.push('unexpected request ' + route.request().method() + ' ' + route.request().url()); return route.fulfill({ status: 405, body: '' }); }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db[m[1]]) });
  });
  await ctx.addInitScript(() => { navigator.share = async d => { window.__shared = d.text; }; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForSelector('#ff-weight');
  return p;
}
const val = (p, id) => p.inputValue('#' + id);
// Comparisons ignore the invisible LTR isolates (U+2066/U+2069) that keep mixed Hebrew/English in order
const ISO = /[\u2066-\u2069]/g;
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(ISO, '').replace(/\s+/g, ' ').trim();
const rawShare = async p => { await p.evaluate(() => { window.__shared = null; document.getElementById('share-btn').click(); }); return p.evaluate(() => window.__shared); };
const share = async p => (await rawShare(p))?.replace(ISO, '');

// 1. Switch off (default): no button, nothing read from Supabase
let p = await page('https://tinydose.test/calculator.html');
check(!(await p.$('#dbp-open')), 'switch off: no "בחירה מהמאגר" button');
check(!(await p.$('.wind-toggle')), 'switch off: no clouds button');

// 2. Preview with ?db=1
p = await page('https://tinydose.test/calculator.html?db=1');
check(await p.$eval('#dbp-picked', e => getComputedStyle(e).display === 'none'), 'database panel really invisible before a choice');
await p.evaluate(() => window.scrollTo(0, 0));
await p.evaluate(() => document.getElementById('dbp-open').click());   // no auto-scroll, like a real tap
await p.waitForSelector('.dbp-overlay:not([hidden]) .dbp-catcard');
const vis = await p.evaluate(() => { const r = document.querySelector('.dbp-sheet').getBoundingClientRect();
  return { pos: getComputedStyle(document.querySelector('.dbp-overlay')).position, top: r.top, bottom: r.bottom, h: innerHeight, y: scrollY }; });
check(vis.pos === 'fixed' && vis.top >= 0 && vis.bottom <= vis.h + 1 && vis.y === 0, `window opens on screen without scrolling (${JSON.stringify(vis)})`);
check(vis.top === 0 && Math.abs(vis.bottom - vis.h) <= 1, 'phone: window fills the screen');
const home = await txt(p, '#dbp-body');
check(home.includes('אף-אוזן-גרון') && home.includes('דרכי שתן') && !home.includes('אוטיטיס מדיה'), 'home shows categories only');
check(home.includes('טיוטות'), 'draft notice shown when drafts are visible');
await p.click('[data-cat="c1"]');
const cat = await txt(p, '#dbp-body');
check(cat.includes('אוטיטיס מדיה') && cat.includes('טונסיליטיס') && !cat.includes('זיהום בדרכי השתן'), 'category shows its diagnoses');
check(!cat.includes('אוטיטיס אקסטרנה'), 'diagnosis without options is hidden');
const sw = await p.evaluate(() => document.documentElement.scrollWidth); check(sw <= 390, `phone: no horizontal scroll (${sw})`);

// 3. Browse → diagnosis → option → confirm → fields filled (never the weight)
await p.click('[data-ind="i1"]');
const ind = await txt(p, '#dbp-body');
check(ind.includes('אמוקסיצילין') && ind.includes('אמוקסיצילין-קלבולנט') && !ind.includes('מ"ג/ק"ג') && !ind.includes('משך לפי DAG'), 'diagnosis shows drug names only');
check(ind.indexOf('קו ראשון') < ind.indexOf('חלופה'), 'first line listed first');
check((await txt(p, '#dbp-crumbs')) === 'אף-אוזן-גרון › אוטיטיס מדיה', 'breadcrumbs show where you are');
await p.click('[data-rec="r1"]');
const det = await txt(p, '#dbp-body');
check(det.includes('מילוי בדף החישוב') && det.includes('משך לפי DAG') && det.includes('3000') && det.includes('מוקסיפן 250'), 'drug screen: all details, note, syrup and fill button');
await p.click('#dbp-back'); await p.click('#dbp-back');
check((await txt(p, '#dbp-body')).includes('טונסיליטיס'), 'back: drug → diagnosis → category');
await p.click('#dbp-back');
check(!!(await p.$('[data-cat]')), 'back again: categories');
await p.click('[data-cat="c1"]'); await p.click('[data-ind="i1"]'); await p.click('[data-rec="r1"]');
await p.click('#dbp-ok');
check(await p.$eval('.dbp-overlay', e => e.hidden), 'window closes after confirm');
check(await val(p, 'ff-drug') === 'אמוקסיצילין (מוקסיפן 250)', 'drug name + syrup filled');
check(await val(p, 'ff-diagnosis') === 'אוטיטיס מדיה', 'diagnosis filled');
check(await val(p, 'ff-dose-min') === '60' && await val(p, 'ff-dose-max') === '90', 'dose range filled');
check(await val(p, 'ff-doses') === '2', 'doses per day filled');
check(await val(p, 'ff-conc-mg') === '250' && await val(p, 'ff-conc-ml') === '5', 'concentration filled from syrup');
check(await val(p, 'ff-maxdaily') === '3000', 'per-diagnosis max (3000) used, not the drug max (4000)');
check(await val(p, 'ff-weight') === '', 'weight NOT filled');
check(await val(p, 'dbp-days') === '5', 'duration shown in the database panel');
check((await txt(p, '#ff-live-vol')) === '—', 'no result before a weight is entered');
await p.fill('#ff-weight', '10'); await p.waitForTimeout(150);
check((await txt(p, '#ff-live-vol')).replace(/[⁦⁩]/g, '') === '6–9 מ"ל', `bubble = 6–9 ml for 10 kg (${await txt(p, '#ff-live-vol')})`);
const rawT = await rawShare(p);
check(rawT && rawT.includes('(מוקסיפן \u2066250\u2069)'), 'WhatsApp: numbers inside Hebrew text are LTR-isolated');
const card = await p.evaluate(() => document.querySelector('#dbp-picked .dbp-dnote').textContent);
check(card.includes('\u2066DAG\u2069: \u20665–10\u2069'), 'doctor note: "DAG: 5–10" → DAG, colon, 5–10 in Hebrew reading order');
let t = await share(p);
check(t && t.includes('למשך 5 ימים') && t.includes('אמוקסיצילין (מוקסיפן 250)') && t.includes('אוטיטיס מדיה'), 'WhatsApp text has drug, diagnosis and duration');
await p.fill('#dbp-days', '7'); await p.waitForTimeout(150);
t = await share(p); check(t && t.includes('למשך 7 ימים'), 'edited duration flows to WhatsApp');
await p.fill('#ff-weight', '40'); await p.waitForTimeout(150);
check((await txt(p, '#ff-live-sub')).includes('הוגבל'), '40 kg: range capped at the per-diagnosis max');

// 4. New choice replaces the old one; parent note lands in the parents' notes; drafts marked
await p.click('#dbp-open'); await p.fill('#dbp-q', 'אזניל'); await p.waitForTimeout(100);
const sr = await txt(p, '#dbp-body'); check(sr.includes('אזיתרומיצין') && sr.includes('טונסיליטיס') && !sr.includes('אמוקסיצילין'), 'search by brand name finds the option');
await p.click('[data-rec="r3"]');
check((await txt(p, '#dbp-body')).includes('טיוטה'), 'draft badge in confirm window');
await p.click('#dbp-ok'); await p.waitForTimeout(150);
check(await val(p, 'ff-dose-max') === '', 'previous range end cleared by the new choice');
check(await val(p, 'ff-maxdaily') === '250' && await val(p, 'ff-weight') === '40', 'new values filled, weight kept');
check(await p.inputValue('#doctor-notes') === 'ביום הראשון של הטיפול ניתנת מנה גדולה יותר.', 'parent note placed in parents\' notes');
check((await txt(p, '#dbp-picked')).includes('טיוטה'), 'draft badge in the database panel');
t = await share(p); check(t && t.includes('ביום הראשון'), 'parent note reaches WhatsApp');

// 5. Several syrups: chips switch the concentration and the name
await p.click('#dbp-open'); await p.fill('#dbp-q', 'אוטיטיס'); await p.click('[data-ind="i1"]'); await p.click('[data-rec="r2"]');
check((await p.$$('input[name=dbp-prod]')).length === 2, 'confirm window offers both syrups');
await p.click('#dbp-ok'); await p.waitForTimeout(150);
check(await p.inputValue('#doctor-notes') === '', 'parents\' notes cleared by the new choice');
await p.click('[data-prod="p3"]'); await p.waitForTimeout(150);
check(await val(p, 'ff-conc-mg') === '600' && await val(p, 'ff-drug') === 'אמוקסיצילין-קלבולנט (אוגמנטין ES 600)', 'syrup chip switches concentration and name');
check(await val(p, 'ff-maxdaily') === '', 'no max anywhere → max field left empty');

// 6. No syrup in the database → concentration left for the doctor
await p.click('#dbp-open'); await p.fill('#dbp-q', 'ציפרו'); await p.click('[data-rec="r5"]');
check((await txt(p, '#dbp-body')).includes('אין סירופ'), 'confirm window warns: no syrup');
await p.click('#dbp-ok'); await p.waitForTimeout(150);
check(await val(p, 'ff-conc-mg') === '' && (await txt(p, '#dbp-picked')).includes('יש להקליד את הריכוז'), 'concentration empty + warning');
check((await txt(p, '#ff-live-vol')) === '—', 'no result until a concentration is typed');
await p.fill('#ff-conc-mg', '250'); await p.fill('#ff-conc-ml', '5'); await p.waitForTimeout(150);
check((await txt(p, '#ff-live-sub')).includes('חריגה'), '40 kg × 30 = 1200 > max 1000 → exceeded, no volume');
await p.fill('#ff-weight', '10'); await p.waitForTimeout(150);
check((await txt(p, '#ff-live-vol')).length > 1 && !(await txt(p, '#ff-live-vol')).includes('—'), 'typed concentration → result');

// 7. Clear, reset, close
await p.click('#dbp-clear'); await p.waitForTimeout(100);
check(await p.$eval('#dbp-picked', e => e.hidden) && await val(p, 'ff-drug') === '' && await val(p, 'ff-dose-min') === '', '"ניקוי" empties the filled fields and the panel');
await p.click('#dbp-open'); await p.click('[data-cat="c1"]'); await p.click('[data-ind="i1"]'); await p.click('[data-rec="r1"]'); await p.click('#dbp-ok');
await p.click('#reset-btn'); await p.waitForTimeout(150);
check(!(await p.$('#dbp-picked:not([hidden])')) && await val(p, 'ff-dose-min') === '', 'איפוס clears the database choice too');
await p.click('#dbp-open'); await p.waitForSelector('.dbp-overlay:not([hidden]) .dbp-catcard'); await p.keyboard.press('Escape');
check(await p.$eval('.dbp-overlay', e => e.hidden), 'Escape closes the window');

// 8. Phone keyboard: the window shrinks with the visible area, results stay above the keyboard
p = await page('https://tinydose.test/calculator.html?db=1');
await p.click('#dbp-open'); await p.waitForSelector('.dbp-catcard');
await p.setViewportSize({ width: 390, height: 420 });   // like a keyboard taking half the screen
await p.fill('#dbp-q', 'אמוקס'); await p.waitForTimeout(200);
const kb = await p.evaluate(() => { const r = document.querySelector('#dbp-body .dbp-pill').getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; });
check(kb.b <= kb.h, `search: first result visible above the keyboard (${JSON.stringify(kb)})`);

// 9. Wind (experiment): clouds drift right, near layer faster than far; off stops them
p = await page('https://tinydose.test/calculator.html?db=1');
const xs = () => p.$$eval('.sky-layer', els => els.map(e => parseFloat(getComputedStyle(e).backgroundPositionX)));
const x0 = await xs();
await p.click('.wind-toggle'); await p.waitForTimeout(1500);
const x1 = await xs();
const moved = x1.map((v, i) => v - x0[i]);   // far, mid, near
check(moved.every(m => m > 0) && moved[0] < moved[1] && moved[1] < moved[2], `wind: all layers move right, near fastest (${moved.map(m => m.toFixed(1)).join(' / ')} px)`);
check(await p.$eval('.wind-toggle', e => e.getAttribute('aria-pressed')) === 'true', 'wind button shows "on"');
await p.click('.wind-toggle'); const x2 = await xs(); await p.waitForTimeout(600); const x3 = await xs();
check(x3.every((v, i) => v === x2[i]), 'wind off: clouds stop');

// 10. Desktop layout
p = await page('https://tinydose.test/calculator.html?db=1', { width: 1280, height: 900 });
await p.click('#dbp-open'); await p.waitForSelector('.dbp-catcard');
const box = await p.$eval('.dbp-sheet', e => e.getBoundingClientRect().width); check(box <= 560, `desktop: window width ${box}px`);

console.log('ERRORS', errs);
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED');
await b.close();
process.exitCode = errs.length || fails.length ? 1 : 0;
