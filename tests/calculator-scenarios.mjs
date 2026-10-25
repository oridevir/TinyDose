// Scenario bench for the calculator (index.html) (free calculation): an independent oracle +
// invariants, checked against the bubble, details, WhatsApp text, print and rounding.
// Run:  node tests/calculator-scenarios.mjs        (SEED=… N=… for other random sets)
// See tests/README.md.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.resolve(HERE, '..');
// Playwright: a local install, or the cloud environment's global one
let pw;
try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node-tools/node_modules/playwright/index.js')).default; }
const { chromium } = pw;

// ── deterministic random ──
let seed = +(process.env.SEED || 12345);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];

// ── scenarios ──
const S = [];
// d = days of treatment (required field); default 7 unless the scenario sets it
const add = (name, o) => S.push({ name, d: 7, ...o });
// realistic paediatric syrups
const CONCS = [[120, 5], [125, 5], [250, 5], [200, 5], [100, 5], [40, 1], [100, 1], [400, 5], [600, 5], [228, 5], [312.5, 5], [156.25, 5], [457, 5], [62.5, 5], [5, 5], [1, 1], [50, 3], [100, 3], [10, 7]];
const DOSES = [[10, null], [15, null], [10, 15], [20, 40], [25, 50], [30, null], [40, 50], [45, null], [50, null], [50, 75], [80, 90], [90, null], [5, 10], [0.5, 1], [7.5, 10], [12.5, null], [33.3, null]];
const WEIGHTS = [1, 2.5, 3.2, 4, 5, 6.5, 7.3, 8, 9, 10, 11.7, 12, 15, 18, 20, 22.5, 25, 30, 35, 40, 45, 60, 80];
for (let i = 0; i < +(process.env.N || 260); i++) {
  const [cmg, cml] = pick(CONCS), [dmin, dmax] = pick(DOSES), w = pick(WEIGHTS), n = pick([1, 2, 2, 3, 3, 4, 6]);
  const daily = (dmax ?? dmin) * w;
  const max = pick([null, null, Math.round(daily * 0.5), Math.round(daily * 0.9), Math.round(daily), Math.round(daily * 1.1), 4000, 1000, 500]);
  add(`rand#${i}`, { w, dmin, dmax, n, cmg, cml, max, d: pick([3, 5, 7, 7, 10, 14]) });
}
// targeted edge cases
add('upper-only over max', { w: 9, dmin: 50, dmax: 75, n: 2, cmg: 250, cml: 5, max: 600 });
add('low end equals max', { w: 12, dmin: 50, dmax: 75, n: 2, cmg: 250, cml: 5, max: 600 });
add('low end just over max', { w: 12.1, dmin: 50, dmax: 75, n: 2, cmg: 250, cml: 5, max: 600 });
add('fixed equals max', { w: 12, dmin: 50, dmax: null, n: 2, cmg: 250, cml: 5, max: 600 });
add('fixed just over max', { w: 12.01, dmin: 50, dmax: null, n: 2, cmg: 250, cml: 5, max: 600 });
add('dmax == dmin', { w: 10, dmin: 40, dmax: 40, n: 2, cmg: 250, cml: 5, max: null });
add('dmax < dmin', { w: 10, dmin: 40, dmax: 20, n: 2, cmg: 250, cml: 5, max: null, expect: 'invalid-range' });
add('max = 0', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: 0 });
add('max negative', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: -100 });
add('weight 0', { w: 0, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, expect: 'not-ready' });
add('weight negative', { w: -5, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, expect: 'not-ready' });
add('weight tiny 0.4', { w: 0.4, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null });
add('weight 150', { w: 150, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null });
add('doses 1.5', { w: 10, dmin: 40, dmax: null, n: 1.5, cmg: 250, cml: 5, max: null, expect: 'invalid-range' });
add('doses 2.0 typed', { w: 10, dmin: 40, dmax: null, n: '2.0', cmg: 250, cml: 5, max: null });
add('doses 0', { w: 10, dmin: 40, dmax: null, n: 0, cmg: 250, cml: 5, max: null, expect: 'not-ready' });
add('doses 7', { w: 10, dmin: 40, dmax: null, n: 7, cmg: 250, cml: 5, max: null });
add('doses 24', { w: 10, dmin: 40, dmax: null, n: 24, cmg: 250, cml: 5, max: null });
add('conc ml 0', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 0, max: null, expect: 'not-ready' });
add('conc mg 0', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 0, cml: 5, max: null, expect: 'not-ready' });
add('dose 0', { w: 10, dmin: 0, dmax: null, n: 2, cmg: 250, cml: 5, max: null, expect: 'not-ready' });
add('dose negative', { w: 10, dmin: -10, dmax: null, n: 2, cmg: 250, cml: 5, max: null, expect: 'not-ready' });
add('odd conc 100/3', { w: 10, dmin: 40, dmax: null, n: 3, cmg: 100, cml: 3, max: null });
add('odd conc 10/7', { w: 7, dmin: 3, dmax: null, n: 2, cmg: 10, cml: 7, max: null });
add('very small vol', { w: 3, dmin: 0.5, dmax: null, n: 2, cmg: 400, cml: 5, max: null });
add('very large vol', { w: 40, dmin: 90, dmax: null, n: 2, cmg: 125, cml: 5, max: null });
add('days empty', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, d: null, expect: 'not-ready' });
add('days 0', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, d: 0, expect: 'not-ready' });
add('days 2.5', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, d: 2.5, expect: 'invalid-range' });
add('days 1', { w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, d: 1 });
add('huge numbers', { w: 40, dmin: 100000, dmax: null, n: 2, cmg: 1, cml: 1, max: null });
add('decimals everywhere', { w: 7.35, dmin: 13.7, dmax: 27.45, n: 3, cmg: 187.5, cml: 5, max: 333.3 });
add('max with decimals equal', { w: 10, dmin: 33.33, dmax: null, n: 1, cmg: 250, cml: 5, max: 333.3 });

// ── independent oracle ──
function expected(s0) {
  const s = { ...s0, n: Number(s0.n) };
  const ready = s.w > 0 && s.dmin > 0 && s.n > 0 && s.d > 0 && s.cmg > 0 && s.cml > 0;
  if (!ready) return { kind: 'not-ready' };
  if (!Number.isInteger(s.n) || !Number.isInteger(s.d)) return { kind: 'invalid-range' };
  if (s.dmax != null && s.dmax < s.dmin) return { kind: 'invalid-range' };
  const conc = s.cmg / s.cml;
  const lo = s.dmin * s.w, hiRaw = (s.dmax ?? s.dmin) * s.w;
  if (s.max != null && lo > s.max + 1e-9) return { kind: 'exceeded' };
  const hi = s.max != null && hiRaw > s.max ? s.max : hiRaw;
  return { kind: 'ok', capped: hi < hiRaw - 1e-9, volMin: lo / s.n / conc, volMax: hi / s.n / conc, mgMin: lo / s.n, mgMax: hi / s.n, conc };
}

// ── helpers ──
const clean = t => t.replace(/[⁦⁩‎‏]/g, '');
const nums = t => { const m = clean(t).match(/(-?[\d.]+)(?:–([\d.]+))?\s*מ"ל/); return m ? [parseFloat(m[1]), parseFloat(m[2] ?? m[1])] : null; };
const close = (a, b) => Math.abs(a - b) <= 0.0101;
// every "a–b" range in raw text must be wrapped in LTR isolates
function badRanges(raw) {
  const out = []; const re = /[\d.]+–[\d.]+/g; let m;
  while ((m = re.exec(raw))) { const before = raw[m.index - 1], after = raw[m.index + m[0].length]; if (before !== '⁦' || after !== '⁩') out.push(m[0]); }
  return out;
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 1200 } });
await ctx.route('https://tinydose.test/**', r => { const p = new URL(r.request().url()).pathname; const f = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const createClient=()=>({});' }));
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await ctx.addInitScript(() => { navigator.share = async d => { window.__shared = d.text; }; });
const p = await ctx.newPage();
const pageErrors = []; p.on('pageerror', e => pageErrors.push(e.message));
await p.goto('https://tinydose.test/'); await p.waitForSelector('#ff-weight');

async function setForm(s) {
  await p.evaluate(s => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('ff-drug', 'תרופת בדיקה'); set('ff-weight', s.w); set('ff-dose-min', s.dmin); set('ff-dose-max', s.dmax);
    set('ff-doses', s.n); set('ff-days', s.d === undefined ? 7 : s.d); set('ff-conc-mg', s.cmg); set('ff-conc-ml', s.cml); set('ff-maxdaily', s.max);
  }, s);
}
const read = () => p.evaluate(() => ({
  vol: document.getElementById('ff-live-vol').textContent,
  sub: document.getElementById('ff-live-sub').textContent,
  details: document.getElementById('result-area').textContent,
  roundHidden: document.getElementById('ff-round').hidden,
  hasReset: !!document.getElementById('reset-btn'),
  inputs: [...document.querySelectorAll('.ff input')].map(i => [i.id, i.value]),
}));

// Send / print open the "הכנה להורים" window: for a range, type an amount (required), then confirm
// The amount is a slider limited to the calculated range (0.1 ml steps): returns what it settled on
const setSlider = v => p.evaluate(v => { const r = document.getElementById('pp-amount'); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); return +r.value; }, v);
async function parentsConfirm(amount) {
  await p.waitForSelector('.pp-overlay #pp-ok');
  const got = (await p.$('#pp-amount')) ? await setSlider(amount) : null;
  await p.click('#pp-ok');
  return got;
}
const failures = [];
const fail = (s, msg) => failures.push(`${s.name} ${JSON.stringify({ w: s.w, dose: [s.dmin, s.dmax], n: s.n, days: s.d, conc: [s.cmg, s.cml], max: s.max })}\n    → ${msg}`);
let printChecks = 0, shareChecks = 0, roundChecks = 0;

for (const [idx, s] of S.entries()) {
  await setForm(s);
  const r = await read();
  const e = expected(s);
  const all = r.vol + ' ' + r.sub + ' ' + r.details;
  for (const bad of ['NaN', 'undefined', 'Infinity', 'null', '[object']) if (all.includes(bad)) fail(s, `text contains "${bad}"`);
  const br = badRanges(all); if (br.length) fail(s, `range without LTR isolation: ${br.join(', ')}`);
  if (s.expect && s.expect !== e.kind) fail(s, `oracle says ${e.kind}, scenario expects ${s.expect}`);

  if (!r.hasReset) fail(s, `no reset button (state: ${e.kind})`);
  if (e.kind === 'not-ready' || e.kind === 'invalid-range') {
    if (clean(r.vol).trim() !== '—') fail(s, `expected no result (${e.kind}), bubble shows "${r.vol}"`);
    if (/תן\s/.test(r.details)) fail(s, `expected no result (${e.kind}), details give a volume`);
    continue;
  }
  if (e.kind === 'exceeded') {
    if (clean(r.vol).trim() !== '—') fail(s, `expected blocked (exceeded), bubble shows "${r.vol}"`);
    if (!/חורג/.test(r.details)) fail(s, 'expected exceeded warning in details');
    if (/תן\s/.test(r.details)) fail(s, 'exceeded, but details give a volume');
    continue;
  }
  // ok
  const v = nums(r.vol);
  if (!v) { fail(s, `bubble has no volume: "${r.vol}"`); continue; }
  if (!close(v[0], e.volMin) || !close(v[1], e.volMax)) fail(s, `bubble ${v.join('–')} ml, expected ${e.volMin.toFixed(3)}–${e.volMax.toFixed(3)}`);
  const sm = clean(r.details).match(/תן\s+([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
  if (!sm) fail(s, 'details summary "תן X מ"ל" missing');
  else if (+sm[1] !== v[0] || +(sm[2] ?? sm[1]) !== v[1]) fail(s, `summary ${sm[1]}–${sm[2] ?? sm[1]} differs from bubble ${v.join('–')}`);
  if (s.max != null && v[1] * e.conc * s.n > s.max * 1.003 + 0.02) fail(s, `shown volume gives ${(v[1] * e.conc * s.n).toFixed(2)} mg/day > max ${s.max}`);
  if (e.capped !== /הוגבל/.test(r.sub)) fail(s, `capped=${e.capped} but bubble note ${/הוגבל/.test(r.sub) ? 'present' : 'missing'}`);
  if (e.capped && !/הגבלה למקסימום/.test(r.details)) fail(s, 'capped but no cap step in details');
  if (r.roundHidden) fail(s, 'rounding panel hidden on a valid result');
  if (!clean(r.sub).includes(`למשך ${s.d} ימים`)) fail(s, `bubble does not show the days: "${r.sub}"`);
  if (!clean(r.details).includes(`למשך ${s.d} ימים`)) fail(s, 'details summary does not show the days');

  // share text (every 3rd)
  if (idx % 3 === 0) {
    await p.evaluate(() => { window.__shared = null; document.getElementById('share-btn').click(); });
    const isRange = v[0] !== v[1];
    if (isRange !== !!(await p.$('#pp-amount'))) fail(s, `parents window: amount field ${isRange ? 'missing for a range' : 'shown for a single amount'}`);
    const got = await parentsConfirm(v[0]);   // parents get one amount: the slider's lowest point
    const want = isRange ? got : v[0];
    if (isRange && (got < v[0] - 1e-9 || got > v[1] + 1e-9 || got > v[0] + 0.1 + 1e-9)) fail(s, `slider low end ${got} not at the range start ${v[0]}`);
    const t = await p.evaluate(() => window.__shared);
    shareChecks++;
    if (!t) fail(s, 'share produced no text');
    else {
      const m = clean(t).match(/לתת\s+([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
      if (!m || +m[1] !== want || m[2] != null) fail(s, `share volume "${m?.[0]}" should be one amount ${want}`);
      for (const bad of ['NaN', 'undefined', 'null']) if (t.includes(bad)) fail(s, `share contains ${bad}`);
      if (!clean(t).includes(`למשך ${s.d} ימים`)) fail(s, 'share text does not show the days');
      const brs = badRanges(t); if (brs.length) fail(s, `share range without isolation: ${brs}`);
    }
  }
  // print (every 12th)
  if (idx % 12 === 0) {
    await p.click('#print-btn');
    const [pw, got] = await Promise.all([ctx.waitForEvent('page'), parentsConfirm(v[1])]);   // print: the top end
    await pw.waitForLoadState('domcontentloaded'); await pw.waitForTimeout(150);
    const pt = await pw.evaluate(() => document.body.innerText);
    printChecks++;
    const want = got ?? v[0];
    const m = clean(pt).match(/([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
    if (!m || +m[1] !== want || m[2] != null) fail(s, `print first volume "${m?.[0]}" should be one amount ${want}`);
    if (got != null && (got > v[1] + 1e-9 || got < v[1] - 0.1 - 1e-9)) fail(s, `slider top end ${got} not at the range end ${v[1]}`);
    for (const bad of ['NaN', 'undefined', 'null']) if (pt.includes(bad)) fail(s, `print contains ${bad}`);
    if (!clean(pt).includes(`למשך ${s.d} ימים`)) fail(s, 'print does not show the days');
    await pw.close();
  }
  // rounding (every 4th): try down and up with ½ ml
  if (idx % 4 === 0) {
    for (const dir of ['down', 'up']) {
      const st = await p.evaluate(dir => {
        const btn = document.querySelector(`#ff-round-opts [data-choice="${dir}"]`);
        if (!btn) return { missing: true };
        if (btn.disabled) return { disabled: true, text: btn.textContent };
        btn.click();
        return { vol: document.getElementById('ff-live-vol').textContent, tag: document.getElementById('ff-live-tag').textContent, details: document.getElementById('result-area').textContent };
      }, dir);
      roundChecks++;
      if (st.missing) { fail(s, `rounding option ${dir} missing`); continue; }
      if (st.disabled) { if (dir === 'down' && e.volMin > 0.5) fail(s, `round down disabled although vol ${e.volMin.toFixed(2)}`); continue; }
      const rv = nums(st.vol);
      if (!rv) { fail(s, `after rounding ${dir}, bubble "${st.vol}"`); continue; }
      for (const x of rv) if (Math.abs(x / 0.5 - Math.round(x / 0.5)) > 1e-6) fail(s, `rounded ${dir} gives ${x}, not a multiple of ½`);
      if (dir === 'down' && (rv[0] > e.volMin + 1e-6 || rv[1] > e.volMax + 1e-6)) fail(s, `round down went UP: ${rv} vs ${e.volMin.toFixed(2)}–${e.volMax.toFixed(2)}`);
      if (dir === 'up' && (rv[0] < e.volMin - 1e-6 || rv[1] < e.volMax - 1e-6)) fail(s, `round up went DOWN: ${rv} vs ${e.volMin.toFixed(2)}–${e.volMax.toFixed(2)}`);
      if (s.max != null && rv[1] * e.conc * s.n > s.max + 1e-6) fail(s, `rounded ${dir} exceeds max: ${(rv[1] * e.conc * s.n).toFixed(2)} > ${s.max}`);
      if (!/מעוגל/.test(st.tag) || !/עיגול/.test(st.details)) fail(s, `rounded ${dir} without "מעוגל" tag / step`);
      for (const bad of ['NaN', 'undefined']) if ((st.vol + st.details).includes(bad)) fail(s, `rounded ${dir} contains ${bad}`);
    }
    // a field change must reset rounding to exact
    await p.evaluate(() => { const el = document.getElementById('ff-weight'); el.value = el.value; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const after = await read();
    const av = nums(after.vol);
    if (!av || !close(av[0], e.volMin) || !close(av[1], e.volMax)) fail(s, `after field change rounding not reset: ${after.vol}`);
  }
}

// ── "הכנה להורים": one clear amount for a dose range (required, slider within the range) ──
{
  const sheet = () => p.evaluate(() => { const r = document.getElementById('pp-amount');
    return { open: !!document.querySelector('.pp-overlay'), amount: !!r, min: r && +r.min, max: r && +r.max, step: r && r.step,
      okDisabled: document.getElementById('pp-ok')?.disabled, value: document.getElementById('pp-value')?.textContent, msg: document.getElementById('pp-msg')?.textContent || '' }; });
  // 10 kg × 60–90 mg/kg/day ÷ 2 ÷ 50 mg/ml = 6–9 ml
  await setForm({ w: 10, dmin: 60, dmax: 90, n: 2, cmg: 250, cml: 5, max: 3000, d: 5 });
  if (!/6–9 מ"ל/.test(clean((await read()).vol))) failures.push('parents: the doctor\'s bubble should keep the range');
  await p.evaluate(() => { window.__shared = null; document.getElementById('share-btn').click(); });
  let c = await sheet();
  if (!c.open || !c.amount || c.min !== 6 || c.max !== 9 || c.step !== '0.1') failures.push('parents: slider should span 6–9 in 0.1 steps: ' + JSON.stringify(c));
  if (!c.okDisabled || c.value !== '—') failures.push('parents: send allowed before the slider was moved');
  if (await setSlider(7.5) !== 7.5) failures.push('parents: slider did not take 7.5');
  c = await sheet();
  if (c.okDisabled || c.value !== '7.5' || !/375 מ"ג למנה/.test(clean(c.msg)) || !/75 מ"ג\/ק"ג\/יום/.test(clean(c.msg))) failures.push('parents: after 7.5: ' + JSON.stringify(c));
  if (await setSlider(12) !== 9 || await setSlider(2) !== 6) failures.push('parents: slider must stay inside the calculated range');
  await setSlider(7.5);
  await p.fill('#pp-notes', 'לתת אחרי האוכל');
  await p.click('#pp-ok');
  const sh = clean(await p.evaluate(() => window.__shared) || '');
  if (!/לתת 7\.5 מ"ל \(375 מ"ג\) בכל פעם/.test(sh) || /6–9/.test(sh)) failures.push('parents: WhatsApp should have only 7.5 ml: ' + sh.split('\n').find(l => l.includes('לתת')));
  if (!/לתת 7\.5 מ"ל \(375 מ"ג\) בכל פעם/.test(sh) || !/לתת אחרי האוכל/.test(sh)) failures.push('parents: WhatsApp mg per dose / notes');
  // order: who → drug and how → wish; every line starts with a right-to-left mark
  const raw = await p.evaluate(() => window.__shared);
  if (!raw.split('\n').every(l => l.startsWith('\u200F'))) failures.push('WhatsApp: a line without the right-to-left mark');
  const order = ['משקל', '💊', 'לתת 7', 'פעמיים ביום', 'למשך', 'לתת אחרי האוכל', 'בריאות שלמה', 'TinyDose'].map(k => sh.indexOf(k));
  if (order.some(i => i < 0) || order.some((i, n) => n && i < order[n - 1])) failures.push('WhatsApp: line order ' + order.join(','));
  if (!/6–9 מ"ל/.test(clean((await read()).vol))) failures.push('parents: the doctor\'s bubble changed after sending');
  // print: same window, amount and notes remembered for the same result
  await p.click('#print-btn'); c = await sheet();
  if (c.value !== '7.5' || c.okDisabled || (await p.inputValue('#pp-notes')) !== 'לתת אחרי האוכל') failures.push('parents: amount/notes not remembered for print');
  const [pw] = await Promise.all([ctx.waitForEvent('page'), p.click('#pp-ok')]);
  await pw.waitForLoadState('domcontentloaded'); await pw.waitForTimeout(150);
  const pt = clean(await pw.evaluate(() => document.body.innerText)); await pw.close();
  const pm = pt.match(/([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
  if (!pm || pm[1] !== '7.5' || pm[2]) failures.push('parents: print first amount ' + pm?.[0]);
  if (!/מנה בפועל/.test(pt) || !/לתת אחרי האוכל/.test(pt)) failures.push('parents: print step "מנה בפועל" / notes missing');
  // a changed result forgets the amount, keeps the notes
  await p.fill('#ff-weight', '11');
  await p.click('#share-btn'); c = await sheet();
  if (c.value !== '—' || !c.okDisabled || (await p.inputValue('#pp-notes')) !== 'לתת אחרי האוכל') failures.push('parents: after a weight change amount should clear, notes stay');
  await p.click('#pp-cancel');
  // odd range ends: slider snaps inward to whole tenths (7.2–10.8 stays; 1.67–2.5 → 1.7–2.5)
  await setForm({ w: 5, dmin: 50, dmax: 75, n: 3, cmg: 250, cml: 5, max: null, d: 5 });   // 1.67–2.5 ml
  await p.click('#share-btn'); c = await sheet();
  if (c.min !== 1.7 || c.max !== 2.5) failures.push('parents: odd range slider limits ' + c.min + '–' + c.max);
  await p.click('#pp-cancel');
  // single amount: no amount field, send right away
  await setForm({ w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null, d: 5 });
  await p.click('#share-btn'); c = await sheet();
  if (c.amount || c.okDisabled) failures.push('parents: single amount should not ask for an amount');
  await p.click('#pp-cancel');
}

// ── behaviour checks ──
// notes survive a field change
await setForm({ w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null });
await p.click('#share-btn'); await p.fill('#pp-notes', 'לתת אחרי האוכל'); await p.click('#pp-cancel');
await p.fill('#ff-dose-min', '45');
await p.click('#share-btn');
if ((await p.inputValue('#pp-notes')) !== 'לתת אחרי האוכל') failures.push('notes: parent notes lost after changing a field');
await p.click('#pp-cancel');
// reset clears everything
await p.click('#reset-btn'); await p.waitForTimeout(200);
const afterReset = await read();
const leftovers = afterReset.inputs.filter(([id, v]) => v !== '' && id !== 'ff-weight-slider');
if (leftovers.length) failures.push('reset: fields not cleared: ' + JSON.stringify(leftovers));
if (clean(afterReset.vol).trim() !== '—') failures.push('reset: bubble still shows ' + afterReset.vol);
// reset works from the exceeded state too
await setForm({ w: 15, dmin: 50, dmax: null, n: 2, cmg: 250, cml: 5, max: 600 });
await p.click('#reset-btn'); await p.waitForTimeout(200);
const afterReset2 = await read();
if (afterReset2.inputs.some(([id, v]) => v !== '' && id !== 'ff-weight-slider')) failures.push('reset from exceeded state did not clear the form');
if (afterReset2.hasReset) failures.push('fresh empty form should not show a reset button');
// slider ↔ weight sync
await p.fill('#ff-weight', '45');
if ((await p.inputValue('#ff-weight-slider')) !== '40') failures.push('slider: weight 45 should park slider at 40');
await p.fill('#ff-weight', '12.5');
if ((await p.inputValue('#ff-weight-slider')) !== '12.5') failures.push('slider: weight 12.5 not mirrored');
await p.evaluate(() => { const s = document.getElementById('ff-weight-slider'); s.value = '20'; s.dispatchEvent(new Event('input', { bubbles: true })); });
if ((await p.inputValue('#ff-weight')) !== '20') failures.push('slider: moving slider to 20 did not update weight');

console.log(`scenarios: ${S.length} · share checks: ${shareChecks} · print checks: ${printChecks} · rounding checks: ${roundChecks}`);
console.log(`page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
console.log(`FAILURES: ${failures.length}`);
const grouped = {};
for (const f of failures) { const key = f.split('→ ')[1]?.replace(/[\d.]+/g, '#') || f; (grouped[key] ||= []).push(f); }
for (const [k, list] of Object.entries(grouped)) { console.log(`\n[${list.length}×] ${k}`); list.slice(0, 3).forEach(x => console.log('  ' + x)); }
await b.close();
process.exitCode = failures.length ? 1 : 0;
