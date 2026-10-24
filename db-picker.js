// db-picker.js — "📚 בחירה מהמאגר": browse the drug database from the calculator.
// Categories → diagnoses → drug names (or free search) → one screen with everything
// about the chosen option, the syrup choice and "fill the calculator". It only READS the database and hands the chosen option back
// to the calculator, which fills its own fields; all math stays in calculateDose().
// Visitors see verified options only (enforced in Supabase); a signed-in admin also
// sees drafts, marked as such.
import { supabase, esc, isolateLtr } from './app.js?v=20261024a';
// Text content from the database: escaped + mixed Hebrew/English kept in order
const t = x => esc(isolateLtr(x));

const LINES = { first: 'קו ראשון', alternative: 'חלופה', allergy: 'אלרגיה לפניצילין' };
const LINE_ORDER = { first: 0, alternative: 1, allergy: 2 };
const rng = (a, b) => (b == null || +b === +a ? `${a}` : `⁦${a}–${b}⁩`);
const dosesText = n => (+n === 1 ? 'פעם ביום' : +n === 2 ? 'פעמיים ביום' : `${n} פעמים ביום`);
// Hebrew-aware loose match: case, spaces, hyphens and final letters don't matter
const norm = s => String(s || '').toLowerCase().replace(/[ךםןףץ]/g, c => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' })[c]).replace(/[\s\-–־"'׳״.,()]/g, '');

let D = null;        // loaded data
let loading = null;

async function load() {
  const q = t => supabase.from(t).select('*').then(({ data, error }) => { if (error) throw error; return data || []; });
  // One retry: right after sign-in Supabase may reject a single request (see CLAUDE.md §11)
  const get = t => q(t).catch(() => q(t));
  const [cats, inds, drugs, prods, recs] = await Promise.all(['categories', 'indications', 'drugs', 'products', 'recommendations'].map(get));
  const byId = a => Object.fromEntries(a.map(x => [x.id, x]));
  D = { cats, inds, drugs, prods, recs, cat: byId(cats), ind: byId(inds), drug: byId(drugs) };
  D.recs.sort((a, b) => (LINE_ORDER[a.treatment_line] ?? 9) - (LINE_ORDER[b.treatment_line] ?? 9) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  D.prodsOf = id => D.prods.filter(p => p.drug_id === id).sort((a, b) => a.conc_mg / a.conc_ml - b.conc_mg / b.conc_ml);
  D.recsOf = id => D.recs.filter(r => r.indication_id === id && D.drug[r.drug_id]);
}

// Daily max for an option: its own (per diagnosis) if set, else the drug's
export function effMax(rec, drug) {
  return rec.max_daily_dose_mg != null ? +rec.max_daily_dose_mg : drug?.max_daily_dose_mg != null ? +drug.max_daily_dose_mg : null;
}

// Category look: an emoji and one of the calculator's bubble colors
const CAT_LOOK = { ENT: ['👂', 'peach'], Respiratory: ['🫁', 'blue'], Gastrointestinal: ['🍼', 'yellow'], 'Urinary Tract': ['💧', 'green'], 'Soft Tissues': ['🩹', 'lilac'] };
const COLORS = ['peach', 'yellow', 'green', 'lilac', 'blue'];
const catLook = (c, i) => CAT_LOOK[c?.name_en] || ['💊', COLORS[i % COLORS.length]];

let el = null, onPick = null, query = '';
let stack = [];                        // navigation: [{ name: 'home' | 'cat' | 'ind' | 'drug', id }]
const view = () => stack[stack.length - 1];

// Phone keyboards shrink the visible area: size the window to it, so search
// results always sit right under the search box instead of behind the keyboard.
function fitViewport() {
  const vv = window.visualViewport;
  if (!el || !vv) return;
  el.style.setProperty('--dbp-h', `${vv.height}px`);
  el.style.setProperty('--dbp-top', `${vv.offsetTop}px`);
}

export async function openPicker(cb) {
  onPick = cb;
  if (!el) {
    el = document.createElement('div');
    el.className = 'dbp-overlay';
    el.innerHTML = `
      <div class="dbp-sheet" role="dialog" aria-modal="true" aria-labelledby="dbp-title">
        <div class="dbp-top">
          <div class="dbp-head">
            <button type="button" class="dbp-icon" id="dbp-back" aria-label="חזרה" hidden>→</button>
            <h2 id="dbp-title"><span aria-hidden="true">📚</span> בחירה מהמאגר</h2>
            <button type="button" class="dbp-icon" id="dbp-close" aria-label="סגירה">✕</button>
          </div>
          <div class="dbp-search"><span aria-hidden="true">🔎</span>
            <input type="search" id="dbp-q" placeholder="חיפוש אבחנה או תרופה" aria-label="חיפוש אבחנה או תרופה" autocomplete="off" enterkeyhint="search"></div>
          <div class="dbp-crumbs" id="dbp-crumbs"></div>
        </div>
        <div class="dbp-body" id="dbp-body"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('#dbp-close').onclick = close;
    el.querySelector('#dbp-back').onclick = back;
    const qi = el.querySelector('#dbp-q');
    qi.addEventListener('input', () => { query = qi.value.trim(); stack = [{ name: 'home' }]; render(); });
    qi.addEventListener('keydown', e => { if (e.key === 'Enter') qi.blur(); });   // "search" key closes the keyboard
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
    el.querySelector('#dbp-body').addEventListener('click', onBodyClick);
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
  }
  el.hidden = false;
  fitViewport();
  document.body.classList.add('dbp-open');
  stack = [{ name: 'home' }]; query = ''; el.querySelector('#dbp-q').value = '';
  if (!D) {
    body('<div class="dbp-msg">טוען את המאגר…</div>');
    try { await (loading ||= load()); }
    catch (e) { loading = null; body(`<div class="dbp-msg dbp-err">לא ניתן לטעון את המאגר כרגע. אפשר להמשיך בחישוב ידני.<br><small>${t(e.message || e)}</small></div>`); return; }
  }
  render();
}

function close() { el.hidden = true; document.body.classList.remove('dbp-open'); }
function go(v) { stack.push(v); render(); el.querySelector('#dbp-body').scrollTop = 0; }
function back() { if (stack.length > 1) stack.pop(); render(); el.querySelector('#dbp-body').scrollTop = 0; }
const body = html => { el.querySelector('#dbp-body').innerHTML = html; };
const draft = r => (r.status === 'draft' ? '<span class="dbp-draft">טיוטה</span>' : '');
const lineChip = r => `<span class="dbp-line dbp-line-${r.treatment_line}">${LINES[r.treatment_line] || ''}</span>`;
const sortHe = (a, b) => a.name_he.localeCompare(b.name_he, 'he');
const indsWithRecs = () => D.inds.filter(i => D.recsOf(i.id).length);
const catsWithInds = () => {
  const inds = indsWithRecs();
  const cats = [...D.cats].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || sortHe(a, b))
    .map((c, i) => ({ c, look: catLook(c, i), inds: inds.filter(x => x.category_id === c.id).sort(sortHe) }));
  const other = inds.filter(x => !D.cat[x.category_id]);
  if (other.length) cats.push({ c: { id: '', name_he: 'אחר' }, look: ['💊', 'blue'], inds: other.sort(sortHe) });
  return cats.filter(g => g.inds.length);
};

function render() {
  const v = view();
  el.querySelector('#dbp-back').hidden = stack.length < 2;
  el.querySelector('.dbp-search').hidden = v.name === 'drug';
  crumbs();
  if (v.name === 'cat') return renderCat(v.id);
  if (v.name === 'ind') return renderInd(v.id);
  if (v.name === 'drug') return renderDrug(v.id);
  if (query) return renderSearch();
  renderHome();
}

// "אף-אוזן-גרון › אוטיטיס מדיה" under the search box, so the doctor knows where they are
function crumbs() {
  const parts = stack.slice(1).map(v => v.name === 'cat' ? (D.cat[v.id]?.name_he || 'אחר')
    : v.name === 'ind' ? D.ind[v.id]?.name_he : v.name === 'drug' ? D.drug[D.recs.find(r => r.id === v.id)?.drug_id]?.name_he : '');
  const c = el.querySelector('#dbp-crumbs');
  c.innerHTML = parts.map(x => t(x)).join(' <span aria-hidden="true">›</span> ');
  c.hidden = !parts.length;
}

function renderHome() {
  const groups = catsWithInds();
  if (!groups.length) return body('<div class="dbp-msg">אין עדיין אפשרויות טיפול מאומתות במאגר. אפשר להמשיך בחישוב ידני.</div>');
  const drafts = D.recs.some(r => r.status === 'draft');
  body(`${drafts ? '<div class="dbp-note">✏️ אתה מחובר כמנהל — מוצגות גם טיוטות. רופאים רואים רק המלצות מאומתות.</div>' : ''}
    <div class="dbp-cats">${groups.map(g => `
      <button type="button" class="dbp-catcard dbp-c-${g.look[1]}" data-cat="${esc(g.c.id)}">
        <span class="dbp-emoji" aria-hidden="true">${g.look[0]}</span>
        <span class="dbp-catname">${t(g.c.name_he)}</span>
        <span class="dbp-count">${g.inds.length === 1 ? 'אבחנה אחת' : `${g.inds.length} אבחנות`}</span>
      </button>`).join('')}</div>`);
}

function renderCat(id) {
  const g = catsWithInds().find(x => x.c.id === id);
  if (!g) return back();
  body(`<div class="dbp-title dbp-c-${g.look[1]}"><span aria-hidden="true">${g.look[0]}</span> ${t(g.c.name_he)}</div>
    <div class="dbp-list">${g.inds.map(i => indBtn(i, g.look[1])).join('')}</div>`);
}
const indBtn = (i, color) => `<button type="button" class="dbp-pill dbp-edge-${color}" data-ind="${esc(i.id)}">
  <span class="dbp-pill-main">${t(i.name_he)}</span><span class="dbp-go" aria-hidden="true">‹</span></button>`;
const colorOfInd = i => catsWithInds().find(g => g.inds.includes(i))?.look[1] || 'blue';

function renderInd(id) {
  const ind = D.ind[id];
  const recs = D.recsOf(id);
  body(`<div class="dbp-title dbp-c-${colorOfInd(ind)}">${t(ind.name_he)}</div>
    <div class="dbp-hint">בחר תרופה לפרטים המלאים</div>
    <div class="dbp-list">${recs.map(drugBtn).join('')}</div>`);
}
// Only the drug name here (plus its line of treatment); everything else on the next screen
const drugBtn = r => `<button type="button" class="dbp-pill" data-rec="${esc(r.id)}">
  <span class="dbp-pill-main">${t(D.drug[r.drug_id].name_he)} ${draft(r)}</span>${lineChip(r)}<span class="dbp-go" aria-hidden="true">‹</span></button>`;

function renderSearch() {
  const q = norm(query);
  const has = (...xs) => xs.some(x => norm(x).includes(q));
  const inds = indsWithRecs().filter(i => has(i.name_he, i.name_en)).sort(sortHe);
  const drugHit = d => has(d.name_he, d.name_en, d.search_aliases, ...D.prodsOf(d.id).flatMap(p => [p.brand_name, p.brand_name_en, p.search_aliases]));
  const recs = D.recs.filter(r => D.ind[r.indication_id] && D.drug[r.drug_id] && drugHit(D.drug[r.drug_id]));
  if (!inds.length && !recs.length) return body('<div class="dbp-msg">לא נמצא. אפשר לנסות שם אחר, או להמשיך בחישוב ידני.</div>');
  body(`${inds.length ? `<div class="dbp-sec">אבחנות</div><div class="dbp-list">${inds.map(i => indBtn(i, colorOfInd(i))).join('')}</div>` : ''}
    ${recs.length ? `<div class="dbp-sec">תרופות</div><div class="dbp-list">${recs.map(r => `
      <button type="button" class="dbp-pill" data-rec="${esc(r.id)}">
        <span class="dbp-pill-main">${t(D.drug[r.drug_id].name_he)} ${draft(r)}<span class="dbp-sub">${t(D.ind[r.indication_id].name_he)}</span></span>
        ${lineChip(r)}<span class="dbp-go" aria-hidden="true">‹</span></button>`).join('')}</div>` : ''}`);
}

function renderDrug(recId) {
  const r = D.recs.find(x => x.id === recId), d = D.drug[r.drug_id], ind = D.ind[r.indication_id];
  const ps = D.prodsOf(d.id), mx = effMax(r, d);
  body(`<div class="dbp-hero">
      <div class="dbp-hero-name">${t(d.name_he)}</div>
      ${d.name_en ? `<div class="dbp-hero-en" dir="ltr">${t(d.name_en)}</div>` : ''}
      <div class="dbp-hero-sub">${t(ind.name_he)} · ${lineChip(r)} ${draft(r)}</div>
    </div>
    <div class="dbp-facts">
      <div class="dbp-fact dbp-c-peach"><span>מינון</span><strong>${rng(r.dose_min_mg_per_kg_day, r.dose_max_mg_per_kg_day)}</strong><small>מ"ג/ק"ג/יום</small></div>
      <div class="dbp-fact dbp-c-yellow"><span>מנות ביום</span><strong>${r.doses_per_day}</strong><small>${dosesText(r.doses_per_day)}</small></div>
      <div class="dbp-fact dbp-c-green"><span>משך</span><strong>${r.duration_days ?? '—'}</strong><small>${r.duration_days ? 'ימים' : 'לא צוין'}</small></div>
      <div class="dbp-fact dbp-c-lilac"><span>מקסימום יומי</span><strong>${mx ?? '—'}</strong><small>${mx != null ? 'מ"ג' : 'לא הוגדר'}</small></div>
    </div>
    ${r.doctor_note ? `<div class="dbp-box dbp-dnote">🩺 <strong>הערה לרופא:</strong> ${t(r.doctor_note)}</div>` : ''}
    ${r.parent_note ? `<div class="dbp-box dbp-pnote">👪 <strong>הערה להורים</strong> (תעבור לתדפיס ולשליחה): ${t(r.parent_note)}</div>` : ''}
    <div class="dbp-sec">סירופ</div>
    ${ps.length ? `<div class="dbp-syrups" role="radiogroup" aria-label="בחירת סירופ">${ps.map((p, i) => `
      <label class="dbp-syrup"><input type="radio" name="dbp-prod" value="${esc(p.id)}"${i === 0 ? ' checked' : ''}>
        <span class="dbp-syrup-name">${t(p.brand_name)}</span><span class="dbp-syrup-conc" dir="ltr">${p.conc_mg} mg / ${p.conc_ml} ml</span></label>`).join('')}</div>`
      : '<div class="dbp-box dbp-warn">⚠️ אין סירופ במאגר לתרופה הזו — את הריכוז יש להקליד ידנית בדף החישוב.</div>'}
    ${r.source ? `<div class="dbp-src">מקור: ${t(r.source)}</div>` : ''}
    <div class="dbp-fill-bar">
      <button type="button" class="dbp-fill" id="dbp-ok">✓ מילוי בדף החישוב</button>
      <div class="dbp-fill-note">המשקל לא מתמלא מהמאגר · כל שדה נשאר ניתן לעריכה</div>
    </div>`);
  el.querySelector('#dbp-ok').onclick = () => {
    const pid = el.querySelector('input[name=dbp-prod]:checked')?.value;
    close();
    onPick({ rec: r, drug: d, indication: ind, products: ps, product: ps.find(p => p.id === pid) || null, maxDailyDoseMg: mx });
  };
}

function onBodyClick(e) {
  const b = e.target.closest('[data-cat],[data-ind],[data-rec]');
  if (!b) return;
  if ('cat' in b.dataset) go({ name: 'cat', id: b.dataset.cat });
  else if (b.dataset.ind) go({ name: 'ind', id: b.dataset.ind });
  else go({ name: 'drug', id: b.dataset.rec });
}
