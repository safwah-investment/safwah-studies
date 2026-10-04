const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {normalizePaymentUrl,preparePaymentRecord,paymentLinkState}=require('../payments.js');
const url='https://sa.myfatoorah.com/pay?invoice=fixture-1',newUrl='https://sa.myfatoorah.com/pay?invoice=fixture-2';
const invoice={id:'a',kind:'إيراد',description:'فاتورة',amount:10000,payments:[{amount:2000,date:'2026-10-04'}],attachments:[{id:'document',name:'فاتورة.pdf'}],notes:'ملاحظات',source:'كشف سابق'};
assert.equal(normalizePaymentUrl(' HTTPS://SA.MYFATOORAH.COM:443/pay?invoice=fixture-1 '),url);
for(const bad of ['javascript:alert(1)','http://sa.myfatoorah.com/pay','/pay','//sa.myfatoorah.com/pay','https:sa.myfatoorah.com/pay','https://sa.myfatoorah.com.evil.example/pay','https://demo.myfatoorah.com/pay','https://sa.myfatoorah.com@evil.example/pay','https://user:pass@sa.myfatoorah.com/pay','https://sa.myfatoorah.com:8443/pay','https://sa.myfatoorah.com./pay','https://sa.myfatoorah.com/\nmalformed','https://sa.myfatoorah.com/'+ 'x'.repeat(2048)])assert.throws(()=>normalizePaymentUrl(bad));
const linked=preparePaymentRecord(null,{...invoice,paymentUrl:url,paymentLink:{url:'https://evil.example',amountHalalas:1}});
assert.deepEqual(linked.paymentLink,{url,amountHalalas:8000});assert.equal(linked.paymentUrl,undefined);assert.equal(paymentLinkState(linked).active,true);
const before=JSON.stringify(linked),changed=preparePaymentRecord(linked,{...linked,amount:12000,paymentUrl:url});
assert.equal(changed.paymentLink.amountHalalas,8000);assert.equal(paymentLinkState(changed).stale,true);assert.equal(paymentLinkState(changed).active,false);
const renewed=preparePaymentRecord(changed,{...changed,paymentUrl:newUrl});assert.deepEqual(renewed.paymentLink,{url:newUrl,amountHalalas:10000});
const expense=preparePaymentRecord(linked,{...linked,kind:'مصروف'});assert.deepEqual(expense.paymentLink,linked.paymentLink);assert.equal(paymentLinkState(expense).active,false);
assert.throws(()=>preparePaymentRecord(null,{...invoice,kind:'مصروف',paymentUrl:url}),/الإيراد فقط/);
assert.equal(paymentLinkState({...linked,payments:[{amount:10000}]}).active,false);
assert.equal(preparePaymentRecord(linked,{...linked,paymentUrl:''}).paymentLink,undefined);
assert.equal(paymentLinkState({...invoice}).active,false);assert.equal(paymentLinkState({...invoice,paymentLink:{url:'javascript:alert(1)',amountHalalas:8000}}).active,false);
assert.equal(JSON.stringify(linked),before);assert.deepEqual(changed.attachments,invoice.attachments);assert.deepEqual(changed.payments,invoice.payments);assert.equal(changed.source,invoice.source);
// Execute the actual row action to verify escaping and the absence of write effects.
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),rowContext={document:{querySelector:()=>({})},paymentLinkState,record:{...linked,description:'<svg/onload=alert(1)>',paymentLink:{url:'https://sa.myfatoorah.com/?value="><img/src=x/onerror=alert(1)>',amountHalalas:8000}}};
vm.createContext(rowContext);vm.runInContext(app.slice(0,app.indexOf('\n'))+'\n'+app.slice(app.indexOf('function paymentAction'),app.indexOf('function updatePaymentControls')),rowContext);
const action=vm.runInContext('paymentAction(record)',rowContext);assert.ok(!action.includes('<svg')&&!action.includes('<img'));assert.ok(action.includes('target="_blank" rel="noopener noreferrer"'));assert.equal(JSON.stringify(linked),before);
// Run the browser storage adapter, replacing only its persistence transport.
const store=new Map(),localContext={window:{SAFWAH_CLOUD:{url:'configured'}},location:{hostname:'127.0.0.2'},document:{addEventListener(){}},URL,crypto:require('node:crypto').webcrypto,atob};
vm.createContext(localContext);vm.runInContext(fs.readFileSync(path.join(__dirname,'../payments.js'),'utf8'),localContext);vm.runInContext(fs.readFileSync(path.join(__dirname,'../storage.js'),'utf8'),localContext);
localContext.readStore=async key=>store.get(key);localContext.writeStore=async(key,value)=>store.set(key,value);
(async()=>{
 const saved=await vm.runInContext("financePost('/api/save',{description:'إيراد',kind:'إيراد',amount:'100.00',payments:[{amount:'20.00',date:'2026-10-04'}],reviewed:false,paymentUrl:'https://sa.myfatoorah.com/pay?invoice=fixture-1'})",localContext);localContext.savedId=saved.record.id;
 assert.deepEqual(JSON.parse(JSON.stringify(saved.record.paymentLink)),{url,amountHalalas:8000});
 await vm.runInContext("financePost('/api/save',{id:savedId,description:'إيراد معدل',kind:'إيراد',amount:'120.00',payments:[{amount:'20.00',date:'2026-10-04'}],reviewed:true,paymentUrl:'https://sa.myfatoorah.com/pay?invoice=fixture-1'})",localContext);
 await vm.runInContext("financePost('/api/upload',{id:savedId,name:'document.pdf',content:'JVBERi0xLjQ='})",localContext);
 const final=store.get('records')[0];assert.equal(final.description,'إيراد معدل');assert.equal(final.amount,12000);assert.equal(final.payments[0].amount,2000);assert.equal(final.attachments.length,1);assert.equal(final.paymentLink.amountHalalas,8000);assert.equal(paymentLinkState(final).stale,true);
 const copy=JSON.parse(JSON.stringify(final));paymentLinkState(final);normalizePaymentUrl(final.paymentLink.url);assert.deepEqual(JSON.parse(JSON.stringify(final)),copy);
 console.log('PASS: exact HTTPS Saudi host, relative/credential/deceptive/port/XSS rejection or safe escaping');
 console.log('PASS: income-only due snapshot, unchanged URL stays stale, new URL renews snapshot, no mutation or automatic payment');
 console.log('PASS: actual local storage adapter preserves payment link, payments, and attachments through edits and upload');
})().catch(error=>{console.error(error);process.exitCode=1});
