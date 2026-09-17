const SUPABASE_URL='https://mtpsxtkqltjypmisbguh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gBXKSl2nZc4BzAXZXwSFFg_R2owgWhk';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const normalizeText=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fmtDate=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T00:00:00')):'-';
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uuid=()=>crypto.randomUUID();

let cases=[], currentSummary='model', editingCaseId='', detailDraft=[], bootFinished=false, confirmTimer=null, filterFrom='', filterTo='';
const DB_NAME='arn_store_v11_offline', DB_STORE='sync_queue';

function idb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>r.result.createObjectStore(DB_STORE,{keyPath:'queueId'});
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function queuePut(item){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function queueAll(){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readonly'),q=tx.objectStore(DB_STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)})}
async function queueDel(id){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}

function setLoading(pct,status){$('#loadingProgress').style.width=`${Math.max(0,Math.min(100,pct))}%`;const statusEl=$('#loadingStatus');if(statusEl)statusEl.textContent=status}
function setConn(type,text){$('#connectionPill').className='connection-pill '+type;$('#connectionPill').innerHTML=`<span class="dot"></span><span>${esc(text)}</span>`}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.remove('hidden');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.add('hidden'),2800)}

async function boot(){
  const started=Date.now(),MAX=45000,DB_WAIT=12000;
  setLoading(4,'Menyiapkan aplikasi...');
  const timer=setInterval(()=>{const elapsed=Date.now()-started;setLoading(Math.min(94,elapsed/MAX*94),elapsed<DB_WAIT?'Menghubungkan database...':'Menyiapkan tampilan...')},200);
  try{
    const result=await Promise.race([
      db.from('service_cases').select('id',{count:'exact',head:true}),
      new Promise(r=>setTimeout(()=>r({timeout:true}),DB_WAIT))
    ]);
    if(result?.error)setConn('error','Periksa Supabase');
    else if(result?.timeout)setConn('offline','Koneksi lambat');
    else setConn('online','Terhubung');
  }catch(e){setConn('offline','Mode offline')}
  finally{
    clearInterval(timer);
    const reveal=()=>{if(bootFinished)return;bootFinished=true;$('#loadingScreen').classList.add('hidden');$('#app').classList.remove('hidden');refreshAll()};
    setTimeout(reveal,Math.max(0,Math.min(700,MAX-(Date.now()-started))));
    setTimeout(reveal,Math.max(0,MAX-(Date.now()-started)));
  }
}

function emptyCase(id){
  return {id,service_date:today(),phone_model:'',notes:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null,details:[]};
}

async function loadCases(){
  const {data,error}=await db.from('service_history_v11').select('*').is('archived_at',null)
    .order('service_date',{ascending:false}).order('created_at',{ascending:false}).order('service_case_id',{ascending:false});
  if(error){setConn(navigator.onLine?'error':'offline',navigator.onLine?'Periksa Supabase':'Mode offline');return loadLocalCases()}
  const map=new Map();
  (data||[]).forEach(r=>{
    const cid=r.service_case_id||r.case_id||r.id;
    if(!map.has(cid))map.set(cid,{id:cid,service_date:r.service_date,phone_model:r.phone_model,notes:r.notes||null,created_at:r.created_at,updated_at:r.updated_at,archived_at:r.archived_at,details:[]});
    if(r.detail_id||r.damage||r.action||r.part)map.get(cid).details.push({id:r.detail_id||uuid(),detail_order:Number(r.detail_order)||map.get(cid).details.length+1,damage:r.damage||'',action:r.action||'',part:r.part||null,jumlah_pcs:Number(r.jumlah_pcs)||0});
  });
  cases=[...map.values()];
  const hasCaseWithoutDetail=(data||[]).length===0;
  if(hasCaseWithoutDetail){
    const {data:cd}=await db.from('service_cases').select('id,service_date,phone_model,notes,created_at,updated_at,archived_at').is('archived_at',null).order('service_date',{ascending:false}).order('created_at',{ascending:false});
    if(cd)cases=cd.map(c=>({...c,details:[]}));
  }
  await syncQueue(false);
  renderAll();
}

async function loadLocalCases(){
  const q=await queueAll();
  const map=new Map();
  q.filter(x=>x.op==='upsertCase').forEach(x=>map.set(x.payload.id,x.payload));
  q.filter(x=>x.op==='deleteCase').forEach(x=>map.delete(x.caseId));
  if(map.size)cases=[...map.values()];
  else cases=[];
  renderAll();
}

function renderAll(){renderHistory();renderStats();renderSummary(currentSummary);renderParts()}

function renderStats(){
  $('#totalCases').textContent=cases.length;
  $('#totalDetails').textContent=cases.reduce((s,c)=>s+c.details.length,0);
  $('#totalPcs').textContent=cases.reduce((s,c)=>s+c.details.reduce((a,d)=>a+(Number(d.jumlah_pcs)||0),0),0);
}

function caseSearchText(c){return [c.phone_model,c.notes,...c.details.flatMap(d=>[d.damage,d.action,d.part])].map(normalizeText).join(' ')}
function renderHistory(){
  const q=normalizeText($('#historySearch').value);
  const rows=cases.filter(c=>{const d=c.service_date||'';const inFrom=!filterFrom||d>=filterFrom;const inTo=!filterTo||d<=filterTo;return inFrom&&inTo&&(!q||caseSearchText(c).includes(q))});
  $('#historyList').innerHTML=rows.map(c=>{
    const chips=c.details.slice(0,3).map(d=>`<span class="detail-chip">${esc(d.damage||'Kerusakan')} • ${esc(d.action||'Tindakan')}${d.part?` • ${esc(d.part)} ${Number(d.jumlah_pcs)||0} pcs`:''}</span>`).join('');
    const more=c.details.length>3?`<span class="detail-chip">+${c.details.length-3} detail</span>`:'';
    return `<article class="history-item"><button class="history-edit" data-edit="${esc(c.id)}">✎</button><div class="history-date">${fmtDate(c.service_date)}</div><div class="history-model">${esc(c.phone_model)}</div><div class="history-meta">${c.details.length} detail kerusakan</div>${chips}${more}${c.notes?`<div class="history-line">Catatan: ${esc(c.notes)}</div>`:''}</article>`;
  }).join('');
  $('#historyEmpty').classList.toggle('hidden',rows.length>0);
  $$('[data-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
}

function buildSummary(){
  const model=new Map(),damage=new Map(),part=new Map();
  for(const c of cases){
    const mk=normalizeText(c.phone_model); if(mk){let x=model.get(mk)||{name:c.phone_model,cases:0,pcs:0};x.cases++;x.pcs+=c.details.reduce((s,d)=>s+(Number(d.jumlah_pcs)||0),0);model.set(mk,x)}
    for(const d of c.details){
      const dk=normalizeText(d.damage);if(dk){let x=damage.get(dk)||{name:d.damage,cases:new Set(),pcs:0};x.cases.add(c.id);x.pcs+=Number(d.jumlah_pcs)||0;damage.set(dk,x)}
      const pk=normalizeText(d.part);if(pk){let x=part.get(pk)||{name:d.part,cases:new Set(),pcs:0};x.cases.add(c.id);x.pcs+=Number(d.jumlah_pcs)||0;part.set(pk,x)}
    }
  }
  return {model:[...model.values()],damage:[...damage.values()].map(x=>({...x,cases:x.cases.size})),part:[...part.values()].map(x=>({...x,cases:x.cases.size}))};
}
function renderSummary(kind){
  currentSummary=kind;$$('.summary-tab').forEach(b=>b.classList.toggle('active',b.dataset.summary===kind));
  const data=buildSummary()[kind].sort((a,b)=>kind==='model'?b.cases-a.cases||b.pcs-a.pcs:b.pcs-a.pcs||b.cases-a.cases).slice(0,100);
  $('#summaryList').innerHTML=data.length?data.map(x=>`<div class="summary-row"><div><div class="summary-main">${esc(x.name)}</div><div class="summary-sub">${x.cases} kasus servis</div></div><div class="summary-number">${x.pcs} pcs</div></div>`).join(''):'<div class="empty">Belum ada data untuk dianalisa.</div>';
}
function renderParts(){
  const data=buildSummary().part.sort((a,b)=>b.pcs-a.pcs||b.cases-a.cases);
  $('#partsList').innerHTML=data.length?data.map(x=>`<div class="summary-row"><div><div class="summary-main">${esc(x.name)}</div><div class="summary-sub">${x.cases} kasus • berbagai tipe HP</div></div><div class="summary-number">${x.pcs} pcs</div></div>`).join(''):'<div class="empty">Belum ada part yang tercatat.</div>';
}

function detailEditor(d={},i=0){
  const id=d.id||uuid(), pcs=Number(d.jumlah_pcs)||0;
  return `<div class="detail-card" data-detail="${id}"><button type="button" class="remove-detail" title="Hapus detail">×</button>
  <div class="detail-grid">
  <label class="full">Kerusakan<input class="d-damage" value="${esc(d.damage||'')}" placeholder="Contoh: LCD pecah"></label>
  <label>Tindakan<input class="d-action" value="${esc(d.action||'')}" placeholder="Contoh: Ganti / Jumper"></label>
  <label>Part<input class="d-part" value="${esc(d.part||'')}" placeholder="Boleh kosong"></label>
  <label class="full">PCS<div class="pcs-wrap"><button type="button" class="pcs-button">${pcs||0} pcs</button><div class="pcs-picker hidden">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-pcs="${n}">${n}</button>`).join('')}<button type="button" data-pcs="more">>9</button></div></div><input type="hidden" class="d-pcs" value="${pcs}"></label>
  </div></div>`;
}
function renderDetailDraft(){
  $('#detailRows').innerHTML=detailDraft.map(detailEditor).join('');
  $('#detailCount').textContent=`${detailDraft.length} detail`;
  $$('.remove-detail').forEach((b,i)=>b.onclick=()=>{if(detailDraft.length===1)return toast('Minimal 1 detail.');detailDraft.splice(i,1);renderDetailDraft()});
  $$('.pcs-button').forEach(btn=>btn.onclick=()=>btn.nextElementSibling.classList.toggle('hidden'));
  $$('.pcs-picker button').forEach(btn=>btn.onclick=()=>{
    const card=btn.closest('.detail-card'),hidden=card.querySelector('.d-pcs'),label=card.querySelector('.pcs-button');
    let n=btn.dataset.pcs==='more'?prompt('Masukkan PCS lebih dari 9:','10'):btn.dataset.pcs;
    if(n===null)return;n=Number(n);if(!Number.isInteger(n)||n<10&&btn.dataset.pcs==='more'||n<0)return toast('PCS tidak valid.');
    hidden.value=n;label.textContent=`${n} pcs`;btn.parentElement.classList.add('hidden');
  });
}
function collectDetails(){
  return $$('.detail-card').map((card,i)=>({id:card.dataset.detail,detail_order:i+1,damage:card.querySelector('.d-damage').value.trim(),action:card.querySelector('.d-action').value.trim(),part:card.querySelector('.d-part').value.trim()||null,jumlah_pcs:Number(card.querySelector('.d-pcs').value)||0}));
}
function validateCase(){
  if(!$('#phoneModel').value.trim())return'Tipe HP wajib diisi.';
  const ds=collectDetails();
  if(!ds.length)return'Tambahkan minimal satu kerusakan.';
  for(let i=0;i<ds.length;i++){if(!ds[i].damage)return`Kerusakan pada detail ${i+1} wajib diisi.`;if(ds[i].part&&ds[i].jumlah_pcs<1)return`PCS detail ${i+1} minimal 1 jika part diisi.`;if(!ds[i].part)ds[i].jumlah_pcs=0}
  return null;
}
function openAdd(){
  editingCaseId='';$('#modalTitle').textContent='Tambah Riwayat';$('#deleteCaseBtn').classList.add('hidden');
  $('#editId').value='';$('#serviceDate').value=today();$('#phoneModel').value='';$('#notes').value='';$('#formError').classList.add('hidden');
  detailDraft=[{id:uuid(),detail_order:1,damage:'',action:'',part:null,jumlah_pcs:0}];renderDetailDraft();showModal('modal');
}
function openEdit(id){
  const c=cases.find(x=>x.id===id);if(!c)return;
  editingCaseId=id;$('#modalTitle').textContent='Edit Riwayat';$('#deleteCaseBtn').classList.remove('hidden');
  $('#editId').value=id;$('#serviceDate').value=c.service_date;$('#phoneModel').value=c.phone_model;$('#notes').value=c.notes||'';$('#formError').classList.add('hidden');
  detailDraft=c.details.length?c.details.map(d=>({...d})): [{id:uuid(),detail_order:1,damage:'',action:'',part:null,jumlah_pcs:0}];
  renderDetailDraft();showModal('modal');
}
function showModal(id){const e=$('#'+id);e.classList.remove('hidden');e.setAttribute('aria-hidden','false')}
function closeModal(id='modal'){$('#'+id).classList.add('hidden');$('#'+id).setAttribute('aria-hidden','true')}

function localCasePayload(){
  return {id:editingCaseId||uuid(),service_date:$('#serviceDate').value,phone_model:$('#phoneModel').value.trim(),notes:$('#notes').value.trim()||null,created_at:editingCaseId?(cases.find(c=>c.id===editingCaseId)?.created_at||new Date().toISOString()):new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null,details:collectDetails()};
}
async function saveCase(e){
  e.preventDefault();const err=validateCase();if(err){$('#formError').textContent=err;$('#formError').classList.remove('hidden');return}
  const payload=localCasePayload();
  if(navigator.onLine){
    const result=await onlineUpsertCase(payload);
    if(result.error){await queuePut({queueId:uuid(),op:'upsertCase',payload});cases=cases.filter(c=>c.id!==payload.id);cases.unshift(payload);toast('Disimpan lokal. Akan disinkronkan saat koneksi tersedia.')}
    else {toast('Riwayat tersimpan.')}
  }else{await queuePut({queueId:uuid(),op:'upsertCase',payload});const idx=cases.findIndex(c=>c.id===payload.id);if(idx>=0)cases[idx]=payload;else cases.unshift(payload);toast('Mode offline: tersimpan di perangkat.')}
  closeModal();renderAll();
}
async function onlineUpsertCase(c){
  const base={id:c.id,service_date:c.service_date,phone_model:c.phone_model,notes:c.notes,updated_at:new Date().toISOString()};
  let r=await db.from('service_cases').upsert(base,{onConflict:'id'});if(r.error)return r;
  await db.from('service_case_details').delete().eq('service_case_id',c.id);
  if(c.details.length)r=await db.from('service_case_details').insert(c.details.map(d=>({id:d.id,service_case_id:c.id,detail_order:d.detail_order,damage:d.damage,action:d.action,part:d.part,jumlah_pcs:d.jumlah_pcs})));
  return r||{error:null};
}
async function deleteCaseOnline(id){return db.from('service_cases').delete().eq('id',id)}

function startDelete(){
  const c=cases.find(x=>x.id===editingCaseId);if(!c)return;
  $('#confirmTitle').textContent='Hapus Riwayat?';$('#confirmText').textContent='Data ini akan dihapus secara permanen.';$('#confirmCountdown').classList.add('hidden');$('#confirmOk').disabled=true;$('#confirmOk').textContent='Hapus Data (10)';
  let n=10;clearInterval(confirmTimer);confirmTimer=setInterval(()=>{n--;$('#confirmOk').textContent=n>0?`Hapus Data (${n})`:'Hapus Data';if(n<=0){clearInterval(confirmTimer);$('#confirmOk').disabled=false}},1000);
  $('#confirmOk').onclick=async()=>{clearInterval(confirmTimer);await performDelete(editingCaseId);closeModal();closeModal('confirmModal')};
  $('#confirmCancel').onclick=()=>{clearInterval(confirmTimer);closeModal('confirmModal')};
  showModal('confirmModal');
}
async function performDelete(id){
  if(navigator.onLine){const r=await deleteCaseOnline(id);if(r.error){await queuePut({queueId:uuid(),op:'deleteCase',caseId:id});toast('Penghapusan ditandai lokal dan akan disinkronkan.')}else toast('Data dihapus permanen.')}
  else {await queuePut({queueId:uuid(),op:'deleteCase',caseId:id});toast('Penghapusan disimpan. Akan disinkronkan saat online.')}
  cases=cases.filter(c=>c.id!==id);renderAll();
}

async function syncQueue(show=true){
  if(!navigator.onLine)return;
  const q=await queueAll();
  for(const item of q){
    let r;
    if(item.op==='upsertCase')r=await onlineUpsertCase(item.payload);
    else if(item.op==='deleteCase')r=await deleteCaseOnline(item.caseId);
    if(!r?.error)await queueDel(item.queueId);
  }
  if(show&&q.length)toast('Data offline disinkronkan.');
}
async function refreshAll(){await syncQueue(false);await loadCases();updateConnection()}
async function updateConnection(){
  if(!navigator.onLine){setConn('offline','Mode offline');return}
  const {error}=await db.from('service_cases').select('id',{head:true});setConn(error?'error':'online',error?'Periksa Supabase':'Terhubung');
}

async function showArchive(){
  closeMenu();showModal('archiveModal');$('#archiveStatus').textContent='Memuat status arsip...';
  const {data,error}=await db.from('v_service_history_status_v11').select('*').maybeSingle();
  if(error){$('#archiveStatus').textContent='Status arsip belum dapat dibaca.';return}
  $('#archiveStatus').textContent=`Kasus aktif: ${data.active_cases??data.active_records??0} • Batas: 90 • Saat arsip: 45 kasus terlama`;
  const {data:rows,error:er}=await db.from('service_archive_v11').select('*').order('phone_model');
  if(er){$('#archiveList').innerHTML='<div class="empty">Arsip belum dapat dimuat.</div>';return}
  $('#archiveList').innerHTML=(rows||[]).map(r=>`<div class="archive-row"><div><b>${esc(r.phone_model)}</b><div class="summary-sub">${esc(r.part||'Tidak ada')} • ${r.service_cases??0} kasus</div></div><b>${r.total_pcs??0} pcs</b></div>`).join('')||'<div class="empty">Belum ada data arsip.</div>';
  $('#runArchiveBtn').disabled=!((data.active_cases??data.active_records??0)>=90);
}
async function runArchive(){
  const {data,error}=await db.rpc('archive_oldest_45_cases');
  if(error){toast(error.message);return}
  toast(`Arsip selesai: ${data?.archived_cases??45} kasus.`);
  await showArchive();await refreshAll();
}
function closeMenu(){$('#menuModal').classList.add('hidden');$('#menuModal').setAttribute('aria-hidden','true')}

function about(){toast('ARN Store • Riwayat & Analisa V1.1 • tanpa login/password')}

$('#addBtn').onclick=openAdd;$('#closeModal').onclick=()=>closeModal();$('#cancelModal').onclick=()=>closeModal();$('#addDetailBtn').onclick=()=>{detailDraft.push({id:uuid(),detail_order:detailDraft.length+1,damage:'',action:'',part:null,jumlah_pcs:0});renderDetailDraft()};$('#caseForm').onsubmit=saveCase;$('#deleteCaseBtn').onclick=startDelete;
$('#historySearch').oninput=renderHistory;$('#refreshBtn').onclick=refreshAll;$('#menuBtn').onclick=()=>showModal('menuModal');$('#menuClose').onclick=closeMenu;$('#menuRefresh').onclick=()=>{closeMenu();refreshAll()};$('#menuFilter').onclick=()=>{closeMenu();$('#filterFrom').value=filterFrom;$('#filterTo').value=filterTo;showModal('filterModal')};$('#applyFilter').onclick=()=>{filterFrom=$('#filterFrom').value;filterTo=$('#filterTo').value;if(filterFrom&&filterTo&&filterFrom>filterTo){toast('Rentang tanggal tidak valid.');return}closeModal('filterModal');renderHistory()};$('#clearFilter').onclick=()=>{filterFrom='';filterTo='';$('#filterFrom').value='';$('#filterTo').value='';closeModal('filterModal');renderHistory()};$('#closeFilter').onclick=()=>closeModal('filterModal');$('#menuArchive').onclick=showArchive;$('#menuAbout').onclick=()=>{closeMenu();about()};$('#closeArchive').onclick=()=>closeModal('archiveModal');$('#runArchiveBtn').onclick=runArchive;
$$('[data-close]').forEach(x=>x.onclick=()=>closeModal());$$('[data-filter-close]').forEach(x=>x.onclick=()=>closeModal('filterModal'));$$('[data-archive-close]').forEach(x=>x.onclick=()=>closeModal('archiveModal'));$$('[data-menu-close]').forEach(x=>x.onclick=closeMenu);
$$('.tab').forEach(b=>b.onclick=()=>{ $$('.tab').forEach(x=>x.classList.toggle('active',x===b));[['history','historyView'],['summary','summaryView'],['parts','partsView']].forEach(([k,id])=>$('#'+id).classList.toggle('hidden',b.dataset.tab!==k));if(b.dataset.tab==='summary')renderSummary(currentSummary);if(b.dataset.tab==='parts')renderParts()});
$$('.summary-tab').forEach(b=>b.onclick=()=>renderSummary(b.dataset.summary));
window.addEventListener('online',async()=>{setConn('online','Terhubung');await syncQueue();await refreshAll()});
window.addEventListener('offline',()=>setConn('offline','Mode offline'));
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
boot();
