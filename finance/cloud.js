// Optional Supabase adapter. Existing local records and database remain untouched.
const cloudConfig=window.SAFWAH_CLOUD||{};
const cloudEnabled=Boolean(cloudConfig.url||cloudConfig.publishableKey);
let cloudSession=null,cloudRevisions=new Map(),cloudSessionEpoch=0,refreshTask=null;
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
 if(!response.ok){let d={};try{d=await response.json()}catch{}const authErrors={email_not_confirmed:'افتح رسالة تأكيد البريد أولًا، ثم سجّل الدخول.',invalid_credentials:'البريد أو كلمة المرور غير صحيحة.',email_address_not_authorized:'إرسال التأكيد لهذا البريد يحتاج استكمال إعداد خدمة البريد.',weak_password:'اختر كلمة مرور أقوى من 12 حرفًا على الأقل.'};throw Error(d.message==='STALE_RECORD'?'تم تعديل الحركة من جهاز آخر. حدّث الصفحة قبل تعديلها.':authErrors[d.code]||(response.status===429?'بلغت الخدمة حد المحاولات. انتظر قبل المحاولة مجددًا.':response.status===401?'سجل الدخول مجددًا':response.status===403?'الحساب غير مخوّل للوصول إلى المالية':d.msg||d.message||'تعذر الاتصال بخدمة الحفظ'))}
 const data=response.status===204?null:await response.json();
 if(epoch!==cloudSessionEpoch)throw Error('تغيّرت جلسة الدخول. سجّل الدخول مجددًا');
 return data;
}
async function cloudSignOut(){
 const headers=cloudSession?cloudHeaders():null;
 cloudSessionEpoch++;cloudSession=null;refreshTask=null;cloudRevisions.clear();records=[];visible=[];editing=null;render();document.querySelector('#editor').close();document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;document.querySelector('#account-actions').hidden=true;
 if(headers)try{await fetch(cloudConfig.url+'/auth/v1/logout',{method:'POST',headers})}catch{}
}
async function cloudState(){
 if(!cloudSession)throw Error('سجّل دخول المدير لعرض الحركات');
 const permission=await cloudRequest('/rest/v1/finance_admins?select=user_id&user_id=eq.'+encodeURIComponent(cloudSession.user.id));
 if(!permission.length)throw Error('حسابك مسجل، وينتظر تفعيل صلاحية المدير من مالك النظام');
 const result=[],nextRevisions=new Map();let start=0;
 while(true){const page=await cloudRequest('/rest/v1/finance_records?select=id,data,revision&order=id.asc',{headers:{Range:start+'-'+(start+499),'Range-Unit':'items'}});for(const row of page){nextRevisions.set(row.id,row.revision);result.push({...row.data,id:row.id})}if(page.length<500)break;start+=500}
 cloudRevisions=nextRevisions;
 return {records:result,token:'cloud'};
}
async function cloudSave(record,revision){
 const saved=await cloudRequest('/rest/v1/rpc/save_finance_record',{method:'POST',body:JSON.stringify({record_id:record.id,record_data:record,expected_revision:revision})});
 cloudRevisions.set(record.id,saved);
 const index=records.findIndex(r=>r.id===record.id);
 if(index<0)records.push(record);else records[index]=record;
 return {ok:true,record};
}
async function cloudPost(path,p){
 if(!cloudSession)throw Error('سجل الدخول أولًا');
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
if(cloudEnabled){
 financeState=cloudState;financePost=cloudPost;
 document.querySelector('a[href="/file/source"]').remove();
 document.querySelector('#ledger').hidden=true;document.querySelector('#auth-panel').hidden=false;
 document.querySelector('.pill').textContent='● مساحة المدير الخاصة';
 document.querySelector('aside').textContent='الحفظ المركزي مفعّل. السجلات والمرفقات متاحة للمدير المخوّل فقط بعد تسجيل الدخول.';
 document.querySelector('footer').textContent='تُحفظ الحركات مركزيًا بعد الضغط على حفظ. العملة: الريال السعودي.';
 if(cloudConfig.registrationEmail){document.querySelector('#registration-note').textContent='التسجيل الأول متاح لبريد مالك المشروع المعتمد. اختر كلمة مرور من 12 حرفًا على الأقل، ثم أكّد بريدك وسجّل الدخول.';document.querySelector('#auth-form').elements.email.value=cloudConfig.registrationEmail}
 document.querySelector('#auth-form').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,status=document.querySelector('#auth-status'),button=form.querySelector('button');button.disabled=true;status.textContent='';
 try{const d=await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});cloudSessionEpoch++;cloudSession={...d,expires_at:Date.now()/1000+d.expires_in};form.elements.password.value='';await load();document.querySelector('#auth-panel').hidden=true;document.querySelector('#ledger').hidden=false;document.querySelector('#account-actions').hidden=false;document.querySelector('#account-email').textContent=d.user.email}catch(error){status.textContent=error.message}finally{button.disabled=false}
 };
 document.querySelector('#register').onclick=async()=>{
 const form=document.querySelector('#auth-form'),status=document.querySelector('#auth-status'),button=document.querySelector('#register');
 if(button.disabled)return;
 if(!form.reportValidity())return;
 const email=form.elements.email.value.trim().toLowerCase();
 if(cloudConfig.registrationEmail&&email!==cloudConfig.registrationEmail.toLowerCase()){status.textContent='التسجيل الحالي متاح لبريد مالك المشروع المعتمد فقط.';return}
 button.disabled=true;form.querySelector('button').disabled=true;status.textContent='جارٍ إرسال رسالة التأكيد…';
 try{await cloudRequest('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password:form.elements.password.value})});form.elements.password.value='';status.textContent='راجع بريدك، بما فيه الرسائل غير المرغوب فيها، وأكّد الحساب. ثم عد هنا واضغط دخول المدير.'}catch(e){status.textContent=e.message}finally{button.disabled=false;form.querySelector('button').disabled=false}
 };
 document.querySelector('#signout').onclick=cloudSignOut;
 document.querySelector('#migrate-local').onclick=async()=>{
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
 document.querySelector('#refresh-cloud').onclick=async()=>{try{await load()}catch(e){alert(e.message)}};
 document.addEventListener('click',async event=>{
 const a=event.target.closest('a');if(!a)return;const href=a.getAttribute('href');
 if(href==='/backup'){
 event.preventDefault();try{await load();const files={};for(const r of records)for(const file of r.attachments){const blob=await cloudFile(file.path);const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});files[file.id]={name:file.name,content}}downloadBlob(new Blob([JSON.stringify({format:'safwah-finance-v1',records,files})],{type:'application/json'}),'safwah-cloud-backup.json')}catch(e){alert('تعذر إنشاء النسخة: '+e.message)}return;
 }
 if(!href?.startsWith('/file/'))return;
 event.preventDefault();try{const file=records.flatMap(r=>r.attachments).find(f=>f.id===decodeURIComponent(href.slice(6)));if(!file?.path)throw Error('هذا المرفق محلي؛ انقله من الجهاز الأصلي');downloadBlob(await cloudFile(file.path),file.name)}catch(e){alert(e.message)}
 },true);
}
