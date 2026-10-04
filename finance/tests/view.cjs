const assert=require('node:assert/strict'),fs=require('node:fs');
const {selectRecords,summarizeRecords}=require('../ledger.js');
const {excelWorkbook}=require('../excel.js');
const records=[
{id:'a',date:'2026-10-01',description:'فاتورة صفوة',party:'العميل',reference:'=SUM(A1)',kind:'إيراد',amount:10000,payments:[{amount:4000,date:'2026-10-02'}],reviewed:false,attachments:[]},
{id:'b',date:'2026-09-01',description:'رواتب',kind:'مصروف',amount:5000,payments:[{amount:5000,date:'2026-09-01'}],reviewed:true,attachments:[]},
{id:'c',date:'',description:'عهدة',kind:'عهدة نقدية',amount:2000,payments:[],reviewed:false,attachments:[]}
];
const original=JSON.stringify(records);
records[0].account='حساب البنك الجاري';records[0].bankName='بنك تجريبي';
assert.equal(selectRecords(records,{account:'حساب البنك الجاري'}).length,1);
assert.equal(selectRecords(records,{account:'إنترنت وهاتف'}).length,0);
assert.equal(selectRecords(records,{query:'بنك تجريبي'}).length,1);
delete records[0].account;delete records[0].bankName;
assert.deepEqual(summarizeRecords(records),{incoming:4000,outgoing:5000,due:6000,owed:2000,reviewCount:2,reviewAmount:12000,openCount:2});
assert.deepEqual(selectRecords(records,{month:'2026-10'}).map(r=>r.id),['a']);
assert.equal(selectRecords(records,{query:' صفوة '}).length,1);
assert.equal(selectRecords(records,{settlement:'partial'})[0].id,'a');
assert.equal(selectRecords(records,{settlement:'paid'})[0].id,'b');
assert.equal(selectRecords(records,{settlement:'unpaid'})[0].id,'c');
assert.equal(selectRecords(records,{review:true}).length,2);
assert.deepEqual(selectRecords(records,{sort:'remaining'}).map(r=>r.id),['a','c','b']);
assert.equal(JSON.stringify(records),original);
(async()=>{const blob=excelWorkbook([['البيان','المبلغ','المرجع'],['فاتورة صفوة',123.45,'=SUM(A1)'],['<>&" العربية',0,'']]);fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'safwah-test.xlsx'),Buffer.from(await blob.arrayBuffer()));console.log('PASS: summaries, filters, settlement, sorting, records unchanged; XLSX fixture created')})();
