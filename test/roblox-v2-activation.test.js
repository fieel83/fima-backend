import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRobloxProvider} from '../src/roblox-v2/provider.mjs';
import {createRobloxOAuthCandidate} from '../src/roblox-v2/robloxOAuthCandidate.mjs';
test('provider diagnostic redacts bare bearer and keeps exact OAuth error',async()=>{
 const logs=[];const warn=console.warn;console.warn=(...v)=>logs.push(v.join(' '));
 try {const p=createRobloxProvider({clientSecret:'test-secret',fetchImpl:async()=>new Response(JSON.stringify({error:'invalid_token',error_description:'bad raw-private-token'}),{status:401})});
 await assert.rejects(p.userInfo('raw-private-token'),{code:'roblox_v2_provider_rejected'});
 assert.match(logs[0],/invalid_token/);assert.match(logs[0],/redacted/);assert.doesNotMatch(logs[0],/raw-private-token/);
 }finally{console.warn=warn;}
});
test('missing returned profile scope prevents userinfo and linking',async()=>{
 let pending;let profileCalls=0;const user={id:'u'};
 const tx={user:{findUnique:async()=>user},oAuthLink:{deleteMany:async()=>({count:1}),create:async({data})=>{pending={...data,id:'pending'};},findUnique:async()=>pending}};
 const c=createRobloxOAuthCandidate({enabled:true,clientId:'test-id',redirectUri:'https://fimamacro.com/api/roblox/v2/callback',db:{$transaction:fn=>fn(tx)},captureAuthority:async()=>({userId:'u',sessionId:'s',credentialVersion:'v'}),assertAuthority:async()=>{},seal:v=>v,unseal:v=>v,exchangeCode:async()=>({access_token:'test-token',token_type:'Bearer',scope:'openid'}),userInfo:async()=>{profileCalls++;}});
 const req={user,query:{}};const start=await c.start(req);req.query={state:new URL(start.authorizationUrl).searchParams.get('state'),code:'test-code'};
 await assert.rejects(c.finish(req),{code:'roblox_v2_scope_missing'});assert.equal(profileCalls,0);
});
test('production wiring precedes static and global 404 fallback',async()=>{
 const src=await fs.readFile(new URL('../src/server.js',import.meta.url),'utf8');
 assert.ok(src.indexOf('prepareRobloxVerification({')<src.indexOf('app.use(express.static'));
 assert.ok(src.indexOf('prepareRobloxVerification({')<src.indexOf('app.use((_req, res) => res.status(404).json'));
});
