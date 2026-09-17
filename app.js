const SUPABASE_URL='https://mtpsxtkqltjypmisbguh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gBXKSl2nZc4BzAXZXwSFFg_R2owgWhk';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const normalizeText=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();

// Lock mobile page zoom/pinch so the PWA stays at a fixed app scale.
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches && e.touches.length>1)e.preventDefault()},{passive:false});

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fmtDate=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T00:00:00')):'-';
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uuid=()=>crypto.randomUUID();

let cases=[],currentSummary='model',editingCaseId='',detailDraft=[],bootFinished=false,confirmTimer=null,filterFrom='',filterTo='',formDirty=false;
const DB_NAME='arn_store_v11_offline',DB_STORE='sync_queue';

function idb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(DB_STORE,{keyPath:'queueId'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function queuePut(item){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function queueAll(){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readonly'),q=tx.objectStore(DB_STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)})}
async function queueDel(id){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function queueRemoveCase(caseId){const q=await queueAll();for(const x of q)if((x.op==='upsertCase'&&x.payload?.id===caseId)||(x.op==='deleteCase'&&x.caseId===caseId))await queueDel(x.queueId)}

function setLoading(pct,status){const p=$('#loadingProgress');if(p)p.style.width=`${Math.max(0,Math.min(100,pct))}%`;const s=$('#loadingStatus');if(s)s.textContent=status}
function setConn(type,text){const e=$('#connectionPill');if(!e)return;e.className='connection-pill '+type;e.innerHTML=`<span class="dot"></span><span>${esc(text)}</span>`}
function toast(msg){const e=$('#toast');if(!e)return;e.textContent=msg;e.classList.remove('hidden');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.add('hidden'),3200)}

async function boot(){
  const started=Date.now(),MAX=45000,DB_WAIT=12000;
  setLoading(4,'Menyiapkan aplikasi...');
  const timer=setInterval(()=>{const elapsed=Date.now()-started;setLoading(Math.min(94,elapsed/MAX*94),elapsed<DB_WAIT?'Menghubungkan database...':'Menyiapkan tampilan...')},200);
  try{
    const result=await Promise.race([db.from('service_cases').select('id',{count:'exact',head:true}),new Promise(r=>setTimeout(()=>r({timeout:true}),DB_WAIT))]);
    if(result?.error)setConn('error','Periksa Supabase');else if(result?.timeout)setConn('offline','Koneksi lambat');else setConn('online','Terhubung');
  }catch(e){setConn('offline','Mode offline')}
  finally{clearInterval(timer);setLoading(100,'Siap digunakan');const reveal=()=>{if(bootFinished)return;bootFinished=true;$('#loadingScreen').classList.add('hidden');$('#app').classList.remove('hidden');refreshAll()};setTimeout(reveal,300);setTimeout(reveal,MAX);}
}

function emptyCase(id){return{id,service_date:today(),phone_model:'',notes:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null,details:[]}}

function normalizeServerCases(caseRows,detailRows){
  const detailMap=new Map();
  for(const d of detailRows||[]){if(!detailMap.has(d.service_case_id))detailMap.set(d.service_case_id,[]);detailMap.get(d.service_case_id).push({id:d.id,detail_order:Number(d.detail_order)||detailMap.get(d.service_case_id).length+1,damage:d.damage||'',action:d.action||'',part:d.part||null,jumlah_pcs:Number(d.jumlah_pcs)||0})}
  return (caseRows||[]).map(c=>({...c,details:detailMap.get(c.id)||[]}));
}

async function fetchServerCases(){
  const {data:caseRows,error:caseError}=await db.from('service_cases').select('id,service_date,phone_model,notes,created_at,updated_at,archived_at').is('archived_at',null).order('service_date',{ascending:false}).order('created_at',{ascending:false});
  if(caseError)throw caseError;
  const ids=(caseRows||[]).map(c=>c.id);
  let detailRows=[];
  if(ids.length){const {data,error}=await db.from('service_case_details').select('id,service_case_id,detail_order,damage,action,part,jumlah_pcs').in('service_case_id',ids).order('detail_order',{ascending:true});if(error)throw error;detailRows=data||[]}
  return normalizeServerCases(caseRows,detailRows);
}

async function loadCases(){
  if(!navigator.onLine){return loadLocalCases()}
  try{
    await syncQueue(false);
    const server=await fetchServerCases();
    const q=await queueAll();
    const overlay=new Map(server.map(c=>[c.id,c]));
    for(const x of q){if(x.op==='upsertCase')overlay.set(x.payload.id,x.payload);if(x.op==='deleteCase')overlay.delete(x.caseId)}
    cases=[...overlay.values()].sort((a,b)=>String(b.service_date||'').localeCompare(String(a.service_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
    setConn('online','Terhubung');renderAll();
  }catch(e){setConn(navigator.onLine?'error':'offline',navigator.onLine?'Periksa Supabase':'Mode offline');await loadLocalCases()}
}
async function loadLocalCases(){const q=await queueAll();const map=new Map();for(const x of q){if(x.op==='upsertCase')map.set(x.payload.id,x.payload);if(x.op==='deleteCase')map.delete(x.caseId)}cases=[...map.values()];renderAll()}
function renderAll(){renderHistory();renderStats();renderSummary(currentSummary);renderParts()}
function renderStats(){$('#totalCases').textContent=cases.length;$('#totalDetails').textContent=cases.reduce((s,c)=>s+c.details.length,0);$('#totalPcs').textContent=cases.reduce((s,c)=>s+c.details.reduce((a,d)=>a+(Number(d.jumlah_pcs)||0),0),0)}
function caseSearchText(c){return[c.phone_model,c.notes,...c.details.flatMap(d=>[d.damage,d.action,d.part])].map(normalizeText).join(' ')}
function renderHistory(){const q=normalizeText($('#historySearch').value);const rows=cases.filter(c=>{const d=c.service_date||'';return(!filterFrom||d>=filterFrom)&&(!filterTo||d<=filterTo)&&(!q||caseSearchText(c).includes(q))});$('#historyList').innerHTML=rows.map(c=>{const chips=c.details.slice(0,3).map(d=>`<span class="detail-chip">${esc(d.damage||'Kerusakan')} • ${esc(d.action||'Tindakan')}${d.part?` • ${esc(d.part)} ${Number(d.jumlah_pcs)||0} pcs`:''}</span>`).join('');const more=c.details.length>3?`<span class="detail-chip">+${c.details.length-3} detail</span>`:'';return`<article class="history-item"><button class="history-edit" data-edit="${esc(c.id)}">✎</button><div class="history-date">${fmtDate(c.service_date)}</div><div class="history-model">${esc(c.phone_model)}</div><div class="history-meta">${c.details.length} detail kerusakan</div>${chips}${more}${c.notes?`<div class="history-line">Catatan: ${esc(c.notes)}</div>`:''}</article>`}).join('');$('#historyEmpty').classList.toggle('hidden',rows.length>0);$$('[data-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.edit))}
function buildSummary(){const model=new Map(),damage=new Map(),part=new Map();for(const c of cases){const mk=normalizeText(c.phone_model);if(mk){let x=model.get(mk)||{name:c.phone_model,cases:0,pcs:0};x.cases++;x.pcs+=c.details.reduce((s,d)=>s+(Number(d.jumlah_pcs)||0),0);model.set(mk,x)}for(const d of c.details){const dk=normalizeText(d.damage);if(dk){let x=damage.get(dk)||{name:d.damage,cases:new Set(),pcs:0};x.cases.add(c.id);x.pcs+=Number(d.jumlah_pcs)||0;damage.set(dk,x)}const pk=normalizeText(d.part);if(pk){let x=part.get(pk)||{name:d.part,cases:new Set(),pcs:0};x.cases.add(c.id);x.pcs+=Number(d.jumlah_pcs)||0;part.set(pk,x)}}}return{model:[...model.values()],damage:[...damage.values()].map(x=>({...x,cases:x.cases.size})),part:[...part.values()].map(x=>({...x,cases:x.cases.size}))}}
function renderSummary(kind){currentSummary=kind;$$('.summary-tab').forEach(b=>b.classList.toggle('active',b.dataset.summary===kind));const data=buildSummary()[kind].sort((a,b)=>kind==='model'?b.cases-a.cases||b.pcs-a.pcs:b.pcs-a.pcs||b.cases-a.cases).slice(0,100);$('#summaryList').innerHTML=data.length?data.map(x=>`<div class="summary-row"><div><div class="summary-main">${esc(x.name)}</div><div class="summary-sub">${x.cases} kasus servis</div></div><div class="summary-number">${x.pcs} pcs</div></div>`).join(''):'<div class="empty">Belum ada data untuk dianalisa.</div>'}
function renderParts(){const data=buildSummary().part.sort((a,b)=>b.pcs-a.pcs||b.cases-a.cases);$('#partsList').innerHTML=data.length?data.map(x=>`<div class="summary-row"><div><div class="summary-main">${esc(x.name)}</div><div class="summary-sub">${x.cases} kasus • berbagai tipe HP</div></div><div class="summary-number">${x.pcs} pcs</div></div>`).join(''):'<div class="empty">Belum ada part yang tercatat.</div>'}

function detailEditor(d={}){const id=d.id||uuid(),pcs=Number(d.jumlah_pcs)||0;return`<div class="detail-card" data-detail="${id}"><button type="button" class="remove-detail" title="Hapus detail">×</button><div class="detail-grid"><label class="full">Kerusakan<input class="d-damage" value="${esc(d.damage||'')}" placeholder="Contoh: LCD pecah"></label><label>Tindakan<input class="d-action" value="${esc(d.action||'')}" placeholder="Contoh: Ganti / Jumper"></label><label>Part<input class="d-part" value="${esc(d.part||'')}" placeholder="Boleh kosong"></label><label class="full">PCS<div class="pcs-wrap"><button type="button" class="pcs-button">${pcs||0} pcs</button><div class="pcs-picker hidden">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-pcs="${n}">${n}</button>`).join('')}<button type="button" data-pcs="more">&gt;9</button></div></div><input type="hidden" class="d-pcs" value="${pcs}"></label></div></div>`}
function bindDetailCard(card){if(!card)return;const remove=card.querySelector('.remove-detail');if(remove)remove.onclick=()=>{if($$('.detail-card').length<=1)return toast('Minimal satu detail harus ada.');card.remove();detailDraft=collectDetails();detailDraft.forEach((d,i)=>d.detail_order=i+1);$('#detailCount').textContent=`${detailDraft.length} detail`;formDirty=true};const pcsBtn=card.querySelector('.pcs-button');if(pcsBtn)pcsBtn.onclick=()=>{const p=pcsBtn.parentElement.querySelector('.pcs-picker');p.classList.toggle('hidden')};card.querySelectorAll('.pcs-picker button').forEach(btn=>btn.onclick=()=>{const hidden=card.querySelector('.d-pcs'),label=card.querySelector('.pcs-button');let n=btn.dataset.pcs==='more'?prompt('Masukkan PCS lebih dari 9:','10'):btn.dataset.pcs;if(n===null)return;n=Number(n);if(!Number.isInteger(n)||n<0||(btn.dataset.pcs==='more'&&n<10))return toast('PCS tidak valid.');hidden.value=n;label.textContent=`${n} pcs`;btn.parentElement.classList.add('hidden');formDirty=true});card.querySelectorAll('input').forEach(x=>x.oninput=()=>{formDirty=true})}
function renderDetailDraft(){const box=$('#detailRows');box.innerHTML=detailDraft.map(detailEditor).join('');$('#detailCount').textContent=`${detailDraft.length} detail`;$$('.detail-card').forEach(bindDetailCard)}
function collectDetails(){return $$('.detail-card').map((card,i)=>({id:card.dataset.detail,detail_order:i+1,damage:card.querySelector('.d-damage').value.trim(),action:card.querySelector('.d-action').value.trim(),part:card.querySelector('.d-part').value.trim()||null,jumlah_pcs:Number(card.querySelector('.d-pcs').value)||0}))}
function validateCase(){if(!$('#serviceDate').value)return'Tanggal wajib diisi.';if(!$('#phoneModel').value.trim())return'Tipe HP wajib diisi.';const ds=collectDetails();if(!ds.length)return'Tambahkan minimal satu kerusakan.';for(let i=0;i<ds.length;i++){if(!ds[i].damage)return`Kerusakan pada detail ${i+1} wajib diisi.`;if(ds[i].part&&ds[i].jumlah_pcs<1)return`PCS detail ${i+1} minimal 1 jika part diisi.`;if(!ds[i].part)ds[i].jumlah_pcs=0}return null}
function openAdd(){editingCaseId='';formDirty=false;$('#modalTitle').textContent='Tambah Riwayat';$('#deleteCaseBtn').classList.add('hidden');$('#editId').value='';$('#serviceDate').value=today();$('#phoneModel').value='';$('#notes').value='';$('#formError').classList.add('hidden');detailDraft=[{id:uuid(),detail_order:1,damage:'',action:'',part:null,jumlah_pcs:0}];renderDetailDraft();showModal('modal')}
function openEdit(id){const c=cases.find(x=>x.id===id);if(!c)return;editingCaseId=id;formDirty=false;$('#modalTitle').textContent='Edit Riwayat';$('#deleteCaseBtn').classList.remove('hidden');$('#editId').value=id;$('#serviceDate').value=c.service_date;$('#phoneModel').value=c.phone_model;$('#notes').value=c.notes||'';$('#formError').classList.add('hidden');detailDraft=c.details.length?c.details.map(d=>({...d})):[{id:uuid(),detail_order:1,damage:'',action:'',part:null,jumlah_pcs:0}];renderDetailDraft();showModal('modal')}
function showModal(id){const e=$('#'+id);e.classList.remove('hidden');e.setAttribute('aria-hidden','false')}
function closeModal(id='modal',force=false){if(id==='modal'&&formDirty&&!force&&!confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?'))return;const e=$('#'+id);e.classList.add('hidden');e.setAttribute('aria-hidden','true');if(id==='modal')formDirty=false}
function localCasePayload(){return{id:editingCaseId||uuid(),service_date:$('#serviceDate').value,phone_model:$('#phoneModel').value.trim(),notes:$('#notes').value.trim()||null,created_at:editingCaseId?(cases.find(c=>c.id===editingCaseId)?.created_at||new Date().toISOString()):new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null,details:collectDetails()}}

async function onlineUpsertCase(c){
  const base={id:c.id,service_date:c.service_date,phone_model:c.phone_model,notes:c.notes,updated_at:new Date().toISOString()};
  let r=await db.from('service_cases').upsert(base,{onConflict:'id'});if(r.error)return r;
  const old=await db.from('service_case_details').select('id').eq('service_case_id',c.id);if(old.error)return old;
  const newIds=new Set(c.details.map(d=>d.id));const stale=(old.data||[]).map(x=>x.id).filter(id=>!newIds.has(id));
  if(stale.length){r=await db.from('service_case_details').delete().in('id',stale);if(r.error)return r}
  if(c.details.length){r=await db.from('service_case_details').upsert(c.details.map(d=>({id:d.id,service_case_id:c.id,detail_order:d.detail_order,damage:d.damage,action:d.action,part:d.part,jumlah_pcs:d.jumlah_pcs})),{onConflict:'id'});if(r.error)return r}
  return{error:null};
}
async function deleteCaseOnline(id){return db.from('service_cases').delete().eq('id',id)}

async function saveCase(e){e.preventDefault();const err=validateCase();if(err){$('#formError').textContent=err;$('#formError').classList.remove('hidden');return}const payload=localCasePayload();const wasEdit=Boolean(editingCaseId);try{if(navigator.onLine){const result=await onlineUpsertCase(payload);if(result.error){await queueRemoveCase(payload.id);await queuePut({queueId:uuid(),op:'upsertCase',payload});cases=cases.filter(c=>c.id!==payload.id);cases.unshift(payload);toast(`Belum tersimpan ke server: ${result.error.message||'koneksi gagal'}. Disimpan di perangkat.`)}else{cases=cases.filter(c=>c.id!==payload.id);cases.unshift(payload);toast(wasEdit?'Perubahan tersimpan.':'Riwayat tersimpan.');await loadCases()}}else{await queueRemoveCase(payload.id);await queuePut({queueId:uuid(),op:'upsertCase',payload});cases=cases.filter(c=>c.id!==payload.id);cases.unshift(payload);toast('Mode offline: tersimpan di perangkat. Akan disinkronkan saat online.')}formDirty=false;closeModal('modal',true);renderAll()}catch(ex){console.error(ex);try{await queueRemoveCase(payload.id);await queuePut({queueId:uuid(),op:'upsertCase',payload});cases=cases.filter(c=>c.id!==payload.id);cases.unshift(payload);formDirty=false;closeModal('modal',true);renderAll();toast('Koneksi gagal. Data diamankan di perangkat dan akan disinkronkan.')}catch(qe){$('#formError').textContent=`Gagal menyimpan: ${qe.message||qe}`;$('#formError').classList.remove('hidden')}}}

async function performDelete(id){try{if(navigator.onLine){const r=await deleteCaseOnline(id);if(r.error){await queueRemoveCase(id);await queuePut({queueId:uuid(),op:'deleteCase',caseId:id});toast('Penghapusan ditandai untuk sinkronisasi.')}else{await queueRemoveCase(id);toast('Data dihapus permanen.')}}else{await queueRemoveCase(id);await queuePut({queueId:uuid(),op:'deleteCase',caseId:id});toast('Penghapusan disimpan. Akan disinkronkan saat online.')}cases=cases.filter(c=>c.id!==id);renderAll()}catch(e){toast(`Gagal menghapus: ${e.message||e}`)}}
function startDelete(){if(!editingCaseId)return;$('#confirmTitle').textContent='Hapus Riwayat?';$('#confirmText').textContent='Data ini akan dihapus secara permanen.';$('#confirmOk').disabled=true;$('#confirmOk').textContent='Hapus Data (10)';let n=10;clearInterval(confirmTimer);confirmTimer=setInterval(()=>{n--;$('#confirmOk').textContent=n>0?`Hapus Data (${n})`:'Hapus Data';if(n<=0){clearInterval(confirmTimer);$('#confirmOk').disabled=false}},1000);$('#confirmOk').onclick=async()=>{clearInterval(confirmTimer);await performDelete(editingCaseId);closeModal('modal',true);closeModal('confirmModal',true)};$('#confirmCancel').onclick=()=>{clearInterval(confirmTimer);closeModal('confirmModal',true)};showModal('confirmModal')}

async function syncQueue(show=true){if(!navigator.onLine)return;const q=await queueAll();if(!q.length)return;for(const item of q){let r=null;try{if(item.op==='upsertCase')r=await onlineUpsertCase(item.payload);else if(item.op==='deleteCase')r=await deleteCaseOnline(item.caseId);if(r&&!r.error)await queueDel(item.queueId)}catch(e){console.warn('Sync gagal',e)}}if(show)toast('Data offline disinkronkan.')}
async function refreshAll(){try{await syncQueue(false);await loadCases();await updateConnection()}catch(e){await loadLocalCases()}}
async function updateConnection(){if(!navigator.onLine){setConn('offline','Mode offline');return}const {error}=await db.from('service_cases').select('id',{head:true});setConn(error?'error':'online',error?'Periksa Supabase':'Terhubung')}
async function showArchive(){closeMenu();showModal('archiveModal');$('#archiveStatus').textContent='Memuat status arsip...';const {data,error}=await db.from('v_service_history_status_v11').select('*').maybeSingle();if(error){$('#archiveStatus').textContent='Status arsip belum dapat dibaca.';return}const active=Number(data.active_cases??data.active_records??0);$('#archiveStatus').textContent=`Kasus aktif: ${active} • Batas: 90 • Saat arsip: 45 kasus terlama`;const {data:rows,error:er}=await db.from('service_archive_v11').select('*').order('phone_model');if(er){$('#archiveList').innerHTML='<div class="empty">Arsip belum dapat dimuat.</div>';return}$('#archiveList').innerHTML=(rows||[]).map(r=>`<div class="archive-row"><div><b>${esc(r.phone_model)}</b><div class="summary-sub">${esc(r.part||'Tidak ada')} • ${r.service_cases??0} kasus</div></div><b>${r.total_pcs??0} pcs</b></div>`).join('')||'<div class="empty">Belum ada data arsip.</div>';$('#runArchiveBtn').disabled=active<90}
async function runArchive(){const {data,error}=await db.rpc('archive_oldest_45_cases');if(error){toast(error.message);return}toast(`Arsip selesai: ${data?.archived_cases??45} kasus.`);await showArchive();await refreshAll()}
function closeMenu(){closeModal('menuModal',true)}
function about(){toast('ARN Store • Riwayat & Analisa V1.1 • tanpa login/password')}

$('#addBtn').onclick=openAdd;$('#closeModal').onclick=()=>closeModal();$('#cancelModal').onclick=()=>closeModal();$('#addDetailBtn').onclick=()=>{const box=$('#detailRows');const current=collectDetails();const next={id:uuid(),detail_order:current.length+1,damage:'',action:'',part:null,jumlah_pcs:0};detailDraft=[...current,next];box.insertAdjacentHTML('beforeend',detailEditor(next));$('#detailCount').textContent=`${detailDraft.length} detail`;bindDetailCard(box.lastElementChild);formDirty=true};$('#caseForm').onsubmit=saveCase;$('#deleteCaseBtn').onclick=startDelete;
$('#historySearch').oninput=renderHistory;$('#refreshBtn').onclick=refreshAll;$('#menuBtn').onclick=()=>showModal('menuModal');$('#menuClose').onclick=closeMenu;$('#menuRefresh').onclick=()=>{closeMenu();refreshAll()};$('#menuFilter').onclick=()=>{closeMenu();$('#filterFrom').value=filterFrom;$('#filterTo').value=filterTo;showModal('filterModal')};$('#applyFilter').onclick=()=>{const a=$('#filterFrom').value,b=$('#filterTo').value;if(a&&b&&a>b)return toast('Rentang tanggal tidak valid.');filterFrom=a;filterTo=b;closeModal('filterModal',true);renderHistory()};$('#clearFilter').onclick=()=>{filterFrom='';filterTo='';$('#filterFrom').value='';$('#filterTo').value='';closeModal('filterModal',true);renderHistory()};$('#closeFilter').onclick=()=>closeModal('filterModal',true);$('#menuArchive').onclick=showArchive;$('#menuAbout').onclick=()=>{closeMenu();about()};$('#closeArchive').onclick=()=>closeModal('archiveModal',true);$('#runArchiveBtn').onclick=runArchive;
$$('[data-close]').forEach(x=>x.onclick=()=>closeModal());$$('[data-filter-close]').forEach(x=>x.onclick=()=>closeModal('filterModal',true));$$('[data-archive-close]').forEach(x=>x.onclick=()=>closeModal('archiveModal',true));$$('[data-menu-close]').forEach(x=>x.onclick=closeMenu);
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));[['history','historyView'],['summary','summaryView'],['parts','partsView']].forEach(([k,id])=>$('#'+id).classList.toggle('hidden',b.dataset.tab!==k));if(b.dataset.tab==='summary')renderSummary(currentSummary);if(b.dataset.tab==='parts')renderParts()});
$$('.summary-tab').forEach(b=>b.onclick=()=>renderSummary(b.dataset.summary));
window.addEventListener('online',async()=>{setConn('online','Terhubung');await syncQueue();await refreshAll()});window.addEventListener('offline',()=>setConn('offline','Mode offline'));window.addEventListener('beforeunload',e=>{if(formDirty){e.preventDefault();e.returnValue=''}});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
boot();
