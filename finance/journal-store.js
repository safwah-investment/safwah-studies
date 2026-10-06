// Posted journal entries use the current private workspace, independently of cash tracking.
function journalSourceRecords(){return records.map(r=>({...r}))}
function journalStored(row){
 const entry=validateJournalEntry({...row.data,id:row.id});
 return {...entry,postedAt:row.posted_at};
}
function journalValidateLinks(entry,entries,sourceRecords){
 if(entry.sourceRecordId&&!sourceRecords.some(r=>r.id===entry.sourceRecordId))throw Error('الحركة المرتبطة غير موجودة في هذه المساحة');
 if(entry.entryType!=='reversal')return;
 const original=entries.find(e=>e.id===entry.reversalOf);
 if(!original||original.entryType==='reversal')throw Error('القيد الأصلي غير متاح للعكس');
 if(entries.some(e=>e.reversalOf===original.id))throw Error('سبق عكس هذا القيد');
 if(entry.date<original.date)throw Error('تاريخ العكس يجب ألا يسبق القيد الأصلي');
 const swapped=original.lines.map(l=>({account:l.account,debit:l.credit,credit:l.debit}));
 if(JSON.stringify(entry.lines)!==JSON.stringify(swapped)||entry.sourceRecordId!==original.sourceRecordId)throw Error('القيد العكسي يجب أن يعكس جميع أطراف القيد الأصلي');
}
async function journalState(){
 if(!cloudEnabled)return ((await readStore('journals'))||[]).map(e=>({...validateJournalEntry(e),postedAt:e.postedAt}));
 if(!cloudCanWrite())throw Error('أنشئ مساحتك الخاصة لعرض القيود');
 const epoch=cloudSessionEpoch,owner=cloudSession.user.id,result=[];
 for(let start=0;;start+=500){
  const page=await cloudRequest('/rest/v1/finance_journals?select=id,data,posted_at&owner_id=eq.'+encodeURIComponent(owner)+'&order=date.asc,id.asc',{headers:{Range:start+'-'+(start+499),'Range-Unit':'items'}});
  if(epoch!==cloudSessionEpoch||owner!==cloudSession?.user?.id)throw Error('تغيّرت جلسة المساحة');
  result.push(...page.map(journalStored));
  if(page.length<500)return result;
 }
}
async function journalPost(input){
 const entry=validateJournalEntry(input);
 if(cloudEnabled){
  if(!cloudCanWrite())throw Error('أنشئ مساحتك الخاصة قبل ترحيل القيود');
  let result;
  try{result=await cloudRequest('/rest/v1/rpc/post_finance_journal',{method:'POST',body:JSON.stringify({entry})})}
  catch(error){
   const messages={JOURNAL_AUTH_REQUIRED:'انتهت جلسة المساحة. أعد فتح الموقع.',JOURNAL_CONFLICT:'معرّف القيد مستخدم لبيانات مختلفة. حدّث القيود قبل إعادة المحاولة.',JOURNAL_ALREADY_REVERSED:'سبق عكس هذا القيد. حدّث القيود لعرض العكس المحفوظ.',JOURNAL_UNBALANCED:'القيد غير متوازن. يجب أن يتساوى المدين والدائن.',JOURNAL_SOURCE_INVALID:'الحركة المرتبطة غير متاحة في هذه المساحة.',JOURNAL_REVERSAL_INVALID:'القيد الأصلي أو تاريخ العكس أو الحركة المرتبطة غير صالح.',JOURNAL_REVERSAL_MISMATCH:'القيد العكسي يجب أن يعكس جميع أطراف القيد الأصلي.',JOURNAL_DATE_INVALID:'تاريخ القيد غير صالح.',JOURNAL_ACCOUNT_INVALID:'اختر حسابًا من دليل الحسابات.',JOURNAL_AMOUNT_INVALID:'أدخل مبالغ موجبة صحيحة بمنزلتين عشريتين كحد أقصى.',JOURNAL_TOTAL_INVALID:'إجمالي القيد يتجاوز الحد المسموح.'};
   if(messages[error.message])error.message=messages[error.message];throw error;
  }
  if(!result||result.id!==entry.id)throw Error('لم يتأكد حفظ القيد. أعد المحاولة بنفس القيد');
  return journalStored(result);
 }
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),request=store.get('journals');let saved,error;
  request.onsuccess=()=>{try{
   const entries=request.result||[],existing=entries.find(e=>e.id===entry.id);
   if(existing){if(JSON.stringify(validateJournalEntry(existing))!==JSON.stringify(entry))throw Error('معرّف القيد مستخدم لبيانات مختلفة');saved=existing;return}
   journalValidateLinks(entry,entries,journalSourceRecords());
   saved={...entry,postedAt:new Date().toISOString()};store.put([...entries,saved],'journals');
  }catch(e){error=e;tx.abort()}};
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('تعذر حفظ القيد'));
 });
}
function journalValidateBackup(imported,current,sourceRecords){
 if(!Array.isArray(imported))throw Error('قائمة القيود في النسخة غير صالحة');
 const merged=current.map(e=>({...validateJournalEntry(e),postedAt:e.postedAt}));
 for(const raw of imported){
  const entry=validateJournalEntry(raw),existing=merged.find(e=>e.id===entry.id);
  if(existing){if(JSON.stringify(validateJournalEntry(existing))!==JSON.stringify(entry))throw Error('النسخة تتعارض مع قيد محفوظ');continue}
  merged.push({...entry,postedAt:raw.postedAt||new Date().toISOString()});
 }
 for(const entry of merged){
  const others=merged.filter(e=>e.id!==entry.id);
  // Source movements are retained with a full backup. Reversal entries may occur later in the array.
  journalValidateLinks(entry,others,sourceRecords);
 }
 return merged;
}
window.journalSourceRecords=journalSourceRecords;
window.journalState=journalState;
window.journalPost=journalPost;
window.addEventListener('DOMContentLoaded',()=>{if(!cloudEnabled&&window.journalLoad)window.journalLoad()});
