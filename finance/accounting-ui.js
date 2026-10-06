// Independent report filters cover all loaded records, including unreviewed transactions.
function initAccountingReports(){
 const panel=document.createElement('section');panel.id='accounting-reports';panel.className='panel';
 panel.innerHTML=`<div class="panelhead"><h2>التقارير المحاسبية</h2><div><button type="button" class="secondary" id="report-excel">تصدير التقرير Excel</button><button type="button" class="secondary" id="report-print">طباعة التقرير / PDF</button></div></div>
 <p class="muted">تقارير أولية من الحركات المسجلة فقط، تشمل الحركات غير المراجعة. لا تتضمن أرصدة افتتاحية خارج السجل. إثبات الإيراد: مدينون / حساب الإيراد؛ إثبات الصرف: الحساب المحدد / مصروفات مستحقة. الدفعات تقابل حساب تسوية السداد والتحصيل لعدم تحديد الخزينة أو البنك لكل دفعة؛ رصيده لا يمثل النقد أو البنك. لم تُحتسب ضريبة تلقائية. توازن الميزان لا يغني عن مراجعة التصنيف والحسابات المقابلة.</p>
 <div class="toolbar report-filters"><label for="report-kind">التقرير<select id="report-kind"><option value="ledger">دفتر الأستاذ العام</option><option value="trial">ميزان المراجعة</option></select></label><label for="report-from">من تاريخ<input type="date" id="report-from"></label><label for="report-to">إلى تاريخ<input type="date" id="report-to"></label><label id="report-account-field" for="report-account">الحساب<select id="report-account"><option value="">جميع الحسابات</option></select></label></div>
 <p id="report-status" role="status"></p><details id="report-issues"><summary>ملاحظات المراجعة</summary><ul></ul></details>
 <div id="report-output"></div>`;
 document.querySelector('main footer').before(panel);
 ['report-kind','report-from','report-to','report-account'].forEach(id=>document.getElementById(id).addEventListener('input',renderAccountingReports));
 document.getElementById('report-excel').onclick=()=>{const data=renderAccountingReports();if(data)downloadBlob(excelWorkbook(data.rows,{sheetName:data.title,headerRow:data.headerRow,lastDataRow:data.lastDataRow}),data.kind==='trial'?'safwah-trial-balance.xlsx':'safwah-general-ledger.xlsx')};
 document.getElementById('report-print').onclick=()=>{if(!renderAccountingReports())return;document.body.classList.add('printing-accounting');window.print()};
 window.addEventListener('afterprint',()=>document.body.classList.remove('printing-accounting'));
}
function renderAccountingReports(){
 const root=document.getElementById('accounting-reports');if(!root)return;
 const kind=$('#report-kind').value,from=$('#report-from').value,to=$('#report-to').value,select=$('#report-account'),selected=select.value;
 const built=accountingEntries(records),names=[...new Set(built.entries.map(e=>e.account))].sort((a,b)=>a.localeCompare(b,'ar'));
 select.innerHTML='<option value="">جميع الحسابات</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');select.value=names.includes(selected)?selected:'';
 $('#report-account-field').hidden=kind==='trial';
 const issues=$('#report-issues');issues.hidden=!built.issues.length;issues.querySelector('summary').textContent='ملاحظات المراجعة ('+built.issues.length+')';issues.querySelector('ul').innerHTML=built.issues.map(s=>'<li>'+esc(s)+'</li>').join('');
 if(from&&to&&from>to){$('#report-status').textContent='تاريخ البداية يجب أن يسبق تاريخ النهاية.';$('#report-output').innerHTML='';return null}
 const account=kind==='ledger'?select.value:'',report=accountingReport(built.entries,{from,to,account}),title=kind==='trial'?'ميزان المراجعة':'دفتر الأستاذ العام';
 let headers,body,rows,headerRow,lastDataRow;
 const balance=n=>fmt(Math.abs(n))+(n>0?' مدين':n<0?' دائن':'');
 const period=(from||'بداية السجل')+' — '+(to||'آخر حركة');
 if(kind==='trial'){
  headers=['الحساب','افتتاحي مدين','افتتاحي دائن','حركة مدين','حركة دائن','رصيد مدين','رصيد دائن'];
  body=report.trial.map(r=>[r.account,Math.max(r.opening,0),Math.max(-r.opening,0),r.debit,r.credit,Math.max(r.balance,0),Math.max(-r.balance,0)]);
  const total=['الإجمالي',...Array.from({length:6},(_,i)=>body.reduce((s,r)=>s+r[i+1],0))];body.push(total);
  $('#report-status').textContent='الفترة: '+period+' · الفرق بين الأرصدة المدينة والدائنة: '+fmt(total[5]-total[6])+' ر.س. · '+records.length+' حركة مصدر';
  headerRow=4;lastDataRow=headerRow+body.length-1;
  rows=[[title],['الفترة',period],['الحالة','أولي — حساب التسوية لا يمثل النقد أو البنك'],headers,...body.map(r=>r.map((v,i)=>i?v/100:v))];
  $('#report-output').innerHTML='<h3>'+title+'</h3><div class="tablewrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map((v,i)=>'<td'+(i?' class="money"':'')+'>'+(i?fmt(v):esc(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 }else{
  headers=['التاريخ','المرجع','البيان','نوع القيد','الحساب','مدين','دائن',...(account?['الرصيد الجاري']:[])];
  body=report.ledger.map(e=>[e.date,e.reference,e.description,e.event,e.account,e.debit,e.credit,...(account?[e.running]:[])]);
  const debit=report.ledger.reduce((s,e)=>s+e.debit,0),credit=report.ledger.reduce((s,e)=>s+e.credit,0);
  $('#report-status').textContent='الفترة: '+period+' · '+(account?'الحساب: '+account+' · افتتاحي: '+balance(report.opening)+' · ختامي: '+balance(report.opening+debit-credit):'جميع الحسابات')+' · مدين: '+fmt(debit)+' · دائن: '+fmt(credit)+' ر.س.';
  headerRow=account?6:5;lastDataRow=headerRow+body.length;
  rows=[[title],['الفترة',period],['الحساب',account||'جميع الحسابات'],['الحالة','أولي — حساب التسوية لا يمثل النقد أو البنك'],...(account?[['الرصيد الافتتاحي المدين موجب والدائن سالب',report.opening/100]]:[]),headers,...body.map(r=>r.map((v,i)=>i>=5?v/100:v)),['إجمالي الحركة','','','','',debit/100,credit/100]];
  $('#report-output').innerHTML='<h3>'+title+'</h3><div class="tablewrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map((v,i)=>'<td'+(i>=5?' class="money"':'')+'>'+(i===7?balance(v):i>=5?fmt(v):esc(v))+'</td>').join('')+'</tr>').join('')+(body.length?'':'<tr><td colspan="'+headers.length+'" class="empty">لا توجد قيود في الفترة المحددة.</td></tr>')+'</tbody></table></div>';
 }
 if(built.issues.length)rows.push([],['ملاحظات المراجعة'],...built.issues.map(s=>[s]));
 return {kind,title,rows,headerRow,lastDataRow};
}
initAccountingReports();
renderAccountingReports();
