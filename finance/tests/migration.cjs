const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cloud.js'),'utf8');
const fixture={id:'11111111-1111-4111-8111-111111111111',date:'2026-01-01',description:'Synthetic migration fixture',kind:'مصروف',amount:10001,payments:[],reviewed:false,attachments:[{id:'22222222-2222-4222-8222-222222222222',name:'fixture.pdf'}]};
function harness(stage,{attachments=true}={}){
 const nodes=new Map(),calls=[],alerts=[];let release,entered,fileReads=0,saves=0;
 const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>entered=resolve);
 const pause=async label=>{if(stage===label){entered();await gate}};
 const node=()=>({disabled:false,hidden:false,value:'',innerHTML:'',textContent:'',elements:{},remove(){},close(){},reset(){},removeAttribute(){},setAttribute(){},querySelector(){return this}});
 const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},addEventListener(){}};
 const record={...fixture,attachments:attachments?fixture.attachments:[]};
 const context={window:{SAFWAH_CLOUD:{url:'https://example.supabase.co',publishableKey:'public-fixture-key'},addEventListener(){}},document,records:[],visible:[],editing:null,render(){calls.push({kind:'render'})},Date,Map,Boolean,Error,JSON,URL,URLSearchParams,encodeURIComponent,atob,Uint8Array,crypto:require('node:crypto').webcrypto,confirm:()=>true,alert:message=>alerts.push(message),localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
 context.readStore=async key=>{calls.push({kind:'read',key});await pause(key==='records'?'records':++fileReads===1?'file-before-save':'file-after-save');return key==='records'?JSON.parse(JSON.stringify([record])):{name:'fixture.pdf',content:'JVBERi0xLjQ='}};
 context.testSave=async input=>{const owner=vm.runInContext('cloudSession.user.id',context);calls.push({kind:'save',owner});await pause(++saves===1?'save-initial':saves===2&&attachments?'save-attachment':'save-complete');return {record:input}};
 context.testRequest=async()=>{const owner=vm.runInContext('cloudSession.user.id',context);calls.push({kind:'upload',owner});await pause('upload');return {}};
 context.load=async()=>{calls.push({kind:'load'});await pause('load')};
 vm.createContext(context);vm.runInContext(source,context);
 vm.runInContext("cloudSession={access_token:'fixture-a',refresh_token:'fixture-refresh-a',expires_at:Date.now()/1000+3600,user:{id:'user-a'}};cloudSave=testSave;cloudRequest=testRequest",context);
 return {context,document,calls,alerts,waiting,release,start:()=>document.querySelector('#migrate-local').onclick(),switchUser:()=>{vm.runInContext("cloudSessionEpoch++;cloudSession={access_token:'fixture-b',expires_at:Date.now()/1000+3600,user:{id:'user-b'}};cloudClearWorkspace()",context)},refreshSameUser:()=>vm.runInContext("cloudSession={access_token:'fixture-a-renewed',expires_at:Date.now()/1000+3600,user:{id:'user-a'}}",context)};
}
(async()=>{
 const cases=[['records',true,0,0],['file-before-save',true,0,0],['file-after-save',true,1,0],['save-initial',true,1,0],['upload',true,1,1],['save-attachment',true,2,1],['save-complete',false,2,0],['load',false,2,0]];
 for(const [stage,attachments,expectedSaves,expectedUploads] of cases){
  const h=harness(stage,{attachments}),pending=h.start();await h.waiting;h.switchUser();
  assert.equal(h.document.querySelector('#migrate-local').disabled,false,'Workspace clear resets the previous operation control');
  h.document.querySelector('#migrate-local').disabled=true; // New workspace has its own operation in progress.
  h.release();await pending;
  assert.equal(h.calls.filter(call=>call.kind==='save').length,expectedSaves,stage);
  assert.equal(h.calls.filter(call=>call.kind==='upload').length,expectedUploads,stage);
  assert.ok(h.calls.filter(call=>call.owner).every(call=>call.owner==='user-a'),stage+' cannot write into B');
  assert.equal(h.alerts.length,0,stage+' suppresses stale notifications');
  assert.equal(h.document.querySelector('#migrate-local').disabled,true,stage+' preserves the new operation control');
  assert.equal(h.calls.filter(call=>call.kind==='load').length,stage==='load'?1:0,stage+' cannot reload B from stale work');
 }
 const refreshed=harness('records'),operation=refreshed.start();await refreshed.waiting;refreshed.refreshSameUser();refreshed.release();await operation;
 assert.equal(refreshed.calls.filter(call=>call.kind==='save').length,3);assert.equal(refreshed.calls.filter(call=>call.kind==='upload').length,1);
 assert.ok(refreshed.calls.filter(call=>call.owner).every(call=>call.owner==='user-a'));
 assert.equal(refreshed.alerts.length,1);assert.match(refreshed.alerts[0],/تم نقل 1 حركة/);assert.equal(refreshed.document.querySelector('#migrate-local').disabled,false);
 console.log('PASS: A→B migration cancellation during local record/file reads, initial/final/attachment saves, upload and reload; stale messages/cleanup suppressed');
 console.log('PASS: same-owner token refresh keeps the migration valid; workspace clear resets the previous operation control');
})().catch(error=>{console.error(error);process.exitCode=1});

