const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let calls=[],reply=[],allowLogout=false;
const nodes=new Map(),stored=new Map([['safwah-finance-v1','original-local-ledger']]);
function node(selector){if(!nodes.has(selector))nodes.set(selector,{hidden:false,disabled:false,textContent:'',innerHTML:'',close(){},reset(){},querySelector(){return node(selector+' button')}});return nodes.get(selector)}
const form=node('#auth-form');form.elements={display_name:{value:'My workspace'}};form.reportValidity=()=>true;
const context={records:[],visible:[],editing:null,document:{querySelector:node},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},confirm:()=>allowLogout,cents:v=>Math.round(Number(v)*100),atob,Uint8Array,window:{SAFWAH_CLOUD:{}},render(){node('#rows').innerHTML=context.records.map(record=>record.description).join(',')},fetch:async(url,options)=>{calls.push({url,options});const response=reply.shift();if(!response)throw Error('Unexpected request');return {ok:response.ok!==false,status:response.status||200,json:async()=>response.body}},Date,Map,Boolean,Error,encodeURIComponent,JSON,crypto:require('node:crypto').webcrypto};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../cloud.js'),'utf8'),context);
vm.runInContext("cloudConfig.url='https://example.supabase.co';cloudConfig.publishableKey='public-key';async function load(){const state=await cloudState();records=state.records;render()}",context);
const user={id:'guest-a',is_anonymous:true,user_metadata:{display_name:'Trusted workspace'}},candidate={access_token:'guest-token',refresh_token:'guest-refresh',expires_in:3600,user:{id:'guest-a',user_metadata:{display_name:'Ignored response label'}}};
const record={id:'record-a',revision:1,data:{description:'private-a',amount:100,attachments:[]}};
const authKey='safwah-finance-guest-session-v1';
(async()=>{
 await assert.rejects(vm.runInContext('cloudState()',context),/أنشئ مساحتك/);assert.equal(calls.length,0);
 reply=[{body:candidate},{body:user},{body:[record]}];
 await vm.runInContext('cloudCreateWorkspace()',context);
 assert.ok(calls[0].url.endsWith('/auth/v1/signup'));
 assert.deepEqual(JSON.parse(calls[0].options.body),{data:{display_name:'My workspace'}});
 assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.ok(calls[1].url.endsWith('/auth/v1/user'));assert.equal(calls[1].options.headers.Authorization,'Bearer guest-token');
 assert.ok(calls[2].url.includes('owner_id=eq.guest-a'));assert.ok(calls.every(call=>!call.url.includes('finance_admins')&&!call.url.includes('finance_members')));
 assert.equal(vm.runInContext('cloudSession.user.id',context),'guest-a');assert.equal(node('#account-name').textContent,'Trusted workspace');assert.equal(node('#ledger').hidden,false);
 const persisted=JSON.parse(stored.get(authKey));assert.equal(persisted.project,'https://example.supabase.co');assert.equal(persisted.access_token,'guest-token');assert.equal(persisted.records,undefined);assert.equal(persisted.user,undefined);
 vm.runInContext('cloudSession=null;cloudClearWorkspace()',context);calls=[];reply=[{body:user},{body:[record]}];
 await vm.runInContext('cloudRestoreSession()',context);
 assert.ok(calls[0].url.endsWith('/auth/v1/user'));assert.ok(calls.every(call=>!call.url.includes('/signup')));assert.equal(context.records[0].description,'private-a');
 // Failed temporary restore retains credentials and prevents a replacement signup.
 vm.runInContext('cloudSession=null',context);calls=[];reply=[{ok:false,status:503,body:{message:'offline'}}];
 await vm.runInContext('cloudRestoreSession()',context);assert.ok(stored.has(authKey));assert.equal(node('#ledger').hidden,true);assert.equal(context.records.length,0);
 const before=calls.length;await vm.runInContext('cloudCreateWorkspace()',context);assert.equal(calls.length,before);
 // Definitively invalid credentials are removed, with no financial reads.
 calls=[];reply=[{ok:false,status:401,body:{message:'invalid token'}}];await vm.runInContext('cloudRestoreSession()',context);
 assert.equal(calls.length,1);assert.equal(stored.has(authKey),false);assert.equal(vm.runInContext('cloudSession',context),null);assert.equal(node('#auth-panel').hidden,false);
 // An expired saved token refreshes once, verifies the server user, then loads.
 stored.set(authKey,JSON.stringify({...persisted,expires_at:0}));calls=[];reply=[{body:{...candidate,access_token:'new-token',refresh_token:'new-refresh'}},{body:user},{body:[record]}];
 await vm.runInContext('cloudRestoreSession()',context);
 assert.ok(calls[0].url.includes('grant_type=refresh_token'));assert.ok(calls[1].url.endsWith('/auth/v1/user'));assert.equal(JSON.parse(stored.get(authKey)).refresh_token,'new-refresh');
 // Rotation survives a failed verification request, so a guest can retry later.
 stored.set(authKey,JSON.stringify({...persisted,expires_at:0}));calls=[];reply=[{body:{...candidate,access_token:'retained-token',refresh_token:'retained-refresh'}},{ok:false,status:503,body:{message:'offline after rotation'}}];
 await vm.runInContext('cloudRestoreSession()',context);assert.equal(calls.length,2);assert.equal(vm.runInContext('cloudSession',context),null);assert.equal(JSON.parse(stored.get(authKey)).refresh_token,'retained-refresh');
 stored.set(authKey,JSON.stringify({...JSON.parse(stored.get(authKey)),expires_at:0}));calls=[];reply=[{body:{...candidate,access_token:'retried-token',refresh_token:'retried-refresh'}},{body:user},{body:[record]}];
 await vm.runInContext('cloudRestoreSession()',context);assert.deepEqual(JSON.parse(calls[0].options.body),{refresh_token:'retained-refresh'});assert.equal(JSON.parse(stored.get(authKey)).refresh_token,'retried-refresh');
 // Switching identity clears the previous user's records and edit form first.
 stored.delete(authKey);context.nextSession={...candidate,user:{id:'guest-b'}};calls=[];reply=[{body:{...user,id:'guest-b',user_metadata:{}}},{body:[]}];
 await vm.runInContext('cloudAcceptSession(nextSession)',context);
 assert.ok(calls[1].url.includes('owner_id=eq.guest-b'));assert.equal(context.records.length,0);assert.equal(node('#account-name').textContent,'مساحة المستخدم');assert.equal(node('#attachments').innerHTML,'');
 const beforeLogout=calls.length;await vm.runInContext('cloudSignOut(true)',context);assert.equal(calls.length,beforeLogout);assert.ok(stored.has(authKey));
 allowLogout=true;reply=[{body:{}}];await vm.runInContext('cloudSignOut(true)',context);
 assert.equal(stored.has(authKey),false);assert.equal(stored.get('safwah-finance-v1'),'original-local-ledger');assert.equal(vm.runInContext('cloudSession',context),null);assert.equal(context.records.length,0);
 // A newly issued guest survives an offline /user check without reading data.
 calls=[];reply=[{body:candidate},{ok:false,status:503,body:{message:'offline during signup verification'}}];await vm.runInContext('cloudCreateWorkspace()',context);
 assert.equal(calls.length,2);assert.equal(JSON.parse(stored.get(authKey)).refresh_token,'guest-refresh');assert.equal(vm.runInContext('cloudSession',context),null);
 calls=[];reply=[{body:user},{body:[]}];await vm.runInContext('cloudRestoreSession()',context);assert.ok(calls.every(call=>!call.url.endsWith('/signup')));
 // A stale tab may never delete another guest's newer persisted credentials.
 const newer=JSON.stringify({...persisted,user_id:'guest-new',access_token:'new-guest-token',refresh_token:'new-guest-refresh'});
 stored.set(authKey,newer);vm.runInContext("cloudSession={access_token:'guest-token',refresh_token:'guest-refresh',expires_at:Date.now()/1000+3600,user:{id:'guest-a'}}",context);reply=[{body:{}}];
 await vm.runInContext('cloudSignOut()',context);assert.equal(stored.get(authKey),newer);
 reply=[{ok:false,status:400,body:{error_code:'anonymous_provider_disabled'}}];await assert.rejects(vm.runInContext("cloudRequest('/auth/v1/signup')",context),error=>error.code==='anonymous_provider_disabled'&&/غير متاح/.test(error.message));
 stored.set(authKey,JSON.stringify(persisted));let failRestore;
 context.fetch=async()=>new Promise(resolve=>{failRestore=()=>resolve({ok:false,status:401,json:async()=>({message:'revoked'})})});
 const oldRestore=vm.runInContext('cloudRestoreSession()',context);stored.set(authKey,newer);failRestore();await oldRestore;assert.equal(stored.get(authKey),newer);
 // A late old restore cannot clear a newer verified in-memory workspace.
 stored.set(authKey,JSON.stringify(persisted));const interruptedRestore=vm.runInContext('cloudRestoreSession()',context);
 vm.runInContext("cloudSessionEpoch++;cloudSession={access_token:'new-guest-token',refresh_token:'new-guest-refresh',expires_at:Date.now()/1000+3600,user:{id:'guest-new'}};records=[{description:'new-private'}]",context);stored.set(authKey,newer);node('#ledger').hidden=false;
 failRestore();await interruptedRestore;assert.equal(vm.runInContext('cloudSession.user.id',context),'guest-new');assert.equal(context.records[0].description,'new-private');assert.equal(node('#ledger').hidden,false);
 const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.ok(!/type="email"|type="password"|approval-panel/.test(page));
 console.log('PASS: name-only anonymous signup, server-verified Auth user, per-user records filter, no email/approval queries');
 console.log('PASS: stored session verifies before financial load; temporary failure preserves session; invalid session clears; expired session refreshes');
 console.log('PASS: identity switch removes old private data; guest exit requires confirmation; logout removes only own session key');
 console.log('PASS: stale-tab logout and invalid in-flight restore preserve newer guest credentials');
 console.log('PASS: successful token rotation survives later verification failure; late restore cannot clear a newer memory session');
})().catch(error=>{console.error(error);process.exitCode=1});
