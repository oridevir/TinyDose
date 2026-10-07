// Scenario bench for calculator.html (free calculation): an independent oracle +
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
const add = (name, o) => S.push({ name, ...o });
// realistic paediatric syrups
const CONCS = [[120, 5], [125, 5], [250, 5], [200, 5], [100, 5], [40, 1], [100, 1], [400, 5], [600, 5], [228, 5], [312.5, 5], [156.25, 5], [457, 5], [62.5, 5], [5, 5], [1, 1], [50, 3], [100, 3], [10, 7]];
const DOSES = [[10, null], [15, null], [10, 15], [20, 40], [25, 50], [30, null], [40, 50], [45, null], [50, null], [50, 75], [80, 90], [90, null], [5, 10], [0.5, 1], [7.5, 10], [12.5, null], [33.3, null]];
const WEIGHTS = [1, 2.5, 3.2, 4, 5, 6.5, 7.3, 8, 9, 10, 11.7, 12, 15, 18, 20, 22.5, 25, 30, 35, 40, 45, 60, 80];
for (let i = 0; i < +(process.env.N || 260); i++) {
  const [cmg, cml] = pick(CONCS), [dmin, dmax] = pick(DOSES), w = pick(WEIGHTS), n = pick([1, 2, 2, 3, 3, 4, 6]);
  const daily = (dmax ?? dmin) * w;
  const max = pick([null, null, Math.round(daily * 0.5), Math.round(daily * 0.9), Math.round(daily), Math.round(daily * 1.1), 4000, 1000, 500]);
  add(`rand#${i}`, { w, dmin, dmax, n, cmg, cml, max });
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
add('huge numbers', { w: 40, dmin: 100000, dmax: null, n: 2, cmg: 1, cml: 1, max: null });
add('decimals everywhere', { w: 7.35, dmin: 13.7, dmax: 27.45, n: 3, cmg: 187.5, cml: 5, max: 333.3 });
add('max with decimals equal', { w: 10, dmin: 33.33, dmax: null, n: 1, cmg: 250, cml: 5, max: 333.3 });

// ── independent oracle ──
function expected(s0) {
  const s = { ...s0, n: Number(s0.n) };
  const ready = s.w > 0 && s.dmin > 0 && s.n > 0 && s.cmg > 0 && s.cml > 0;
  if (!ready) return { kind: 'not-ready' };
  if (!Number.isInteger(s.n)) return { kind: 'invalid-range' };
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
await ctx.route('https://tinydose.test/**', r => { const p = new URL(r.request().url()).pathname; const f = path.join(ROOT, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const createClient=()=>({});' }));
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await ctx.addInitScript(() => { navigator.share = async d => { window.__shared = d.text; }; });
const p = await ctx.newPage();
const pageErrors = []; p.on('pageerror', e => pageErrors.push(e.message));
await p.goto('https://tinydose.test/calculator.html'); await p.waitForSelector('#ff-weight');

async function setForm(s) {
  await p.evaluate(s => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('ff-drug', 'תרופת בדיקה'); set('ff-weight', s.w); set('ff-dose-min', s.dmin); set('ff-dose-max', s.dmax);
    set('ff-doses', s.n); set('ff-conc-mg', s.cmg); set('ff-conc-ml', s.cml); set('ff-maxdaily', s.max);
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

const failures = [];
const fail = (s, msg) => failures.push(`${s.name} ${JSON.stringify({ w: s.w, dose: [s.dmin, s.dmax], n: s.n, conc: [s.cmg, s.cml], max: s.max })}\n    → ${msg}`);
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

  // share text (every 3rd)
  if (idx % 3 === 0) {
    await p.evaluate(() => { window.__shared = null; document.getElementById('share-btn').click(); });
    const t = await p.evaluate(() => window.__shared);
    shareChecks++;
    if (!t) fail(s, 'share produced no text');
    else {
      const m = clean(t).match(/לתת\s+([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
      if (!m || +m[1] !== v[0] || +(m[2] ?? m[1]) !== v[1]) fail(s, `share volume "${m?.[0]}" differs from bubble ${v.join('–')}`);
      for (const bad of ['NaN', 'undefined', 'null']) if (t.includes(bad)) fail(s, `share contains ${bad}`);
      const brs = badRanges(t); if (brs.length) fail(s, `share range without isolation: ${brs}`);
    }
  }
  // print (every 12th)
  if (idx % 12 === 0) {
    const [pw] = await Promise.all([ctx.waitForEvent('page'), p.click('#print-btn')]);
    await pw.waitForLoadState('domcontentloaded'); await pw.waitForTimeout(150);
    const pt = await pw.evaluate(() => document.body.innerText);
    printChecks++;
    const m = clean(pt).match(/([\d.]+)(?:–([\d.]+))?\s*מ"ל/);
    if (!m || +m[1] !== v[0] || +(m[2] ?? m[1]) !== v[1]) fail(s, `print first volume "${m?.[0]}" differs from bubble ${v.join('–')}`);
    for (const bad of ['NaN', 'undefined', 'null']) if (pt.includes(bad)) fail(s, `print contains ${bad}`);
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

// ── behaviour checks ──
// notes survive a field change
await setForm({ w: 10, dmin: 40, dmax: null, n: 2, cmg: 250, cml: 5, max: null });
await p.fill('#doctor-notes', 'לתת אחרי האוכל');
await p.fill('#ff-dose-min', '45');
if ((await p.inputValue('#doctor-notes')) !== 'לתת אחרי האוכל') failures.push('notes: parent notes lost after changing a field');
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
