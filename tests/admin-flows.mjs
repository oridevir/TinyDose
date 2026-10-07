// Admin screen flows (admin.html) on phone and desktop, against an in-memory mock of
// Supabase — the real database is never touched. Also smoke-tests the calculator and
// the admin-old.html backup. Run:  node tests/admin-flows.mjs   (see tests/README.md)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.resolve(HERE, '..');
// Playwright: a local install, or the cloud environment's global one
let pw;
try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node-tools/node_modules/playwright/index.js')).default; }
const { chromium } = pw;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/json'};
// cdn.jsdelivr.net may be blocked in test environments: serve a local supabase-js copy
// (npm install --prefix tests @supabase/supabase-js@2  — tests/node_modules is git-ignored)
const UMD = process.env.SUPABASE_UMD || path.join(HERE, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
if (!fs.existsSync(UMD)) { console.error('Missing supabase-js copy. Run: npm install --prefix tests @supabase/supabase-js@2'); process.exit(2); }
const umd = fs.readFileSync(UMD, 'utf8');
const now = new Date().toISOString();
function freshDb(){ return {
  categories:[{id:'c1',name_he:'אף-אוזן-גרון',name_en:'ENT',sort_order:0},{id:'c2',name_he:'רקמות רכות',sort_order:1}],
  indications:[{id:'i1',name_he:'אוטיטיס מדיה',category_id:'c1'},{id:'i2',name_he:'טונסיליטיס',category_id:'c1'},{id:'i3',name_he:'אימפטיגו',category_id:'c2'}],
  drugs:[{id:'d1',name_he:'אמוקסיצילין',name_en:'Amoxicillin',max_daily_dose_mg:4000,updated_at:now},{id:'d2',name_he:'צפלקסין',name_en:'Cephalexin',max_daily_dose_mg:null,updated_at:now}],
  products:[{id:'p1',drug_id:'d1',brand_name:'מוקסיפן 250',conc_mg:250,conc_ml:5,updated_at:now}],
  recommendations:[{id:'r1',indication_id:'i1',drug_id:'d1',treatment_line:'first',dose_min_mg_per_kg_day:80,dose_max_mg_per_kg_day:90,doses_per_day:2,duration_days:10,status:'draft',sort_order:0,source:'',updated_at:now}],
};}
let db, n=0;
async function mkCtx(b, vp){
  const ctx = await b.newContext({viewport:vp});
  await ctx.route('https://tinydose.test/**', r=>{ const p=new URL(r.request().url()).pathname; const f=path.join(ROOT,p); if(!fs.existsSync(f)) return r.fulfill({status:404,body:''}); r.fulfill({status:200,contentType:MIME[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)}); });
  await ctx.route('https://cdn.jsdelivr.net/**', r=>r.fulfill({status:200,contentType:'text/javascript',body:'var self=globalThis;'+umd+'\nexport const createClient = supabase.createClient;'}));
  await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('https://orvizmgloskvqfsralxc.supabase.co/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const m = url.pathname.match(/\/rest\/v1\/(\w+)/);
    if (!m) return route.fulfill({status:200, contentType:'application/json', body:'{}'});
    const t=m[1], method=req.method(); const id=(url.searchParams.get('id')||'').replace('eq.','');
    const one = (row)=>route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(row)});
    if (method==='GET') return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(db[t])});
    if (method==='POST') { const row={...JSON.parse(req.postData()), id:t[0]+'n'+(++n)}; db[t].push(row); return one(row); }
    if (method==='PATCH') { const row=db[t].find(r=>r.id===id); Object.assign(row, JSON.parse(req.postData())); return one(row); }
    if (method==='DELETE') { const used = (t==='drugs' && (db.products.some(p=>p.drug_id===id)||db.recommendations.some(r=>r.drug_id===id))); if (used) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23503',message:'fk'})}); db[t]=db[t].filter(r=>r.id!==id); return route.fulfill({status:204,body:''}); }
  });
  const fake = { access_token:'x', refresh_token:'y', token_type:'bearer', expires_in:3600, expires_at: Math.floor(Date.now()/1000)+3600, user:{id:'u1',email:'t@e.com',aud:'authenticated',role:'authenticated'} };
  await ctx.addInitScript(s => localStorage.setItem('sb-orvizmgloskvqfsralxc-auth-token', s), JSON.stringify(fake));
  return ctx;
}
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g,' ').trim();
const b = await chromium.launch(); const errs=[];
// ── PHONE ──
db = freshDb();
let ctx = await mkCtx(b, {width:390,height:844}); let p = await ctx.newPage(); p.on('pageerror',e=>errs.push('phone '+e.message));
await p.goto('https://tinydose.test/admin.html'); await p.waitForSelector('#home-body');
console.log('HOME attn:', await txt(p,'.attn'));
await p.click('#go-issues'); console.log('ISSUES:', await txt(p,'#screen .stack')); await p.click('#back');
await p.fill('#q','moxi'); console.log('search moxi (no alias yet):', await txt(p,'#home-body')); await p.fill('#q','מוקסיפן'); console.log('search מוקסיפן:', await txt(p,'#home-body')); await p.fill('#q','');
await p.click('[data-ind="i1"]'); // verify from card -> checklist
await p.click('[data-verify]'); console.log('CHECKLIST:', await txt(p,'.sheet')); await p.click('#vc-ok'); await p.waitForTimeout(300);
console.log('r1 status:', db.recommendations[0].status);
// add new option in tonsillitis with amoxicillin (copy suggestion)
await p.click('#back'); await p.click('[data-ind="i2"]'); await p.click('#add-opt');
await p.fill('#dq','amox'); await p.press('#dq','Enter'); await p.waitForTimeout(100);
await p.click('#next');
console.log('copy box:', await txt(p,'.note-info'));
await p.click('[data-copy]'); console.log('min after copy:', await p.inputValue('#ed-min'), await p.inputValue('#ed-doses'));
await p.fill('#ed-min','50'); await p.fill('#ed-max',''); await p.click('[data-line="alternative"]');
await p.click('#next'); await p.click('#next'); await p.fill('#ed-src','בדיקה'); await p.click('#next');
console.log('PREVIEW phone:', await txt(p,'#ed-pv'));
await p.click('#save-draft'); await p.waitForTimeout(300);
console.log('saved rec:', JSON.stringify(db.recommendations.at(-1)).slice(0,200));
// new drug with duplicate warning
await p.click('#add-opt'); await p.click('#new-drug'); await p.fill('#ds-he','אמוקסצילין');
console.log('dup warn:', await txt(p,'#ds-similar'));
await p.fill('#ds-he','אזיתרומיצין'); await p.fill('#ds-en','Azithromycin'); console.log('dup warn2:', JSON.stringify(await txt(p,'#ds-similar')));
await p.fill('#ds-max','500'); await p.click('#ds-save'); await p.waitForTimeout(300);
console.log('new drug selected:', await txt(p,'[data-sec="0"]'));
await p.click('#next'); await p.fill('#ed-min','10'); await p.fill('#ed-doses','1'); await p.fill('#ed-days','3'); await p.click('#next');
await p.click('#add-syrup'); await p.fill('#ps-he','אזניל'); await p.fill('#ps-mg','200'); await p.fill('#ps-ml','5'); await p.click('#ps-save'); await p.waitForTimeout(300);
console.log('syrups sec:', await txt(p,'[data-sec="2"]'));
await p.click('#next'); await p.click('#next'); console.log('PREVIEW azi:', await txt(p,'#ed-pv'));
await p.click('#save-ok'); console.log('verify sheet:', await txt(p,'.sheet')); await p.click('#vc-ok'); await p.waitForTimeout(300);
console.log('azi rec status:', db.recommendations.at(-1).status, '| screen:', await txt(p,'.top h1'));
// bad dose -> warnings
await p.click('[data-edit]'); 
// dup to another ind
await p.click('#cancel'); await p.click('[data-dup]'); await p.selectOption('#ed-ind','i3'); for(let k=0;k<4;k++) await p.click('#next'); await p.click('#save-draft'); await p.waitForTimeout(300);
console.log('after dup screen:', await txt(p,'.top h1'), '| recs:', db.recommendations.length);
// drug screen & delete-protection
await p.click('#back'); await p.click('#back'); await p.fill('#q','צפלקסין'); await p.click('[data-drug="d2"]'); console.log('drug d2:', await txt(p,'#screen .stack'));
await p.click('#del-drug'); await p.click('#cf-yes'); await p.waitForTimeout(300); console.log('d2 deleted:', !db.drugs.find(d=>d.id==='d2'));
const sw = await p.evaluate(()=>document.documentElement.scrollWidth); console.log('phone scrollWidth', sw);
await ctx.close();
// ── DESKTOP editor ──
db = freshDb();
ctx = await mkCtx(b, {width:1280,height:900}); p = await ctx.newPage(); p.on('pageerror',e=>errs.push('desk '+e.message));
await p.goto('https://tinydose.test/admin.html'); await p.waitForSelector('#home-body');
await p.click('[data-ind="i1"]'); await p.click('#add-opt');
console.log('desktop sections visible:', await p.$$eval('[data-sec]', els=>els.filter(e=>!e.hidden).length), 'focused:', await p.evaluate(()=>document.activeElement.id));
await p.keyboard.type('amox'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
await p.click('#ed-min'); await p.keyboard.type('800'); await p.keyboard.press('Enter'); console.log('after Enter focus:', await p.evaluate(()=>document.activeElement.id));
await p.keyboard.press('Enter'); await p.keyboard.type('2'); 
console.log('PREVIEW desk 800:', await txt(p,'#ed-pv'));
await p.click('#save-ok'); console.log('verify sheet desk:', await txt(p,'.sheet'));
await p.click('[data-close].btn'); await p.fill('#ed-min','80'); await p.click('#save-draft'); await p.waitForTimeout(300);
console.log('desk saved:', db.recommendations.length);
// calculator still OK
const c = await ctx.newPage(); c.on('pageerror',e=>errs.push('calc '+e.message));
await c.goto('https://tinydose.test/calculator.html'); await c.waitForSelector('#ff-weight');
await c.fill('#ff-weight','10'); await c.fill('#ff-dose-min','50'); await c.fill('#ff-doses','2'); await c.fill('#ff-conc-mg','250'); await c.fill('#ff-conc-ml','5'); await c.waitForTimeout(300);
console.log('calc:', await c.textContent('#ff-live-vol'));
// old admin backup loads
const o = await ctx.newPage(); o.on('pageerror',e=>errs.push('old '+e.message)); await o.goto('https://tinydose.test/admin-old.html'); await o.waitForSelector('#admin-app:not(.hidden)'); console.log('old admin ok:', await o.title());
console.log('ERRORS', errs); await b.close();
process.exitCode = errs.length ? 1 : 0;
