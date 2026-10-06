// Reports are derived from source transactions; stored records are never changed.
const REPORT_CLEARING='حساب تسوية السداد والتحصيل';
const REPORT_SUSPENSE='حساب معلق — يحتاج تصنيف';
function accountingEntries(source){
 const entries=[],issues=[];
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const pair=(r,date,debit,credit,amount,suffix)=>{entries.push({date,reference:r.reference||r.id||'',description:r.description||'',sourceId:r.id,account:debit,debit:amount,credit:0,event:suffix},{date,reference:r.reference||r.id||'',description:r.description||'',sourceId:r.id,account:credit,debit:0,credit:amount,event:suffix})};
 for(const r of source){
  const label=r.description||r.id||'حركة';
  if(!validDate(r.date)||!Number.isSafeInteger(r.amount)||r.amount<=0){issues.push(label+': تاريخ الحركة أو المبلغ غير صالح؛ استُبعدت من التقرير.');continue}
  const income=r.kind==='إيراد';
  let account=r.account||REPORT_SUSPENSE;
  if(account===REPORT_SUSPENSE||r.kind==='قيد التصنيف'||['النقدية من الخزينة','حساب البنك الجاري','المدينون','مصروفات مستحقة'].includes(account)){
   account=REPORT_SUSPENSE;issues.push(label+': يلزم تحديد حساب الاعتراف؛ أدرجت في الحساب المعلق.');
  }
  const contra=income?'المدينون':'مصروفات مستحقة';
  pair(r,r.date,income?contra:account,income?account:contra,r.amount,'إثبات الحركة');
  let paid=0;
  for(const p of r.payments||[]){
   if(!validDate(p.date)||p.date<r.date||!Number.isSafeInteger(p.amount)||p.amount<=0||paid+p.amount>r.amount){issues.push(label+': دفعة غير صالحة أو تتجاوز الإجمالي أو تسبق الحركة؛ استُبعدت الدفعة.');continue}
   paid+=p.amount;pair(r,p.date,income?REPORT_CLEARING:contra,income?contra:REPORT_CLEARING,p.amount,income?'تحصيل':'سداد');
  }
 }
 entries.sort((a,b)=>a.date.localeCompare(b.date));
 return {entries,issues};
}
function accountingReport(entries,{from='',to='',account=''}={}){
 const totals=new Map(),ledger=[];let opening=0,running=0;
 const get=a=>{if(!totals.has(a))totals.set(a,{account:a,opening:0,debit:0,credit:0,balance:0});return totals.get(a)};
 for(const e of entries){
  if(to&&e.date>to)continue;
  const row=get(e.account),net=e.debit-e.credit;
  if(from&&e.date<from){row.opening+=net;if(account===e.account)opening+=net;}
  else{row.debit+=e.debit;row.credit+=e.credit;if(!account||account===e.account)ledger.push({...e})}
  row.balance+=net;
 }
 running=opening;
 for(const e of ledger){if(account){running+=e.debit-e.credit;e.running=running}else e.running=null}
 const trial=[...totals.values()].sort((a,b)=>a.account.localeCompare(b.account,'ar'));
 return {trial,ledger,opening};
}
if(typeof module!=='undefined')module.exports={accountingEntries,accountingReport,REPORT_CLEARING,REPORT_SUSPENSE};
