// View calculations use integer halalas and never mutate stored records.
function paidAmount(r){return r.payments.reduce((s,p)=>s+p.amount,0)}
function selectRecords(records,f={}){
 const q=String(f.query||'').trim().toLocaleLowerCase('ar');
 return records.filter(r=>(!q||[r.description,r.party,r.reference,r.kind,r.account,r.bankName].join(' ').toLocaleLowerCase('ar').includes(q))&&(!f.month||String(r.date||'').startsWith(f.month))&&(!f.kind||r.kind===f.kind)&&(!f.account||r.account===f.account)&&(!f.review||!r.reviewed)&&(!f.settlement||(f.settlement==='paid'?paidAmount(r)===r.amount:f.settlement==='partial'?paidAmount(r)>0&&paidAmount(r)<r.amount:paidAmount(r)===0))).sort((a,b)=>{
 if(f.sort==='amount')return b.amount-a.amount;
 if(f.sort==='remaining')return (b.amount-paidAmount(b))-(a.amount-paidAmount(a));
 const order=String(b.date||'').localeCompare(String(a.date||''));
 return f.sort==='oldest'?-order:order;
 });
}
function summarizeRecords(records){return records.reduce((s,r)=>{const paid=paidAmount(r),left=r.amount-paid;if(r.kind==='إيراد'){s.incoming+=paid;s.due+=left}else{s.outgoing+=paid;s.owed+=left}if(!r.reviewed){s.reviewCount++;s.reviewAmount+=r.amount}if(left>0)s.openCount++;return s},{incoming:0,outgoing:0,due:0,owed:0,reviewCount:0,reviewAmount:0,openCount:0})}
if(typeof module!=='undefined')module.exports={paidAmount,selectRecords,summarizeRecords};
