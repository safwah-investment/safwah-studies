const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// A small DOM fixture tests accounting actions without authenticating or mailing anyone.
class Node{
 constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;this.children=[];this.dataset={};this.listeners={};this.attributes={};this._html='';this.fields=new Map();const classes=new Set();this.classList={add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)}}
 set innerHTML(value){this._html=value;if(!value)this.children=[];if(value.includes('data-journal-account'))for(const key of ['[data-journal-account]','[data-journal-debit]','[data-journal-credit]','button'])this.fields.set(key,new Node())}
 get innerHTML(){return this._html}
 get options(){return [...this._html.matchAll(/<option value="([^"]*)"/g)].map(match=>({value:match[1]}))}
 setAttribute(key,value){this.attributes[key]=value}
 removeAttribute(key){delete this.attributes[key];if(key==='data-journal-print')delete this.dataset.journalPrint}
 addEventListener(name,handler){this.listeners[name]=handler}
 append(node){node.parent=this;this.children.push(node)}
 remove(){this.parent.children=this.parent.children.filter(node=>node!==this)}
 querySelector(selector){return this.fields.get(selector)}
 showModal(){this.open=true}
 close(){this.open=false}
 reset(){for(const field of Object.values(this.elements||{}))field.value='';if(this.elements?.entryType)this.elements.entryType.value='standard'}
 focus(){}
}
const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector)};
const tabs=['operations','entries','general','trial'].map(view=>{const node=new Node();node.dataset.financeView=view;return node});
const form=get('#journal-entry-form');form.elements=Object.fromEntries(['date','entryType','description','reference','sourceRecordId'].map(name=>[name,name==='sourceRecordId'?get('#journal-source'):new Node()]));
const reversalForm=get('#journal-reversal-form');reversalForm.elements={date:new Node(),reason:new Node()};
const docListeners={},windowListeners={},source=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',date:'2026-10-01',description:'فاتورة محفوظة <script>',reference:'=SUM(A1)',amount:40000,payments:[],attachments:[]}];
let stored=[],postCalls=[],stateCalls=0,stateHook=null,postHook=null,exportCalls=[];
const context={console,Date,Error,Map,Set,JSON,Number,String,Boolean,Math,Object,Array,BigInt,crypto:require('node:crypto').webcrypto,
 document:{querySelector:get,querySelectorAll(selector){if(selector==='[data-finance-view]')return tabs;if(selector==='#journal-draft-lines .journal-line')return get('#journal-draft-lines').children;if(selector==='[data-journal-remove]')return get('#journal-draft-lines').children.map(row=>row.querySelector('button'));return[]},createElement:()=>new Node(),addEventListener:(name,handler)=>docListeners[name]=handler,body:new Node()},
 window:{addEventListener:(name,handler)=>windowListeners[name]=handler,print(){}},cloudEnabled:false,journalSourceRecords:()=>source,
 journalState:async()=>{stateCalls++;return stateHook?await stateHook():stored},journalPost:async entry=>{postCalls.push(entry);if(postHook)return await postHook(entry);const saved={...entry,postedAt:'2026-10-06T12:00:00Z'};stored.push(saved);return saved},
 excelWorkbook:(rows,sheet)=>{exportCalls.push({rows,sheet});return{}},downloadBlob(){}
};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../journal.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../journal-ui.js'),'utf8'),context);
const event={preventDefault(){}},input=()=>form.listeners.input(),lines=()=>get('#journal-draft-lines').children;
function detail(id){docListeners.click({preventDefault(){},target:{closest:()=>({dataset:{journalEntry:id}})}})}
(async()=>{
 assert.equal(stateCalls,0,'UI must not fetch before workspace integration explicitly loads it');
 await context.window.journalLoad();assert.equal(get('#journal-nav').hidden,false);tabs[1].onclick();assert.equal(get('#ledger').hidden,true);
 const anchorEvent={preventDefault(){this.prevented=true},target:{closest:selector=>selector.startsWith('a[')?{}:null}};docListeners.click(anchorEvent);assert.equal(get('#ledger').hidden,false);assert.equal(get('#journal-workspace').hidden,true);assert.equal(anchorEvent.prevented,undefined);tabs[1].onclick();
 get('#journal-new').onclick();assert.equal(lines().length,2);form.elements.sourceRecordId.value=source[0].id;get('#journal-source').onchange();
 assert.equal(form.elements.description.value,source[0].description);assert.equal(form.elements.reference.value,source[0].reference);assert.equal(form.elements.date.value,source[0].date);assert.equal(lines()[0].querySelector('[data-journal-account]').value,'');assert.equal(lines()[0].querySelector('[data-journal-debit]').value,'');
 lines()[0].querySelector('[data-journal-account]').value='1101';lines()[0].querySelector('[data-journal-debit]').value='123.45';lines()[1].querySelector('[data-journal-account]').value='4101';lines()[1].querySelector('[data-journal-credit]').value='123.44';input();assert.equal(get('#journal-post').disabled,true);
 lines()[1].querySelector('[data-journal-credit]').value='123.45';input();assert.equal(get('#journal-post').disabled,false);
 const operationalBefore=JSON.stringify(source);await form.listeners.submit(event);assert.equal(postCalls.length,1);assert.equal(postCalls[0].lines[0].debit,12345);assert.equal(postCalls[0].sourceRecordId,source[0].id);assert.equal(JSON.stringify(source),operationalBefore);assert.equal(get('#journal-entry-dialog').open,false);assert.ok(get('#journal-entry-rows').innerHTML.includes('&lt;script&gt;'));assert.ok(!get('#journal-entry-rows').innerHTML.includes('<script>'));
 const original=JSON.stringify(stored[0]);detail(stored[0].id);get('#journal-reverse').onclick();reversalForm.elements.reason.value='تصحيح المبلغ';await reversalForm.listeners.submit(event);assert.equal(postCalls.length,2);assert.equal(postCalls[1].entryType,'reversal');assert.equal(postCalls[1].reversalOf,stored[0].id);assert.equal(postCalls[1].sourceRecordId,source[0].id);assert.equal(postCalls[1].lines[0].credit,12345);assert.equal(postCalls[1].lines[1].debit,12345);assert.equal(JSON.stringify(stored[0]),original);detail(stored[0].id);assert.equal(get('#journal-reverse').hidden,true);
 get('#journal-general-account').value='1101';get('#journal-general-account').onchange();get('#journal-general-export').onclick();assert.equal(exportCalls[0].sheet,'دفتر الأستاذ العام');assert.equal(exportCalls[0].rows.at(-1)[8],0);get('#journal-trial-export').onclick();assert.equal(exportCalls[1].sheet,'ميزان المراجعة');assert.ok(exportCalls[1].rows.at(-1)[4]===246.9);context.document.body.classList.add('printing-accounting');get('#journal-general-print').onclick();assert.equal(context.document.body.classList.contains('printing-accounting'),false);assert.equal(context.document.body.dataset.journalPrint,'general');windowListeners.afterprint();assert.equal(context.document.body.dataset.journalPrint,undefined);
 // Failed posts retain the same draft UUID for an explicit, idempotent retry.
 get('#journal-new').onclick();form.elements.description.value='محاولة أخرى';lines()[0].querySelector('[data-journal-account]').value='1101';lines()[0].querySelector('[data-journal-debit]').value='5';lines()[1].querySelector('[data-journal-account]').value='4101';lines()[1].querySelector('[data-journal-credit]').value='5';input();postHook=async()=>{throw Error('تعذر الاتصال')};await form.listeners.submit(event);assert.equal(get('#journal-draft-error').textContent,'تعذر الاتصال');const retryId=postCalls.at(-1).id;postHook=null;await form.listeners.submit(event);assert.equal(postCalls.at(-1).id,retryId);
 // Logout clears details and prevents late fetch/post responses restoring private rows.
 let resolveState;stateHook=()=>new Promise(resolve=>resolveState=resolve);const pending=context.window.journalLoad();context.window.journalClear();resolveState(stored);await pending;assert.equal(get('#journal-nav').hidden,true);assert.equal(get('#journal-entry-rows').textContent,'');assert.equal(get('#journal-detail-content').textContent,'');assert.equal(get('#journal-detail-dialog').open,false);
 stateHook=null;await context.window.journalLoad();get('#journal-new').onclick();form.elements.description.value='متأخر';lines()[0].querySelector('[data-journal-account]').value='1101';lines()[0].querySelector('[data-journal-debit]').value='2';lines()[1].querySelector('[data-journal-account]').value='4101';lines()[1].querySelector('[data-journal-credit]').value='2';let resolvePost;postHook=entry=>new Promise(resolve=>resolvePost=()=>resolve({...entry,postedAt:'2026-10-06T12:00:00Z'}));const pendingPost=form.listeners.submit(event);context.window.journalClear();resolvePost();await pendingPost;assert.equal(get('#journal-nav').hidden,true);assert.equal(get('#journal-status').textContent,'');
 context.cloudEnabled=true;context.cloudCanWrite=()=>false;const before=stateCalls;await context.window.journalLoad();assert.equal(stateCalls,before);get('#ledger').hidden=true;tabs[0].onclick();docListeners.click(anchorEvent);assert.equal(get('#ledger').hidden,true);assert.equal(anchorEvent.prevented,true);
 console.log('PASS: balanced exact-halalas posting, source metadata only, safe text, immutable reversal, report export, idempotent retry, logout and late-response isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
