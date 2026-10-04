import { withSupabase } from 'npm:@supabase/server@1';
import { allowedOrigin, corsHeaders, createFinanceAccessHandler } from './handler.js';

const handler=createFinanceAccessHandler({env:name=>Deno.env.get(name),waitUntil:task=>EdgeRuntime.waitUntil(task)});
// Public requests require the project publishable key. Decisions require a verified
// user JWT, then the RPC checks the confirmed owner's identity. Mail work uses only
// the server-side admin client; no privileged key is sent to the website.
const authenticated=withSupabase({auth:['user','publishable','secret']},handler);
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 if(!allowedOrigin(origin))return new Response('Forbidden origin',{status:403});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
 const response=await authenticated(request);
 const headers=new Headers(response.headers);
 for(const [name,value] of Object.entries(corsHeaders(origin)))headers.set(name,value);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
});
