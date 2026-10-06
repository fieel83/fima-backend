import test from 'node:test';
import assert from 'node:assert/strict';
import {createMacroHandoffCandidate,runtimeContracts} from '../src/macroHandoffCandidate.mjs';
import {issueAppEntitlement,hashDeviceId} from '../src/entitlements.js';
import {entitlementVersionStatus} from '../src/appVersionPolicy.js';
process.env.ENTITLEMENT_SIGNING_SECRET='runtime-handoff-isolated-test-secret-12345';
function fixture(owner=true) {
 const user={id:'account-a',passwordHash:'test-password-hash'};
 const identity={userId:user.id,accountId:user.id,licenseId:'license-a'};
 const session={id:'session-a',userId:user.id,deviceIdHash:hashDeviceId(('FIMA-DEVICE-'+'A'.repeat(64))),revokedAt:null};
 const issue=(clientApplication='fima-hub')=>issueAppEntitlement({license:{id:identity.licenseId,plan:'monthly',status:'active'},user,hwid:('FIMA-DEVICE-'+'A'.repeat(64)),authSessionId:session.id,ownerAdminAccess:owner,clientApplication});
 let row;
 const db={$transaction:async fn=>fn(db),$queryRaw:async()=>[],user:{findUnique:async()=>user},desktopAuthSession:{findUnique:async()=>session},runtimeHandoffGrant:{create:async({data})=>row={id:'grant-a',...data},findUnique:async({where})=>row?.grantHash===where.grantHash?row:null,updateMany:async()=>{if(row.consumedAt)return {count:0};row.consumedAt=new Date();return {count:1};}}};
 const candidate=createMacroHandoffCandidate({db,resolveEntitlement:async({clientApplication})=>({valid:true,canUseApp:true,entitlementToken:issue(clientApplication).token})});
 return {candidate,identity,token:issue().token,user,session};
}
for(const {contract,version} of runtimeContracts.values()) {
 for(const owner of [false,true]) test(`${contract.productId} ${version} owner=${owner}`,async()=>{
  const f=fixture(owner);const binding={...contract,hwid:('FIMA-DEVICE-'+'A'.repeat(64)),appVersion:version};const body={identity:f.identity,binding};
  if(contract.ownerOnly&&!owner) {await assert.rejects(f.candidate.issue(body,f.token));return;}
  const grant=await f.candidate.issue(body,f.token);assert.equal(grant.grantExpiresAt,grant.expiresAt);
  const result=await f.candidate.exchange({...body,grant:grant.grant});assert.equal(result.canUseApp,true);
  assert.deepEqual(Object.keys(result).sort(),['valid','canUseApp','reason','protocol','productId','entitlementToken','entitlement','entitlementExpiresAt','minSupportedAppVersion'].sort());
  assert.equal(result.protocol,binding.protocol);assert.equal(result.productId,binding.productId);
  assert.equal(result.reason,'valid');assert.equal(result.entitlement.desktopAuthSession,undefined);
  assert.equal(result.entitlement.accountId,f.identity.accountId);
  assert.equal(result.entitlementExpiresAt,result.entitlement.expiresAt);
  await assert.rejects(f.candidate.exchange({...body,grant:grant.grant}));
 });
}
test('owner runtime versions use signed product identity',()=>{
 for(const id of ['fima-mail','fima-cloud-pc']) assert.equal(entitlementVersionStatus('0.1.0-owner-preview',{clientApplication:id},{macroMinimum:'1.0.128'}).updateRequired,false);
 assert.equal(entitlementVersionStatus('0.1.0-owner-preview',{},{macroMinimum:'1.0.128'}).updateRequired,true);
});

