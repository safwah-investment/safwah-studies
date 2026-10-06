// Optional Supabase adapter. Existing local records and database remain untouched.
const cloudConfig=window.SAFWAH_CLOUD||{};
const cloudEnabled=Boolean(cloudConfig.url||cloudConfig.publishableKey);
let cloudSession=null,cloudRevisions=new Map(),cloudSessionEpoch=0,refreshTask=null,cloudAuthBusy=false;
const cloudAuthStorageKey='safwah-finance-guest-session-v1';
function cloudCanWrite(){return Boolean(cloudSession?.user?.id)}
function cloudPersistSession(session=cloudSession){if(session)localStorage.setItem(cloudAuthStorageKey,JSON.stringify({project:cloudConfig.url,user_id:session.user.id,access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at||Date.now()/1000+(Number(session.expires_in)>0?Number(session.expires_in):3600)}))}
function cloudRemoveStoredSession(session,sameUser=false){const saved=JSON.parse(localStorage.getItem(cloudAuthStorageKey)||'null');if(session&&saved&&saved.project===cloudConfig.url&&(saved.refresh_token===session.refresh_token||(sameUser&&saved.user_id===session.user?.id)))localStorage.removeItem(cloudAuthStorageKey)}
function cloudClearWorkspace(){if(window.journalClear)window.journalClear();document.querySelector('#migrate-local').disabled=false;cloudRevisions.clear();records=[];visible=[];editing=null;render();document.querySelector('#editor').close();document.querySelector('#form').reset();document.querySelector('#payments').innerHTML='';document.querySelector('#attachments').innerHTML='';document.querySelector('#error').textContent='';document.querySelector('#account-name').textContent='';document.querySelector('#workspace-name').textContent='مساحة المستخدم';document.querySelector('#payment-section').hidden=true;document.querySelector('#payment-url-open').removeAttribute('href');document.querySelector('#payment-url-open').setAttribute('aria-disabled','true');document.querySelector('#payment-url-copy').disabled=true;document.querySelector('#payment-link-status').textContent='';document.querySelector('#ledger').hidden=true;document.querySelector('#account-actions').hidden=true}
function cloudHeaders(){return {apikey:cloudConfig.publishableKey,...(cloudSession?{Authorization:'Bearer '+cloudSession.access_token}:{}),'Content-Type':'application/json'}}
async function cloudRequest(path,options={}){
 const epoch=cloudSessionEpoch;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cloudConfig.url))throw Error('إعداد خدمة الحفظ غير صالح');
 if(cloudSession&&cloudSession.expires_at<Date.now()/1000+60){
 if(!refreshTask){
 let task;task=(async()=>{
 const session=cloudSession;
 const r=await fetch(cloudConfig.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cloudConfig.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
 if(epoch!==cloudSessionEpoch||cloudSession!==session)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 if(!r.ok){if(r.status===400||r.status===401){await cloudSignOut();throw Error('انتهت جلسة هذه المساحة.')}throw Error('تعذر تجديد الجلسة. أعد المحاولة عند استقرار الاتصال.')}
 const d=await r.json();
 if(epoch!==cloudSessionEpoch||cloudSession!==session)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 if(!d.user?.id||d.user.id!==session.user.id){await cloudSignOut();throw Error('تغيّرت هوية المساحة. أعد فتح الموقع.');}
 cloudSession={...d,expires_at:Date.now()/1000+d.expires_in};cloudPersistSession();
 })().finally(()=>{if(refreshTask===task)refreshTask=null});refreshTask=task;
 }
 await refreshTask;
 }
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 const response=await fetch(cloudConfig.url+path,{...options,headers:{...cloudHeaders(),...options.headers}});
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 if(!response.ok){let d={};try{d=await response.json()}catch{}const authErrors={anonymous_provider_disabled:'إنشاء المساحات غير متاح حاليًا. حاول لاحقًا.',captcha_failed:'لم يكتمل التحقق. حاول مجددًا.'},code=d.error_code||d.code;const error=Error(d.message==='STALE_RECORD'?'تم تعديل الحركة من جهاز آخر. حدّث الصفحة قبل تعديلها.':authErrors[code]||(response.status===429?'بلغت الخدمة حد المحاولات. انتظر قبل المحاولة مجددًا.':response.status===401?'جلسة المساحة غير صالحة':response.status===403?'تعذر الوصول إلى المساحة':d.msg||d.message||d.error||'تعذر الاتصال بخدمة الحفظ'));error.status=response.status;error.code=code;throw error}
 const data=response.status===204?null:await response.json();
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 return data;
}
async function cloudSignOut(ask=false){
 if(ask&&cloudSession&&!confirm('هذه مساحة ضيف مرتبطة بهذا المتصفح. بعد تسجيل الخروج لن تستطيع العودة إلى بياناتها بالاسم وحده. احفظ نسخة احتياطية قبل الخروج. هل تريد تسجيل الخروج؟'))return;
 const previous=cloudSession,headers=cloudSession?cloudHeaders():null;
 cloudSessionEpoch++;cloudSession=null;refreshTask=null;try{cloudRemoveStoredSession(previous,ask)}finally{cloudClearWorkspace();document.querySelector('#auth-panel').hidden=false;document.querySelector('#auth-status').textContent='تم تسجيل الخروج. أنشئ مساحة جديدة للبدء.'}
 if(headers)try{await fetch(cloudConfig.url+'/auth/v1/logout',{method:'POST',headers})}catch{}
}
async function cloudState(){
 if(!cloudSession?.user?.id)throw Error('أنشئ مساحتك الخاصة لعرض الحركات');
 const owner=encodeURIComponent(cloudSession.user.id);
 const result=[],nextRevisions=new Map();let start=0;
 while(true){const page=await cloudRequest('/rest/v1/finance_records?select=id,data,revision&owner_id=eq.'+owner+'&order=id.asc',{headers:{Range:start+'-'+(start+499),'Range-Unit':'items'}});for(const row of page){nextRevisions.set(row.id,row.revision);result.push({...row.data,id:row.id})}if(page.length<500)break;start+=500}
 cloudRevisions=nextRevisions;
 return {records:result,token:'cloud'};
}
async function cloudSave(record,revision){
 if(!cloudCanWrite())throw Error('أنشئ مساحتك الخاصة قبل حفظ الحركات.');
 const saved=await cloudRequest('/rest/v1/rpc/save_finance_record',{method:'POST',body:JSON.stringify({record_id:record.id,record_data:record,expected_revision:revision})});
 cloudRevisions.set(record.id,saved);
 const index=records.findIndex(r=>r.id===record.id);
 if(index<0)records.push(record);else records[index]=record;
 return {ok:true,record};
}
async function cloudPost(path,p){
 if(!cloudSession)throw Error('سجل الدخول أولًا');
 if(!cloudCanWrite())throw Error('أنشئ مساحتك الخاصة قبل تعديل الحركات والمرفقات.');
 if(path==='/api/save'){
 const amount=cents(p.amount),payments=p.payments.map(x=>{if(!x.date)throw Error('حدد تاريخ السداد');const n=cents(x.amount);if(!n)throw Error('أدخل مبلغ الدفعة');return {...x,amount:n}});
 if(!p.description.trim()||!amount)throw Error('أدخل البيان والمبلغ');
 if(payments.reduce((s,x)=>s+x.amount,0)>amount)throw Error('السداد يتجاوز قيمة الحركة');
 const previous=records.find(r=>r.id===p.id);
 return cloudSave(preparePaymentRecord(previous,{...previous,...p,id:previous?.id||crypto.randomUUID(),amount,payments,attachments:previous?.attachments||[]}),previous?cloudRevisions.get(previous.id):0);
 }
 const previous=records.find(r=>r.id===p.id);if(!previous)throw Error('احفظ الحركة أولًا');
 if(!/^(JVBERi0|iVBORw0KGgo|\/9j\/)/.test(p.content))throw Error('المسموح PDF وPNG وJPEG');
 const id=crypto.randomUUID(),raw=atob(p.content),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(bytes.length>20000000)throw Error('الملف أكبر من 20 ميجابايت');
 const type=p.content.startsWith('JVBER')?'application/pdf':p.content.startsWith('iVBOR')?'image/png':'image/jpeg';
 await cloudRequest('/storage/v1/object/finance-documents/'+previous.id+'/'+id,{method:'POST',headers:{'Content-Type':type},body:bytes});
 return cloudSave({...previous,attachments:[...previous.attachments,{id,name:p.name,path:previous.id+'/'+id}]},cloudRevisions.get(previous.id));
}
async function cloudFile(path){
 const epoch=cloudSessionEpoch;
 const signed=await cloudRequest('/storage/v1/object/sign/finance-documents/'+path,{method:'POST',body:JSON.stringify({expiresIn:60})});
 const response=await fetch(cloudConfig.url+'/storage/v1'+signed.signedURL);
 if(!response.ok)throw Error('تعذر تنزيل المستند');
 const blob=await response.blob();if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة المساحة.');return blob;
}
function cloudWorkspaceName(){const name=cloudSession?.user?.user_metadata?.display_name;return typeof name==='string'&&name.trim()?name.trim().slice(0,80):'مساحة المستخدم'}
function cloudApplyWorkspace(){document.querySelector('#account-name').textContent=cloudWorkspaceName();document.querySelector('#workspace-name').textContent=cloudWorkspaceName();document.querySelector('#migrate-local').hidden=!cloudCanWrite()}
async function cloudShowSession(){
 const epoch=cloudSessionEpoch;
 try{await load();if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة المساحة.');cloudApplyWorkspace();document.querySelector('#auth-panel').hidden=true;document.querySelector('#ledger').hidden=false;document.querySelector('#account-actions').hidden=false;if(window.journalLoad)await window.journalLoad()}
 catch(error){if(epoch===cloudSessionEpoch){document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;document.querySelector('#auth-status').textContent=error.message}throw error}
}
async function cloudAcceptSession(candidate){
 if(!candidate?.access_token||!candidate.refresh_token)throw Error('تعذر إنشاء جلسة المساحة. حاول مجددًا.');
 cloudSessionEpoch++;cloudSession=null;refreshTask=null;cloudClearWorkspace();const epoch=cloudSessionEpoch;
 let session=candidate;const expectedUserId=candidate.user_id||candidate.user?.id;
 const refreshed=Number(session.expires_at)<Date.now()/1000+60;
 if(refreshed)session=await cloudRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
 // Preserve Auth-issued credentials before a later network failure can lose a guest.
 if(refreshed||candidate.user?.id){
 if(!session.user?.id||(expectedUserId&&session.user.id!==expectedUserId))throw Error('تغيّرت هوية المساحة. أعد فتح الموقع.');
 const stored=JSON.parse(localStorage.getItem(cloudAuthStorageKey)||'null');
 if(stored&&stored.refresh_token!==candidate.refresh_token)throw Error('تغيّرت مساحة هذا المتصفح. أعد فتح الموقع.');
 cloudPersistSession(session);
 }
 let user;try{user=await cloudRequest('/auth/v1/user',{headers:{Authorization:'Bearer '+session.access_token}})}catch(error){error.authSession=session;throw error}
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة المساحة. أعد المحاولة.');
 if(!user?.id||(expectedUserId&&user.id!==expectedUserId))throw Error('جلسة المساحة غير صالحة.');
 const stored=JSON.parse(localStorage.getItem(cloudAuthStorageKey)||'null');if(stored&&stored.refresh_token!==session.refresh_token)throw Error('تغيّرت مساحة هذا المتصفح. أعد فتح الموقع.');
 cloudSession={access_token:session.access_token,refresh_token:session.refresh_token,token_type:'bearer',expires_at:session.expires_at||Date.now()/1000+(Number(session.expires_in)>0?Number(session.expires_in):3600),user};
 cloudPersistSession();await cloudShowSession();
}
async function cloudRestoreSession(){
 let saved;try{saved=JSON.parse(localStorage.getItem(cloudAuthStorageKey)||'null')}catch{localStorage.removeItem(cloudAuthStorageKey);return}
 if(!saved)return;
 if(saved.project!==cloudConfig.url||!saved.access_token||!saved.refresh_token){localStorage.removeItem(cloudAuthStorageKey);return}
 const button=document.querySelector('#auth-form').querySelector('button');cloudAuthBusy=true;button.disabled=true;document.querySelector('#auth-status').textContent='جارٍ فتح مساحتك المحفوظة…';
 const restoring=cloudAcceptSession(saved),epoch=cloudSessionEpoch;
 try{await restoring}catch(error){if(epoch!==cloudSessionEpoch)return;cloudSession=null;cloudClearWorkspace();document.querySelector('#auth-panel').hidden=false;if(error.status===401||error.status===400)cloudRemoveStoredSession(error.authSession||saved);document.querySelector('#auth-status').textContent='تعذر فتح المساحة: '+error.message}finally{if(epoch===cloudSessionEpoch){cloudAuthBusy=false;button.disabled=false}}
}
async function cloudCreateWorkspace(){
 const form=document.querySelector('#auth-form'),status=document.querySelector('#auth-status');
 if(cloudAuthBusy||!form.reportValidity())return;
 const name=form.elements.display_name.value.trim();if(!name){status.textContent='أدخل اسم مساحتك.';return}
 if(localStorage.getItem(cloudAuthStorageKey)){status.textContent='لديك مساحة محفوظة في هذا المتصفح. أعد تحميل الصفحة لفتحها، أو حاول عندما يعود الاتصال.';return}
 cloudAuthBusy=true;const button=form.querySelector('button');button.disabled=true;status.textContent='جارٍ إنشاء مساحتك الخاصة…';
 try{
 const session=await cloudRequest('/auth/v1/signup',{method:'POST',body:JSON.stringify({data:{display_name:name.slice(0,80)}})});
 await cloudAcceptSession(session);form.reset();status.textContent='';
 }catch(error){status.textContent=error.message}finally{cloudAuthBusy=false;button.disabled=false}
}
if(cloudEnabled){
 financeState=cloudState;financePost=cloudPost;
 document.querySelector('a[href="/file/source"]').remove();
 document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;
 document.querySelector('.pill').textContent='● مساحة المستخدم الخاصة';
 document.querySelector('#ledger aside').textContent='هذه الحركات والمرفقات تخص مساحتك وحدك. احتفظ بنسخة احتياطية؛ العودة إلى مساحة الضيف تتطلب بقاء بيانات هذا المتصفح.';
 document.querySelector('footer').textContent='تُحفظ الحركات مركزيًا بعد الضغط على حفظ. العملة: الريال السعودي.';
 document.querySelector('#auth-form').onsubmit=event=>{event.preventDefault();cloudCreateWorkspace()};
 document.querySelector('#signout').onclick=()=>cloudSignOut(true);
 document.querySelector('#migrate-local').onclick=async()=>{
 if(!cloudCanWrite()){alert('أنشئ مساحتك الخاصة قبل نقل الحركات.');return}
 if(!confirm('نقل سجلات ومرفقات هذا المتصفح إلى مساحتك الخاصة؟ ستبقى النسخة المحلية محفوظة.'))return;
 const button=document.querySelector('#migrate-local'),epoch=cloudSessionEpoch,owner=cloudSession.user.id;
 const current=()=>epoch===cloudSessionEpoch&&owner===cloudSession?.user?.id;
 const check=()=>{if(!current())throw Error('تغيّرت جلسة المساحة. توقف نقل البيانات المحلية.')};
 const read=async key=>{check();const value=await readStore(key);check();return value};
 const save=async(record,revision)=>{check();const value=await cloudSave(record,revision);check();return value};
 button.disabled=true;let count=0,sourceCount=0;
 try{
 const local=(await read('records'))||[];
 for(const r of local){
 check();
 const existing=records.find(x=>x.id===r.id);
 if(existing&&!existing.localMigrationPending)continue;
 const attachments=[...(existing?.attachments||[])];
 for(const attachment of r.attachments){
 const file=await read('file:'+attachment.id);if(!file)throw Error('مرفق محلي مفقود: '+attachment.name);
 if(!attachments.some(x=>x.id===attachment.id))attachments.push({...attachment,path:r.id+'/'+crypto.randomUUID()});
 }
 let migrated=existing||{...r,attachments:[],localMigrationPending:true,...(r.source?{sourceUnavailable:true}:{})};
 if(!existing)await save(migrated,0);
 for(const attachment of attachments){
 if(migrated.attachments.some(x=>x.id===attachment.id))continue;
 const file=await read('file:'+attachment.id),raw=atob(file.content),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const type=file.content.startsWith('JVBER')?'application/pdf':file.content.startsWith('iVBOR')?'image/png':'image/jpeg';
 check();
 await cloudRequest('/storage/v1/object/finance-documents/'+attachment.path,{method:'POST',headers:{'Content-Type':type},body:bytes});
 check();
 migrated={...migrated,attachments:[...migrated.attachments,attachment]};
 await save(migrated,cloudRevisions.get(r.id));
 }
 const complete={...migrated};delete complete.localMigrationPending;
 await save(complete,cloudRevisions.get(r.id));count++;if(complete.sourceUnavailable)sourceCount++;
 }
 check();await load();check();alert('تم نقل '+count+' حركة. النسخة المحلية لم تتغير.'+(sourceCount?' · '+sourceCount+' حركة لها كشف مصدر محلي؛ أرفق نسخة الكشف من الجهاز الأصلي.':''));
 }catch(e){if(!current())return;await load().catch(()=>{});if(current())alert('توقف النقل: '+e.message+' · النسخة المحلية محفوظة.')}finally{if(current())button.disabled=false}
 };
 document.querySelector('#refresh-cloud').onclick=async()=>{try{await cloudShowSession()}catch(e){alert(e.message)}};
 document.addEventListener('click',async event=>{
 const a=event.target.closest('a');if(!a)return;const href=a.getAttribute('href');
 if(href==='/backup'){
 event.preventDefault();const epoch=cloudSessionEpoch;try{await load();const journals=await journalState(),files={},snapshot=[...records];for(const r of snapshot)for(const file of r.attachments){const blob=await cloudFile(file.path);const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة المساحة.');files[file.id]={name:file.name,content}}if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة المساحة.');downloadBlob(new Blob([JSON.stringify({format:'safwah-finance-v1',records:snapshot,files,journals})],{type:'application/json'}),'safwah-cloud-backup.json')}catch(e){alert('تعذر إنشاء النسخة: '+e.message)}return;
 }
 if(!href?.startsWith('/file/'))return;
 event.preventDefault();try{const file=records.flatMap(r=>r.attachments).find(f=>f.id===decodeURIComponent(href.slice(6)));if(!file?.path)throw Error('هذا المرفق محلي؛ انقله من الجهاز الأصلي');downloadBlob(await cloudFile(file.path),file.name)}catch(e){alert(e.message)}
 },true);
 window.addEventListener('DOMContentLoaded',()=>{cloudRestoreSession()});
 window.addEventListener('storage',event=>{
 if(event.key!==cloudAuthStorageKey&&event.key!==null)return;
 if(event.newValue){try{const saved=JSON.parse(event.newValue);if((!cloudSession&&!cloudAuthBusy)||(cloudSession&&saved.user_id===cloudSession.user.id))return}catch{}}
 cloudSessionEpoch++;cloudSession=null;refreshTask=null;cloudAuthBusy=false;document.querySelector('#auth-form').querySelector('button').disabled=false;cloudClearWorkspace();document.querySelector('#auth-panel').hidden=false;document.querySelector('#auth-status').textContent='تم تسجيل الخروج من المساحة في تبويب آخر.';
 });
}
