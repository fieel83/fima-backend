import {createHash, randomBytes} from 'node:crypto';
import {entitlementCredentialGeneration, verifyAppEntitlement, hashDeviceId, entitlementSecretStatus} from './entitlements.js';
import {assertRefreshDesktopSession, runEntitlementRefreshWithAccountLock} from './entitlementRefreshSecurity.js';
import {runtimeHandoffDefaultContract, createRuntimeHandoffContract, normalizeRuntimeHandoffIdentity, normalizeRuntimeHandoffBinding, runtimeHandoffGrantPattern} from './macroHandoffContract.mjs';

const fail = (status=401) => Object.assign(new Error('runtime_handoff_denied'), {handoffStatus:status});
const options = {maxWait:5000, timeout:15000};
// Generation-bound lookup: reset changes the lookup even if session revocation fails.
// No password hash, bearer token or generation proof is stored in the grant row.
const lookup = (grant,user) => createHash('sha256').update(JSON.stringify(['fima-macro-grant-generation:v1',grant,entitlementCredentialGeneration(user)])).digest('hex');
export const runtimeContracts = new Map([
  [runtimeHandoffDefaultContract.executableSha256, {contract:runtimeHandoffDefaultContract, version:'1.0.131'}],
  ['47187016ac88327fd2450bb084c242797c449b32cccf9944754613c3b6a1b278', {contract:createRuntimeHandoffContract({productId:'fima-macro',executableName:'FimaMacroStudio.exe',executableSha256:'47187016ac88327fd2450bb084c242797c449b32cccf9944754613c3b6a1b278',feature:'macro_runtime'}),version:'1.0.130'}],
  ...[
    {productId:'fima-mail',executableName:'FIMA Mail Manager.exe',appVersion:'0.1.0-owner-preview',runtimeTreeSha256:'45e8fb89e2027ec53dc5257df8e56a5613b1cc3e0ebed847de34844bd838a34e',packageIdentity:'75fd0b34f9df47548ff71a3484291797eb7c7c3bbf74a6d1828abfe82f0a0979',feature:'owner_email_manager'},
    {productId:'fima-cloud-pc',executableName:'FIMA Cloud PC.exe',appVersion:'0.1.0-mvp',runtimeTreeSha256:'5c8b6dfc4cb0686a7633cfe8ea3c6c5c6374142bd44e9a1f3773d84eb9b533d9',packageIdentity:'ed5c9058a7952ca333d4a39a000946514179ed356a0dbf21985e33937672e066',feature:'owner_cloud_pc'},
  ].map(value=>[value.productId,{contract:createRuntimeHandoffContract({...value,schemaVersion:2,ownerOnly:true,executableSha256:'67cff2ce5ac7976408aac30e17e9266443a351b44ec1ee613b444867a78dc9d7'}),version:value.appVersion}])
]);
const contractFor = binding => runtimeContracts.get(binding?.productId==='fima-macro' ? binding?.executableSha256 : binding?.productId);
const fields = body => {
  const release=contractFor(body?.binding);
  if(!release) throw fail(400);
  const {contract,version}=release;
  let identity,binding;
  try { identity=normalizeRuntimeHandoffIdentity(body?.identity ?? body);binding=normalizeRuntimeHandoffBinding(body?.binding,{contract}); }
  catch { throw fail(400); }
  if(binding.appVersion!==version) throw fail(400);
  return {identity,binding};
};
const matches = (payload,identity,binding) => payload?.desktopAuthSession===true
  && typeof payload.sessionId==='string' && payload.sessionId.length>0
  && ['licenseId','userId','accountId'].every(k=>payload[k]===identity[k])
  && payload.hwidHash===hashDeviceId(binding.hwid)
  && payload.licenseStatus==='active' && payload.allowedFeatures?.includes(contractFor(binding).contract.feature)
  && (!contractFor(binding).contract.ownerOnly || (payload.ownerAdminAccess===true && payload.isOwner===true));

export function createMacroHandoffCandidate({db,resolveEntitlement}) {
  if(typeof db?.$transaction!=='function'||typeof resolveEntitlement!=='function') throw fail(503);
  async function resolve(tx,user,identity,binding,sessionId) {
    const response=await resolveEntitlement({db:tx,user,hwid:binding.hwid,appVersion:binding.appVersion,clientApplication:binding.productId,authSessionId:sessionId});
    const verified=verifyAppEntitlement(response?.entitlementToken);
    if(response?.valid!==true||response.canUseApp!==true||!verified.ok||!matches(verified.payload,identity,binding)||verified.payload.sessionId!==sessionId) throw fail();
    return {response,payload:verified.payload};
  }
  async function lock(tx,identity,binding) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${identity.userId} FOR UPDATE`;
    const user=await tx.user.findUnique({where:{id:identity.userId}});
    if(!user||user.id!==identity.accountId) throw fail();
    return user;
  }
  function active(row,identity,binding,user,grant) {
    if(!row||row.grantHash!==lookup(grant,user)||row.consumedAt||row.revokedAt
      ||new Date(row.expiresAt).getTime()<=Date.now()
      ||new Date(row.issuedAt).getTime()>Date.now()+5000
      ||new Date(row.expiresAt)-new Date(row.issuedAt)>75000
      ||['licenseId','userId','accountId'].some(k=>row[k]!==identity[k])
      ||row.protocol!==binding.protocol||row.productId!==binding.productId
      ||row.hwidHash!==hashDeviceId(binding.hwid)||row.executableSha256!==binding.executableSha256
      ||row.packageIdentity!==binding.packageIdentity||!row.authSessionId
      ||row.sessionVersion!==(process.env.ADMIN_SESSION_VERSION||process.env.ADMIN_SESSION_REVOKED_BEFORE||'')) throw fail();
  }
  async function session(tx,row) {
    await assertRefreshDesktopSession(tx,{desktopAuthSession:true,sessionId:row.authSessionId,userId:row.userId,accountId:row.accountId,hwidHash:row.hwidHash});
  }
  return {
    async issue(body,token) {
      if(typeof token!=='string'||token.length>16384) throw fail();
      const {identity,binding}=fields(body); const verified=verifyAppEntitlement(token);
      if(!verified.ok||!matches(verified.payload,identity,binding)) throw fail();
      return runEntitlementRefreshWithAccountLock({db,payload:verified.payload,operation:async(tx,user)=>{
        const current=await resolve(tx,user,identity,binding,verified.payload.sessionId);
        const grant=randomBytes(32).toString('base64url'); const issuedAt=new Date();
        const expiresAt=new Date(Math.min(issuedAt.getTime()+75000,new Date(verified.payload.expiresAt).getTime()));
        await tx.runtimeHandoffGrant.create({data:{grantHash:lookup(grant,user),...identity,
          protocol:binding.protocol,productId:binding.productId,hwidHash:hashDeviceId(binding.hwid),
          executableSha256:binding.executableSha256,packageIdentity:binding.packageIdentity,
          entitlementId:current.payload.entitlementId,sessionVersion:current.payload.sessionVersion,
          authSessionId:verified.payload.sessionId,issuedAt,expiresAt}});
        return {valid:true,canUseApp:true,...identity,protocol:binding.protocol,productId:binding.productId,grant,grantExpiresAt:expiresAt.toISOString(),expiresAt:expiresAt.toISOString()};
      }});
    },
    async exchange(body) {
      const {identity,binding}=fields(body);const grant=body?.grant;
      if(typeof grant!=='string'||!runtimeHandoffGrantPattern.test(grant)) throw fail(400);
      let row,generation;
      const response=await db.$transaction(async tx=>{
        const user=await lock(tx,identity,binding); generation=entitlementCredentialGeneration(user);
        row=await tx.runtimeHandoffGrant.findUnique({where:{grantHash:lookup(grant,user)}});
        active(row,identity,binding,user,grant); await session(tx,row);
        const current=await resolve(tx,user,identity,binding,row.authSessionId);
        const consumed=await tx.runtimeHandoffGrant.updateMany({where:{id:row.id,consumedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
        if(consumed.count!==1) throw fail();
        const entitlementFields = ['tokenType','entitlementVersion','entitlementId','sessionId','licenseId','userId','accountId','plan','allowedFeatures','ownerAdminAccess','isOwner','isAdmin','adminTools','capabilities','issuedAt','expiresAt','appVersion','minSupportedAppVersion','hwidHash','deviceIdHash','nonce','licenseStatus'];
        return {valid:true,canUseApp:true,reason:'valid',protocol:binding.protocol,productId:binding.productId,
          entitlementToken:current.response.entitlementToken,
          entitlement:Object.fromEntries(entitlementFields.map(key=>[key,current.payload[key]])),
          entitlementExpiresAt:current.payload.expiresAt,minSupportedAppVersion:current.payload.minSupportedAppVersion};
      },options);
      // Delivery barrier shares user→session lock order with logout/reset.
      await db.$transaction(async tx=>{
        const user=await lock(tx,identity,binding);
        if(entitlementCredentialGeneration(user)!==generation||Date.now()>=new Date(row.expiresAt).getTime()) throw fail();
        if(row.sessionVersion!==(process.env.ADMIN_SESSION_VERSION||process.env.ADMIN_SESSION_REVOKED_BEFORE||'')) throw fail();
        await session(tx,row);
      },options);
      if(Date.now()>=new Date(row.expiresAt).getTime()) throw fail();
      return response;
    }
  };
}

export function mountMacroHandoffCandidate({router,candidate,rateLimit,enabled=false,extractToken}) {
  if(typeof rateLimit!=='function'||typeof extractToken!=='function') throw fail(503);
  const handler=method=>async(req,res)=>{
    if(enabled!==true||!entitlementSecretStatus().configured) return res.status(503).json({error:'runtime_handoff_unavailable'});
    try{return res.json(await candidate[method](req.body,method==='issue'?extractToken(req):undefined));}
    catch(error){const status=error.handoffStatus||error.entitlementStatus;return res.status([400,401,403,409,429,503].includes(status)?status:503).json({error:'runtime_handoff_denied'});}
  };
  const headers=(_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next();};
  router.post('/api/runtime-handoff/issue',headers,rateLimit,handler('issue'));
  router.post('/api/runtime-handoff/exchange',headers,rateLimit,handler('exchange'));
}
