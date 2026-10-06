// Accounting reports are independent of the operational movement filters.
(()=>{
 'use strict';
 const q=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)];
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 const typeName=type=>({standard:'قيد اعتيادي',opening:'قيد افتتاحي',reversal:'قيد عكسي'}[type]||'قيد اعتيادي');
 const accountName=code=>journalAccounts.find(a=>a.code===code)?.name||code;
 const balanceLabel=value=>value>0?'مدين':value<0?'دائن':'بلا رصيد';
 const balanceText=value=>money(Math.abs(value))+' '+balanceLabel(value);
 const balanceCell=value=>'<span>'+money(Math.abs(value))+'</span><small>'+balanceLabel(value)+'</small>';
 const shortId=id=>String(id).slice(0,8);
 const totalKeys=['openingDebit','openingCredit','debit','credit','closingDebit','closingCredit'];
 const form=q('#journal-entry-form'),reversalForm=q('#journal-reversal-form');
 let entries=[],loaded=false,activeView='operations',epoch=0,loadId=0,draftId=null,detailId=null,reversalOriginal=null,reversalId=null,posting=false;
 let generalReport=null,trialReport=null,periodEntries=[];

 function status(message){q('#journal-status').textContent=message||''}
 function hasWorkspace(){return typeof cloudEnabled==='undefined'||!cloudEnabled||cloudCanWrite()}
 function accountOptions(placeholder='اختر الحساب'){
  let html='<option value="">'+escape(placeholder)+'</option>',group='';
  for(const account of journalAccounts){if(group!==account.group){if(group)html+='</optgroup>';group=account.group;html+='<optgroup label="'+escape(group)+'">'}html+='<option value="'+escape(account.code)+'">'+escape(account.code+' — '+account.name)+'</option>'}
  return html+(group?'</optgroup>':'');
 }
 function setView(view){
  if(!hasWorkspace())return;
  activeView=view;
  for(const button of all('[data-finance-view]')){const selected=button.dataset.financeView===view;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1}
  q('#ledger').hidden=view!=='operations';q('#journal-workspace').hidden=view==='operations';q('#journal-workspace').dataset.currentView=view;
  for(const name of ['entries','general','trial'])q('#journal-'+name+'-view').hidden=name!==view;
 }
 function bounds(){const from=q('#journal-from').value,to=q('#journal-to').value;if(from&&to&&from>to)throw Error('تاريخ بداية التقرير يجب ألا يتجاوز نهايته.');return{from,to}}
 function emptyRow(columns,message='لا توجد قيود مرحّلة في هذه الفترة.'){return '<tr><td class="journal-empty" colspan="'+columns+'"><strong>'+escape(message)+'</strong>أضف قيدًا متوازنًا. الحركات السابقة تحتاج ترحيلًا محاسبيًا مع تحديد الحساب المقابل.</td></tr>'}
 function entryButton(id,label){return '<button class="journal-link" type="button" data-journal-entry="'+escape(id)+'">'+escape(label||shortId(id))+'</button>'}
 function entryTotals(entry){return entry.lines.reduce((s,line)=>({debit:s.debit+line.debit,credit:s.credit+line.credit}),{debit:0,credit:0})}
 function renderEntries(){
  q('#journal-count').textContent=periodEntries.length+' قيد مرحّل في الفترة';
  q('#journal-entry-rows').innerHTML=periodEntries.map(entry=>{const totals=entryTotals(entry);return '<tr><td>'+escape(entry.date)+'</td><td>'+entryButton(entry.id)+'<small>'+escape(entry.reference)+'</small></td><td class="journal-description">'+escape(entry.description)+'</td><td>'+typeName(entry.entryType)+'</td><td class="journal-money">'+money(totals.debit)+'</td><td class="journal-money">'+money(totals.credit)+'</td><td class="journal-no-print">'+entryButton(entry.id,'عرض التفاصيل')+'</td></tr>'}).join('')||emptyRow(7);
  q('#journal-export').disabled=!loaded||!periodEntries.length;
 }
 function renderGeneral(options){
  const account=q('#journal-general-account').value;
  generalReport=null;q('#journal-general-export').disabled=true;q('#journal-general-print').disabled=true;
  if(!account){q('#journal-general-title').textContent='اختر حسابًا لعرض رصيده وحركته.';q('#journal-general-cards').innerHTML='';q('#journal-general-rows').innerHTML=emptyRow(6,'اختر حسابًا من دليل الحسابات.');return}
  generalReport=buildGeneralLedger(entries,{...options,account});
  const totals=generalReport.rows.reduce((s,row)=>({debit:s.debit+row.debit,credit:s.credit+row.credit}),{debit:0,credit:0});
  q('#journal-general-title').textContent=account+' — '+accountName(account)+' · العملة: الريال السعودي';
  q('#journal-general-cards').innerHTML=[['الرصيد الافتتاحي',balanceText(generalReport.opening)],['حركة الفترة — مدين',money(totals.debit)],['حركة الفترة — دائن',money(totals.credit)],['الرصيد الختامي',balanceText(generalReport.closing)]].map(([label,value])=>'<article class="journal-report-card">'+escape(label)+'<strong>'+escape(value)+'</strong></article>').join('');
  q('#journal-general-rows').innerHTML=generalReport.rows.map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+entryButton(row.entryId)+'<small>'+escape(row.reference)+'</small></td><td class="journal-description">'+escape(row.description)+'</td><td class="journal-money">'+money(row.debit)+'</td><td class="journal-money">'+money(row.credit)+'</td><td class="journal-money">'+balanceCell(row.balance)+'</td></tr>').join('')||emptyRow(6,'لا توجد حركة لهذا الحساب في الفترة.');
  q('#journal-general-export').disabled=!loaded;q('#journal-general-print').disabled=!loaded;
 }
 function renderTrial(options){
  trialReport=buildTrialBalance(entries,options);
  q('#journal-trial-rows').innerHTML=trialReport.rows.map(row=>'<tr><td>'+escape(row.code)+'</td><td>'+escape(row.name)+'</td>'+totalKeys.map(key=>'<td class="journal-money">'+money(row[key])+'</td>').join('')+'</tr>').join('');
  q('#journal-trial-totals').innerHTML='<tr><td colspan="2">الإجمالي بالريال السعودي</td>'+totalKeys.map(key=>'<td class="journal-money">'+money(trialReport.totals[key])+'</td>').join('')+'</tr>';
  const badge=q('#journal-trial-balanced');badge.className=entries.length?'journal-balanced'+(trialReport.balanced?'':' journal-unbalanced'):'muted';
  badge.textContent=entries.length?(trialReport.balanced?'الميزان متوازن: المدين يساوي الدائن.':'الميزان غير متوازن. راجع القيود.'):'لا توجد قيود مرحّلة. الحركات السابقة تحتاج ترحيلًا محاسبيًا؛ الأرصدة المعروضة صفر.';
  q('#journal-trial-export').disabled=!loaded;q('#journal-trial-print').disabled=!loaded;
 }
 function renderReports(){
  try{const options=bounds();q('#journal-period-note').textContent='الفترة: '+(options.from||'من بداية القيود')+' — '+(options.to||'حتى آخر قيد')+' · العملة: الريال السعودي';periodEntries=entries.filter(entry=>(!options.from||entry.date>=options.from)&&(!options.to||entry.date<=options.to)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));renderEntries();renderGeneral(options);renderTrial(options);status('')}
  catch(error){periodEntries=[];generalReport=null;trialReport=null;for(const name of ['journal-export','journal-general-export','journal-general-print','journal-trial-export','journal-trial-print'])q('#'+name).disabled=true;q('#journal-entry-rows').innerHTML=emptyRow(7,'صحّح فترة التقرير.');q('#journal-general-rows').innerHTML=emptyRow(6,'صحّح فترة التقرير.');q('#journal-general-cards').innerHTML='';q('#journal-trial-rows').innerHTML='';q('#journal-trial-totals').innerHTML='';q('#journal-trial-balanced').textContent='';q('#journal-period-note').textContent='';status(error.message)}
 }
 function closeDialog(id){const dialog=q('#'+id);if(dialog.open)dialog.close()}
 function sourceRecords(){return typeof journalSourceRecords==='function'?journalSourceRecords():[]}
 function sourceRefresh(){
  const select=q('#journal-source'),selected=select.value;
  select.innerHTML='<option value="">دون حركة مرتبطة</option>'+sourceRecords().map(record=>'<option value="'+escape(record.id)+'">'+escape([record.date,record.description,record.reference].filter(Boolean).join(' — '))+'</option>').join('');
  if([...select.options].some(option=>option.value===selected))select.value=selected;
  if(q('#journal-detail-dialog').open&&detailId)renderDetail(detailId);
 }
 function clear(){
  epoch++;loadId++;entries=[];loaded=false;periodEntries=[];generalReport=null;trialReport=null;posting=false;draftId=null;detailId=null;reversalOriginal=null;reversalId=null;
  for(const id of ['journal-entry-dialog','journal-detail-dialog','journal-reversal-dialog'])closeDialog(id);
  form.reset();reversalForm.reset();q('#journal-draft-lines').innerHTML='';q('#journal-source').innerHTML='<option value="">دون حركة مرتبطة</option>';
  for(const id of ['journal-entry-rows','journal-general-cards','journal-general-rows','journal-trial-rows','journal-trial-totals','journal-detail-content','journal-reversal-lines','journal-reversal-original','journal-draft-error','journal-reversal-error','journal-draft-totals','journal-count','journal-trial-balanced','journal-period-note'])q('#'+id).textContent='';
  q('#journal-from').value='';q('#journal-to').value='';q('#journal-general-account').value='';q('#journal-general-title').textContent='اختر حسابًا لعرض رصيده وحركته.';status('');
  activeView='operations';for(const button of all('[data-finance-view]')){const selected=button.dataset.financeView==='operations';button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1}
  q('#journal-nav').hidden=true;q('#journal-workspace').hidden=true;for(const name of ['entries','general','trial'])q('#journal-'+name+'-view').hidden=true;
  q('#journal-new').disabled=false;q('#journal-refresh').disabled=false;q('#journal-post').disabled=true;q('#journal-reversal-post').disabled=false;document.body.removeAttribute('data-journal-print');document.body.classList.remove('printing-accounting');
 }
 async function load(){
  if(!hasWorkspace()){clear();return}
  const ownEpoch=epoch,requestId=++loadId;q('#journal-refresh').disabled=true;status('جارٍ تحميل القيود…');
  try{const result=await journalState();if(ownEpoch!==epoch||requestId!==loadId)return;entries=result.map(entry=>({...validateJournalEntry(entry),postedAt:entry.postedAt}));loaded=true;q('#journal-nav').hidden=false;renderReports();sourceRefresh();setView(activeView);return true}
  catch(error){if(ownEpoch!==epoch||requestId!==loadId)return;entries=[];loaded=false;q('#journal-nav').hidden=false;renderReports();status('تعذر تحميل القيود: '+error.message);setView(activeView);return false}
  finally{if(ownEpoch===epoch&&requestId===loadId)q('#journal-refresh').disabled=false}
 }
 function parseMoney(value){
  const normalized=String(value).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.');
  if(!normalized)return 0;if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))throw Error('اكتب مبلغًا موجبًا بالريال، حتى منزلتين عشريتين.');
  const [whole,fraction='']=normalized.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount>100000000000)throw Error('مبلغ السطر يتجاوز الحد المسموح.');return amount;
 }
 function addLine(){
  if(posting||q('#journal-draft-lines').children.length>=40)return;
  const row=document.createElement('div');row.className='journal-line';row.innerHTML='<label>الحساب<select data-journal-account required>'+accountOptions()+'</select></label><label>مدين (ريال)<input data-journal-debit type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></label><label>دائن (ريال)<input data-journal-credit type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></label><button type="button" class="secondary" data-journal-remove>حذف</button>';
  row.querySelector('button').onclick=()=>{if(posting||q('#journal-draft-lines').children.length<=2)return;row.remove();updateDraft()};q('#journal-draft-lines').append(row);updateDraft();
 }
 function draft(){return{id:draftId,date:form.elements.date.value,description:form.elements.description.value,reference:form.elements.reference.value,entryType:form.elements.entryType.value,sourceRecordId:form.elements.sourceRecordId.value||null,lines:all('#journal-draft-lines .journal-line').map(row=>({account:row.querySelector('[data-journal-account]').value,debit:parseMoney(row.querySelector('[data-journal-debit]').value),credit:parseMoney(row.querySelector('[data-journal-credit]').value)}))}}
 function updateDraft(){
  let debit=0,credit=0,error='';
  try{const entry=draft();for(const line of entry.lines){debit+=line.debit;credit+=line.credit}validateJournalEntry(entry)}catch(e){error=e.message}
  q('#journal-draft-totals').innerHTML='<span>مجموع المدين: <b>'+money(debit)+'</b></span><span>مجموع الدائن: <b>'+money(credit)+'</b></span><span>الفرق: <b>'+money(Math.abs(debit-credit))+'</b></span>';
  q('#journal-draft-error').textContent=error;q('#journal-post').disabled=posting||Boolean(error);q('#journal-line-add').disabled=posting||q('#journal-draft-lines').children.length>=40;
  for(const button of all('[data-journal-remove]'))button.disabled=posting||q('#journal-draft-lines').children.length<=2;
 }
 function openNew(){
  if(posting||!hasWorkspace())return;form.reset();draftId=crypto.randomUUID();form.elements.date.value=today();q('#journal-draft-lines').innerHTML='';sourceRefresh();addLine();addLine();updateDraft();q('#journal-entry-dialog').showModal();
 }
 function lineTable(lines){const totals=entryTotals({lines});return '<div class="journal-table-wrap"><table class="journal-table"><thead><tr><th>رمز الحساب</th><th>الحساب</th><th>مدين (ريال)</th><th>دائن (ريال)</th></tr></thead><tbody>'+lines.map(line=>'<tr><td>'+escape(line.account)+'</td><td>'+escape(accountName(line.account))+'</td><td class="journal-money">'+money(line.debit)+'</td><td class="journal-money">'+money(line.credit)+'</td></tr>').join('')+'</tbody><tfoot><tr><td colspan="2">الإجمالي</td><td class="journal-money">'+money(totals.debit)+'</td><td class="journal-money">'+money(totals.credit)+'</td></tr></tfoot></table></div>'}
 function renderDetail(id){
  const entry=entries.find(item=>item.id===id);if(!entry)return;detailId=id;
  const source=sourceRecords().find(record=>record.id===entry.sourceRecordId),reverse=entries.find(item=>item.reversalOf===id);
  const postedAt=entry.postedAt?new Date(entry.postedAt).toLocaleString('ar-SA'):'';
  q('#journal-detail-content').innerHTML='<div class="journal-detail-meta"><p>التاريخ: '+escape(entry.date)+'</p><p>النوع: '+typeName(entry.entryType)+'</p><p class="journal-wide">المعرّف: '+escape(entry.id)+'</p><p>المرجع: '+escape(entry.reference||'دون مرجع')+'</p><p>وقت الترحيل: '+escape(postedAt||'غير متاح')+'</p><p class="journal-wide">البيان: '+escape(entry.description)+'</p>'+(entry.sourceRecordId?'<p class="journal-wide">الحركة المرتبطة: '+escape(source?[source.date,source.description,source.reference].filter(Boolean).join(' — '):entry.sourceRecordId)+'</p>':'')+'</div>'+lineTable(entry.lines)+(entry.reversalOf||reverse?'<div class="journal-detail-links">'+(entry.reversalOf?'القيد الأصلي: '+entryButton(entry.reversalOf):'')+(reverse?'القيد العكسي: '+entryButton(reverse.id):'')+'</div>':'');
  q('#journal-reverse').hidden=entry.entryType==='reversal'||Boolean(reverse);q('#journal-reverse').disabled=posting;
 }
 function openDetail(id){if(!entries.some(entry=>entry.id===id))return;renderDetail(id);if(!q('#journal-detail-dialog').open)q('#journal-detail-dialog').showModal()}
 function openReversal(){
  if(posting)return;const entry=entries.find(item=>item.id===detailId);if(!entry||entry.entryType==='reversal'||entries.some(item=>item.reversalOf===entry.id))return;
  reversalOriginal=entry;reversalId=crypto.randomUUID();reversalForm.reset();reversalForm.elements.date.min=entry.date;reversalForm.elements.date.value=today()<entry.date?entry.date:today();q('#journal-reversal-original').textContent='القيد الأصلي: '+shortId(entry.id)+' · '+entry.date+' · '+entry.description;q('#journal-reversal-lines').innerHTML=lineTable(entry.lines.map(line=>({account:line.account,debit:line.credit,credit:line.debit})));q('#journal-reversal-error').textContent='';closeDialog('journal-detail-dialog');q('#journal-reversal-dialog').showModal();
 }
 async function submit(event){
  event.preventDefault();if(posting||!hasWorkspace())return;const ownEpoch=epoch;let failure='';
  try{const entry=validateJournalEntry(draft());posting=true;q('#journal-new').disabled=true;updateDraft();await journalPost(entry);if(ownEpoch!==epoch)return;closeDialog('journal-entry-dialog');draftId=null;const refreshed=await load();if(ownEpoch===epoch)status(refreshed?'تم ترحيل القيد المتوازن وحفظه.':'تم حفظ القيد، وتعذر تحديث العرض. اضغط «تحديث القيود».')}
  catch(error){failure=error.message;if(ownEpoch===epoch)q('#journal-draft-error').textContent=failure}
  finally{if(ownEpoch===epoch){posting=false;q('#journal-new').disabled=false;updateDraft();if(failure)q('#journal-draft-error').textContent=failure}}
 }
 async function submitReversal(event){
  event.preventDefault();if(posting||!reversalOriginal||!hasWorkspace())return;const ownEpoch=epoch;
  try{const reason=reversalForm.elements.reason.value.trim();if(!reason)throw Error('اكتب سبب عكس القيد.');const original=reversalOriginal,entry=validateJournalEntry({id:reversalId,date:reversalForm.elements.date.value,description:'عكس القيد — '+reason,reference:original.reference,sourceRecordId:original.sourceRecordId,entryType:'reversal',reversalOf:original.id,lines:original.lines.map(line=>({account:line.account,debit:line.credit,credit:line.debit}))});if(entry.date<original.date)throw Error('تاريخ العكس يجب ألا يسبق القيد الأصلي.');posting=true;q('#journal-reversal-post').disabled=true;q('#journal-new').disabled=true;q('#journal-reversal-error').textContent='';await journalPost(entry);if(ownEpoch!==epoch)return;closeDialog('journal-reversal-dialog');reversalOriginal=null;reversalId=null;const refreshed=await load();if(ownEpoch===epoch)status(refreshed?'تم ترحيل القيد العكسي. بقي القيد الأصلي محفوظًا.':'تم حفظ القيد العكسي، وتعذر تحديث العرض. اضغط «تحديث القيود».')}
  catch(error){if(ownEpoch===epoch)q('#journal-reversal-error').textContent=error.message}
  finally{if(ownEpoch===epoch){posting=false;q('#journal-new').disabled=false;q('#journal-reversal-post').disabled=false}}
 }
 function exportRows(rows,sheetName,filename){try{downloadBlob(excelWorkbook(rows,sheetName),filename)}catch(error){status('تعذر التصدير: '+error.message)}}
 function exportEntries(){if(!loaded||!periodEntries.length)return;const rows=[['معرّف القيد','التاريخ','نوع القيد','المرجع','البيان','رمز الحساب','الحساب','مدين (ريال)','دائن (ريال)','الحركة المرتبطة','القيد الأصلي للعكس'],...periodEntries.flatMap(entry=>entry.lines.map(line=>[entry.id,entry.date,typeName(entry.entryType),entry.reference,entry.description,line.account,accountName(line.account),line.debit/100,line.credit/100,entry.sourceRecordId||'',entry.reversalOf||'']))];exportRows(rows,'القيود اليومية','safwah-journal.xlsx')}
 function exportGeneral(){if(!loaded||!generalReport)return;const code=q('#journal-general-account').value,name=accountName(code),rows=[['رمز الحساب','الحساب','التاريخ','القيد','المرجع','البيان','مدين (ريال)','دائن (ريال)','الرصيد (ريال)','طبيعة الرصيد'],[code,name,q('#journal-from').value,'','','الرصيد الافتتاحي',0,0,Math.abs(generalReport.opening)/100,balanceLabel(generalReport.opening)],...generalReport.rows.map(row=>[code,name,row.date,row.entryId,row.reference,row.description,row.debit/100,row.credit/100,Math.abs(row.balance)/100,balanceLabel(row.balance)]),[code,name,q('#journal-to').value,'','','الرصيد الختامي',0,0,Math.abs(generalReport.closing)/100,balanceLabel(generalReport.closing)]];exportRows(rows,'دفتر الأستاذ العام','safwah-general-ledger.xlsx')}
 function exportTrial(){if(!loaded||!trialReport)return;const rows=[['الرمز','الحساب','افتتاحي مدين (ريال)','افتتاحي دائن (ريال)','حركة الفترة مدين (ريال)','حركة الفترة دائن (ريال)','ختامي مدين (ريال)','ختامي دائن (ريال)'],...trialReport.rows.map(row=>[row.code,row.name,...totalKeys.map(key=>row[key]/100)]),['','الإجمالي',...totalKeys.map(key=>trialReport.totals[key]/100)]];exportRows(rows,'ميزان المراجعة','safwah-trial-balance.xlsx')}
 function printReport(view){if(!loaded||(view==='general'&&!generalReport)||(view==='trial'&&!trialReport))return;document.body.classList.remove('printing-accounting');document.body.dataset.journalPrint=view;window.print()}

 q('#journal-general-account').innerHTML=accountOptions('اختر حسابًا للأستاذ العام');
 for(const button of all('[data-finance-view]')){button.onclick=()=>setView(button.dataset.financeView);button.addEventListener('keydown',event=>{const tabs=all('[data-finance-view]'),index=tabs.indexOf(button);let next;if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else if(event.key==='ArrowLeft')next=(index+1)%tabs.length;else if(event.key==='ArrowRight')next=(index+tabs.length-1)%tabs.length;else return;event.preventDefault();tabs[next].focus();setView(tabs[next].dataset.financeView)})}
 q('#journal-from').onchange=renderReports;q('#journal-to').onchange=renderReports;q('#journal-general-account').onchange=renderReports;q('#journal-period-clear').onclick=()=>{q('#journal-from').value='';q('#journal-to').value='';renderReports()};q('#journal-refresh').onclick=load;
 q('#journal-new').onclick=openNew;q('#journal-line-add').onclick=addLine;form.addEventListener('input',updateDraft);form.addEventListener('change',updateDraft);form.addEventListener('submit',submit);reversalForm.addEventListener('submit',submitReversal);
 q('#journal-source').onchange=()=>{const source=sourceRecords().find(record=>record.id===form.elements.sourceRecordId.value);if(source){form.elements.description.value=String(source.description||'').slice(0,2000);form.elements.reference.value=String(source.reference||'').slice(0,200);if(/^\d{4}-\d{2}-\d{2}$/.test(source.date||''))form.elements.date.value=source.date}updateDraft()};
 for(const name of ['entry','detail','reversal'])q('#journal-'+name+'-close').onclick=()=>closeDialog('journal-'+name+'-dialog');
 q('#journal-reverse').onclick=openReversal;q('#journal-export').onclick=exportEntries;q('#journal-general-export').onclick=exportGeneral;q('#journal-trial-export').onclick=exportTrial;q('#journal-general-print').onclick=()=>printReport('general');q('#journal-trial-print').onclick=()=>printReport('trial');
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-journal-entry]');if(button){event.preventDefault();openDetail(button.dataset.journalEntry);return}
  const anchor=event.target.closest('a[href="#ledger"],a[href="#accounting-reports"]');
  if(anchor){if(!hasWorkspace()||q('#journal-nav').hidden){event.preventDefault();return}setView('operations')}
 });
 window.addEventListener('afterprint',()=>document.body.removeAttribute('data-journal-print'));
 window.journalLoad=load;window.journalClear=clear;window.journalSourceRefresh=sourceRefresh;
})();
