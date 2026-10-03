// The registered first-party callback has no API host-only session cookie.
// Relay only to the fixed API callback; authentication and PKCE remain mandatory there.
export function robloxCallbackRelay(req,res,next) {
  const host=String(req.hostname||'').toLowerCase();
  if(host==='api.fimamacro.com') return next();
  if(host!=='fimamacro.com') return res.status(400).json({ok:false,code:'callback-host-invalid'});
  const {state,code}=req.query||{};
  if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||typeof code!=='string'||!code||code.length>4096||req.query.error!==undefined) {
    return res.status(400).json({ok:false,code:'verification-session-invalid'});
  }
  const target=new URL('https://api.fimamacro.com/api/roblox/v2/callback');
  target.searchParams.set('state',state);
  target.searchParams.set('code',code);
  return res.redirect(303,target.href);
}
