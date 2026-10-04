// Optional Supabase adapter. Existing local records and database remain untouched.
const cloudConfig=window.SAFWAH_CLOUD||{};
const cloudEnabled=Boolean(cloudConfig.url||cloudConfig.publishableKey);
let cloudSession=null,cloudRevisions=new Map(),cloudSessionEpoch=0,refreshTask=null,cloudRole=null,cloudAuthBusy=false,cloudApprovalLoad=0;
const cloudOwnerEmail=(cloudConfig.ownerEmail||'afalsuhaimi@gmail.com').toLowerCase();
const cloudCallbackParams=cloudEnabled?cloudReadCallback():null;
function cloudCanWrite(){return cloudRole==='owner'||cloudRole==='editor'}
function cloudIsOwner(){return cloudRole==='owner'&&cloudSession?.user?.email?.toLowerCase()===cloudOwnerEmail}
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
 if(!r.ok){await cloudSignOut();throw Error('انتهت جلسة الدخول. سجل الدخول مجددًا')}
 const d=await r.json();
 if(epoch!==cloudSessionEpoch||cloudSession!==session)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 cloudSession={...d,expires_at:Date.now()/1000+d.expires_in};
 })().finally(()=>{if(refreshTask===task)refreshTask=null});refreshTask=task;
 }
 await refreshTask;
 }
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 const response=await fetch(cloudConfig.url+path,{...options,headers:{...cloudHeaders(),...options.headers}});
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 if(!response.ok){let d={};try{d=await response.json()}catch{}const authErrors={email_not_confirmed:'أكّد بريدك من رابط الدخول أولًا.',email_address_not_authorized:'تعذّر إرسال رابط الدخول إلى هذا البريد. تواصل مع مالك المشروع.',otp_expired:'انتهت صلاحية رابط الدخول. اطلب رابطًا جديدًا.',over_email_send_rate_limit:'انتظر قليلًا قبل طلب رابط دخول جديد.',email_provider_disabled:'خدمة الدخول بالبريد غير متاحة حاليًا. تواصل مع مالك المشروع.'};throw Error(d.message==='STALE_RECORD'?'تم تعديل الحركة من جهاز آخر. حدّث الصفحة قبل تعديلها.':authErrors[d.code]||(response.status===429?'بلغت الخدمة حد المحاولات. انتظر قبل المحاولة مجددًا.':response.status===401?'سجل الدخول مجددًا':response.status===403?'الحساب غير مخوّل للوصول إلى المالية':d.msg||d.message||d.error||'تعذر الاتصال بخدمة الحفظ'))}
 const data=response.status===204?null:await response.json();
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 return data;
}
async function cloudSignOut(){
 const headers=cloudSession?cloudHeaders():null;
 cloudSessionEpoch++;cloudSession=null;cloudRole=null;refreshTask=null;cloudRevisions.clear();records=[];visible=[];editing=null;render();document.querySelector('#editor').close();document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;document.querySelector('#account-actions').hidden=true;document.querySelector('#approval-panel').hidden=true;document.querySelector('#auth-status').textContent='تم تسجيل الخروج.';
 if(headers)try{await fetch(cloudConfig.url+'/auth/v1/logout',{method:'POST',headers})}catch{}
}
async function cloudState(){
 if(!cloudSession?.user)throw Error('سجّل الدخول بالبريد لعرض الحركات');
 cloudRole=null;
 const id=encodeURIComponent(cloudSession.user.id),members=await cloudRequest('/rest/v1/finance_members?select=access_role&user_id=eq.'+id);
 if(members.length&&['editor','viewer'].includes(members[0].access_role))cloudRole=members[0].access_role;
 if(!cloudRole||cloudSession.user.email.toLowerCase()===cloudOwnerEmail){const legacy=await cloudRequest('/rest/v1/finance_admins?select=user_id&user_id=eq.'+id);if(legacy.length)cloudRole=cloudSession.user.email.toLowerCase()===cloudOwnerEmail?'owner':'editor'}
 if(!cloudRole){const error=Error('تم تأكيد بريدك. ينتظر حسابك اعتماد مالك المشروع؛ يمكنك إرسال طلب اعتماد البريد أدناه.');error.code='FINANCE_PENDING';throw error}
 const result=[],nextRevisions=new Map();let start=0;
 while(true){const page=await cloudRequest('/rest/v1/finance_records?select=id,data,revision&order=id.asc',{headers:{Range:start+'-'+(start+499),'Range-Unit':'items'}});for(const row of page){nextRevisions.set(row.id,row.revision);result.push({...row.data,id:row.id})}if(page.length<500)break;start+=500}
 cloudRevisions=nextRevisions;
 return {records:result,token:'cloud'};
}
async function cloudSave(record,revision){
 if(!cloudCanWrite())throw Error('صلاحيتك للاطلاع فقط؛ حفظ الحركات متاح للمحرّر المعتمد.');
 const saved=await cloudRequest('/rest/v1/rpc/save_finance_record',{method:'POST',body:JSON.stringify({record_id:record.id,record_data:record,expected_revision:revision})});
 cloudRevisions.set(record.id,saved);
 const index=records.findIndex(r=>r.id===record.id);
 if(index<0)records.push(record);else records[index]=record;
 return {ok:true,record};
}
async function cloudPost(path,p){
 if(!cloudSession)throw Error('سجل الدخول أولًا');
 if(!cloudCanWrite())throw Error('صلاحيتك للاطلاع فقط؛ تعديل الحركات والمرفقات متاح للمحرّر المعتمد.');
 if(path==='/api/save'){
 const amount=cents(p.amount),payments=p.payments.map(x=>{if(!x.date)throw Error('حدد تاريخ السداد');const n=cents(x.amount);if(!n)throw Error('أدخل مبلغ الدفعة');return {...x,amount:n}});
 if(!p.description.trim()||!amount)throw Error('أدخل البيان والمبلغ');
 if(payments.reduce((s,x)=>s+x.amount,0)>amount)throw Error('السداد يتجاوز قيمة الحركة');
 const previous=records.find(r=>r.id===p.id);
 return cloudSave({...previous,...p,id:previous?.id||crypto.randomUUID(),amount,payments,attachments:previous?.attachments||[]},previous?cloudRevisions.get(previous.id):0);
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
 const signed=await cloudRequest('/storage/v1/object/sign/finance-documents/'+path,{method:'POST',body:JSON.stringify({expiresIn:60})});
 const response=await fetch(cloudConfig.url+'/storage/v1'+signed.signedURL);
 if(!response.ok)throw Error('تعذر تنزيل المستند');
 return response.blob();
}
function cloudEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cloudApplyRole(){
 const readOnly=cloudRole==='viewer';
 document.querySelector('#new').hidden=readOnly;
 document.querySelector('.payroll-actions').hidden=readOnly;
 document.querySelector('#migrate-local').hidden=!cloudCanWrite();
 document.querySelector('#account-role').textContent=cloudRole==='owner'?'مالك المشروع':cloudRole==='editor'?'محرّر معتمد':readOnly?'اطلاع وتصدير':'بانتظار الاعتماد';
 document.querySelector('#approval-panel').hidden=!cloudIsOwner();
 document.querySelectorAll('.edit').forEach(button=>{button.textContent=readOnly?'عرض':'فتح'});
 if(readOnly&&!records.length){const empty=document.querySelector('#rows .empty');if(empty)empty.innerHTML='<strong>لا توجد حركات مسجلة بعد</strong><p>ستظهر هنا الحركات التي يسجّلها المحرّر المعتمد.</p>'}
}
function cloudReadOnlyEditor(){
 if(cloudRole!=='viewer')return;
 document.querySelector('#title').textContent='عرض الحركة';
 document.querySelectorAll('#form input,#form select,#form textarea').forEach(input=>{input.disabled=true});
 document.querySelectorAll('#payments button').forEach(button=>{button.hidden=true});
 document.querySelector('#addpay').hidden=true;document.querySelector('#file').closest('label').hidden=true;document.querySelector('#save').hidden=true;
}
async function cloudLoadAccessRequests(){
 if(!cloudIsOwner())throw Error('اعتماد الطلبات متاح لمالك المشروع فقط.');
 const status=document.querySelector('#approval-status'),list=document.querySelector('#approval-requests');
 const filter=document.querySelector('#request-status-filter').value,statusFilter=filter==='all'?null:['pending','approved','rejected'].includes(filter)?filter:'pending',requestNumber=++cloudApprovalLoad;
 status.textContent='جارٍ جلب طلبات الاعتماد…';
 try{
 const requests=await cloudRequest('/rest/v1/rpc/list_finance_access_requests',{method:'POST',body:JSON.stringify({status_filter:statusFilter})});
 if(!cloudIsOwner()||requestNumber!==cloudApprovalLoad)return;
 const labels={pending:'بانتظار الاعتماد',approved:'معتمد',rejected:'مرفوض'};
 list.innerHTML=requests.length?requests.map(request=>'<article class="approval-request" data-request-id="'+cloudEscape(request.id)+'" data-request-status="'+cloudEscape(request.status)+'"><div><strong dir="ltr">'+cloudEscape(request.email)+'</strong><p class="muted">'+cloudEscape(labels[request.status]||request.status)+' · '+(request.email_verified?'البريد مؤكّد':'سيؤكّد صاحب الطلب بريده برابط الدخول')+' · '+cloudEscape(new Date(request.requested_at).toLocaleDateString('ar-SA'))+'</p></div><label>الصلاحية<select aria-label="صلاحية '+cloudEscape(request.email)+'"><option value="viewer"'+(request.access_role!=='editor'?' selected':'')+'>اطلاع وتصدير</option><option value="editor"'+(request.access_role==='editor'?' selected':'')+'>إضافة وتعديل</option></select></label><div class="approval-buttons"><button type="button" data-approve="true">'+(request.status==='approved'?'تحديث الاعتماد':'اعتماد')+'</button><button type="button" class="secondary" data-approve="false">'+(request.status==='approved'?'إلغاء الاعتماد':'رفض')+'</button></div></article>').join(''):'<p class="muted">لا توجد طلبات ضمن الحالة المحددة.</p>';
 list.querySelectorAll('button[data-approve]').forEach(button=>{button.onclick=()=>cloudDecideAccess(button.closest('.approval-request'),button.dataset.approve==='true')});
 status.textContent=requests.length?'الطلبات المعروضة: '+requests.length:'';
 }catch(error){if(requestNumber===cloudApprovalLoad)status.textContent=error.message}
}
async function cloudDecideAccess(row,approve){
 if(!cloudIsOwner())throw Error('اعتماد الطلبات متاح لمالك المشروع فقط.');
 const buttons=[...row.querySelectorAll('button')],status=document.querySelector('#approval-status');
 if(buttons.some(button=>button.disabled))return;
 buttons.forEach(button=>{button.disabled=true});status.textContent=approve?'جارٍ اعتماد الطلب…':'جارٍ رفض الطلب…';
 try{
 await cloudRequest('/functions/v1/finance-access',{method:'POST',body:JSON.stringify({action:'decide',requestId:row.dataset.requestId,approve,role:row.querySelector('select').value})});
 await cloudLoadAccessRequests();status.textContent=approve?'تم اعتماد الطلب. يمكن لصاحب البريد طلب رابط الدخول من الموقع.':row.dataset.requestStatus==='approved'?'تم إلغاء الاعتماد.':'تم رفض الطلب.';
 }catch(error){status.textContent=error.message}finally{buttons.forEach(button=>{button.disabled=false})}
}
async function cloudDeliverNotifications(){
 if(!cloudIsOwner())throw Error('إرسال التنبيهات متاح لمالك المشروع فقط.');
 const button=document.querySelector('#retry-notifications'),status=document.querySelector('#approval-status');
 if(button.disabled)return;button.disabled=true;status.textContent='جارٍ إعادة إرسال التنبيهات…';
 try{
 const result=await cloudRequest('/functions/v1/finance-access',{method:'POST',body:JSON.stringify({action:'deliver'})});
 status.textContent=result.configured===false?'تنبيهات البريد غير مفعّلة بعد. طلبات الاعتماد محفوظة.':'تم إرسال '+(Number.isInteger(result.delivered)&&result.delivered>=0?result.delivered:0)+' تنبيه.';
 }catch(error){status.textContent=error.message}finally{button.disabled=false}
}
async function cloudShowSession(){
 document.querySelector('#account-actions').hidden=false;
 document.querySelector('#account-email').textContent=cloudSession.user.email;
 document.querySelector('#auth-form').elements.email.value=cloudSession.user.email;
 try{
 await load();cloudApplyRole();document.querySelector('#auth-panel').hidden=true;document.querySelector('#ledger').hidden=false;
 if(cloudIsOwner())await cloudLoadAccessRequests();
 }catch(error){document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;document.querySelector('#auth-status').textContent=error.message;cloudApplyRole();if(error.code!=='FINANCE_PENDING')throw error}
}
async function cloudAcceptMagicLink(params){
 const token=params.get('access_token'),refreshToken=params.get('refresh_token');
 if(!token||!refreshToken)throw Error('رابط الدخول غير مكتمل. اطلب رابطًا جديدًا.');
 cloudSessionEpoch++;cloudSession=null;cloudRole=null;refreshTask=null;
 const epoch=cloudSessionEpoch;
 // The callback is untrusted until Auth validates the token and returns its user.
 const user=await cloudRequest('/auth/v1/user',{headers:{Authorization:'Bearer '+token}});
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. اطلب رابطًا جديدًا.');
 if(!user?.id||!user.email||!user.email_confirmed_at)throw Error('لم يكتمل تأكيد البريد. اطلب رابط دخول جديدًا.');
 const seconds=Number(params.get('expires_in'));
 cloudSession={access_token:token,refresh_token:refreshToken,token_type:'bearer',expires_at:Date.now()/1000+(seconds>0&&seconds<=86400?seconds:3600),user};
 await cloudShowSession();
}
function cloudReadCallback(){
 const params=new URLSearchParams(window.location.hash.slice(1));
 if(!params.has('access_token')&&!params.has('error')&&!params.has('error_code'))return null;
 // Clear tokens before any network request, including failures. Never persist them.
 window.history.replaceState(null,'',window.location.pathname+window.location.search);
 return params;
}
async function cloudHandleCallback(params=cloudCallbackParams||cloudReadCallback()){
 if(!params)return;
 const status=document.querySelector('#auth-status');status.textContent='جارٍ التحقق من رابط الدخول…';
 try{if(params.has('error')||params.has('error_code'))throw Error('رابط الدخول منتهي أو غير صالح. اطلب رابطًا جديدًا.');await cloudAcceptMagicLink(params)}catch(error){status.textContent=error.message}
}
async function cloudSendAuthRequest(action){
 const form=document.querySelector('#auth-form'),status=document.querySelector('#auth-status');
 if(cloudAuthBusy||!form.reportValidity())return;
 cloudAuthBusy=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>{button.disabled=true});
 const email=form.elements.email.value.trim().toLowerCase();
 status.textContent=action==='request'?'جارٍ إرسال طلب الاعتماد…':'جارٍ إرسال رابط الدخول…';
 try{
 if(action==='request'){
 await cloudRequest('/functions/v1/finance-access',{method:'POST',body:JSON.stringify({action:'request',email})});
 status.textContent='تم استلام طلب اعتماد البريد. بعد اعتماد المالك، اطلب رابط الدخول من هنا وافتحه في بريدك.';
 }else{
 const redirect=cloudConfig.redirectUrl||window.location.origin+window.location.pathname;
 await cloudRequest('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:JSON.stringify({email,create_user:true})});
 status.textContent='راجع بريدك والرسائل غير المرغوب فيها، وافتح رابط الدخول. الاطلاع على المالية يتطلب اعتماد مالك المشروع.';
 }
 }catch(error){status.textContent=error.message}finally{cloudAuthBusy=false;buttons.forEach(button=>{button.disabled=false})}
}
if(cloudEnabled){
 financeState=cloudState;financePost=cloudPost;
 document.querySelector('a[href="/file/source"]').remove();
 document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;
 document.querySelector('.pill').textContent='● مساحة مالية خاصة';
 document.querySelector('aside').textContent='تُحفظ الحركات مركزيًا. الدخول برابط يصل إلى بريدك، والاطلاع أو التعديل حسب الصلاحية التي يعتمدها مالك المشروع.';
 document.querySelector('footer').textContent='تُحفظ الحركات مركزيًا بعد الضغط على حفظ. العملة: الريال السعودي.';
 document.querySelector('#auth-form').addEventListener('invalid',()=>{document.querySelector('#auth-status').textContent='أدخل بريدًا إلكترونيًا صحيحًا. لم يُرسل الطلب بعد.'},true);
 document.querySelector('#auth-form').onsubmit=event=>{event.preventDefault();cloudSendAuthRequest('login')};
 document.querySelector('#request-access').onclick=()=>cloudSendAuthRequest('request');
 document.querySelector('#refresh-requests').onclick=cloudLoadAccessRequests;
 document.querySelector('#request-status-filter').onchange=cloudLoadAccessRequests;
 document.querySelector('#retry-notifications').onclick=cloudDeliverNotifications;
 document.querySelector('#signout').onclick=cloudSignOut;
 document.querySelector('#migrate-local').onclick=async()=>{
 if(!cloudCanWrite()){alert('نقل الحركات متاح للمحرّر المعتمد فقط.');return}
 if(!confirm('نقل سجلات ومرفقات هذا المتصفح إلى مساحة صفوة الخاصة في Supabase؟ ستبقى النسخة المحلية محفوظة.'))return;
 const button=document.querySelector('#migrate-local');button.disabled=true;let count=0,sourceCount=0;
 try{
 const local=(await readStore('records'))||[];
 for(const r of local){
 const existing=records.find(x=>x.id===r.id);
 if(existing&&!existing.localMigrationPending)continue;
 const attachments=[...(existing?.attachments||[])];
 for(const attachment of r.attachments){
 const file=await readStore('file:'+attachment.id);if(!file)throw Error('مرفق محلي مفقود: '+attachment.name);
 if(!attachments.some(x=>x.id===attachment.id))attachments.push({...attachment,path:r.id+'/'+crypto.randomUUID()});
 }
 let migrated=existing||{...r,attachments:[],localMigrationPending:true,...(r.source?{sourceUnavailable:true}:{})};
 if(!existing)await cloudSave(migrated,0);
 for(const attachment of attachments){
 if(migrated.attachments.some(x=>x.id===attachment.id))continue;
 const file=await readStore('file:'+attachment.id),raw=atob(file.content),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const type=file.content.startsWith('JVBER')?'application/pdf':file.content.startsWith('iVBOR')?'image/png':'image/jpeg';
 await cloudRequest('/storage/v1/object/finance-documents/'+attachment.path,{method:'POST',headers:{'Content-Type':type},body:bytes});
 migrated={...migrated,attachments:[...migrated.attachments,attachment]};
 await cloudSave(migrated,cloudRevisions.get(r.id));
 }
 const complete={...migrated};delete complete.localMigrationPending;
 await cloudSave(complete,cloudRevisions.get(r.id));count++;if(complete.sourceUnavailable)sourceCount++;
 }
 await load();alert('تم نقل '+count+' حركة. النسخة المحلية لم تتغير.'+(sourceCount?' · '+sourceCount+' حركة لها كشف مصدر محلي؛ أرفق نسخة الكشف من الجهاز الأصلي.':''));
 }catch(e){await load().catch(()=>{});alert('توقف النقل: '+e.message+' · النسخة المحلية محفوظة.')}finally{button.disabled=false}
 };
 document.querySelector('#refresh-cloud').onclick=async()=>{try{await cloudShowSession()}catch(e){alert(e.message)}};
 document.addEventListener('click',async event=>{
 const a=event.target.closest('a');if(!a)return;const href=a.getAttribute('href');
 if(href==='/backup'){
 event.preventDefault();try{await load();const files={};for(const r of records)for(const file of r.attachments){const blob=await cloudFile(file.path);const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});files[file.id]={name:file.name,content}}downloadBlob(new Blob([JSON.stringify({format:'safwah-finance-v1',records,files})],{type:'application/json'}),'safwah-cloud-backup.json')}catch(e){alert('تعذر إنشاء النسخة: '+e.message)}return;
 }
 if(!href?.startsWith('/file/'))return;
 event.preventDefault();try{const file=records.flatMap(r=>r.attachments).find(f=>f.id===decodeURIComponent(href.slice(6)));if(!file?.path)throw Error('هذا المرفق محلي؛ انقله من الجهاز الأصلي');downloadBlob(await cloudFile(file.path),file.name)}catch(e){alert(e.message)}
 },true);
 window.addEventListener('DOMContentLoaded',()=>{
 const originalRender=render;render=function(){originalRender();cloudApplyRole()};
 const originalOpenRecord=openRecord;openRecord=function(record,kind){if(!cloudCanWrite()&&!record)return;document.querySelectorAll('#form input,#form select,#form textarea').forEach(input=>{input.disabled=false});document.querySelector('#addpay').hidden=false;document.querySelector('#file').closest('label').hidden=false;document.querySelector('#save').hidden=false;originalOpenRecord(record,kind);cloudReadOnlyEditor()};
 cloudHandleCallback();
 });
}
