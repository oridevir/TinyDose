// admin.js
import { supabase, round2, esc, calculateDose } from './app.js?v=20261007b';

let indicationsData = [];
let categoriesData = [];
let drugsData = [];
let productsData = [];
let recsData = [];

const LINE_LABELS = { first: 'קו ראשון', alternative: 'חלופה', allergy: 'אלרגיה לפניצילין' };

// ── Auth ──
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await showAdmin(session.user.email);

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) await showAdmin(session.user.email);
    else showLogin();
  });
}

async function showAdmin(email) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  document.getElementById('admin-email').textContent = email;
  await Promise.all([loadCategories(), loadIndications(), loadDrugs(), loadProducts()]);
  await loadRecs();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('admin-app').classList.add('hidden');
}

window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'מתחבר...';

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'כניסה';

  if (error) {
    errEl.textContent = 'שגיאה: ' + (error.message === 'Invalid login credentials' ? 'פרטי כניסה שגויים' : error.message);
    errEl.style.display = 'block';
  }
};

window.doLogout = async function() {
  await supabase.auth.signOut();
};

// ── Tab switching ──
window.showAdminTab = function(tab) {
  ['recs', 'drugs', 'products', 'indications', 'cats'].forEach(t => {
    document.getElementById(`admin-section-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`admin-tab-${t}`).classList.toggle('active', t === tab);
  });
};

// ── Helpers ──
function catName(categoryId) {
  if (!categoryId) return '—';
  const c = categoriesData.find(x => x.id === categoryId);
  return c ? esc(c.name_he) : '—';
}

function indicationName(indicationId) {
  if (!indicationId) return '—';
  const ind = indicationsData.find(x => x.id === indicationId);
  return ind ? esc(ind.name_he) : '—';
}

// ── Categories ──
async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) { showToast('שגיאה בטעינת קטגוריות'); return; }
  categoriesData = data || [];
  renderCategoriesTable(categoriesData);
  populateCategorySelects();
}

function renderCategoriesTable(cats) {
  const tbody = document.getElementById('cats-tbody');
  if (!cats.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--gray-400);">אין קטגוריות מוגדרות</td></tr>';
    return;
  }
  tbody.innerHTML = cats.map(c => `
    <tr>
      <td>${esc(c.name_he)}</td>
      <td>${c.name_en ? esc(c.name_en) : '—'}</td>
      <td>${c.sort_order}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" data-cat-edit="${esc(c.id)}">עריכה</button>
          <button class="btn btn-danger btn-sm" data-cat-delete="${esc(c.id)}">מחק</button>
        </div>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-cat-edit]').forEach(btn =>
    btn.addEventListener('click', () => openCatModal(btn.getAttribute('data-cat-edit')))
  );
  tbody.querySelectorAll('[data-cat-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteCat(btn.getAttribute('data-cat-delete')))
  );
}

function populateCategorySelects() {
  const options = '<option value="">ללא קטגוריה (כללי)</option>' +
    categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name_he)}</option>`).join('');

  const el = document.getElementById('if-category-id');
  if (el) { const cur = el.value; el.innerHTML = options; if (cur) el.value = cur; }

}

window.openCatModal = function(id) {
  const c = id ? categoriesData.find(x => x.id === id) : null;
  document.getElementById('cat-modal-title').textContent = c ? 'עריכת קטגוריה' : 'הוסף קטגוריה';
  document.getElementById('cf-id').value = c?.id || '';
  document.getElementById('cf-name-he').value = c?.name_he || '';
  document.getElementById('cf-name-en').value = c?.name_en || '';
  document.getElementById('cf-sort-order').value = c?.sort_order ?? 0;
  document.getElementById('cat-modal-overlay').classList.remove('hidden');
};

window.closeCatModal = function() {
  document.getElementById('cat-modal-overlay').classList.add('hidden');
};

window.saveCat = async function(e) {
  e.preventDefault();
  const payload = {
    name_he: document.getElementById('cf-name-he').value.trim(),
    name_en: document.getElementById('cf-name-en').value.trim() || null,
    sort_order: parseInt(document.getElementById('cf-sort-order').value) || 0,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name_he) { showToast('יש להזין שם קטגוריה'); return; }

  const btn = document.getElementById('cat-save-btn');
  btn.disabled = true; btn.textContent = 'שומר...';

  const id = document.getElementById('cf-id').value;
  let error;
  if (id) {
    ({ error } = await supabase.from('categories').update(payload).eq('id', id));
  } else {
    payload.created_at = new Date().toISOString();
    ({ error } = await supabase.from('categories').insert(payload));
  }

  btn.disabled = false; btn.textContent = 'שמור';
  if (error) { showToast('שגיאה בשמירה: ' + error.message); return; }
  showToast(id ? 'עודכן בהצלחה ✓' : 'נוסף בהצלחה ✓');
  closeCatModal();
  await loadCategories();
  renderIndicationsTable(indicationsData);
};

window.deleteCat = async function(id) {
  const c = categoriesData.find(x => x.id === id);
  const linkedInds = indicationsData.filter(i => i.category_id === id).length;
  const msg = linkedInds > 0
    ? `למחוק את הקטגוריה "${c?.name_he}"?\n${linkedInds} אבחנה/ות תחזורנה ל"כללי / לא ממוין".`
    : `למחוק את הקטגוריה "${c?.name_he}"?`;
  if (!confirm(msg)) return;
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה'); return; }
  showToast('נמחק ✓');
  await loadCategories();
  await loadIndications();
};

// ── Indications ──
async function loadIndications() {
  const { data, error } = await supabase.from('indications').select('*').order('name_he');
  if (error) { showToast('שגיאה בטעינת אבחנות'); return; }
  indicationsData = data || [];
  renderIndicationsTable(indicationsData);
  populateIndicationSelect();
}

function renderIndicationsTable(inds) {
  const tbody = document.getElementById('indications-tbody');
  if (!inds.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--gray-400);">אין אבחנות מוגדרות</td></tr>';
    return;
  }
  tbody.innerHTML = inds.map(ind => `
    <tr>
      <td>${esc(ind.name_he)}</td>
      <td>${ind.name_en ? esc(ind.name_en) : '—'}</td>
      <td>${catName(ind.category_id)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" data-ind-edit="${esc(ind.id)}">עריכה</button>
          <button class="btn btn-danger btn-sm" data-ind-delete="${esc(ind.id)}">מחק</button>
        </div>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-ind-edit]').forEach(btn =>
    btn.addEventListener('click', () => openIndicationModal(btn.getAttribute('data-ind-edit')))
  );
  tbody.querySelectorAll('[data-ind-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteIndication(btn.getAttribute('data-ind-delete')))
  );
}

function populateIndicationSelect() {
  const options = '<option value="">— בחר אבחנה —</option>' +
    indicationsData.map(ind => `<option value="${esc(ind.id)}">${esc(ind.name_he)}${ind.category_id ? ` (${catName(ind.category_id)})` : ''}</option>`).join('');
  const sel = document.getElementById('rf-indication-id');
  if (sel) { const cur = sel.value; sel.innerHTML = options; if (cur) sel.value = cur; }
}

window.openIndicationModal = function(id) {
  const ind = id ? indicationsData.find(x => x.id === id) : null;
  // Sync category options
  const catOptions = '<option value="">ללא קטגוריה (כללי)</option>' +
    categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name_he)}</option>`).join('');
  document.getElementById('if-category-id').innerHTML = catOptions;

  document.getElementById('indication-modal-title').textContent = ind ? 'עריכת אבחנה' : 'הוסף אבחנה';
  document.getElementById('if-id').value = ind?.id || '';
  document.getElementById('if-name-he').value = ind?.name_he || '';
  document.getElementById('if-name-en').value = ind?.name_en || '';
  document.getElementById('if-category-id').value = ind?.category_id || '';
  document.getElementById('indication-modal-overlay').classList.remove('hidden');
};

window.closeIndicationModal = function() {
  document.getElementById('indication-modal-overlay').classList.add('hidden');
};

window.saveIndication = async function(e) {
  e.preventDefault();
  const payload = {
    name_he: document.getElementById('if-name-he').value.trim(),
    name_en: document.getElementById('if-name-en').value.trim() || null,
    category_id: document.getElementById('if-category-id').value || null,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name_he) { showToast('יש להזין שם אבחנה'); return; }

  const btn = document.getElementById('indication-save-btn');
  btn.disabled = true; btn.textContent = 'שומר...';

  const id = document.getElementById('if-id').value;
  let error;
  if (id) {
    ({ error } = await supabase.from('indications').update(payload).eq('id', id));
  } else {
    payload.created_at = new Date().toISOString();
    ({ error } = await supabase.from('indications').insert(payload));
  }

  btn.disabled = false; btn.textContent = 'שמור';
  if (error) { showToast('שגיאה בשמירה: ' + error.message); return; }
  showToast(id ? 'עודכן בהצלחה ✓' : 'נוסף בהצלחה ✓');
  closeIndicationModal();
  await loadIndications();
  renderRecsTable();
};

window.deleteIndication = async function(id) {
  const ind = indicationsData.find(x => x.id === id);
  const linked = recsData.filter(r => r.indication_id === id);
  if (linked.length > 0) {
    alert(
      `לא ניתן למחוק את האבחנה "${ind?.name_he}" — יש לה ${linked.length} המלצה/ות:\n` +
      linked.map(r => `• ${drugName(r.drug_id)}`).join('\n') +
      '\n\nיש למחוק או להעביר קודם את ההמלצות האלה.'
    );
    return;
  }
  if (!confirm(`למחוק את האבחנה "${ind?.name_he}"?`)) return;
  const { error } = await supabase.from('indications').delete().eq('id', id);
  if (error) { showToast(isFkError(error) ? 'לא ניתן למחוק — האבחנה עדיין בשימוש' : 'שגיאה במחיקה: ' + error.message); return; }
  showToast('נמחק ✓');
  await loadIndications();
};

// ── Shared helpers for the drug database (drugs / products / recommendations) ──
function drugName(drugId) {
  return drugsData.find(d => d.id === drugId)?.name_he || '—';
}

function numOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

function intOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseInt(v, 10);
}

function textOrNull(id) {
  return document.getElementById(id).value.trim() || null;
}

// Postgres foreign-key violation (row still referenced by another table)
function isFkError(error) {
  return error?.code === '23503';
}

function concLabel(p) {
  return `${p.conc_mg} מ"ג / ${p.conc_ml} מ"ל`;
}

function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:30px;color:var(--gray-400);">${text}</td></tr>`;
}

function rowActions(kind, id) {
  return `
    <div style="display:flex;gap:6px;">
      <button class="btn btn-secondary btn-sm" data-${kind}-edit="${esc(id)}">עריכה</button>
      <button class="btn btn-danger btn-sm" data-${kind}-delete="${esc(id)}">מחק</button>
    </div>`;
}

function bindRowActions(tbody, kind, onEdit, onDelete) {
  tbody.querySelectorAll(`[data-${kind}-edit]`).forEach(btn =>
    btn.addEventListener('click', () => onEdit(btn.getAttribute(`data-${kind}-edit`)))
  );
  tbody.querySelectorAll(`[data-${kind}-delete]`).forEach(btn =>
    btn.addEventListener('click', () => onDelete(btn.getAttribute(`data-${kind}-delete`)))
  );
}

function drugOptions(placeholder) {
  return `<option value="">${placeholder}</option>` +
    drugsData.map(d => `<option value="${esc(d.id)}">${esc(d.name_he)}${d.name_en ? ` (${esc(d.name_en)})` : ''}</option>`).join('');
}

// Insert or update one row; returns the Supabase error (or null)
async function saveRow(table, id, payload, btn) {
  btn.disabled = true; btn.textContent = 'שומר...';
  payload.updated_at = new Date().toISOString();
  let error;
  if (id) {
    ({ error } = await supabase.from(table).update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from(table).insert(payload));
  }
  btn.disabled = false; btn.textContent = 'שמור';
  if (error) showToast('שגיאה בשמירה: ' + error.message);
  else showToast(id ? 'עודכן בהצלחה ✓' : 'נוסף בהצלחה ✓');
  return error;
}

// ── Drugs ──
async function loadDrugs() {
  const { data, error } = await supabase.from('drugs').select('*').order('name_he');
  if (error) { showToast('שגיאה בטעינת תרופות'); return; }
  drugsData = data || [];
  renderDrugsTable();
}

function renderDrugsTable() {
  const tbody = document.getElementById('drugs-tbody');
  if (!drugsData.length) { tbody.innerHTML = emptyRow(6, 'אין תרופות עדיין'); return; }
  tbody.innerHTML = drugsData.map(d => `
    <tr>
      <td><strong>${esc(d.name_he)}</strong>${d.search_aliases ? `<div style="font-size:.75rem;color:var(--gray-500);">${esc(d.search_aliases)}</div>` : ''}</td>
      <td dir="ltr" style="text-align:right;">${d.name_en ? esc(d.name_en) : '—'}</td>
      <td>${d.max_daily_dose_mg != null ? `${d.max_daily_dose_mg} מ"ג` : '—'}</td>
      <td>${productsData.filter(p => p.drug_id === d.id).length}</td>
      <td>${recsData.filter(r => r.drug_id === d.id).length}</td>
      <td>${rowActions('drug', d.id)}</td>
    </tr>
  `).join('');
  bindRowActions(tbody, 'drug', openDrugModal, deleteDrug);
}

window.openDrugModal = function(id) {
  const d = id ? drugsData.find(x => x.id === id) : null;
  document.getElementById('drug-modal-title').textContent = d ? 'עריכת תרופה' : 'הוסף תרופה';
  document.getElementById('df-id').value = d?.id || '';
  document.getElementById('df-name-he').value = d?.name_he || '';
  document.getElementById('df-name-en').value = d?.name_en || '';
  document.getElementById('df-aliases').value = d?.search_aliases || '';
  document.getElementById('df-max-daily').value = d?.max_daily_dose_mg ?? '';
  document.getElementById('drug-modal-overlay').classList.remove('hidden');
};

window.closeDrugModal = function() {
  document.getElementById('drug-modal-overlay').classList.add('hidden');
};

window.saveDrug = async function(e) {
  e.preventDefault();
  const payload = {
    name_he: document.getElementById('df-name-he').value.trim(),
    name_en: textOrNull('df-name-en'),
    search_aliases: textOrNull('df-aliases'),
    max_daily_dose_mg: numOrNull('df-max-daily'),
  };
  if (!payload.name_he) { showToast('יש להזין שם תרופה'); return; }
  if (payload.max_daily_dose_mg != null && !(payload.max_daily_dose_mg > 0)) {
    showToast('מקסימום יומי חייב להיות גדול מאפס (או ריק)'); return;
  }
  const id = document.getElementById('df-id').value;
  const error = await saveRow('drugs', id, payload, document.getElementById('drug-save-btn'));
  if (error) return;
  closeDrugModal();
  await loadDrugs();
  renderProductsTable();
  renderRecsTable();
};

async function deleteDrug(id) {
  const d = drugsData.find(x => x.id === id);
  const nProducts = productsData.filter(p => p.drug_id === id).length;
  const nRecs = recsData.filter(r => r.drug_id === id).length;
  if (nProducts || nRecs) {
    alert(`לא ניתן למחוק את "${d?.name_he}" — יש לה ${nProducts} תכשיר/ים ו-${nRecs} המלצה/ות.\nיש למחוק אותם קודם.`);
    return;
  }
  if (!confirm(`למחוק את התרופה "${d?.name_he}"?`)) return;
  const { error } = await supabase.from('drugs').delete().eq('id', id);
  if (error) { showToast(isFkError(error) ? 'לא ניתן למחוק — התרופה עדיין בשימוש' : 'שגיאה במחיקה: ' + error.message); return; }
  showToast('נמחק ✓');
  await loadDrugs();
}

// ── Products ──
async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('brand_name');
  if (error) { showToast('שגיאה בטעינת תכשירים'); return; }
  productsData = data || [];
  renderProductsTable();
}

// All the names a product can be found by: its own (he/en/aliases) and its drug's
function productSearchText(p) {
  const d = drugsData.find(x => x.id === p.drug_id);
  return [p.brand_name, p.brand_name_en, p.search_aliases, d?.name_he, d?.name_en, d?.search_aliases]
    .filter(Boolean).join(' ').toLowerCase();
}

window.renderProductsTable = function() {
  const tbody = document.getElementById('products-tbody');
  if (!productsData.length) { tbody.innerHTML = emptyRow(5, 'אין תכשירים עדיין'); return; }
  const q = document.getElementById('product-filter').value.trim().toLowerCase();
  const rows = productsData.filter(p => !q || productSearchText(p).includes(q))
    .sort((a, b) => drugName(a.drug_id).localeCompare(drugName(b.drug_id), 'he'));
  if (!rows.length) { tbody.innerHTML = emptyRow(5, 'אין תוצאות לחיפוש'); return; }
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td>${esc(drugName(p.drug_id))}</td>
      <td><strong>${esc(p.brand_name)}</strong>${p.brand_name_en ? `<div dir="ltr" style="font-size:.75rem;color:var(--gray-500);text-align:right;">${esc(p.brand_name_en)}</div>` : ''}${p.search_aliases ? `<div style="font-size:.75rem;color:var(--gray-400);">${esc(p.search_aliases)}</div>` : ''}</td>
      <td>${concLabel(p)}<div style="font-size:.75rem;color:var(--gray-500);">= ${round2(p.conc_mg / p.conc_ml)} מ"ג/מ"ל</div></td>
      <td style="font-size:.8rem;">${p.parent_note ? esc(p.parent_note) : '—'}</td>
      <td>${rowActions('product', p.id)}</td>
    </tr>
  `).join('');
  bindRowActions(tbody, 'product', openProductModal, deleteProduct);
};

function updateProductConcResult() {
  const mg = numOrNull('pf-conc-mg');
  const ml = numOrNull('pf-conc-ml');
  document.getElementById('pf-conc-result').textContent =
    mg > 0 && ml > 0 ? `= ${round2(mg / ml)} מ"ג למ"ל` : '';
}
document.getElementById('pf-conc-mg').addEventListener('input', updateProductConcResult);
document.getElementById('pf-conc-ml').addEventListener('input', updateProductConcResult);

window.openProductModal = function(id) {
  if (!drugsData.length) { showToast('יש להוסיף קודם תרופה בלשונית "תרופות"'); return; }
  const p = id ? productsData.find(x => x.id === id) : null;
  document.getElementById('product-modal-title').textContent = p ? 'עריכת תכשיר' : 'הוסף תכשיר';
  document.getElementById('pf-drug-id').innerHTML = drugOptions('— בחר תרופה —');
  document.getElementById('pf-id').value = p?.id || '';
  document.getElementById('pf-drug-id').value = p?.drug_id || '';
  document.getElementById('pf-brand').value = p?.brand_name || '';
  document.getElementById('pf-brand-en').value = p?.brand_name_en || '';
  document.getElementById('pf-aliases').value = p?.search_aliases || '';
  document.getElementById('pf-conc-mg').value = p?.conc_mg ?? '';
  document.getElementById('pf-conc-ml').value = p?.conc_ml ?? '';
  document.getElementById('pf-parent-note').value = p?.parent_note || '';
  updateProductConcResult();
  document.getElementById('product-modal-overlay').classList.remove('hidden');
};

window.closeProductModal = function() {
  document.getElementById('product-modal-overlay').classList.add('hidden');
};

window.saveProduct = async function(e) {
  e.preventDefault();
  const payload = {
    drug_id: document.getElementById('pf-drug-id').value || null,
    brand_name: document.getElementById('pf-brand').value.trim(),
    brand_name_en: textOrNull('pf-brand-en'),
    search_aliases: textOrNull('pf-aliases'),
    conc_mg: numOrNull('pf-conc-mg'),
    conc_ml: numOrNull('pf-conc-ml'),
    parent_note: textOrNull('pf-parent-note'),
  };
  if (!payload.drug_id) { showToast('יש לבחור תרופה'); return; }
  if (!payload.brand_name) { showToast('יש להזין שם מסחרי'); return; }
  if (!(payload.conc_mg > 0) || !(payload.conc_ml > 0)) { showToast('יש להזין ריכוז תקין (מ"ג ומ"ל)'); return; }
  const id = document.getElementById('pf-id').value;
  const error = await saveRow('products', id, payload, document.getElementById('product-save-btn'));
  if (error) return;
  closeProductModal();
  await loadProducts();
  renderDrugsTable();
};

async function deleteProduct(id) {
  const p = productsData.find(x => x.id === id);
  if (!confirm(`למחוק את התכשיר "${p?.brand_name}"?`)) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה: ' + error.message); return; }
  showToast('נמחק ✓');
  await loadProducts();
  renderDrugsTable();
}

// ── Recommendations ──
async function loadRecs() {
  const { data, error } = await supabase.from('recommendations').select('*');
  if (error) { showToast('שגיאה בטעינת המלצות'); return; }
  recsData = data || [];
  renderRecsTable();
  renderDrugsTable();
}

const LINE_ORDER = { first: 0, alternative: 1, allergy: 2 };

window.renderRecsTable = function() {
  const tbody = document.getElementById('recs-tbody');
  const q = document.getElementById('rec-filter').value.trim().toLowerCase();
  const st = document.getElementById('rec-status-filter').value;
  const rows = recsData
    .filter(r => !st || r.status === st)
    .filter(r => {
      if (!q) return true;
      const d = drugsData.find(x => x.id === r.drug_id);
      const hay = [indicationsData.find(x => x.id === r.indication_id)?.name_he,
        d?.name_he, d?.name_en, d?.search_aliases,
        ...productsData.filter(p => p.drug_id === r.drug_id).map(productSearchText)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) =>
      (indicationsData.find(x => x.id === a.indication_id)?.name_he || '').localeCompare(
        indicationsData.find(x => x.id === b.indication_id)?.name_he || '', 'he') ||
      LINE_ORDER[a.treatment_line] - LINE_ORDER[b.treatment_line] ||
      a.sort_order - b.sort_order);
  if (!rows.length) {
    tbody.innerHTML = emptyRow(8, recsData.length ? 'אין תוצאות לסינון' : 'אין המלצות עדיין');
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${indicationName(r.indication_id)}</td>
      <td>${LINE_LABELS[r.treatment_line] || '—'}</td>
      <td><strong>${esc(drugName(r.drug_id))}</strong></td>
      <td><bdi dir="ltr">${r.dose_min_mg_per_kg_day}${r.dose_max_mg_per_kg_day != null ? '–' + r.dose_max_mg_per_kg_day : ''}</bdi></td>
      <td>${r.doses_per_day}</td>
      <td>${r.duration_days ? `${r.duration_days} ימים` : '—'}</td>
      <td>${r.status === 'verified'
        ? '<span class="badge" style="background:var(--success-light);color:var(--success);">✅ מאומת</span>'
        : '<span class="badge" style="background:var(--warning-light);color:var(--warning);">📝 טיוטה</span>'}</td>
      <td>${rowActions('rec', r.id)}</td>
    </tr>
  `).join('');
  bindRowActions(tbody, 'rec', openRecModal, deleteRec);
};

window.showRecDrugInfo = function() {
  const d = drugsData.find(x => x.id === document.getElementById('rf-drug-id').value);
  const info = document.getElementById('rf-drug-info');
  if (!d) { info.textContent = ''; return; }
  const prods = productsData.filter(p => p.drug_id === d.id);
  info.textContent =
    `מקסימום יומי: ${d.max_daily_dose_mg != null ? d.max_daily_dose_mg + ' מ"ג' : 'לא הוגדר'} · ` +
    (prods.length ? `תכשירים: ${prods.map(p => `${p.brand_name} (${concLabel(p)})`).join(', ')}` : '⚠️ אין עדיין תכשירים לתרופה זו');
};

window.openRecModal = function(id) {
  if (!indicationsData.length || !drugsData.length) {
    showToast('יש להוסיף קודם אבחנה ותרופה'); return;
  }
  const r = id ? recsData.find(x => x.id === id) : null;
  populateIndicationSelect();
  document.getElementById('rf-drug-id').innerHTML = drugOptions('— בחר תרופה —');
  document.getElementById('rec-modal-title').textContent = r ? 'עריכת המלצה' : 'הוסף המלצה';
  document.getElementById('rf-id').value = r?.id || '';
  document.getElementById('rf-indication-id').value = r?.indication_id || '';
  document.getElementById('rf-drug-id').value = r?.drug_id || '';
  document.getElementById('rf-line').value = r?.treatment_line || 'first';
  document.getElementById('rf-dose-min').value = r?.dose_min_mg_per_kg_day ?? '';
  document.getElementById('rf-dose-max').value = r?.dose_max_mg_per_kg_day ?? '';
  document.getElementById('rf-doses').value = r?.doses_per_day ?? '';
  document.getElementById('rf-duration').value = r?.duration_days ?? '';
  document.getElementById('rf-doctor-note').value = r?.doctor_note || '';
  document.getElementById('rf-parent-note').value = r?.parent_note || '';
  document.getElementById('rf-source').value = r?.source || '';
  document.getElementById('rf-status').value = r?.status || 'draft';
  document.getElementById('rf-sort').value = r?.sort_order ?? 0;
  document.getElementById('rec-preview-area').innerHTML = '';
  document.getElementById('rec-preview-weight').value = '';
  showRecDrugInfo();
  document.getElementById('rec-modal-overlay').classList.remove('hidden');
};

window.closeRecModal = function() {
  document.getElementById('rec-modal-overlay').classList.add('hidden');
};

window.saveRec = async function(e) {
  e.preventDefault();
  const payload = {
    indication_id: document.getElementById('rf-indication-id').value || null,
    drug_id: document.getElementById('rf-drug-id').value || null,
    treatment_line: document.getElementById('rf-line').value,
    dose_min_mg_per_kg_day: numOrNull('rf-dose-min'),
    dose_max_mg_per_kg_day: numOrNull('rf-dose-max'),
    doses_per_day: intOrNull('rf-doses'),
    duration_days: intOrNull('rf-duration'),
    doctor_note: textOrNull('rf-doctor-note'),
    parent_note: textOrNull('rf-parent-note'),
    source: textOrNull('rf-source'),
    status: document.getElementById('rf-status').value,
    sort_order: intOrNull('rf-sort') ?? 0,
  };
  if (!payload.indication_id) { showToast('יש לבחור אבחנה'); return; }
  if (!payload.drug_id) { showToast('יש לבחור תרופה'); return; }
  if (!(payload.dose_min_mg_per_kg_day > 0)) { showToast('מינון חייב להיות גדול מאפס'); return; }
  if (payload.dose_max_mg_per_kg_day != null && payload.dose_max_mg_per_kg_day < payload.dose_min_mg_per_kg_day) {
    showToast('שגיאה: "עד" קטן מהמינון'); return;
  }
  if (!(payload.doses_per_day >= 1 && payload.doses_per_day <= 6)) { showToast('מנות ביום: בין 1 ל-6'); return; }
  if (payload.duration_days != null && !(payload.duration_days > 0)) {
    showToast('משך טיפול חייב להיות גדול מאפס (או ריק)'); return;
  }
  if (payload.status === 'verified' && !productsData.some(p => p.drug_id === payload.drug_id)) {
    if (!confirm('לתרופה זו אין עדיין תכשיר (ריכוז). לסמן את ההמלצה כמאומתת בכל זאת?')) return;
  }
  const id = document.getElementById('rf-id').value;
  const error = await saveRow('recommendations', id, payload, document.getElementById('rec-save-btn'));
  if (error) return;
  closeRecModal();
  await loadRecs();
};

async function deleteRec(id) {
  const r = recsData.find(x => x.id === id);
  const indHe = indicationsData.find(x => x.id === r?.indication_id)?.name_he || '';
  if (!confirm(`למחוק את ההמלצה ${drugName(r?.drug_id)}${indHe ? ` (${indHe})` : ''}?`)) return;
  const { error } = await supabase.from('recommendations').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה: ' + error.message); return; }
  showToast('נמחק ✓');
  await loadRecs();
}

// Preview: same calculateDose() as the calculator, once per product of the chosen drug
window.previewRec = function() {
  const weight = numOrNull('rec-preview-weight');
  if (!(weight > 0)) { showToast('יש להזין משקל לתצוגה מקדימה'); return; }
  const drugId = document.getElementById('rf-drug-id').value;
  const doseMin = numOrNull('rf-dose-min');
  const doseMax = numOrNull('rf-dose-max');
  const dpd = intOrNull('rf-doses');
  if (!drugId || !(doseMin > 0) || !(dpd >= 1)) { showToast('יש לבחור תרופה ולמלא מינון ומנות ביום'); return; }
  const drug = drugsData.find(x => x.id === drugId);
  const prods = productsData.filter(p => p.drug_id === drugId);
  const area = document.getElementById('rec-preview-area');
  if (!prods.length) {
    area.innerHTML = `<div style="background:var(--warning-light);border-radius:8px;padding:14px;margin:12px 0;font-size:.9rem;">⚠️ אין תכשירים לתרופה זו — אי אפשר לחשב נפח.</div>`;
    return;
  }
  const lines = prods.map(p => {
    const calc = calculateDose({
      weight, doseMin, doseMax, concentration: p.conc_mg / p.conc_ml, dosesPerDay: dpd,
      maxDailyDoseMg: drug?.max_daily_dose_mg ?? null, adultMaxDailyDoseMg: null,
    });
    if (calc.exceeded) {
      return `<li><strong>${esc(p.brand_name)}</strong>: <span style="color:var(--warning);">⚠️ חריגה מהמקסימום היומי (${calc.dailyMax} מ"ג &gt; ${drug.max_daily_dose_mg} מ"ג)</span></li>`;
    }
    const vol = calc.hasRange && calc.volMin !== calc.volMax ? `${calc.volMin}–${calc.volMax}` : `${calc.volMin}`;
    const mg = calc.hasRange && calc.perDoseMin !== calc.perDoseMax ? `${calc.perDoseMin}–${calc.perDoseMax}` : `${calc.perDoseMin}`;
    return `<li><strong>${esc(p.brand_name)}</strong>: <strong style="color:var(--primary)"><bdi dir="ltr">${vol}</bdi> מ"ל</strong> (<bdi dir="ltr">${mg}</bdi> מ"ג) · ${dpd} פעמים ביום</li>`;
  });
  area.innerHTML = `
    <div style="background:var(--success-light);border-radius:8px;padding:14px;margin:12px 0;font-size:.9rem;">
      <strong>תצוגה מקדימה (${weight} ק"ג):</strong>
      <ul style="margin:6px 18px 0 0;padding:0;">${lines.join('')}</ul>
    </div>`;
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

init();
