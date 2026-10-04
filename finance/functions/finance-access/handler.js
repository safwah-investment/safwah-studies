const OWNER_EMAIL='afalsuhaimi@gmail.com';
const SITE_URL='https://safwah-investment.github.io/safwah-studies/finance/';
export function corsHeaders(origin){return {'Access-Control-Allow-Origin':origin||'https://safwah-investment.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json; charset=utf-8'}}
export function allowedOrigin(origin){return !origin||origin==='https://safwah-investment.github.io'}
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function notificationMessage(row,from){
 const role=row.access_role==='editor'?'الاطلاع والإضافة والتعديل':'الاطلاع فقط';
 const request=row.kind==='request',approved=row.kind==='approved';
 const link=request?SITE_URL+'?review='+encodeURIComponent(row.request_id):SITE_URL;
 const subject=request?'صفوة — طلب اعتماد بريد':approved?'صفوة — تم اعتماد بريدك':'صفوة — نتيجة طلب الدخول';
 const text=request?`ورد طلب اعتماد البريد ${row.email}. راجعه من حساب مالك المشروع: ${link}\nلا يتم فتح البيانات إلا بعد الاعتماد والتحقق من ملكية البريد.`:approved?`تم اعتماد بريدك لدى صفوة بصلاحية ${role}. افتح الموقع واطلب رابط الدخول إلى بريدك: ${link}`:`لم يعتمد مالك المشروع طلب الدخول لهذا البريد. يمكنك مراجعة إدارة صفوة. ${link}`;
 return {from,to:[request?OWNER_EMAIL:row.email],subject,text,html:`<div lang="ar" dir="rtl" style="font-family:Arial,sans-serif"><h2>${esc(subject)}</h2><p>${esc(text).replace(/\n/g,'<br>')}</p><a href="${esc(link)}">${request?'مراجعة الطلب من حساب المالك':'فتح موقع صفوة'}</a></div>`};
}
export function createFinanceAccessHandler({env,fetchMail=fetch,waitUntil=task=>task.catch(()=>{})}){
 const configured=()=>Boolean(env('RESEND_API_KEY')&&env('SAFWAH_MAIL_FROM'));
 const json=(request,body,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders(request.headers.get('origin'))});
 async function deliver(admin){
  if(!configured())return {configured:false,delivered:0};
  const claim=await admin.rpc('claim_finance_access_notifications',{limit_count:10});
  if(claim.error)throw Error('NOTIFICATION_CLAIM_FAILED');
  let delivered=0;
  for(const row of claim.data||[]){
   let success=false;
   try{
    const response=await fetchMail('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'safwah-access-'+row.id},body:JSON.stringify(notificationMessage(row,env('SAFWAH_MAIL_FROM'))),signal:AbortSignal.timeout(10000)});
    success=response.ok;
   }catch{}
   const complete=await admin.rpc('complete_finance_access_notification',{notification_id:row.id,delivered:success});
   if(complete.error)throw Error('NOTIFICATION_COMPLETE_FAILED');
   if(success)delivered++;
  }
  return {configured:true,delivered};
 }
 const background=admin=>{waitUntil(deliver(admin).catch(()=>{console.warn('Finance notification delivery pending')}))};
 return async function handle(request,ctx){
  if(request.method!=='POST')return json(request,{message:'طريقة الطلب غير متاحة'},405);
  let body;
  try{const text=await request.text();if(text.length>2048)throw Error();body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{return json(request,{message:'طلب غير صالح'},400)}
  if(body.action==='request'){
   if(typeof body.email!=='string'||body.email.length>254)return json(request,{message:'أدخل بريدًا إلكترونيًا صحيحًا'},400);
   const result=await ctx.supabase.rpc('request_finance_access',{email:body.email});
   if(result.error)return json(request,{message:'تعذّر حفظ طلب الاعتماد. راجع البريد وحاول لاحقًا.'},400);
   background(ctx.supabaseAdmin);
   return json(request,{accepted:true});
  }
  if(body.action==='decide'){
   if(ctx.authMode!=='user')return json(request,{message:'سجّل دخول مالك المشروع لاعتماد الطلبات'},401);
   if(!/^[a-f0-9-]{36}$/i.test(body.requestId||'')||typeof body.approve!=='boolean'||!['viewer','editor'].includes(body.role||'viewer'))return json(request,{message:'قرار الاعتماد غير صالح'},400);
   // The RPC checks the confirmed owner in auth.users, independent of user metadata.
   const result=await ctx.supabase.rpc('decide_finance_access_request',{request_id:body.requestId,approve:body.approve,desired_role:body.role||'viewer'});
   if(result.error)return json(request,{message:'اعتماد الطلبات متاح لمالك المشروع وحده'},403);
   background(ctx.supabaseAdmin);
   return json(request,result.data);
  }
  if(body.action==='health'||body.action==='deliver'){
   if(ctx.authMode!=='secret'){
    if(ctx.authMode!=='user')return json(request,{message:'غير مخوّل'},401);
    const owner=await ctx.supabase.rpc('list_finance_access_requests',{status_filter:'pending'});
    if(owner.error)return json(request,{message:'غير مخوّل'},403);
   }
   if(body.action==='health')return json(request,{notificationsConfigured:configured()});
   try{return json(request,await deliver(ctx.supabaseAdmin))}catch{return json(request,{message:'تعذّر إرسال التنبيهات. الطلبات محفوظة للمراجعة.'},503)}
  }
  return json(request,{message:'طلب غير معروف'},400);
 };
}
