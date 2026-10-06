const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {journalAccounts,validateJournalEntry,buildGeneralLedger,buildTrialBalance}=require('../journal.js');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const entry=(n,date,description,lines,extra={})=>({id:id(n),date,description,lines,...extra});
const cash=(debit,credit=0)=>({account:'1101',debit,credit});
const opening=entry(1,'2026-01-01','رصيد افتتاحي',[cash(10001),{account:'3101',debit:0,credit:10001}],{entryType:'opening',reference:'OPEN'});
const income=entry(2,'2026-01-02','إيراد',[cash(1003),{account:'4101',debit:0,credit:1003}]);
const expense=entry(3,'2026-01-03','مصروف كهرباء',[{account:'5103',debit:201,credit:0},cash(0,201)]);
const reversal=entry(4,'2026-01-04','عكس المصروف',[cash(201),{account:'5103',debit:0,credit:201}],{entryType:'reversal',reversalOf:expense.id});
const future=entry(5,'2026-02-01','لاحق',[cash(901),{account:'4101',debit:0,credit:901}]);
const entries=[reversal,income,future,opening,expense];
const original=JSON.stringify(entries);

// Exact fixed names from the existing chart, plus the requested equity/payroll accounts.
const accountContext={document:{querySelector:()=>({append(){},querySelector(){return {}}}),createElement:()=>({append(){}})},module:{exports:{}}};
vm.createContext(accountContext);vm.runInContext(fs.readFileSync(path.join(__dirname,'../accounts.js'),'utf8'),accountContext);
const existing=accountContext.module.exports.financeAccounts.flatMap(([,names])=>names);
assert.equal(existing.length,21);assert.equal(journalAccounts.length,26);
for(const name of existing)assert.equal(journalAccounts.filter(account=>account.name===name).length,1);
assert.equal(new Set(journalAccounts.map(account=>account.code)).size,26);
for(const name of ['رأس المال','الأرباح المبقاة','مصروف رواتب الموظفين','مصروف رواتب المتدربين','مصروف أجور مقطوعة'])assert.ok(journalAccounts.some(account=>account.name===name));

const normalized=validateJournalEntry({...income,description:'  إيراد  ',reference:'  REF  ',sourceRecordId:id(99),ignored:'omit'});
assert.deepEqual(normalized,{id:income.id,date:income.date,description:'إيراد',reference:'REF',sourceRecordId:id(99),entryType:'standard',reversalOf:null,lines:income.lines});
assert.notEqual(normalized.lines,income.lines);assert.notEqual(normalized.lines[0],income.lines[0]);
const upperId='ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';
assert.equal(validateJournalEntry({...income,id:upperId}).id,upperId);

const ledger=buildGeneralLedger(entries,{account:'1101',from:'2026-01-02',to:'2026-01-04'});
assert.equal(ledger.opening,10001);assert.equal(ledger.closing,11004);
assert.deepEqual(ledger.rows.map(row=>[row.entryId,row.debit,row.credit,row.balance]),[[income.id,1003,0,11004],[expense.id,0,201,10803],[reversal.id,201,0,11004]]);
assert.equal(buildGeneralLedger(entries,{account:'5103',from:'2026-01-04',to:'2026-01-04'}).opening,201);
assert.equal(buildGeneralLedger(entries,{account:'5103',from:'2026-01-04',to:'2026-01-04'}).closing,0);
assert.equal(buildGeneralLedger(entries,{account:'3101',from:'2026-01-02'}).opening,-10001);
assert.equal(buildGeneralLedger(entries,{account:'3101',from:'2026-01-02'}).closing,-10001);
assert.deepEqual(buildGeneralLedger(entries,{account:'1201'}),{opening:0,rows:[],closing:0});
assert.equal(buildGeneralLedger(entries,{account:'1101',to:'2025-12-31'}).closing,0);
assert.equal(buildGeneralLedger(entries,{account:'1101',from:'2027-01-01'}).opening,11905);
assert.equal(buildGeneralLedger(entries,{account:'1101',from:'2027-01-01'}).rows.length,0);

const trial=buildTrialBalance(entries,{from:'2026-01-02',to:'2026-01-04'}),byCode=code=>trial.rows.find(row=>row.code===code);
assert.equal(trial.rows.length,26);assert.equal(trial.balanced,true);
assert.deepEqual(trial.totals,{openingDebit:10001,openingCredit:10001,debit:1405,credit:1405,closingDebit:11004,closingCredit:11004});
assert.equal(byCode('1101').closingDebit,11004);assert.equal(byCode('3101').openingCredit,10001);assert.equal(byCode('4101').closingCredit,1003);
assert.equal(byCode('5103').debit,201);assert.equal(byCode('5103').credit,201);assert.equal(byCode('5103').closingDebit,0);
assert.equal(byCode('1201').debit,0);assert.equal(byCode('1201').name,'أجهزة مكتبية ومعدات طباعة');
const zero=buildTrialBalance([]);assert.equal(zero.rows.length,26);assert.equal(zero.balanced,true);assert.ok(Object.values(zero.totals).every(value=>value===0));
assert.equal(buildTrialBalance(entries,{to:'2026-01-03'}).rows.find(row=>row.code==='5103').closingDebit,201);
assert.equal(buildTrialBalance(entries,{from:'2026-01-03',to:'2026-01-03'}).totals.openingDebit,11004);
assert.equal(JSON.stringify(entries),original);

// A repeated account within an entry is valid: the ledger preserves both turnovers.
const repeated=entry(6,'2026-01-05','سطور حساب مكررة',[cash(5),cash(0,2),{account:'4101',debit:0,credit:3}]);
assert.deepEqual(buildGeneralLedger([repeated],{account:'1101'}).rows.map(row=>[row.debit,row.credit,row.balance]),[[5,2,3]]);
const max=entry(7,'2026-01-05','أقصى مبلغ',[cash(100000000000),{account:'3101',debit:0,credit:100000000000}]);
assert.equal(buildTrialBalance([max]).totals.debit,100000000000);
assert.deepEqual(buildGeneralLedger([entry(9,income.date,'متأخر بالمعرّف',income.lines),income],{account:'1101'}).rows.map(row=>row.entryId),[income.id,id(9)]);

const bad=[
 {...income,id:undefined},{...income,id:'not-a-uuid'},
 {...income,date:'2026-02-29'},{...income,date:'2026-04-31'},{...income,date:'2026-1-02'},{...income,date:'0000-01-01'},
 {...income,description:'   '},{...income,reference:42},
 {...income,lines:[cash(1)]},{...income,lines:Array.from({length:41},()=>cash(1))},
 {...income,lines:[income.lines[0],,income.lines[1]]},
 {...income,lines:[cash(1),{account:'4101',debit:0,credit:2}]},
 {...income,lines:[cash(-1),{account:'4101',debit:0,credit:-1}]},
 {...income,lines:[cash(1,1),{account:'4101',debit:0,credit:1}]},
 {...income,lines:[cash(0),{account:'4101',debit:0,credit:1}]},
 {...income,lines:[cash(1.5),{account:'4101',debit:0,credit:1.5}]},
 {...income,lines:[cash('1'),{account:'4101',debit:0,credit:'1'}]},
 {...income,lines:[cash(null),{account:'4101',debit:0,credit:1}]},
 {...income,lines:[cash(Number.MAX_SAFE_INTEGER+1),{account:'4101',debit:0,credit:Number.MAX_SAFE_INTEGER+1}]},
 {...income,lines:[cash(100000000001),{account:'4101',debit:0,credit:100000000001}]},
 {...income,lines:[cash(60000000000),cash(60000000000),{account:'4101',debit:0,credit:60000000000},{account:'3101',debit:0,credit:60000000000}]},
 {...income,lines:[{account:'9999',debit:1,credit:0},{account:'4101',debit:0,credit:1}]},
 {...income,entryType:'draft'},{...income,entryType:'reversal'},{...income,reversalOf:opening.id},
 {...income,entryType:'reversal',reversalOf:income.id},{...income,sourceRecordId:'bad'}
];
for(const invalid of bad){assert.throws(()=>validateJournalEntry(invalid));assert.throws(()=>buildTrialBalance([invalid],{to:'2020-01-01'}));assert.throws(()=>buildGeneralLedger([invalid],{account:'1201',to:'2020-01-01'}))}
assert.equal(validateJournalEntry({...income,date:'2024-02-29'}).date,'2024-02-29');
assert.equal(validateJournalEntry({...income,date:'2000-02-29'}).date,'2000-02-29');
assert.throws(()=>validateJournalEntry({...income,date:'1900-02-29'}));
for(const invalid of [{from:'2026-03-01',to:'2026-02-01'},{from:'invalid'},{to:'2026-02-29'},{from:0},{to:false},null,[]]){
 assert.throws(()=>buildTrialBalance(entries,invalid));assert.throws(()=>buildGeneralLedger(entries,invalid===null||Array.isArray(invalid)?invalid:{...invalid,account:'1101'}));
}
assert.throws(()=>buildGeneralLedger(entries,{}));assert.throws(()=>buildGeneralLedger(entries,{account:'9999'}));
assert.throws(()=>buildTrialBalance([income,{...income,id:income.id.toUpperCase()}]));assert.throws(()=>buildTrialBalance({}));
assert.throws(()=>buildTrialBalance([income,,expense]));
const browser={};vm.createContext(browser);vm.runInContext(fs.readFileSync(path.join(__dirname,'../journal.js'),'utf8'),browser);
assert.equal(vm.runInContext('journalAccounts.length',browser),26);assert.equal(vm.runInContext('typeof validateJournalEntry+":"+typeof buildGeneralLedger+":"+typeof buildTrialBalance',browser),'function:function:function');
console.log('PASS: fixed 26-account chart, balanced posted entries, exact halalas, normalization without identity changes');
console.log('PASS: opening/income/expense/reversal ledgers, inclusive date bounds, all-account trial balance and input immutability');
console.log('PASS: malformed/unbalanced/signed/double-sided/unknown/date/order entries throw, even outside the report range');
