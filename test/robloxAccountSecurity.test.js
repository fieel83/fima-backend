import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRobloxAccountHandlers } from "../src/robloxAccountSecurity.js";

// Actual route helpers and production session/password-generation proof functions.
// Database and Roblox network adapters are local controlled inputs, not live-provider evidence.
const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const start = source.indexOf("function oauthInitiatingSessionProof(");
const end = source.indexOf("async function getOptionalUser(", start);
assert.ok(start >= 0 && end > start);
const executable = source.slice(start, end) + "\n({captureOAuthInitiatingSession,assertOAuthInitiatingSession})";
const hash = (v) => v ? crypto.createHash("sha256").update(v).digest("hex") : "";
const copy = (v) => structuredClone(v);
const code = "FIMAVERIFY-0123456789ABCDEF0123456789ABCDEF";
const matches = (row, where) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === "object" && "not" in v) return row[k] !== v.not;
  if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
  return row[k] === v;
});
function fixture() {
  let state = {
    users: [{id:"one",passwordHash:"password-generation-one",robloxUserId:null,robloxUsername:null,robloxAvatarUrl:null}],
    sessions: [{id:"s1",userId:"one",tokenHash:hash("cookie-one"),expiresAt:new Date(Date.now()+600_000)}],
    links: [], resets:[{id:"r1",userId:"one",usedAt:null}],
    desktop:[{id:"d1",userId:"one",status:"approved"},{id:"d2",userId:"other",status:"approved"}]
  };
  const locks=[]; const writes=[]; let counter=0;
  const delegates=(get)=>({
    async $queryRaw(sql,...values){locks.push({sql:sql.join("?"),id:values[0]});},
    user:{
      async findUnique({where}){return copy(get().users.find(x=>matches(x,where))||null);},
      async findFirst({where}){return copy(get().users.find(x=>matches(x,where))||null);},
      async update({where,data}){const row=get().users.find(x=>matches(x,where));assert.ok(row);Object.assign(row,copy(data));writes.push({type:"user",data:copy(data)});return copy(row);}
    },
    userSession:{async findUnique({where}){const row=get().sessions.find(x=>matches(x,where));return row?{...copy(row),user:copy(get().users.find(x=>x.id===row.userId))}:null;}},
    oAuthLink:{
      async findMany({where}){return copy(get().links.filter(x=>matches(x,where)));},
      async findFirst({where}){return copy(get().links.find(x=>matches(x,where))||null);},
      async findUnique({where}){return copy(get().links.find(x=>matches(x,where.provider_providerSubject||where))||null);},
      async create({data}){if(get().links.some(x=>x.provider===data.provider&&x.providerSubject===data.providerSubject))throw Object.assign(new Error("unique"),{code:"P2002"});const row={id:`l${++counter}`,updatedAt:new Date(),...copy(data)};get().links.push(row);writes.push({type:"link-create",data:copy(data)});return copy(row);},
      async update({where,data}){const row=get().links.find(x=>matches(x,where));assert.ok(row);Object.assign(row,copy(data));writes.push({type:"link-update",data:copy(data)});return copy(row);},
      async deleteMany({where}){const old=get().links.length;get().links=get().links.filter(x=>!matches(x,where));return{count:old-get().links.length};}
    },
    passwordResetToken:{async updateMany({where,data}){const rows=get().resets.filter(x=>matches(x,where));rows.forEach(x=>Object.assign(x,copy(data)));return{count:rows.length};}},
    desktopLoginRequest:{async updateMany({where,data}){const rows=get().desktop.filter(x=>matches(x,where));rows.forEach(x=>Object.assign(x,copy(data)));return{count:rows.length};}}
  });
  const db=delegates(()=>state);
  db.$transaction=async(run)=>{const draft=copy(state);const result=await run(delegates(()=>draft));state=draft;return result;};
  const proofApi=runInNewContext(executable,{crypto,Date,Buffer,prisma:db,USER_SESSION_COOKIE:"fima_user_session",hashToken:hash,oauthSecret:()=>"controlled-test-session-secret",timingSafeTextEqual:(a,b)=>crypto.timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)))});
  let networkCalls=0;let afterFetch=()=>{};let profile={id:"12345",username:"RobloxUser",displayName:"Roblox User",avatarUrl:"https://example.invalid/avatar.png",description:`Proof ${code}`};
  const deps={db,now:()=>Date.now(),captureAuthority:async(req)=>({...await proofApi.captureOAuthInitiatingSession(req,req.user),userId:req.user.id,tokenHash:hash(req.cookies.fima_user_session)}),assertAuthority:proofApi.assertOAuthInitiatingSession,
    normalizeUsername:(v)=>/^[A-Za-z0-9_]{3,20}$/.test(v)?v:null,
    resolveProfile:async()=>{networkCalls++;await afterFetch();return copy(profile);},resolveProfileWithDescription:async()=>{networkCalls++;await afterFetch();return copy(profile);},
    verifyPassword:async(p,h)=>p==="fresh-password"&&h==="password-generation-one",publicUser:copy,buildIntegrationSummary:async()=>({}),buildTrialSummary:async()=>({}),maskId:(v)=>v?`masked-${v.slice(-2)}`:null,audit:async()=>{}
  };
  const handlers=createRobloxAccountHandlers(deps);
  const invoke=async(name,body={})=>{const req={user:copy(state.users[0]),cookies:{fima_user_session:"cookie-one"},body};const res={statusCode:200,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};await handlers[name](req,res);return res;};
  const pending=()=>state.links.push({id:"pending",userId:"one",provider:"roblox_profile_verify",providerSubject:"one",metadata:{code,expiresAt:new Date(Date.now()+600_000).toISOString(),robloxUserId:"12345",username:"RobloxUser"}});
  const linked=()=>{Object.assign(state.users[0],{robloxUserId:"12345",robloxUsername:"RobloxUser",robloxAvatarUrl:"saved-avatar"});state.links.push({id:"linked",userId:"one",provider:"roblox",providerSubject:"12345"});};
  return{get state(){return state;},deps,handlers,invoke,pending,linked,locks,writes,get networkCalls(){return networkCalls;},set profile(v){profile={...profile,...v};},set afterFetch(v){afterFetch=v;}};
}
const rejected=(res,status,error)=>{assert.equal(res.statusCode,status);assert.equal(res.body.error,error);};

test("confirm consumes exact proof and links only numeric subject under account/session locks",async()=>{const f=fixture();f.pending();const res=await f.invoke("confirm");assert.equal(res.statusCode,200);assert.equal(res.body.user.robloxUserId,"12345");assert.equal(f.state.links.length,1);assert.equal(f.state.links[0].providerSubject,"12345");assert.ok(f.locks.some(x=>x.sql.includes("users")));assert.ok(f.locks.some(x=>x.sql.includes("user_sessions")));});
test("consumed verification cannot replay",async()=>{const f=fixture();f.pending();await f.invoke("confirm");rejected(await f.invoke("confirm"),400,"roblox_verification_expired");assert.equal(f.state.links.length,1);});
test("expiry during provider fetch is rejected after fetch",async()=>{const f=fixture();f.pending();f.afterFetch=()=>{f.state.links[0].metadata.expiresAt=new Date(Date.now()-1).toISOString();};rejected(await f.invoke("confirm"),400,"roblox_verification_expired");assert.equal(f.state.users[0].robloxUserId,null);});
test("replaced pending proof during fetch cannot authorize old claim",async()=>{const f=fixture();f.pending();f.afterFetch=()=>{f.state.links[0].metadata.code="FIMAVERIFY-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";};rejected(await f.invoke("confirm"),400,"roblox_verification_expired");});
test("deleted pending proof during fetch is denied",async()=>{const f=fixture();f.pending();f.afterFetch=()=>{f.state.links=[];};rejected(await f.invoke("confirm"),400,"roblox_verification_expired");});
test("foreign provider subject cannot be reassigned even when legacy user numeric field is absent",async()=>{const f=fixture();f.pending();f.state.links.push({id:"foreign",userId:"other",provider:"roblox",providerSubject:"12345"});rejected(await f.invoke("confirm"),409,"roblox_profile_already_verified");assert.equal(f.state.links.find(x=>x.id==="foreign").userId,"other");assert.ok(f.state.links.some(x=>x.id==="pending"));});
test("legacy duplicate numeric user field is denied",async()=>{const f=fixture();f.pending();f.state.users.push({id:"other",robloxUserId:"12345"});rejected(await f.invoke("confirm"),409,"roblox_profile_already_verified");});
test("changed numeric provider identity is denied regardless of same username",async()=>{const f=fixture();f.pending();f.profile={id:"54321"};rejected(await f.invoke("confirm"),409,"roblox_profile_changed");});
test("non-numeric identity cannot link",async()=>{const f=fixture();f.pending();f.profile={id:"RobloxUser"};rejected(await f.invoke("confirm"),404,"roblox_profile_not_found");});
test("verification code substring does not prove ownership",async()=>{const f=fixture();f.pending();f.profile={description:`X${code}Y`};rejected(await f.invoke("confirm"),400,"roblox_code_not_found");});
test("missing session stops network lookup",async()=>{const f=fixture();f.pending();f.state.sessions=[];rejected(await f.invoke("confirm"),401,"oauth_initiating_session_invalid");assert.equal(f.networkCalls,0);});
for(const operation of ["start","confirm"]){
  test(`${operation}: logout while provider fetch is in flight rejects writes`,async()=>{const f=fixture();if(operation==="confirm")f.pending();f.afterFetch=()=>{f.state.sessions=[];};rejected(await f.invoke(operation,{robloxUsername:"RobloxUser"}),401,"oauth_initiating_session_invalid");assert.equal(f.state.users[0].robloxUserId,null);assert.equal(f.writes.length,0);});
  test(`${operation}: password reset during provider fetch invalidates captured generation`,async()=>{const f=fixture();if(operation==="confirm")f.pending();f.afterFetch=()=>{f.state.users[0].passwordHash="password-generation-two";};rejected(await f.invoke(operation,{robloxUsername:"RobloxUser"}),401,"oauth_initiating_session_invalid");assert.equal(f.writes.length,0);});
}
test("start preserves already verified numeric identity/avatar and issues 128-bit proof",async()=>{const f=fixture();f.linked();const res=await f.invoke("start",{robloxUsername:"RobloxUser"});assert.equal(res.statusCode,200);assert.equal(f.state.users[0].robloxUserId,"12345");assert.equal(f.state.users[0].robloxAvatarUrl,"saved-avatar");assert.match(f.state.links.find(x=>x.provider==="roblox_profile_verify").metadata.code,/^FIMAVERIFY-[A-F0-9]{32}$/);});
test("start cannot replace linked identity without authenticated unlink",async()=>{const f=fixture();f.linked();f.profile={id:"54321"};rejected(await f.invoke("start",{robloxUsername:"AnotherUser"}),409,"roblox_unlink_required");assert.equal(f.state.links.length,1);});
test("start rejects foreign subject before writing pending proof",async()=>{const f=fixture();f.state.links.push({id:"foreign",userId:"other",provider:"roblox",providerSubject:"12345"});rejected(await f.invoke("start",{robloxUsername:"RobloxUser"}),409,"roblox_profile_already_verified");assert.equal(f.state.links.length,1);});
test("profile cosmetic edit cannot erase verified numeric ID",async()=>{const f=fixture();f.linked();rejected(await f.invoke("profile",{robloxUsername:""}),409,"roblox_unlink_required");assert.equal(f.state.users[0].robloxUserId,"12345");});
test("profile rejects legacy linked subject even when user numeric field missing",async()=>{const f=fixture();f.linked();f.state.users[0].robloxUserId=null;rejected(await f.invoke("profile",{robloxUsername:"AnotherUser"}),409,"roblox_unlink_required");assert.equal(f.state.links.length,1);});
test("same normalized username profile update preserves verified avatar/identity",async()=>{const f=fixture();f.linked();const res=await f.invoke("profile",{robloxUsername:"ROBLOXUSER"});assert.equal(res.statusCode,200);assert.equal(f.state.users[0].robloxUserId,"12345");assert.equal(f.state.users[0].robloxAvatarUrl,"saved-avatar");});
test("unverified cosmetic edit discards stale pending proof",async()=>{const f=fixture();f.pending();assert.equal((await f.invoke("profile",{robloxUsername:"AnotherUser"})).statusCode,200);assert.equal(f.state.links.length,0);assert.equal(f.state.users[0].robloxUserId,null);});
test("clear requires explicit password confirmation",async()=>{const f=fixture();f.linked();rejected(await f.invoke("clear"),400,"password_confirmation_required");assert.equal(f.state.links.length,1);});
test("clear incorrect password cannot unlink or invalidate grants",async()=>{const f=fixture();f.linked();rejected(await f.invoke("clear",{password:"wrong"}),403,"password_confirmation_failed");assert.equal(f.state.links.length,1);assert.equal(f.state.resets[0].usedAt,null);});
test("clear rechecks current password hash, not stale request user",async()=>{const f=fixture();f.linked();f.state.users[0].passwordHash="password-generation-two";rejected(await f.invoke("clear",{password:"fresh-password"}),403,"password_confirmation_failed");assert.equal(f.state.links.length,1);});
test("fresh-password clear invalidates reset proofs/pending desktop approval only for this account",async()=>{const f=fixture();f.linked();f.pending();assert.equal((await f.invoke("clear",{password:"fresh-password"})).statusCode,200);assert.equal(f.state.links.length,0);assert.equal(f.state.users[0].robloxUserId,null);assert.ok(f.state.resets[0].usedAt);assert.equal(f.state.desktop[0].status,"cancelled");assert.equal(f.state.desktop[1].status,"approved");});
test("existing own subject updates metadata without assigning userId",async()=>{const f=fixture();f.linked();f.pending();assert.equal((await f.invoke("confirm")).statusCode,200);const update=f.writes.find(x=>x.type==="link-update");assert.ok(update);assert.equal(Object.hasOwn(update.data,"userId"),false);assert.equal(f.state.links[0].userId,"one");});
test("same username/email cannot authorize different own linked numeric subject",async()=>{const f=fixture();f.pending();f.state.links.push({id:"old",userId:"one",provider:"roblox",providerSubject:"99999",providerUsername:"RobloxUser",providerEmail:"same@example.com"});rejected(await f.invoke("confirm"),409,"roblox_unlink_required");});
test("unique-constraint collision fails closed and rolls back proof consumption",async()=>{const f=fixture();f.pending();const original=f.deps.db.$transaction;f.deps.db.$transaction=(run)=>original(async tx=>{const create=tx.oAuthLink.create;tx.oAuthLink.create=async(args)=>{if(args.data.provider==="roblox")throw Object.assign(new Error("collision"),{code:"P2002"});return create(args);};return run(tx);});rejected(await f.invoke("confirm"),409,"roblox_profile_already_verified");assert.equal(f.state.links[0].id,"pending");assert.equal(f.state.users[0].robloxUserId,null);});
test("routes are wired to actual scoped helpers with rate limit and authentication",()=>{for(const [route,name]of [["/api/me/profile","profile"],["/api/me/roblox/start-verification","start"],["/api/me/roblox/confirm-verification","confirm"],["/api/me/roblox/clear","clear"]])assert.ok(source.includes(`app.post("${route}", authLimiter, requireUser, robloxAccountHandlers.${name});`));assert.ok(source.includes("assertAuthority: assertOAuthInitiatingSession"));});

test("legacy Roblox disconnect aliases cannot bypass the password-confirmed handler",()=>{assert.ok(source.includes('app.post(["/auth/roblox/disconnect", "/api/auth/roblox/disconnect"], authLimiter, requireUser, robloxAccountHandlers.clear);'));assert.equal((source.match(/app\.post\(\["\/auth\/roblox\/disconnect"/g)||[]).length,1);});

for (const failure of ["identity deletion", "reset invalidation", "desktop cancellation", "user update"]) {
  test(`clear rolls back all identity/proof changes when ${failure} fails`, async () => {
    const f = fixture(); f.linked(); f.pending();
    const before = copy(f.state);
    const transaction = f.deps.db.$transaction;
    f.deps.db.$transaction = (run) => transaction(async (tx) => {
      const [delegate, method] = {
        "identity deletion": [tx.oAuthLink, "deleteMany"],
        "reset invalidation": [tx.passwordResetToken, "updateMany"],
        "desktop cancellation": [tx.desktopLoginRequest, "updateMany"],
        "user update": [tx.user, "update"]
      }[failure];
      const original = delegate[method];
      delegate[method] = async (...args) => { await original(...args); throw new Error("controlled write failure"); };
      return run(tx);
    });
    rejected(await f.invoke("clear", { password: "fresh-password" }), 500, "roblox_clear_failed");
    assert.deepEqual(f.state, before);
  });
}
