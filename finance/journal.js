// Posted journal entries use account codes and integer halalas. Legacy movements are separate.
const journalAccounts=Object.freeze([
 ['1101','النقدية من الخزينة','الأصول المتداولة'],
 ['1102','حساب البنك الجاري','الأصول المتداولة'],
 ['1103','المدينون','الأصول المتداولة'],
 ['1104','تأمين طبي مقدم','الأصول المتداولة'],
 ['1105','إيجار مقدم','الأصول المتداولة'],
 ['1106','مدفوعات مقدمة للموظفين','الأصول المتداولة'],
 ['1107','الضريبة على المدخلات','الأصول المتداولة'],
 ['1201','أجهزة مكتبية ومعدات طباعة','الأصول الثابتة'],
 ['1202','الأجهزة الكهربائية','الأصول الثابتة'],
 ['1203','الأثاث والمفروشات','الأصول الثابتة'],
 ['1204','أجهزة حاسب وطابعات','الأصول الثابتة'],
 ['2101','مصروفات مستحقة','الالتزامات'],
 ['2102','ضريبة القيمة المضافة المستحقة','الالتزامات'],
 ['2103','مستحقات المؤسسة العامة للتأمينات الاجتماعية','الالتزامات'],
 ['3101','رأس المال','حقوق الملكية'],
 ['3102','الأرباح المبقاة','حقوق الملكية'],
 ['4101','إيرادات المبيعات / الخدمات','الإيرادات'],
 ['5101','مصاريف تسويقية ودعائية','المصروفات'],
 ['5102','مصاريف ضيافة','المصروفات'],
 ['5103','كهرباء ومياه','المصروفات'],
 ['5104','مصروف نقل ومواصلات','المصروفات'],
 ['5105','إنترنت وهاتف','المصروفات'],
 ['5106','سفر وإقامة','المصروفات'],
 ['5201','مصروف رواتب الموظفين','المصروفات'],
 ['5202','مصروف رواتب المتدربين','المصروفات'],
 ['5203','مصروف أجور مقطوعة','المصروفات']
].map(([code,name,group])=>Object.freeze({code,name,group})));
const journalAccountCodes=new Set(journalAccounts.map(account=>account.code));
const journalMaxAmount=100000000000;
const journalUuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function journalValidDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 if(year<1||month<1||month>12||day<1)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0);
 return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
function journalOptionalUuid(value,label){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!journalUuidPattern.test(value))throw Error(label+' يجب أن يكون معرّف UUID صالحًا.');
 return value;
}
function journalText(value,label,max,required=false){
 if(!required&&(value===undefined||value===null))return '';
 if(typeof value!=='string')throw Error(label+' يجب أن يكون نصًا.');
 const text=value.trim();
 if((required&&!text)||text.length>max)throw Error(label+' غير صالح أو أطول من الحد المسموح.');
 return text;
}
function journalSafeNumber(value){
 if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw Error('مجموع التقرير يتجاوز الحد الآمن للحساب.');
 return Number(value);
}
function validateJournalEntry(entry){
 if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('القيد يجب أن يكون كائنًا صالحًا.');
 if(typeof entry.id!=='string'||!journalUuidPattern.test(entry.id))throw Error('القيد يحتاج معرّف UUID صالحًا من الحفظ.');
 if(!journalValidDate(entry.date))throw Error('تاريخ القيد غير صالح؛ استخدم YYYY-MM-DD.');
 const description=journalText(entry.description,'بيان القيد',2000,true);
 const reference=journalText(entry.reference,'مرجع القيد',200);
 const sourceRecordId=journalOptionalUuid(entry.sourceRecordId,'مرجع الحركة');
 const entryType=entry.entryType===undefined?'standard':entry.entryType;
 if(!['standard','opening','reversal'].includes(entryType))throw Error('نوع القيد غير صالح.');
 const reversalOf=journalOptionalUuid(entry.reversalOf,'مرجع القيد المعكوس');
 if(entryType==='reversal'&&!reversalOf)throw Error('القيد العكسي يحتاج مرجع القيد الأصلي.');
 if(entryType!=='reversal'&&reversalOf)throw Error('مرجع القيد المعكوس متاح للقيود العكسية فقط.');
 if(reversalOf&&reversalOf.toLowerCase()===entry.id.toLowerCase())throw Error('لا يمكن عكس القيد نفسه.');
 if(!Array.isArray(entry.lines)||entry.lines.length<2||entry.lines.length>40)throw Error('القيد يحتاج من سطرين إلى 40 سطرًا.');
 let debitTotal=0n,creditTotal=0n;
 const lines=Array.from(entry.lines,line=>{
  if(!line||typeof line!=='object'||Array.isArray(line)||!journalAccountCodes.has(line.account))throw Error('أحد حسابات القيد غير موجود في دليل الحسابات.');
  const debit=line.debit===undefined?0:line.debit,credit=line.credit===undefined?0:line.credit;
  if(!Number.isSafeInteger(debit)||!Number.isSafeInteger(credit)||debit<0||credit<0||debit>journalMaxAmount||credit>journalMaxAmount)throw Error('مبالغ القيد يجب أن تكون هلالات صحيحة ضمن الحد المسموح.');
  if((debit>0)===(credit>0))throw Error('كل سطر يحتاج مبلغًا موجبًا في المدين أو الدائن وحده.');
  debitTotal+=BigInt(debit);creditTotal+=BigInt(credit);
  return {account:line.account,debit,credit};
 });
 if(debitTotal!==creditTotal||debitTotal<=0n)throw Error('القيد غير متوازن؛ يجب أن يتساوى مجموع المدين والدائن.');
 if(debitTotal>BigInt(journalMaxAmount))throw Error('إجمالي القيد يتجاوز الحد المسموح.');
 return {id:entry.id,date:entry.date,description,reference,sourceRecordId,entryType,reversalOf,lines};
}
function journalReportEntries(entries,options){
 if(!Array.isArray(entries))throw Error('قيود التقرير يجب أن تكون قائمة.');
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('مرشحات التقرير غير صالحة.');
 const from=options.from===undefined||options.from===null||options.from===''?null:options.from;
 const to=options.to===undefined||options.to===null||options.to===''?null:options.to;
 if((from!==null&&!journalValidDate(from))||(to!==null&&!journalValidDate(to)))throw Error('تاريخ التصفية غير صالح؛ استخدم YYYY-MM-DD.');
 if(from&&to&&from>to)throw Error('تاريخ بداية التقرير يجب ألا يتجاوز نهايته.');
 const ids=new Set();
 const normalized=Array.from(entries,entry=>{
  const validated=validateJournalEntry(entry),id=validated.id.toLowerCase();
  if(ids.has(id))throw Error('قائمة التقرير تحتوي قيدًا مكررًا.');
  ids.add(id);return validated;
 });
 normalized.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.id.toLowerCase()<b.id.toLowerCase()?-1:a.id.toLowerCase()>b.id.toLowerCase()?1:0);
 return {entries:normalized,from,to};
}
function buildGeneralLedger(entries,options={}){
 if(!options||!journalAccountCodes.has(options.account))throw Error('اختر حسابًا من دليل الحسابات للأستاذ العام.');
 const report=journalReportEntries(entries,options),rows=[];
 let opening=0n,balance=0n;
 for(const entry of report.entries){
  if(report.to&&entry.date>report.to)continue;
  let debit=0n,credit=0n;
  for(const line of entry.lines)if(line.account===options.account){debit+=BigInt(line.debit);credit+=BigInt(line.credit)}
  if(debit===0n&&credit===0n)continue;
  if(report.from&&entry.date<report.from){opening+=debit-credit;balance=opening;continue}
  balance+=debit-credit;
  rows.push({entryId:entry.id,date:entry.date,description:entry.description,reference:entry.reference,debit:journalSafeNumber(debit),credit:journalSafeNumber(credit),balance:journalSafeNumber(balance)});
 }
 return {opening:journalSafeNumber(opening),rows,closing:journalSafeNumber(balance)};
}
function buildTrialBalance(entries,options={}){
 const report=journalReportEntries(entries,options);
 const balances=new Map(journalAccounts.map(account=>[account.code,{opening:0n,debit:0n,credit:0n}]));
 for(const entry of report.entries){
  if(report.to&&entry.date>report.to)continue;
  for(const line of entry.lines){
   const balance=balances.get(line.account),debit=BigInt(line.debit),credit=BigInt(line.credit);
   if(report.from&&entry.date<report.from)balance.opening+=debit-credit;
   else{balance.debit+=debit;balance.credit+=credit}
  }
 }
 const totalKeys=['openingDebit','openingCredit','debit','credit','closingDebit','closingCredit'];
 const bigTotals=Object.fromEntries(totalKeys.map(key=>[key,0n]));
 const rows=journalAccounts.map(account=>{
  const balance=balances.get(account.code),closing=balance.opening+balance.debit-balance.credit;
  const amounts={openingDebit:balance.opening>0n?balance.opening:0n,openingCredit:balance.opening<0n?-balance.opening:0n,debit:balance.debit,credit:balance.credit,closingDebit:closing>0n?closing:0n,closingCredit:closing<0n?-closing:0n};
  const row={account:account.code,code:account.code,name:account.name,group:account.group};
  for(const key of totalKeys){bigTotals[key]+=amounts[key];row[key]=journalSafeNumber(amounts[key])}
  return row;
 });
 const totals=Object.fromEntries(totalKeys.map(key=>[key,journalSafeNumber(bigTotals[key])]));
 const balanced=bigTotals.openingDebit===bigTotals.openingCredit&&bigTotals.debit===bigTotals.credit&&bigTotals.closingDebit===bigTotals.closingCredit;
 return {rows,totals,balanced};
}
if(typeof module!=='undefined')module.exports={journalAccounts,validateJournalEntry,buildGeneralLedger,buildTrialBalance};
