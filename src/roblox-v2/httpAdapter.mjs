// Narrow activation adapter; live acceptance is recorded separately from mounting.
export function mountRobloxVerificationCandidate({router,candidate,enabled=false,authenticate,csrf,validateOrigin,rateLimit,invalidateAccountCache,resultUrl}) {
  for(const fn of [authenticate,csrf,validateOrigin,rateLimit,invalidateAccountCache]) {
    if(typeof fn!=='function') throw new Error('Reviewed account security middleware required');
  }
  if(!candidate || typeof candidate.start!=='function' || typeof candidate.finish!=='function') throw new Error('Verification candidate required');
  const target=new URL(resultUrl);
  if(target.origin!=='https://fimamacro.com' || target.username || target.password || target.search || target.hash) throw new Error('Fixed first-party result URL required');
  const headers=(_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.set('Pragma','no-cache');next();};
  const feature=(_req,res,next)=>enabled===true?next():res.status(503).json({ok:false,code:'roblox-verification-unavailable'});
  const session=(req,res,next)=>typeof req.user?.id==='string'&&req.user.id?next():res.status(401).json({ok:false,code:'authentication-required'});
  const failure=(res,error)=>{
    // Never reveal provider bodies, subjects, uniqueness owners or DB errors.
    const invalid=['roblox_v2_callback_invalid','roblox_v2_state_invalid','roblox_v2_state_expired','oauth_initiating_session_invalid'];
    const conflict=['P2002','roblox_already_verified','roblox_profile_already_verified','roblox_unlink_required'];
    const status=invalid.includes(error?.code)?400:conflict.includes(error?.code)?409:503;
    res.status(status).json({ok:false,code:status===400?'verification-session-invalid':status===409?'verification-conflict':'roblox-verification-unavailable'});
  };
  router.post('/api/roblox/v2/start',headers,feature,authenticate,session,rateLimit,validateOrigin,csrf,async(req,res)=>{
    try {
      const start=await candidate.start(req);
      const url=new URL(start.authorizationUrl);
      if(url.origin!=='https://apis.roblox.com'||url.pathname!=='/oauth/v1/authorize'||url.username||url.password||url.hash) throw new Error('Invalid authorization origin');
      res.json({ok:true,authorizationUrl:url.href,expiresAt:start.expiresAt});
    }catch(error){failure(res,error);}
  });
  // GET callback is bound to initiating cookie session + consumed PKCE state;
  // a CSRF POST token cannot be required on the provider redirect.
  router.get('/api/roblox/v2/callback',headers,feature,authenticate,session,rateLimit,async(req,res)=>{
    try {
      const {state,code}=req.query||{};
      if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||typeof code!=='string'||!code||code.length>4096||req.query.error!==undefined) {
        throw Object.assign(new Error('Invalid callback'),{code:'roblox_v2_callback_invalid'});
      }
      await candidate.finish(req);
      await invalidateAccountCache(req.user.id);
      res.redirect(303,target.href);
    }catch(error){failure(res,error);}
  });
  return {mounted:true,enabled:enabled===true,productionReady:false};
}
