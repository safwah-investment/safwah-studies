const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let calls=[],reply=[];
const context={window:{SAFWAH_CLOUD:{}},fetch:async(url,options)=>{calls.push({url,options});const x=reply.shift();if(!x)throw Error('Unexpected request');return {ok:x.ok!==false,status:x.status||200,json:async()=>x.body}},Date,Map,Boolean,Error,encodeURIComponent,JSON,crypto:require('node:crypto').webcrypto};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../cloud.js'),'utf8'),context);
vm.runInContext("cloudConfig.url='https://example.supabase.co';cloudConfig.publishableKey='public-key';cloudSession={access_token:'user-token',expires_at:Date.now()/1000+3600,user:{id:'user-id'}}",context);
(async()=>{
 reply=[{body:[]}];
 await assert.rejects(vm.runInContext('cloudState()',context),/تفعيل صلاحية المدير/);
 assert.equal(calls.length,1);assert.ok(!calls[0].url.includes('finance_records'));
 calls=[];reply=[{body:[{user_id:'user-id'}]},{body:[{id:'a',revision:2,data:{description:'صفوة',amount:100}}]}];
 const state=await vm.runInContext('cloudState()',context);
 assert.equal(state.records[0].description,'صفوة');assert.equal(calls[1].options.headers.Authorization,'Bearer user-token');
 reply=[{ok:false,status:400,body:{message:'STALE_RECORD'}}];
 await assert.rejects(vm.runInContext("cloudSave({id:'a'},2)",context),/جهاز آخر/);
 reply=[{body:3}];await vm.runInContext("cloudSave({id:'a'},2)",context);
 assert.equal(vm.runInContext("cloudRevisions.get('a')",context),3);
 console.log('PASS: unapproved accounts cannot request ledger, authenticated headers, revision conflicts and save response');
})().catch(e=>{console.error(e);process.exitCode=1});
