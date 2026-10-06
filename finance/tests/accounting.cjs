const assert=require('node:assert/strict');
const {accountingEntries,accountingReport}=require('../accounting.js');
const source=[
{id:'1',date:'2026-01-01',kind:'إيراد',account:'إيرادات المبيعات / الخدمات',amount:10000,payments:[{date:'2026-02-01',amount:4000}]},
{id:'2',date:'2026-01-15',kind:'مصروف',account:'إنترنت وهاتف',amount:3000,payments:[{date:'2026-02-02',amount:1000}]}
];
const snapshot=JSON.stringify(source),built=accountingEntries(source);
assert.equal(JSON.stringify(source),snapshot);
assert.equal(built.issues.length,0);
const report=accountingReport(built.entries,{from:'2026-02-01',to:'2026-02-28',account:'المدينون'});
assert.equal(report.opening,10000);
assert.equal(report.ledger.length,1);
assert.equal(report.ledger[0].running,6000);
assert.equal(report.trial.reduce((s,r)=>s+r.balance,0),0);
assert.equal(report.trial.reduce((s,r)=>s+r.debit-r.credit,0),0);
assert.equal(accountingReport(built.entries,{to:'2026-01-31'}).trial.find(r=>r.account==='المدينون').balance,10000);
assert.equal(accountingEntries([{...source[0],date:'2026-02-30'}]).entries.length,0);
assert.equal(accountingEntries([{...source[0],payments:[{date:'2026-02-01',amount:10001}]}]).issues.length,1);
assert.equal(accountingEntries([{...source[0],payments:[{date:'2025-12-01',amount:1000}]}]).issues.length,1);
assert.equal(accountingEntries([{...source[1],account:''}]).issues.length,1);
assert.equal(accountingReport([]).trial.length,0);
console.log('Accounting report tests passed.');
