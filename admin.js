// admin.js — drug database admin, organised by diagnosis (see CLAUDE.md section 9)
// Phone: the treatment-option editor is a step-by-step wizard.
// Desktop (wide screen): the same editor is one page with a live preview column.
import { supabase, calculateDose, round2, esc } from './app.js';

const LINES = { first: 'קו ראשון', alternative: 'חלופה', allergy: 'אלרגיה לפניצילין' };
const LINE_ORDER = { first: 0, alternative: 1, allergy: 2 };
const PREVIEW_WEIGHTS = [5, 10, 20];
const SMALL_VOL_ML = 1;   // below this a dose is hard to measure
const LARGE_VOL_ML = 15;  // above this a dose is hard to give a child
const WIDE = window.matchMedia('(min-width: 900px)');

const S = { cats: [], inds: [], drugs: [], prods: [], recs: [] };

// ── Small helpers ──
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const indById = id => S.inds.find(i => i.id === id);
const drugById = id => S.drugs.find(d => d.id === id);
const catById = id => S.cats.find(c => c.id === id);
const prodsOf = drugId => S.prods.filter(p => p.drug_id === drugId);
const recsOfInd = indId => S.recs.filter(r => r.indication_id === indId);
const rng = (a, b) => `<bdi dir="ltr">${a}${b != null && b !== '' && +b !== +a ? '–' + b : ''}</bdi>`;
const dosesText = n => (+n === 1 ? 'פעם ביום' : +n === 2 ? 'פעמיים ביום' : `${n} פעמים ביום`);
const concText = p => `<bdi dir="ltr">${p.conc_mg}/${p.conc_ml}</bdi>`;
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('he-IL') : '');
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const isFkError = e => e?.code === '23503';
const numOrNull = v => (v === '' || v == null ? null : +v);

function sortRecs(rs) {
  return [...rs].sort((a, b) =>
    LINE_ORDER[a.treatment_line] - LINE_ORDER[b.treatment_line] ||
    a.sort_order - b.sort_order ||
    (drugById(a.drug_id)?.name_he || '').localeCompare(drugById(b.drug_id)?.name_he || '', 'he'));
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2400);
}

function bottom(html) {
  $('#bottom').hidden = !html;
  $('#bottom-inner').innerHTML = html || '';
}

// Bottom sheet / centered dialog. Returns the sheet element.
function sheet(html) {
  $('#overlay').innerHTML = html ? `<div class="sheet-back" data-close><div class="sheet" role="dialog">${html}</div></div>` : '';
  return $('#overlay .sheet');
}
const closeSheet = () => sheet('');
document.addEventListener('click', e => { if (e.target.matches('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#overlay').innerHTML) closeSheet(); });

// "Enter moves to the next field" inside a container (textareas keep Enter for new lines)
function enterMovesOn(root, onLast) {
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'search') return;
    e.preventDefault();
    const fields = [...root.querySelectorAll('input:not([type=hidden]):not([type=search]), textarea, select')]
      .filter(el => el.offsetParent !== null && !el.disabled);
    const next = fields[fields.indexOf(e.target) + 1];
    if (next) next.focus(); else onLast?.();
  });
}

// ── Similar-name detection (warn before creating a duplicate drug) ──
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]))
    .replace(/[\s\-–_'"״׳.,()]/g, '')
    .replace(/[יו]/g, '');           // Hebrew spelling varies mostly in י / ו
}
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function similarDrugs(names, excludeId) {
  const typed = names.map(normName).filter(n => n.length >= 3);
  if (!typed.length) return [];
  return S.drugs.filter(d => d.id !== excludeId).filter(d => {
    const theirs = [d.name_he, d.name_en, ...(d.search_aliases || '').split(',')].map(normName).filter(Boolean);
    return typed.some(t => theirs.some(o => o === t || (Math.min(o.length, t.length) >= 5 && editDistance(o, t) <= 2)));
  });
}

// ── Preview + safety checks (same calculateDose() as the calculator) ──
function previewFor(r, weight) {
  const d = drugById(r.drug_id);
  const doseMin = +r.dose_min_mg_per_kg_day, doseMax = numOrNull(r.dose_max_mg_per_kg_day), dpd = +r.doses_per_day;
  if (!d || !(doseMin > 0) || !(dpd >= 1)) return null;
  return prodsOf(d.id).map(p => {
    const calc = calculateDose({
      weight, doseMin, doseMax, concentration: p.conc_mg / p.conc_ml, dosesPerDay: dpd,
      maxDailyDoseMg: d.max_daily_dose_mg ?? null, adultMaxDailyDoseMg: null,
    });
    const flags = [];
    if (calc.exceeded) flags.push({ level: 'bad', text: `חריגה: ${calc.dailyMax} מ"ג ליום, המקסימום ${d.max_daily_dose_mg} מ"ג` });
    else {
      if (calc.volMin < SMALL_VOL_ML) flags.push({ level: 'warn', text: 'נפח קטן מאוד — קשה למדוד' });
      if (calc.volMax > LARGE_VOL_ML) flags.push({ level: 'warn', text: 'נפח גדול מאוד' });
    }
    return { p, calc, flags };
  });
}

function previewHtml(r, extraWeight) {
  const d = drugById(r.drug_id);
  if (!d) return '<div class="small">בחר תרופה כדי לראות תצוגה מקדימה.</div>';
  if (!prodsOf(d.id).length) return '<div class="note-box note-warn">⚠️ לתרופה הזו אין עדיין סירופ — אי אפשר לחשב נפח.</div>';
  if (!(+r.dose_min_mg_per_kg_day > 0) || !(+r.doses_per_day >= 1)) return '<div class="small">מלא מינון ומנות ביום כדי לראות תצוגה מקדימה.</div>';
  const weights = [...PREVIEW_WEIGHTS];
  if (+extraWeight > 0 && !weights.includes(+extraWeight)) weights.push(+extraWeight);
  return `<div class="pv">${weights.map(w => `
    <div class="pv-w"><strong>${w} ק"ג</strong>
      ${previewFor(r, w).map(({ p, calc, flags }) => `
        <div class="pv-line">
          <span>${esc(p.brand_name)}:</span>
          ${calc.exceeded ? '<span class="vol">—</span>' : `<span class="vol">${rng(calc.volMin, calc.volMax)} מ"ל</span><span class="small">(${rng(calc.perDoseMin, calc.perDoseMax)} מ"ג)</span>`}
          ${flags.map(f => `<span class="flag flag-${f.level}">${f.level === 'bad' ? '🔴' : '🟡'} ${f.text}</span>`).join('')}
        </div>`).join('')}
    </div>`).join('')}</div>`;
}

function previewProblems(r) {
  const out = [];
  for (const w of PREVIEW_WEIGHTS) for (const { p, flags } of previewFor(r, w) || [])
    for (const f of flags) out.push(`${w} ק"ג · ${p.brand_name}: ${f.text}`);
  return out;
}

// Checklist shown before marking a treatment option as verified
function verifyChecklist(r, onConfirm) {
  const d = drugById(r.drug_id);
  const problems = previewProblems(r);
  const items = [
    { ok: !!(r.source || '').trim(), text: 'יש מקור' },
    { ok: prodsOf(r.drug_id).length > 0, text: 'יש לפחות סירופ אחד' },
    { ok: d?.max_daily_dose_mg != null, text: 'הוגדר מקסימום יומי לתרופה' },
    { ok: !problems.length, text: problems.length ? `תצוגה מקדימה (5/10/20 ק"ג): ${problems.join(' · ')}` : 'התצוגה המקדימה (5/10/20 ק"ג) תקינה' },
  ];
  const allOk = items.every(i => i.ok);
  sheet(`
    <h2>אימות: ${esc(d?.name_he)} · ${esc(indById(r.indication_id)?.name_he)}</h2>
    <ul class="checklist">${items.map(i => `<li><span>${i.ok ? '✅' : '⚠️'}</span><span>${esc(i.text)}</span></li>`).join('')}</ul>
    ${allOk ? '' : '<p class="small">אפשר לאמת גם כשיש ⚠️, אם בדקת ואתה בטוח.</p>'}
    <div class="sheet-actions">
      <button class="btn" data-close>ביטול</button>
      <button class="btn primary" id="vc-ok">${allOk ? 'אימות ✓' : 'לאמת בכל זאת'}</button>
    </div>`);
  $('#vc-ok').onclick = () => { closeSheet(); onConfirm(); };
}

// ── Data ──
async function loadAll() {
  const [c, i, d, p, r] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('name_he'),
    supabase.from('indications').select('*').order('name_he'),
    supabase.from('drugs').select('*').order('name_he'),
    supabase.from('products').select('*').order('brand_name'),
    supabase.from('recommendations').select('*'),
  ]);
  const err = [c, i, d, p, r].find(x => x.error);
  if (err) { toast('שגיאה בטעינת הנתונים: ' + err.error.message); return false; }
  S.cats = c.data; S.inds = i.data; S.drugs = d.data; S.prods = p.data; S.recs = r.data;
  return true;
}

// Insert or update; returns the saved row, or null on error
async function saveRow(table, id, payload) {
  payload = { ...payload, updated_at: new Date().toISOString() };
  const q = id ? supabase.from(table).update(payload).eq('id', id) : supabase.from(table).insert(payload);
  const { data, error } = await q.select().single();
  if (error) { toast('שגיאה בשמירה: ' + error.message); return null; }
  return data;
}

async function deleteRow(table, id, inUseMsg) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { toast(isFkError(error) ? inUseMsg : 'שגיאה במחיקה: ' + error.message); return false; }
  return true;
}

// ── Navigation ──
const nav = [];
function go(view) { nav.push(view); render(); window.scrollTo(0, 0); }
function back() { nav.pop(); render(); window.scrollTo(0, 0); }
function render() {
  const v = nav[nav.length - 1];
  $('#app').classList.toggle('wide', v.type === 'editor' && WIDE.matches);
  ({ home: renderHome, ind: renderInd, drug: renderDrug, pending: renderPending, issues: renderIssues, editor: renderEditor })[v.type](v);
}
WIDE.addEventListener('change', () => { if (nav.length) render(); });

function topBar(title, sub, { backBtn = true, extra = '' } = {}) {
  return `<div class="top">
    ${backBtn ? '<button class="iconbtn" id="back" aria-label="חזרה">→</button>' : ''}
    <h1>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</h1>${extra}
  </div>`;
}
function bindBack() { const b = $('#back'); if (b) b.onclick = back; }

// ── Issues: what's missing in the database ──
function computeIssues() {
  const out = [];
  for (const i of S.inds) {
    const rs = recsOfInd(i.id);
    if (rs.length && !rs.some(r => r.treatment_line === 'first'))
      out.push({ text: `${i.name_he}: אין קו ראשון`, go: { type: 'ind', id: i.id } });
  }
  for (const d of S.drugs) {
    if (!prodsOf(d.id).length) out.push({ text: `${d.name_he}: אין סירופ`, go: { type: 'drug', id: d.id } });
    if (d.max_daily_dose_mg == null) out.push({ text: `${d.name_he}: לא הוגדר מקסימום יומי`, go: { type: 'drug', id: d.id } });
  }
  return out;
}

// ── Home ──
let homeQuery = '';
const openCats = new Set();

function renderHome() {
  $('#screen').innerHTML = `
    ${topBar('ניהול המאגר', 'TinyDose', { backBtn: false, extra: '<a class="linkbtn" href="calculator.html">למחשבון</a><button class="linkbtn" id="logout">יציאה</button>' })}
    <label class="search"><span aria-hidden="true">🔍</span>
      <input id="q" type="search" placeholder="חיפוש אבחנה, תרופה או שם מסחרי" aria-label="חיפוש" value="${esc(homeQuery)}">
    </label>
    <div class="stack" id="home-body"></div>`;
  $('#logout').onclick = async () => { await supabase.auth.signOut(); };
  $('#q').addEventListener('input', e => { homeQuery = e.target.value; homeBody(); });
  homeBody();
  bottom('');
}

function drugSearchText(d) {
  return [d.name_he, d.name_en, d.search_aliases,
    ...prodsOf(d.id).flatMap(p => [p.brand_name, p.brand_name_en, p.search_aliases])]
    .filter(Boolean).join(' ').toLowerCase();
}

function indRow(i) {
  const rs = recsOfInd(i.id);
  const drafts = rs.filter(r => r.status === 'draft').length;
  return `<button class="row" data-ind="${esc(i.id)}">
    <span class="name">${esc(i.name_he)}</span>
    ${drafts ? '<span class="dot" title="יש טיוטות"></span>' : ''}
    <span class="meta">${rs.length ? plural(rs.length, 'אפשרות אחת', 'אפשרויות') : 'ריק'}</span><span class="meta" aria-hidden="true">‹</span>
  </button>`;
}

function homeBody() {
  const body = $('#home-body');
  const q = homeQuery.trim().toLowerCase();
  if (q) {
    const inds = S.inds.filter(i => [i.name_he, i.name_en].join(' ').toLowerCase().includes(q));
    const drugs = S.drugs.filter(d => drugSearchText(d).includes(q));
    body.innerHTML = `
      ${inds.length ? `<div class="section-label">אבחנות</div><div class="group">${inds.map(indRow).join('')}</div>` : ''}
      ${drugs.length ? `<div class="section-label">תרופות</div><div class="group">${drugs.map(d => `
        <button class="row" data-drug="${esc(d.id)}"><span class="name">${esc(d.name_he)}
          <div class="small">${prodsOf(d.id).map(p => esc(p.brand_name)).join(' · ') || 'אין סירופים'}</div></span><span class="meta" aria-hidden="true">‹</span></button>`).join('')}</div>` : ''}
      ${!inds.length && !drugs.length ? `<div class="empty">לא נמצא דבר עבור "${esc(homeQuery.trim())}"</div>` : ''}
      <button class="btn ghost" id="new-drug-search">+ תרופה חדשה</button>`;
    $('#new-drug-search').onclick = () => drugSheet(null, d => go({ type: 'drug', id: d.id }), homeQuery.trim());
  } else {
    const pending = S.recs.filter(r => r.status === 'draft').length;
    const issues = computeIssues().length;
    const groups = [...S.cats.map(c => ({ c, inds: S.inds.filter(i => i.category_id === c.id) }))];
    const loose = S.inds.filter(i => !i.category_id || !catById(i.category_id));
    if (loose.length) groups.push({ c: null, inds: loose });
    body.innerHTML = `
      ${pending || issues ? `<div class="attn">
        ${pending ? `<button class="attn-card attn-draft" id="go-pending"><b>${pending}</b><span>${pending === 1 ? 'אפשרות טיפול ממתינה' : 'אפשרויות טיפול ממתינות'} לאימות</span><span aria-hidden="true">‹</span></button>` : ''}
        ${issues ? `<button class="attn-card attn-issue" id="go-issues"><b>${issues}</b><span>${issues === 1 ? 'דבר אחד דורש' : 'דברים דורשים'} תשומת לב</span><span aria-hidden="true">‹</span></button>` : ''}
      </div>` : ''}
      ${groups.map(({ c, inds }) => {
        const key = c ? c.id : 'none';
        return `<details class="group" data-cat="${esc(key)}" ${openCats.has(key) ? 'open' : ''}>
          <summary>${c ? esc(c.name_he) : 'ללא קטגוריה'}<span class="count">${plural(inds.length, 'אבחנה אחת', 'אבחנות')}</span></summary>
          ${inds.map(indRow).join('')}
          <button class="row add" data-new-ind="${c ? esc(c.id) : ''}">+ אבחנה חדשה</button>
          ${c ? `<button class="row muted" data-edit-cat="${esc(c.id)}">✏️ עריכת הקטגוריה</button>` : ''}
        </details>`;
      }).join('')}
      <button class="btn ghost" id="new-cat">+ קטגוריה חדשה</button>`;
    $('#new-cat').onclick = () => catSheet(null);
    const gp = $('#go-pending'); if (gp) gp.onclick = () => go({ type: 'pending' });
    const gi = $('#go-issues'); if (gi) gi.onclick = () => go({ type: 'issues' });
    body.querySelectorAll('details[data-cat]').forEach(el => el.addEventListener('toggle', () => {
      el.open ? openCats.add(el.dataset.cat) : openCats.delete(el.dataset.cat);
    }));
    body.querySelectorAll('[data-new-ind]').forEach(b => b.onclick = () => indSheet(null, b.dataset.newInd || null));
    body.querySelectorAll('[data-edit-cat]').forEach(b => b.onclick = () => catSheet(catById(b.dataset.editCat)));
  }
  body.querySelectorAll('[data-ind]').forEach(b => b.onclick = () => go({ type: 'ind', id: b.dataset.ind }));
  body.querySelectorAll('[data-drug]').forEach(b => b.onclick = () => go({ type: 'drug', id: b.dataset.drug }));
}

// ── Category / diagnosis sheets ──
function catSheet(c) {
  const used = c ? S.inds.filter(i => i.category_id === c.id).length : 0;
  const el = sheet(`
    <h2>${c ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</h2>
    <div class="field"><label for="cs-he">שם (עברית) *</label><input id="cs-he" value="${esc(c?.name_he)}"></div>
    <div class="field"><label for="cs-en">שם (אנגלית)</label><input id="cs-en" dir="ltr" value="${esc(c?.name_en)}"></div>
    <div class="field"><label for="cs-sort">סדר תצוגה (מספר נמוך = למעלה)</label><input id="cs-sort" type="number" inputmode="numeric" dir="ltr" value="${c?.sort_order ?? 0}"></div>
    <div class="sheet-actions"><button class="btn" data-close>ביטול</button><button class="btn primary" id="cs-save">שמירה</button></div>
    ${c ? (used ? `<p class="small">אי אפשר למחוק קטגוריה שיש בה אבחנות (${used}).</p>` : '<button class="btn danger" id="cs-del">מחיקת הקטגוריה</button>') : ''}`);
  $('#cs-he').focus();
  enterMovesOn(el, () => $('#cs-save').click());
  $('#cs-save').onclick = async () => {
    const name_he = $('#cs-he').value.trim();
    if (!name_he) { toast('יש להזין שם'); return; }
    const row = await saveRow('categories', c?.id, { name_he, name_en: $('#cs-en').value.trim() || null, sort_order: parseInt($('#cs-sort').value, 10) || 0 });
    if (!row) return;
    closeSheet(); await loadAll(); openCats.add(row.id); toast('נשמר ✓'); render();
  };
  const del = $('#cs-del');
  if (del) del.onclick = () => confirmSheet(`למחוק את הקטגוריה "${c.name_he}"?`, async () => {
    if (await deleteRow('categories', c.id, 'לא ניתן למחוק — הקטגוריה בשימוש')) { await loadAll(); toast('נמחק'); render(); }
  });
}

function indSheet(i, defaultCat) {
  const used = i ? recsOfInd(i.id).length : 0;
  const el = sheet(`
    <h2>${i ? 'עריכת אבחנה' : 'אבחנה חדשה'}</h2>
    <div class="field"><label for="is-he">שם (עברית) *</label><input id="is-he" value="${esc(i?.name_he)}"></div>
    <div class="field"><label for="is-en">שם (אנגלית)</label><input id="is-en" dir="ltr" value="${esc(i?.name_en)}"></div>
    <div class="field"><label for="is-cat">קטגוריה</label><select id="is-cat">
      <option value="">ללא קטגוריה</option>
      ${S.cats.map(c => `<option value="${esc(c.id)}">${esc(c.name_he)}</option>`).join('')}
    </select></div>
    <div class="sheet-actions"><button class="btn" data-close>ביטול</button><button class="btn primary" id="is-save">שמירה</button></div>
    ${i ? (used ? `<p class="small">אי אפשר למחוק אבחנה שיש לה אפשרויות טיפול (${used}).</p>` : '<button class="btn danger" id="is-del">מחיקת האבחנה</button>') : ''}`);
  $('#is-cat').value = i ? (i.category_id || '') : (defaultCat || '');
  $('#is-he').focus();
  enterMovesOn(el, () => $('#is-save').click());
  $('#is-save').onclick = async () => {
    const name_he = $('#is-he').value.trim();
    if (!name_he) { toast('יש להזין שם'); return; }
    const row = await saveRow('indications', i?.id, { name_he, name_en: $('#is-en').value.trim() || null, category_id: $('#is-cat').value || null });
    if (!row) return;
    closeSheet(); await loadAll(); if (row.category_id) openCats.add(row.category_id);
    toast('נשמר ✓');
    if (i) render(); else go({ type: 'ind', id: row.id });
  };
  const del = $('#is-del');
  if (del) del.onclick = () => confirmSheet(`למחוק את האבחנה "${i.name_he}"?`, async () => {
    if (await deleteRow('indications', i.id, 'לא ניתן למחוק — האבחנה עדיין בשימוש')) { await loadAll(); toast('נמחק'); back(); }
  });
}

function confirmSheet(question, onYes, yesText = 'מחיקה') {
  sheet(`<h2>${esc(question)}</h2>
    <div class="sheet-actions"><button class="btn" data-close>ביטול</button><button class="btn danger" id="cf-yes">${yesText}</button></div>`);
  $('#cf-yes').onclick = () => { closeSheet(); onYes(); };
}

// ── Diagnosis screen ──
function optCard(r, withInd = false) {
  const d = drugById(r.drug_id);
  const ps = prodsOf(r.drug_id);
  return `<article class="opt">
    ${withInd ? `<div class="small">${esc(indById(r.indication_id)?.name_he)} · ${LINES[r.treatment_line]}</div>` : ''}
    <div class="opt-head">
      <h3>${esc(d?.name_he || '—')}</h3>
      <span class="chip ${r.status === 'verified' ? 's-verified' : 's-draft'}">${r.status === 'verified' ? '✓ מאומת' : '✎ טיוטה'}</span>
    </div>
    <div>${rng(r.dose_min_mg_per_kg_day, r.dose_max_mg_per_kg_day)} מ"ג/ק"ג/יום · ${dosesText(r.doses_per_day)}${r.duration_days ? ` · ${r.duration_days} ימים` : ''}</div>
    <div class="opt-syrups">🧴 ${ps.length ? ps.map(p => `${esc(p.brand_name)} (${concText(p)})`).join(' · ') : '<span style="color:var(--bad-ink)">אין סירופ לתרופה</span>'}</div>
    ${r.doctor_note ? `<div class="opt-note">🩺 ${esc(r.doctor_note)}</div>` : ''}
    <div class="opt-foot">
      ${r.status === 'draft' ? `<button class="btn ok" data-verify="${esc(r.id)}">✓ אמת</button>` : ''}
      <button class="btn" data-edit="${esc(r.id)}">עריכה</button>
      <button class="btn" data-dup="${esc(r.id)}">שכפול</button>
      <span class="small">עודכן ${fmtDate(r.updated_at)}</span>
    </div>
  </article>`;
}

function bindOptCards() {
  $$('[data-verify]').forEach(b => b.onclick = () => {
    const r = S.recs.find(x => x.id === b.dataset.verify);
    verifyChecklist(r, async () => {
      if (await saveRow('recommendations', r.id, { status: 'verified' })) { await loadAll(); toast('סומן כמאומת ✓'); render(); }
    });
  });
  $$('[data-edit]').forEach(b => b.onclick = () => openEditor('edit', S.recs.find(x => x.id === b.dataset.edit)));
  $$('[data-dup]').forEach(b => b.onclick = () => openEditor('dup', S.recs.find(x => x.id === b.dataset.dup)));
}

function renderInd(v) {
  const i = indById(v.id);
  if (!i) { back(); return; }
  const rs = sortRecs(recsOfInd(i.id));
  const groups = Object.keys(LINES).map(l => [l, rs.filter(r => r.treatment_line === l)]).filter(([, g]) => g.length);
  $('#screen').innerHTML = `
    ${topBar(esc(i.name_he), esc(catById(i.category_id)?.name_he || 'ללא קטגוריה'), { extra: '<button class="iconbtn" id="edit-ind" aria-label="עריכת האבחנה">✏️</button>' })}
    <div class="stack">
      ${groups.length ? groups.map(([l, g]) => `<div class="section-label">${LINES[l]}</div>${g.map(r => optCard(r)).join('')}`).join('')
        : '<div class="empty">עוד אין אפשרויות טיפול לאבחנה הזו.<br>הוסף את הראשונה בכפתור למטה.</div>'}
    </div>`;
  bindBack();
  $('#edit-ind').onclick = () => indSheet(i);
  bindOptCards();
  bottom('<button class="btn primary big" id="add-opt">+ אפשרות טיפול</button>');
  $('#add-opt').onclick = () => openEditor('new', { indication_id: i.id });
}

function renderPending() {
  const rs = S.recs.filter(r => r.status === 'draft')
    .sort((a, b) => (indById(a.indication_id)?.name_he || '').localeCompare(indById(b.indication_id)?.name_he || '', 'he'));
  $('#screen').innerHTML = `
    ${topBar('ממתינים לאימות', plural(rs.length, 'טיוטה אחת', 'טיוטות'))}
    <div class="stack">${rs.length ? rs.map(r => optCard(r, true)).join('') : '<div class="empty">אין טיוטות. הכול מאומת ✓</div>'}</div>`;
  bindBack(); bindOptCards(); bottom('');
}

function renderIssues() {
  const list = computeIssues();
  $('#screen').innerHTML = `
    ${topBar('דורש תשומת לב', plural(list.length, 'דבר אחד', 'דברים'))}
    <div class="stack">${list.length ? `<div class="group">${list.map((x, n) => `
      <button class="row" data-issue="${n}"><span class="name">${esc(x.text)}</span><span class="meta" aria-hidden="true">‹</span></button>`).join('')}</div>`
      : '<div class="empty">הכול תקין ✓</div>'}</div>`;
  bindBack();
  $$('[data-issue]').forEach(b => b.onclick = () => go(list[+b.dataset.issue].go));
  bottom('');
}

// ── Drug screen + drug / product sheets ──
function renderDrug(v) {
  const d = drugById(v.id);
  if (!d) { back(); return; }
  const ps = prodsOf(d.id);
  const rs = S.recs.filter(r => r.drug_id === d.id);
  $('#screen').innerHTML = `
    ${topBar(esc(d.name_he), d.name_en ? `<span dir="ltr">${esc(d.name_en)}</span>` : '', { extra: '<button class="iconbtn" id="edit-drug" aria-label="עריכת התרופה">✏️</button>' })}
    <div class="stack">
      <div class="card">
        <div><span class="small">מקסימום יומי</span><br><strong style="font-family:var(--f-display);font-size:1.3rem">${d.max_daily_dose_mg != null ? `<bdi dir="ltr">${d.max_daily_dose_mg}</bdi> מ"ג` : '<span style="color:var(--bad-ink)">לא הוגדר</span>'}</strong></div>
        ${d.search_aliases ? `<div class="small">שמות נוספים: ${esc(d.search_aliases)}</div>` : ''}
        <div class="small">עודכן ${fmtDate(d.updated_at)}</div>
      </div>
      <div class="section-label">סירופים</div>
      <div class="group">
        ${ps.map(p => `<button class="row" data-prod="${esc(p.id)}"><span class="name">${esc(p.brand_name)}
          ${p.brand_name_en || p.search_aliases ? `<div class="small">${esc([p.brand_name_en, p.search_aliases].filter(Boolean).join(' · '))}</div>` : ''}</span>
          <span class="meta">${p.conc_mg} מ"ג ב-${p.conc_ml} מ"ל</span><span class="meta">✏️</span></button>`).join('')}
        <button class="row add" id="add-prod">+ סירופ חדש</button>
      </div>
      <div class="section-label">מופיעה באבחנות</div>
      <div class="group">
        ${rs.map(r => `<button class="row" data-ind="${esc(r.indication_id)}"><span class="name">${esc(indById(r.indication_id)?.name_he)}</span>
          <span class="chip l-${r.treatment_line}">${LINES[r.treatment_line]}</span><span class="meta" aria-hidden="true">‹</span></button>`).join('') || '<div class="row muted">עדיין לא בשימוש</div>'}
      </div>
      ${!ps.length && !rs.length ? '<button class="btn danger" id="del-drug">מחיקת התרופה</button>' : ''}
    </div>`;
  bindBack();
  $('#edit-drug').onclick = () => drugSheet(d, () => render());
  $('#add-prod').onclick = () => prodSheet(null, d.id, () => render());
  $$('[data-prod]').forEach(b => b.onclick = () => prodSheet(S.prods.find(p => p.id === b.dataset.prod), d.id, () => render()));
  $$('[data-ind]').forEach(b => b.onclick = () => go({ type: 'ind', id: b.dataset.ind }));
  const del = $('#del-drug');
  if (del) del.onclick = () => confirmSheet(`למחוק את התרופה "${d.name_he}"?`, async () => {
    if (await deleteRow('drugs', d.id, 'לא ניתן למחוק — התרופה עדיין בשימוש')) { await loadAll(); toast('נמחק'); back(); }
  });
  bottom('');
}

// Create / edit a drug. onSaved(row) runs after a successful save.
function drugSheet(d, onSaved, prefill = '') {
  const el = sheet(`
    <h2>${d ? 'עריכת תרופה' : 'תרופה חדשה'}</h2>
    <div class="field"><label for="ds-he">שם גנרי (עברית) *</label><input id="ds-he" value="${esc(d ? d.name_he : prefill)}"></div>
    <div class="field"><label for="ds-en">שם גנרי (אנגלית)</label><input id="ds-en" dir="ltr" value="${esc(d?.name_en)}"></div>
    <div id="ds-similar"></div>
    <div class="field"><label for="ds-alias">שמות נוספים לחיפוש (מופרדים בפסיק)</label><input id="ds-alias" value="${esc(d?.search_aliases)}"></div>
    <div class="field"><label for="ds-max">מקסימום יומי (מ"ג)</label><input id="ds-max" type="number" inputmode="decimal" dir="ltr" value="${d?.max_daily_dose_mg ?? ''}"></div>
    <div class="sheet-actions"><button class="btn" data-close>ביטול</button><button class="btn primary" id="ds-save">שמירה</button></div>`);
  const checkSimilar = () => {
    const sim = similarDrugs([$('#ds-he').value, $('#ds-en').value], d?.id);
    $('#ds-similar').innerHTML = sim.length ? `<div class="note-box note-warn">
      <span>⚠️ כבר קיימת תרופה דומה: <strong>${sim.map(s => esc(s.name_he)).join(', ')}</strong></span>
      ${d ? '' : sim.map(s => `<button class="btn" data-use="${esc(s.id)}">להשתמש ב${esc(s.name_he)}</button>`).join('')}
    </div>` : '';
    $$('#ds-similar [data-use]').forEach(b => b.onclick = () => { closeSheet(); onSaved(drugById(b.dataset.use)); });
  };
  $('#ds-he').addEventListener('input', checkSimilar);
  $('#ds-en').addEventListener('input', checkSimilar);
  checkSimilar();
  $('#ds-he').focus();
  enterMovesOn(el, () => $('#ds-save').click());
  $('#ds-save').onclick = async () => {
    const name_he = $('#ds-he').value.trim();
    const max = numOrNull($('#ds-max').value);
    if (!name_he) { toast('יש להזין שם'); return; }
    if (max != null && !(max > 0)) { toast('מקסימום יומי חייב להיות גדול מאפס (או ריק)'); return; }
    const row = await saveRow('drugs', d?.id, {
      name_he, name_en: $('#ds-en').value.trim() || null,
      search_aliases: $('#ds-alias').value.trim() || null, max_daily_dose_mg: max,
    });
    if (!row) return;
    closeSheet(); await loadAll(); toast('נשמר ✓'); onSaved(row);
  };
}

function prodSheet(p, drugId, onSaved) {
  const d = drugById(drugId);
  const el = sheet(`
    <h2>${p ? 'עריכת סירופ' : 'סירופ חדש'} · ${esc(d?.name_he)}</h2>
    <div class="field"><label for="ps-he">שם מסחרי (עברית) *</label><input id="ps-he" value="${esc(p?.brand_name)}" placeholder="לדוגמה: מוקסיפן 250"></div>
    <div class="field"><label for="ps-en">שם מסחרי (אנגלית)</label><input id="ps-en" dir="ltr" value="${esc(p?.brand_name_en)}"></div>
    <div class="field"><label for="ps-alias">שמות נוספים לחיפוש (מופרדים בפסיק)</label><input id="ps-alias" value="${esc(p?.search_aliases)}"></div>
    <div class="pair">
      <div class="field"><label for="ps-mg">ריכוז: מ"ג *</label><input id="ps-mg" type="number" inputmode="decimal" dir="ltr" value="${p?.conc_mg ?? ''}"></div>
      <span class="sep">ב-</span>
      <div class="field"><label for="ps-ml">מ"ל *</label><input id="ps-ml" type="number" inputmode="decimal" dir="ltr" value="${p?.conc_ml ?? 5}"></div>
    </div>
    <div class="small" id="ps-res"></div>
    <div class="field"><label for="ps-note">הערה להורים (הכנה, שמירה)</label><textarea id="ps-note" rows="2">${esc(p?.parent_note)}</textarea></div>
    <div class="sheet-actions"><button class="btn" data-close>ביטול</button><button class="btn primary" id="ps-save">שמירה</button></div>
    ${p ? '<button class="btn danger" id="ps-del">מחיקת הסירופ</button>' : ''}`);
  const res = () => {
    const mg = +$('#ps-mg').value, ml = +$('#ps-ml').value;
    $('#ps-res').textContent = mg > 0 && ml > 0 ? `= ${round2(mg / ml)} מ"ג למ"ל` : '';
  };
  $('#ps-mg').addEventListener('input', res); $('#ps-ml').addEventListener('input', res); res();
  $('#ps-he').focus();
  enterMovesOn(el, () => $('#ps-note').focus());
  $('#ps-save').onclick = async () => {
    const brand_name = $('#ps-he').value.trim(), conc_mg = numOrNull($('#ps-mg').value), conc_ml = numOrNull($('#ps-ml').value);
    if (!brand_name) { toast('יש להזין שם מסחרי'); return; }
    if (!(conc_mg > 0) || !(conc_ml > 0)) { toast('יש להזין ריכוז תקין'); return; }
    const row = await saveRow('products', p?.id, {
      drug_id: drugId, brand_name, brand_name_en: $('#ps-en').value.trim() || null,
      search_aliases: $('#ps-alias').value.trim() || null, conc_mg, conc_ml,
      parent_note: $('#ps-note').value.trim() || null,
    });
    if (!row) return;
    closeSheet(); await loadAll(); toast('נשמר ✓'); onSaved(row);
  };
  const del = $('#ps-del');
  if (del) del.onclick = () => confirmSheet(`למחוק את הסירופ "${p.brand_name}"?`, async () => {
    if (await deleteRow('products', p.id, 'לא ניתן למחוק')) { await loadAll(); toast('נמחק'); onSaved(null); }
  });
}

// ── Treatment-option editor ──
const SECTIONS = ['תרופה', 'מינון', 'סירופים', 'הערות ומקור', 'סיכום'];
let E = null;

function openEditor(mode, src) {
  E = {
    mode, step: 0, weight: '',
    id: mode === 'edit' ? src.id : null,
    r: {
      indication_id: src.indication_id, drug_id: src.drug_id || null,
      treatment_line: src.treatment_line || 'first',
      dose_min_mg_per_kg_day: src.dose_min_mg_per_kg_day ?? '', dose_max_mg_per_kg_day: src.dose_max_mg_per_kg_day ?? '',
      doses_per_day: src.doses_per_day ?? '', duration_days: src.duration_days ?? '',
      doctor_note: src.doctor_note || '', parent_note: src.parent_note || '', source: src.source || '',
      sort_order: src.sort_order ?? 0,
    },
  };
  go({ type: 'editor' });
}

function validate(step) {
  const r = E.r;
  if (step === 0 && !r.drug_id) return 'יש לבחור תרופה';
  if (step === 1) {
    if (!(+r.dose_min_mg_per_kg_day > 0)) return 'יש להזין מינון';
    if (r.dose_max_mg_per_kg_day !== '' && +r.dose_max_mg_per_kg_day < +r.dose_min_mg_per_kg_day) return '"עד" קטן מהמינון';
    if (!(Number.isInteger(+r.doses_per_day) && +r.doses_per_day >= 1 && +r.doses_per_day <= 6)) return 'מנות ביום: מספר שלם בין 1 ל-6';
    if (r.duration_days !== '' && !(Number.isInteger(+r.duration_days) && +r.duration_days > 0)) return 'משך טיפול: מספר ימים שלם (או ריק)';
  }
  return null;
}

function renderEditor() {
  const wide = WIDE.matches;
  const r = E.r;
  const title = E.mode === 'edit' ? 'עריכת אפשרות טיפול' : E.mode === 'dup' ? 'שכפול אפשרות טיפול' : 'אפשרות טיפול חדשה';
  const sub = `${esc(indById(r.indication_id)?.name_he)}${wide ? '' : ` · שלב ${E.step + 1} מתוך ${SECTIONS.length}`}`;
  const show = n => (wide ? n < 4 : n === E.step);
  $('#screen').innerHTML = `
    <div class="top">
      <button class="iconbtn" id="cancel" aria-label="ביטול">✕</button>
      <h1>${title}<span class="sub">${sub}</span></h1>
    </div>
    ${wide ? '' : `<div class="steps" aria-hidden="true">${SECTIONS.map((_, n) => `<i class="${n <= E.step ? 'on' : ''}"></i>`).join('')}</div>`}
    <div class="ed-grid">
      <div class="ed-main" id="ed-main">
        <section class="card" data-sec="0" ${show(0) ? '' : 'hidden'}>${secDrug()}</section>
        <section class="card" data-sec="1" ${show(1) ? '' : 'hidden'}>${secDose()}</section>
        <section class="card" data-sec="2" ${show(2) ? '' : 'hidden'}>${secSyrups()}</section>
        <section class="card" data-sec="3" ${show(3) ? '' : 'hidden'}>${secNotes()}</section>
        ${wide ? '' : `<section class="card" data-sec="4" ${show(4) ? '' : 'hidden'}>${secSummary()}${previewBlock()}${deleteBtn()}</section>`}
      </div>
      ${wide ? `<aside class="ed-side">
        <div class="card">${previewBlock()}</div>
        <div class="card">
          <button class="btn big" id="save-draft">שמירה כטיוטה</button>
          <button class="btn primary big" id="save-ok">שמירה ואימות ✓</button>
          ${deleteBtn()}
        </div>
      </aside>` : ''}
    </div>`;
  $('#cancel').onclick = back;
  bindEditor();
  if (wide) bottom('');
  else if (E.step === SECTIONS.length - 1)
    bottom('<button class="btn big" id="save-draft">שמירה כטיוטה</button><button class="btn primary big" id="save-ok">שמירה ואימות ✓</button>');
  else
    bottom(`${E.step ? '<button class="btn big" id="prev">הקודם</button>' : ''}<button class="btn primary big" id="next">הבא</button>`);
  const sd = $('#save-draft'); if (sd) sd.onclick = () => saveEditor('draft');
  const so = $('#save-ok'); if (so) so.onclick = () => saveEditor('verified');
  const nx = $('#next'); if (nx) nx.onclick = nextStep;
  const pv = $('#prev'); if (pv) pv.onclick = () => { E.step--; render(); window.scrollTo(0, 0); };
  if (wide && E.mode === 'new' && !r.drug_id) $('#dq')?.focus();
}

function nextStep() {
  const err = validate(E.step);
  if (err) { toast(err); return; }
  E.step++; render(); window.scrollTo(0, 0);
}

function deleteBtn() { return E.mode === 'edit' ? '<button class="btn danger" id="ed-del">מחיקת אפשרות הטיפול</button>' : ''; }

function secDrug() {
  const d = drugById(E.r.drug_id);
  return `<h2>1 · תרופה</h2>
    ${E.mode === 'dup' ? `<div class="field"><label for="ed-ind">לאיזו אבחנה לשכפל?</label><select id="ed-ind">
      ${[...S.inds].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he')).map(i => `<option value="${esc(i.id)}" ${i.id === E.r.indication_id ? 'selected' : ''}>${esc(i.name_he)}</option>`).join('')}
    </select></div>` : ''}
    ${d ? `<div class="pick" aria-pressed="true"><span class="check">✓</span><span class="name">${esc(d.name_he)}${d.name_en ? `<br><span class="small" dir="ltr">${esc(d.name_en)}</span>` : ''}</span>
      <button class="btn" id="change-drug">החלפה</button></div>` : `
    <label class="search" style="background:var(--sky)"><span aria-hidden="true">🔍</span>
      <input id="dq" type="search" placeholder="חיפוש תרופה (עברית / אנגלית / שם מסחרי)" aria-label="חיפוש תרופה"></label>
    <div class="picks" id="drug-picks"></div>
    <button class="btn ghost" id="new-drug" style="align-self:flex-start">+ תרופה חדשה</button>`}`;
}

function secDose() {
  const r = E.r;
  const d = drugById(r.drug_id);
  // Same drug already used for another diagnosis → offer to copy its dosing
  const others = d ? sortRecs(S.recs.filter(x => x.drug_id === d.id && x.id !== E.id)) : [];
  return `<h2>2 · מינון</h2>
    ${d ? `<div class="small">${esc(d.name_he)} · מקסימום יומי ${d.max_daily_dose_mg != null ? d.max_daily_dose_mg + ' מ"ג' : 'לא הוגדר'}</div>` : ''}
    ${others.length ? `<div class="note-box note-info"><span>התרופה כבר מופיעה באבחנות אחרות. להעתיק משם את המינון?</span>
      ${others.map(o => `<button class="btn" data-copy="${esc(o.id)}">${esc(indById(o.indication_id)?.name_he)}: ${rng(o.dose_min_mg_per_kg_day, o.dose_max_mg_per_kg_day)} · ${dosesText(o.doses_per_day)}${o.duration_days ? ` · ${o.duration_days} ימים` : ''}</button>`).join('')}
    </div>` : ''}
    <div class="field"><label>קו טיפול</label>
      <div class="seg">${Object.entries(LINES).map(([k, t]) => `<button type="button" aria-pressed="${r.treatment_line === k}" data-line="${k}">${t}</button>`).join('')}</div>
    </div>
    <div class="pair">
      <div class="field"><label for="ed-min">מינון (מ"ג/ק"ג/יום) *</label><input id="ed-min" type="number" inputmode="decimal" dir="ltr" value="${esc(r.dose_min_mg_per_kg_day)}"></div>
      <span class="sep">עד</span>
      <div class="field"><label for="ed-max">(לא חובה)</label><input id="ed-max" type="number" inputmode="decimal" dir="ltr" value="${esc(r.dose_max_mg_per_kg_day)}"></div>
    </div>
    <div class="pair">
      <div class="field"><label for="ed-doses">מנות ביום *</label><input id="ed-doses" type="number" inputmode="numeric" dir="ltr" value="${esc(r.doses_per_day)}"></div>
      <div class="field"><label for="ed-days">משך (ימים)</label><input id="ed-days" type="number" inputmode="numeric" dir="ltr" value="${esc(r.duration_days)}"></div>
    </div>`;
}

function secSyrups() {
  const d = drugById(E.r.drug_id);
  if (!d) return '<h2>3 · סירופים</h2><div class="small">בחר קודם תרופה.</div>';
  const ps = prodsOf(d.id);
  return `<h2>3 · סירופים</h2>
    <div class="small">הסירופים שייכים לתרופה, ולכן יופיעו בכל האבחנות שלה.</div>
    ${ps.length ? `<div class="group">${ps.map(p => `<button type="button" class="row" data-prod="${esc(p.id)}"><span class="name">${esc(p.brand_name)}</span>
      <span class="meta">${p.conc_mg} מ"ג ב-${p.conc_ml} מ"ל (${round2(p.conc_mg / p.conc_ml)} מ"ג/מ"ל)</span><span class="meta">✏️</span></button>`).join('')}</div>`
      : '<div class="note-box note-warn">⚠️ לתרופה הזו עוד אין סירופ.</div>'}
    <button type="button" class="btn ghost" id="add-syrup" style="align-self:flex-start">+ סירופ חדש</button>`;
}

function secNotes() {
  const r = E.r;
  return `<h2>4 · הערות ומקור</h2>
    <div class="field"><label for="ed-dnote">הערה לרופא</label><textarea id="ed-dnote" rows="2" placeholder="מוצגת רק בחלון המינון">${esc(r.doctor_note)}</textarea></div>
    <div class="field"><label for="ed-pnote">הערה להורים</label><textarea id="ed-pnote" rows="2" placeholder="עוברת לתדפיס ולוואטסאפ">${esc(r.parent_note)}</textarea></div>
    <div class="field"><label for="ed-src">מקור</label><input id="ed-src" value="${esc(r.source)}" placeholder="לדוגמה: הנחיות האיגוד לרפואת ילדים"></div>`;
}

function secSummary() {
  const r = E.r, d = drugById(r.drug_id);
  return `<h2>5 · סיכום</h2>
    <dl class="summary">
      <dt>אבחנה</dt><dd>${esc(indById(r.indication_id)?.name_he)}</dd>
      <dt>תרופה</dt><dd>${esc(d?.name_he)}</dd>
      <dt>קו טיפול</dt><dd><span class="chip l-${r.treatment_line}">${LINES[r.treatment_line]}</span></dd>
      <dt>מינון</dt><dd>${rng(r.dose_min_mg_per_kg_day, r.dose_max_mg_per_kg_day)} מ"ג/ק"ג/יום</dd>
      <dt>מנות</dt><dd>${dosesText(r.doses_per_day)}${r.duration_days ? ` · ${r.duration_days} ימים` : ''}</dd>
      <dt>סירופים</dt><dd>${prodsOf(r.drug_id).map(p => esc(p.brand_name)).join(' · ') || '—'}</dd>
      ${r.source ? `<dt>מקור</dt><dd>${esc(r.source)}</dd>` : ''}
    </dl>`;
}

function previewBlock() {
  return `<h2>תצוגה מקדימה</h2>
    <div class="field"><label for="ed-w">משקל נוסף לבדיקה (ק"ג)</label><input id="ed-w" type="number" inputmode="decimal" dir="ltr" value="${esc(E.weight)}"></div>
    <div id="ed-pv">${previewHtml(E.r, E.weight)}</div>`;
}

const refreshPreview = () => { const el = $('#ed-pv'); if (el) el.innerHTML = previewHtml(E.r, E.weight); };

function bindEditor() {
  const r = E.r;
  const main = $('#ed-main');
  // Section 1: drug
  const indSel = $('#ed-ind');
  if (indSel) indSel.onchange = () => { r.indication_id = indSel.value; render(); };
  const chg = $('#change-drug');
  if (chg) chg.onclick = () => { r.drug_id = null; render(); $('#dq')?.focus(); };
  const dq = $('#dq');
  if (dq) {
    const list = () => {
      const q = dq.value.trim().toLowerCase();
      const ds = S.drugs.filter(d => !q || drugSearchText(d).includes(q));
      $('#drug-picks').innerHTML = ds.map(d => `
        <button type="button" class="pick" data-pick="${esc(d.id)}"><span class="check">✓</span>
          <span class="name">${esc(d.name_he)}${d.name_en ? `<br><span class="small" dir="ltr">${esc(d.name_en)}</span>` : ''}</span>
          <span class="small">${plural(prodsOf(d.id).length, 'סירופ אחד', 'סירופים')}</span></button>`).join('')
        || '<div class="small">לא נמצאה תרופה. אפשר להוסיף חדשה.</div>';
      $$('#drug-picks [data-pick]').forEach(b => b.onclick = () => { r.drug_id = b.dataset.pick; render(); });
    };
    dq.addEventListener('input', list);
    dq.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = $('#drug-picks [data-pick]');
      if (first) first.click(); else $('#new-drug').click();
    });
    list();
    $('#new-drug').onclick = () => drugSheet(null, d => { r.drug_id = d.id; render(); }, dq.value.trim());
  }
  // Section 2: dose
  $$('[data-copy]').forEach(b => b.onclick = () => {
    const o = S.recs.find(x => x.id === b.dataset.copy);
    Object.assign(r, {
      dose_min_mg_per_kg_day: o.dose_min_mg_per_kg_day, dose_max_mg_per_kg_day: o.dose_max_mg_per_kg_day ?? '',
      doses_per_day: o.doses_per_day, duration_days: o.duration_days ?? '',
    });
    toast('המינון הועתק — אפשר לשנות'); render();
  });
  $$('[data-line]').forEach(b => b.onclick = () => {
    r.treatment_line = b.dataset.line;
    $$('[data-line]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  const bindField = (id, key) => { const el = $('#' + id); if (el) el.addEventListener('input', () => { r[key] = el.value; refreshPreview(); }); };
  bindField('ed-min', 'dose_min_mg_per_kg_day'); bindField('ed-max', 'dose_max_mg_per_kg_day');
  bindField('ed-doses', 'doses_per_day'); bindField('ed-days', 'duration_days');
  bindField('ed-dnote', 'doctor_note'); bindField('ed-pnote', 'parent_note'); bindField('ed-src', 'source');
  const w = $('#ed-w'); if (w) w.addEventListener('input', () => { E.weight = w.value; refreshPreview(); });
  // Section 3: syrups (sheets keep the editor state; re-render afterwards)
  const add = $('#add-syrup'); if (add) add.onclick = () => prodSheet(null, r.drug_id, () => render());
  $$('#ed-main [data-prod]').forEach(b => b.onclick = () => prodSheet(S.prods.find(p => p.id === b.dataset.prod), r.drug_id, () => render()));
  // Delete
  const del = $('#ed-del');
  if (del) del.onclick = () => confirmSheet('למחוק את אפשרות הטיפול הזו? (התרופה והסירופים נשארים במאגר)', async () => {
    if (await deleteRow('recommendations', E.id, 'לא ניתן למחוק')) { await loadAll(); toast('נמחק'); back(); }
  });
  // Enter → next field; on the last field of a phone step → next step
  enterMovesOn(main, () => { if (!WIDE.matches && E.step < SECTIONS.length - 1) nextStep(); });
}

async function saveEditor(status) {
  for (let n = 0; n < 2; n++) {
    const err = validate(n);
    if (err) { toast(err); if (!WIDE.matches) { E.step = n; render(); } return; }
  }
  const r = E.r;
  const payload = {
    indication_id: r.indication_id, drug_id: r.drug_id, treatment_line: r.treatment_line,
    dose_min_mg_per_kg_day: +r.dose_min_mg_per_kg_day, dose_max_mg_per_kg_day: numOrNull(r.dose_max_mg_per_kg_day),
    doses_per_day: +r.doses_per_day, duration_days: numOrNull(r.duration_days),
    doctor_note: r.doctor_note.trim() || null, parent_note: r.parent_note.trim() || null, source: r.source.trim() || null,
    sort_order: r.sort_order, status,
  };
  const doSave = async () => {
    const row = await saveRow('recommendations', E.id, payload);
    if (!row) return;
    await loadAll();
    toast(status === 'verified' ? 'נשמר ואומת ✓' : 'נשמר כטיוטה');
    back();
    // After a duplicate to another diagnosis, show that diagnosis
    if (E.mode === 'dup' && nav[nav.length - 1].id !== row.indication_id) go({ type: 'ind', id: row.indication_id });
  };
  if (status === 'verified') verifyChecklist(payload, doSave);
  else doSave();
}

// ── Login / start ──
function renderLogin() {
  nav.length = 0;
  bottom('');
  $('#app').classList.remove('wide');
  $('#screen').innerHTML = `
    <form class="login card" id="login-form">
      <h1>TinyDose</h1>
      <div class="small" style="text-align:center">כניסה לניהול המאגר</div>
      <div class="field"><label for="li-email">אימייל</label><input id="li-email" type="email" dir="ltr" autocomplete="username"></div>
      <div class="field"><label for="li-pass">סיסמה</label><input id="li-pass" type="password" dir="ltr" autocomplete="current-password"></div>
      <div class="err" id="li-err" hidden></div>
      <button class="btn primary big" id="li-btn">כניסה</button>
      <a class="small" href="calculator.html" style="text-align:center">חזרה למחשבון</a>
    </form>`;
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#li-btn'), err = $('#li-err');
    btn.disabled = true; btn.textContent = 'מתחבר...'; err.hidden = true;
    const { error } = await supabase.auth.signInWithPassword({ email: $('#li-email').value.trim(), password: $('#li-pass').value });
    btn.disabled = false; btn.textContent = 'כניסה';
    if (error) { err.textContent = error.message === 'Invalid login credentials' ? 'פרטי כניסה שגויים' : 'שגיאה: ' + error.message; err.hidden = false; }
  };
}

let started = false;
async function start() {
  if (started) return;
  started = true;
  $('#screen').innerHTML = '<div class="empty">טוען...</div>';
  await loadAll();
  if (S.cats[0]) openCats.add(S.cats[0].id);
  go({ type: 'home' });
}

// Supabase asks not to await its own calls inside this callback → defer with setTimeout
supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (session) start();
    else { started = false; renderLogin(); }
  }, 0);
});
