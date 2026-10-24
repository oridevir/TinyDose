// db-picker.js — "📚 בחירה מהמאגר": browse the drug database from the calculator.
// Category → diagnosis → treatment options (or free search), then a confirm window
// with the syrup choice. It only READS the database and hands the chosen option back
// to the calculator, which fills its own fields; all math stays in calculateDose().
// Visitors see verified options only (enforced in Supabase); a signed-in admin also
// sees drafts, marked as such.
import { supabase, esc } from './app.js?v=20261007b';

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

let el = null, onPick = null, view = { name: 'home' }, query = '';

export async function openPicker(cb) {
  onPick = cb;
  if (!el) {
    el = document.createElement('div');
    el.className = 'dbp-overlay';
    el.innerHTML = `
      <div class="dbp-sheet" role="dialog" aria-modal="true" aria-labelledby="dbp-title">
        <div class="dbp-head">
          <button type="button" class="dbp-icon" id="dbp-back" aria-label="חזרה" hidden>→</button>
          <h2 id="dbp-title">📚 בחירה מהמאגר</h2>
          <button type="button" class="dbp-icon" id="dbp-close" aria-label="סגירה">✕</button>
        </div>
        <input type="search" id="dbp-q" placeholder="חיפוש אבחנה או תרופה" aria-label="חיפוש אבחנה או תרופה" autocomplete="off">
        <div class="dbp-body" id="dbp-body"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.querySelector('#dbp-close').onclick = close;
    el.querySelector('#dbp-back').onclick = back;
    const qi = el.querySelector('#dbp-q');
    qi.addEventListener('input', () => { query = qi.value.trim(); view = { name: 'home' }; render(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
    el.querySelector('#dbp-body').addEventListener('click', onBodyClick);
  }
  el.hidden = false;
  document.body.classList.add('dbp-open');
  view = { name: 'home' }; query = ''; el.querySelector('#dbp-q').value = '';
  if (!D) {
    body('<div class="dbp-msg">טוען את המאגר…</div>');
    try { await (loading ||= load()); }
    catch (e) { loading = null; body(`<div class="dbp-msg dbp-err">לא ניתן לטעון את המאגר כרגע. אפשר להמשיך בחישוב ידני.<br><small>${esc(e.message || e)}</small></div>`); return; }
  }
  render();
}

function close() { el.hidden = true; document.body.classList.remove('dbp-open'); }
function back() { view = view.name === 'confirm' ? { name: 'ind', id: view.indId } : { name: 'home' }; render(); }
const body = html => { el.querySelector('#dbp-body').innerHTML = html; };
const draft = r => (r.status === 'draft' ? '<span class="dbp-draft">טיוטה</span>' : '');
const doseLine = (r, drug) => {
  const mx = effMax(r, drug);
  return `${rng(r.dose_min_mg_per_kg_day, r.dose_max_mg_per_kg_day)} מ"ג/ק"ג/יום · ${dosesText(r.doses_per_day)}${r.duration_days ? ` · ${r.duration_days} ימים` : ''}${mx != null ? ` · מקס' ${mx} מ"ג ליום` : ''}`;
};

function render() {
  el.querySelector('#dbp-back').hidden = view.name === 'home';
  el.querySelector('#dbp-q').hidden = view.name === 'confirm';
  if (view.name === 'ind') return renderInd(view.id);
  if (view.name === 'confirm') return renderConfirm(view.recId);
  if (query) return renderSearch();
  renderHome();
}

function renderHome() {
  const withRecs = D.inds.filter(i => D.recsOf(i.id).length);
  if (!withRecs.length) return body('<div class="dbp-msg">אין עדיין אפשרויות טיפול מאומתות במאגר. אפשר להמשיך בחישוב ידני.</div>');
  const cats = [...D.cats].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_he.localeCompare(b.name_he, 'he'));
  const groups = cats.map(c => ({ name: c.name_he, inds: withRecs.filter(i => i.category_id === c.id) }));
  groups.push({ name: 'אחר', inds: withRecs.filter(i => !D.cat[i.category_id]) });
  const drafts = D.recs.some(r => r.status === 'draft');
  body(`${drafts ? '<div class="dbp-note">אתה מחובר כמנהל — מוצגות גם טיוטות (רופאים רואים רק המלצות מאומתות).</div>' : ''}
    ${groups.filter(g => g.inds.length).map(g => `
      <div class="dbp-cat">${esc(g.name)}</div>
      <div class="dbp-list">${g.inds.sort((a, b) => a.name_he.localeCompare(b.name_he, 'he')).map(indBtn).join('')}</div>`).join('')}`);
}
const indBtn = i => `<button type="button" class="dbp-row" data-ind="${esc(i.id)}"><span>${esc(i.name_he)}</span><span class="dbp-sub">${D.recsOf(i.id).length} אפשרויות ‹</span></button>`;

function renderSearch() {
  const q = norm(query);
  const has = (...xs) => xs.some(x => norm(x).includes(q));
  const inds = D.inds.filter(i => D.recsOf(i.id).length && has(i.name_he, i.name_en));
  const drugHit = d => has(d.name_he, d.name_en, d.search_aliases, ...D.prodsOf(d.id).flatMap(p => [p.brand_name, p.brand_name_en, p.search_aliases]));
  const recs = D.recs.filter(r => D.ind[r.indication_id] && D.drug[r.drug_id] && drugHit(D.drug[r.drug_id]));
  if (!inds.length && !recs.length) return body('<div class="dbp-msg">לא נמצא. אפשר לנסות שם אחר, או להמשיך בחישוב ידני.</div>');
  body(`${inds.length ? `<div class="dbp-cat">אבחנות</div><div class="dbp-list">${inds.map(indBtn).join('')}</div>` : ''}
    ${recs.length ? `<div class="dbp-cat">תרופות</div><div class="dbp-list">${recs.map(r => `
      <button type="button" class="dbp-row" data-rec="${esc(r.id)}">
        <span>${esc(D.drug[r.drug_id].name_he)} · ${esc(D.ind[r.indication_id].name_he)} ${draft(r)}</span>
        <span class="dbp-sub">${LINES[r.treatment_line] || ''}</span></button>`).join('')}</div>` : ''}`);
}

function renderInd(id) {
  const ind = D.ind[id];
  const recs = D.recsOf(id);
  body(`<h3 class="dbp-ind">${esc(ind.name_he)}</h3>
    ${Object.keys(LINES).map(line => {
      const rs = recs.filter(r => r.treatment_line === line);
      return rs.length ? `<div class="dbp-cat">${LINES[line]}</div>${rs.map(r => {
        const d = D.drug[r.drug_id];
        return `<button type="button" class="dbp-card" data-rec="${esc(r.id)}">
          <span class="dbp-card-head"><strong>${esc(d.name_he)}</strong>${d.name_en ? ` <span class="dbp-sub" dir="ltr">${esc(d.name_en)}</span>` : ''} ${draft(r)}</span>
          <span>${doseLine(r, d)}</span>
          ${r.doctor_note ? `<span class="dbp-dnote">🩺 ${esc(r.doctor_note)}</span>` : ''}
        </button>`;
      }).join('')}` : '';
    }).join('')}`);
}

function renderConfirm(recId) {
  const r = D.recs.find(x => x.id === recId), d = D.drug[r.drug_id], ind = D.ind[r.indication_id];
  const ps = D.prodsOf(d.id), mx = effMax(r, d);
  body(`<h3 class="dbp-ind">מינון מומלץ ${draft(r)}</h3>
    <dl class="dbp-dl">
      <dt>אבחנה</dt><dd>${esc(ind.name_he)} · ${LINES[r.treatment_line] || ''}</dd>
      <dt>תרופה</dt><dd>${esc(d.name_he)}${d.name_en ? ` <span dir="ltr">(${esc(d.name_en)})</span>` : ''}</dd>
      <dt>מינון</dt><dd>${rng(r.dose_min_mg_per_kg_day, r.dose_max_mg_per_kg_day)} מ"ג/ק"ג/יום</dd>
      <dt>מנות ביום</dt><dd>${dosesText(r.doses_per_day)}</dd>
      ${r.duration_days ? `<dt>משך</dt><dd>${r.duration_days} ימים</dd>` : ''}
      <dt>מקסימום יומי</dt><dd>${mx != null ? `${mx} מ"ג` : 'לא הוגדר'}</dd>
      ${r.source ? `<dt>מקור</dt><dd>${esc(r.source)}</dd>` : ''}
    </dl>
    ${r.doctor_note ? `<div class="dbp-dnote dbp-box">🩺 <strong>הערה לרופא:</strong> ${esc(r.doctor_note)}</div>` : ''}
    ${r.parent_note ? `<div class="dbp-box">👪 <strong>הערה להורים</strong> (תעבור לתדפיס ולשליחה): ${esc(r.parent_note)}</div>` : ''}
    <div class="dbp-cat">סירופ</div>
    ${ps.length ? `<div class="dbp-list" role="radiogroup" aria-label="בחירת סירופ">${ps.map((p, i) => `
      <label class="dbp-row dbp-radio"><input type="radio" name="dbp-prod" value="${esc(p.id)}"${i === 0 ? ' checked' : ''}>
        <span>${esc(p.brand_name)}</span><span class="dbp-sub" dir="ltr">${p.conc_mg} mg / ${p.conc_ml} ml</span></label>`).join('')}</div>`
      : '<div class="dbp-box dbp-warn">⚠️ אין סירופ במאגר לתרופה הזו — את הריכוז יש להקליד ידנית בדף החישוב.</div>'}
    <p class="dbp-sub">המשקל לא מתמלא מהמאגר. כל שדה נשאר ניתן לעריכה.</p>
    <div class="dbp-actions">
      <button type="button" class="dbp-btn" id="dbp-cancel">חזרה</button>
      <button type="button" class="dbp-btn dbp-primary" id="dbp-ok">✓ מילוי בדף החישוב</button>
    </div>`);
  el.querySelector('#dbp-cancel').onclick = back;
  el.querySelector('#dbp-ok').onclick = () => {
    const pid = el.querySelector('input[name=dbp-prod]:checked')?.value;
    close();
    onPick({ rec: r, drug: d, indication: ind, products: ps, product: ps.find(p => p.id === pid) || null, maxDailyDoseMg: mx });
  };
}

function onBodyClick(e) {
  const b = e.target.closest('[data-ind],[data-rec]');
  if (!b) return;
  if (b.dataset.ind) view = { name: 'ind', id: b.dataset.ind };
  else { const r = D.recs.find(x => x.id === b.dataset.rec); view = { name: 'confirm', recId: r.id, indId: r.indication_id }; }
  render();
  el.querySelector('.dbp-sheet').scrollTop = 0;
}
