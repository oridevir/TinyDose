// admin.js
import { supabase, round2, esc, calculateDose } from './app.js';

let medsData = [];
let indicationsData = [];
let categoriesData = [];

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
  await Promise.all([loadCategories(), loadIndications()]);
  loadMeds();
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
  ['meds', 'indications', 'cats'].forEach(t => {
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

function indicationCatName(indicationId) {
  const ind = indicationsData.find(x => x.id === indicationId);
  return ind?.category_id ? catName(ind.category_id) : '—';
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

  ['f-category-id', 'if-category-id', 'ni-category-id', 'cf-id'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'SELECT' && id !== 'cf-id') {
      const cur = el.value;
      el.innerHTML = options;
      if (cur) el.value = cur;
    }
  });

  // f-category-id for med modal (category of the med itself — kept for now,
  // but category is on indication not med after migration)
  const medCatSel = document.getElementById('f-category-id');
  if (medCatSel) { const cur = medCatSel.value; medCatSel.innerHTML = options; if (cur) medCatSel.value = cur; }
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
  renderTable(medsData);
};

window.deleteCat = async function(id) {
  const c = categoriesData.find(x => x.id === id);
  const linkedInds = indicationsData.filter(i => i.category_id === id).length;
  const msg = linkedInds > 0
    ? `למחוק את הקטגוריה "${c?.name_he}"?\n${linkedInds} אינדיקציה/ות תחזורנה ל"כללי / לא ממוין".`
    : `למחוק את הקטגוריה "${c?.name_he}"?`;
  if (!confirm(msg)) return;
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה'); return; }
  showToast('נמחק ✓');
  await loadCategories();
  await loadIndications();
  renderTable(medsData);
};

// ── Indications ──
async function loadIndications() {
  const { data, error } = await supabase.from('indications').select('*').order('name_he');
  if (error) { showToast('שגיאה בטעינת אינדיקציות'); return; }
  indicationsData = data || [];
  renderIndicationsTable(indicationsData);
  populateIndicationSelect();
}

function renderIndicationsTable(inds) {
  const tbody = document.getElementById('indications-tbody');
  if (!inds.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--gray-400);">אין אינדיקציות מוגדרות</td></tr>';
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
  const options = '<option value="">— בחר אינדיקציה —</option>' +
    indicationsData.map(ind => `<option value="${esc(ind.id)}">${esc(ind.name_he)}${ind.category_id ? ` (${catName(ind.category_id)})` : ''}</option>`).join('');
  const sel = document.getElementById('f-indication-id');
  if (sel) { const cur = sel.value; sel.innerHTML = options; if (cur) sel.value = cur; }
}

window.openIndicationModal = function(id) {
  const ind = id ? indicationsData.find(x => x.id === id) : null;
  // Sync category options
  const catOptions = '<option value="">ללא קטגוריה (כללי)</option>' +
    categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name_he)}</option>`).join('');
  document.getElementById('if-category-id').innerHTML = catOptions;

  document.getElementById('indication-modal-title').textContent = ind ? 'עריכת אינדיקציה' : 'הוסף אינדיקציה';
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
  if (!payload.name_he) { showToast('יש להזין שם אינדיקציה'); return; }

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
  renderTable(medsData);
};

window.deleteIndication = async function(id) {
  const ind = indicationsData.find(x => x.id === id);
  const linkedMeds = medsData.filter(m => m.indication_id === id);
  if (linkedMeds.length > 0) {
    alert(
      `לא ניתן למחוק את האינדיקציה "${ind?.name_he}" — יש לה ${linkedMeds.length} תרופה/ות משויכות:\n` +
      linkedMeds.map(m => `• ${m.drug_name}`).join('\n') +
      '\n\nשנה תחילה את שיוך התרופות הללו לאינדיקציה אחרת.'
    );
    return;
  }
  if (!confirm(`למחוק את האינדיקציה "${ind?.name_he}"?`)) return;
  const { error } = await supabase.from('indications').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה: ' + error.message); return; }
  showToast('נמחק ✓');
  await loadIndications();
};

// ── Inline create indication (within medication modal) ──
window.toggleNewIndicationForm = function() {
  const form = document.getElementById('new-indication-form');
  const isHidden = form.classList.toggle('hidden');
  if (!isHidden) {
    // populate category select with current data
    const catOptions = '<option value="">ללא קטגוריה (כללי)</option>' +
      categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name_he)}</option>`).join('');
    document.getElementById('ni-category-id').innerHTML = catOptions;
    document.getElementById('ni-name-he').value = '';
    document.getElementById('ni-name-en').value = '';
    document.getElementById('ni-name-he').focus();
  }
};

window.saveNewIndication = async function() {
  const nameHe = document.getElementById('ni-name-he').value.trim();
  if (!nameHe) { showToast('יש להזין שם אינדיקציה'); return; }

  const payload = {
    name_he: nameHe,
    name_en: document.getElementById('ni-name-en').value.trim() || null,
    category_id: document.getElementById('ni-category-id').value || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('indications').insert(payload).select().single();
  if (error) { showToast('שגיאה ביצירת אינדיקציה: ' + error.message); return; }

  showToast('אינדיקציה נוצרה ✓');
  await loadIndications();

  // Select the newly created indication
  document.getElementById('f-indication-id').value = data.id;
  document.getElementById('new-indication-form').classList.add('hidden');
};

// ── Medications table ──
async function loadMeds() {
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .order('indication_id');
  if (error) { showToast('שגיאה בטעינה'); return; }
  medsData = data || [];
  renderTable(medsData);
}

function renderTable(meds) {
  const tbody = document.getElementById('meds-tbody');
  if (!meds.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--gray-400);">אין נתונים</td></tr>';
    return;
  }
  tbody.innerHTML = meds.map(m => `
    <tr>
      <td>${indicationName(m.indication_id)}</td>
      <td>
        <strong>${esc(m.drug_name)}</strong>
        ${m.concentration_label ? `<div style="font-size:.75rem;color:var(--gray-500);">${esc(m.concentration_label)}</div>` : ''}
      </td>
      <td>${m.dose_min_mg_per_kg_day}${m.dose_max_mg_per_kg_day ? '–' + m.dose_max_mg_per_kg_day : ''}</td>
      <td>${m.concentration_mg_per_ml} מ"ג/מ"ל</td>
      <td>${m.doses_per_day}${m.duration_days ? ` · ${m.duration_days}י׳` : ''}</td>
      <td>${m.max_daily_dose_mg} מ"ג</td>
      <td>${indicationCatName(m.indication_id)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" data-edit="${esc(m.id)}">עריכה</button>
          <button class="btn btn-danger btn-sm" data-delete="${esc(m.id)}">מחק</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.getAttribute('data-edit')))
  );
  tbody.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteMed(btn.getAttribute('data-delete')))
  );
}

window.filterTable = function() {
  const q = document.getElementById('filter-input').value.toLowerCase();
  const filtered = medsData.filter(m => {
    const indHe = indicationsData.find(x => x.id === m.indication_id)?.name_he || '';
    return m.drug_name.toLowerCase().includes(q) || indHe.includes(q);
  });
  renderTable(filtered);
};

// ── Medication modal ──
window.openModal = function(id) {
  const m = id ? medsData.find(x => x.id === id) : null;
  populateIndicationSelect();

  document.getElementById('modal-title').textContent = m ? 'עריכת תרופה' : 'הוסף תרופה';
  document.getElementById('f-id').value = m?.id || '';
  document.getElementById('f-indication-id').value = m?.indication_id || '';
  document.getElementById('f-drug').value = m?.drug_name || '';
  document.getElementById('f-concentration-label').value = m?.concentration_label || '';
  document.getElementById('f-dose-min').value = m?.dose_min_mg_per_kg_day || '';
  document.getElementById('f-dose-max').value = m?.dose_max_mg_per_kg_day || '';
  document.getElementById('f-concentration').value = m?.concentration_mg_per_ml || '';
  document.getElementById('f-doses-per-day').value = m?.doses_per_day || '';
  document.getElementById('f-duration-days').value = m?.duration_days || '';
  document.getElementById('f-max-daily').value = m?.max_daily_dose_mg || '';
  document.getElementById('f-adult-max-daily').value = m?.adult_max_daily_dose_mg || '';
  document.getElementById('f-adult-note').value = m?.adult_dose_note || '';
  document.getElementById('f-notes').value = m?.notes || '';
  document.getElementById('new-indication-form').classList.add('hidden');
  document.getElementById('preview-area').innerHTML = '';
  document.getElementById('preview-weight').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('modal-overlay').classList.add('hidden');
};

// ── Save medication ──
window.saveMed = async function(e) {
  e.preventDefault();

  const payload = {
    indication_id: document.getElementById('f-indication-id').value || null,
    drug_name: document.getElementById('f-drug').value.trim(),
    concentration_label: document.getElementById('f-concentration-label').value.trim() || null,
    dose_min_mg_per_kg_day: parseFloat(document.getElementById('f-dose-min').value),
    dose_max_mg_per_kg_day: document.getElementById('f-dose-max').value ? parseFloat(document.getElementById('f-dose-max').value) : null,
    concentration_mg_per_ml: parseFloat(document.getElementById('f-concentration').value),
    doses_per_day: parseInt(document.getElementById('f-doses-per-day').value),
    duration_days: document.getElementById('f-duration-days').value ? parseInt(document.getElementById('f-duration-days').value) : null,
    max_daily_dose_mg: parseFloat(document.getElementById('f-max-daily').value),
    adult_max_daily_dose_mg: document.getElementById('f-adult-max-daily').value ? parseFloat(document.getElementById('f-adult-max-daily').value) : null,
    adult_dose_note: document.getElementById('f-adult-note').value.trim() || null,
    notes: document.getElementById('f-notes').value.trim() || null,
    updated_at: new Date().toISOString(),
  };

  // ── Validation ──
  if (!payload.indication_id) { showToast('יש לבחור אינדיקציה'); return; }
  if (!payload.drug_name) { showToast('יש להזין שם תרופה'); return; }
  if (!(payload.dose_min_mg_per_kg_day > 0)) { showToast('מינון מינימום חייב להיות גדול מאפס'); return; }
  if (payload.dose_max_mg_per_kg_day != null && payload.dose_max_mg_per_kg_day < payload.dose_min_mg_per_kg_day) {
    showToast('שגיאה: מינון מקסימום קטן ממינון מינימום'); return;
  }
  if (!(payload.concentration_mg_per_ml > 0)) { showToast('ריכוז חייב להיות גדול מאפס'); return; }
  if (!(payload.doses_per_day >= 1)) { showToast('מספר מנות ביום חייב להיות לפחות 1'); return; }
  if (payload.duration_days != null && !(payload.duration_days > 0)) {
    showToast('משך טיפול חייב להיות גדול מאפס (או ריק)'); return;
  }
  if (!(payload.max_daily_dose_mg > 0)) { showToast('יש להזין מינון מקסימלי יומי'); return; }
  if (payload.adult_max_daily_dose_mg != null && !(payload.adult_max_daily_dose_mg > 0)) {
    showToast('מינון מקסימלי למבוגר חייב להיות גדול מאפס (או ריק)'); return;
  }
  const highEnd = payload.dose_max_mg_per_kg_day ?? payload.dose_min_mg_per_kg_day;
  if (highEnd * 3 > payload.max_daily_dose_mg) {
    const proceed = confirm(
      `שים לב: עבור ילד במשקל 3 ק"ג, המינון לפי משקל (${round2(highEnd * 3)} מ"ג) כבר חורג מהמקסימום היומי שהזנת (${payload.max_daily_dose_mg} מ"ג).\n` +
      `כך כל המטופלים יקבלו "חריגה ממינון". האם זה מכוון? (אישור = שמור בכל זאת)`
    );
    if (!proceed) return;
  }
  if (payload.adult_max_daily_dose_mg != null && payload.adult_max_daily_dose_mg < payload.max_daily_dose_mg) {
    const proceed = confirm(
      `שים לב: המינון המקסימלי למבוגר (${payload.adult_max_daily_dose_mg} מ"ג) נמוך מהמקסימום לילד (${payload.max_daily_dose_mg} מ"ג). ייתכן שזו טעות הקלדה. להמשיך בכל זאת?`
    );
    if (!proceed) return;
  }

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'שומר...';

  const id = document.getElementById('f-id').value;
  let error;
  if (id) {
    ({ error } = await supabase.from('medications').update(payload).eq('id', id));
  } else {
    payload.created_at = new Date().toISOString();
    ({ error } = await supabase.from('medications').insert(payload));
  }

  btn.disabled = false; btn.textContent = 'שמור';
  if (error) { showToast('שגיאה בשמירה: ' + error.message); return; }
  showToast(id ? 'עודכן בהצלחה ✓' : 'נוסף בהצלחה ✓');
  closeModal();
  loadMeds();
};

// ── Delete medication ──
window.deleteMed = async function(id) {
  const m = medsData.find(x => x.id === id);
  const indHe = indicationsData.find(x => x.id === m?.indication_id)?.name_he || '';
  if (!confirm(`למחוק את ${m?.drug_name}${indHe ? ` (${indHe})` : ''}?`)) return;
  const { error } = await supabase.from('medications').delete().eq('id', id);
  if (error) { showToast('שגיאה במחיקה'); return; }
  showToast('נמחק ✓');
  loadMeds();
};

// ── Preview calc ──
window.previewCalc = function() {
  const weight = parseFloat(document.getElementById('preview-weight').value);
  if (!weight || weight <= 0) { showToast('יש להזין משקל לתצוגה מקדימה'); return; }

  const doseMin = parseFloat(document.getElementById('f-dose-min').value);
  const doseMax = document.getElementById('f-dose-max').value ? parseFloat(document.getElementById('f-dose-max').value) : null;
  const conc = parseFloat(document.getElementById('f-concentration').value);
  const dpd = parseInt(document.getElementById('f-doses-per-day').value);
  const durationDays = document.getElementById('f-duration-days').value ? parseInt(document.getElementById('f-duration-days').value) : null;
  const maxDaily = parseFloat(document.getElementById('f-max-daily').value);
  const adultMaxDaily = document.getElementById('f-adult-max-daily').value ? parseFloat(document.getElementById('f-adult-max-daily').value) : null;

  if (!doseMin || !conc || !dpd || !maxDaily) { showToast('יש למלא את שדות המינון קודם'); return; }

  const calc = calculateDose({
    weight, doseMin, doseMax, concentration: conc, dosesPerDay: dpd,
    maxDailyDoseMg: maxDaily, adultMaxDailyDoseMg: adultMaxDaily,
  });

  if (calc.exceeded) {
    let html = `
      <div style="background:var(--warning-light);border:1.5px solid #fde68a;border-radius:8px;padding:14px;margin:12px 0;font-size:.9rem;">
        <strong>תצוגה מקדימה (${weight} ק"ג):</strong><br>
        <span style="color:var(--warning);">⚠️ המינון לפי משקל (${calc.dailyMax} מ"ג) חורג מהמקסימום היומי (${maxDaily} מ"ג).</span><br>`;
    if (calc.adultVolMl != null) {
      html += `יוצג למשתמש: תן <strong style="color:var(--primary)">${calc.adultVolMl} מ"ל</strong> (מינון מבוגרים) — ${dpd} פעמים ביום.`;
    } else {
      html += `עבור משקל זה תוצג הודעה כללית בלבד (לא הוזן מינון מקסימלי למבוגר).`;
    }
    html += `</div>`;
    document.getElementById('preview-area').innerHTML = html;
    return;
  }

  const volStr = calc.hasRange && calc.volMin !== calc.volMax ? `${calc.volMin}–${calc.volMax} מ"ל` : `${calc.volMin} מ"ל`;
  const perDoseStr = calc.hasRange && calc.perDoseMin !== calc.perDoseMax ? `${calc.perDoseMin}–${calc.perDoseMax} מ"ג` : `${calc.perDoseMin} מ"ג`;
  const dailyStr = calc.hasRange && calc.dailyMin !== calc.dailyMax ? `${calc.dailyMin}–${calc.dailyMax}` : `${calc.dailyMin}`;

  document.getElementById('preview-area').innerHTML = `
    <div style="background:var(--success-light);border:1.5px solid #bbf7d0;border-radius:8px;padding:14px;margin:12px 0;font-size:.9rem;">
      <strong>תצוגה מקדימה (${weight} ק"ג):</strong><br>
      מינון יומי: ${dailyStr} מ"ג<br>
      לנטילה: ${perDoseStr} → <strong style="color:var(--primary)">${volStr}</strong> — ${dpd} פעמים ביום${durationDays ? ` · ${durationDays} ימים` : ''}
    </div>
  `;
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

init();
