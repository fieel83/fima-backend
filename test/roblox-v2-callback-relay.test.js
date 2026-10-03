import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {mountRobloxVerificationCandidate} from '../src/roblox-v2/httpAdapter.mjs';

test('first-party relay reaches API host-only session without bypassing authority',async()=>{
  const app=express();let finishes=0;let authCalls=0;
  const pass=(_req,_res,next)=>next();
  mountRobloxVerificationCandidate({router:app,enabled:true,
    candidate:{start:async()=>{},finish:async()=>{finishes++;}},
    authenticate:(req,res,next)=>{authCalls++;if(req.get('Cookie')!=='fima_user_session=test-only')return res.status(401).json({error:'unauthorized'});req.user={id:'u'};next();},
    csrf:pass,validateOrigin:pass,rateLimit:pass,invalidateAccountCache:async()=>{},resultUrl:'https://fimamacro.com/dashboard/overview'});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const fetch=(url,{headers})=>new Promise((resolve,reject)=>{
    const request=http.get(url,{headers},response=>{response.resume();resolve({status:response.statusCode,headers:{get:name=>response.headers[name]??null}});});
    request.on('error',reject);
  });
  const state='a'.repeat(43);const code='test-only/+=';
  try {
    const path='/api/roblox/v2/callback?'+new URLSearchParams({state,code,returnTo:'https://attacker.invalid',extra:'discard'});
    const relay=await fetch(base+path,{headers:{Host:'fimamacro.com'},redirect:'manual'});
    assert.equal(relay.status,303);assert.equal(authCalls,0);assert.equal(finishes,0);
    assert.equal(relay.headers.get('cache-control'),'no-store');assert.equal(relay.headers.get('referrer-policy'),'no-referrer');
    const target=new URL(relay.headers.get('location'));
    assert.equal(target.origin,'https://api.fimamacro.com');assert.equal(target.pathname,'/api/roblox/v2/callback');
    assert.deepEqual([...target.searchParams.keys()],['state','code']);assert.equal(target.searchParams.get('code'),code);
    const noSession=await fetch(base+target.pathname+target.search,{headers:{Host:'api.fimamacro.com'},redirect:'manual'});
    assert.equal(noSession.status,401);assert.equal(finishes,0);
    const valid=await fetch(base+target.pathname+target.search,{headers:{Host:'api.fimamacro.com',Cookie:'fima_user_session=test-only'},redirect:'manual'});
    assert.equal(valid.status,303);assert.equal(valid.headers.get('location'),'https://fimamacro.com/dashboard/overview');assert.equal(finishes,1);
    for(const bad of [path.replace(state,'bad'),'/api/roblox/v2/callback?state='+state+'&code=x&code=y',path+'&error=access_denied']) {
      assert.equal((await fetch(base+bad,{headers:{Host:'fimamacro.com'},redirect:'manual'})).status,400);
    }
    assert.equal((await fetch(base+path,{headers:{Host:'attacker.invalid'},redirect:'manual'})).status,400);
    assert.equal(finishes,1);
  } finally {await new Promise(r=>server.close(r));}
});
