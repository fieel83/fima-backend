import { randomBytes, createHash } from 'node:crypto';
const pendingProvider = 'roblox_oauth_v2_pending';
const digest = value => createHash('sha256').update(value).digest('hex');
const deny = code => { throw Object.assign(new Error(code), { code }); };
const idValid = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);

// Activation requires the existing account/session locks and persistent sealing key.
// Never enable legacy OAuth routes or accept a subject/username supplied by the browser.
export function createRobloxOAuthCandidate(d) {
  for (const key of ['captureAuthority','assertAuthority','seal','unseal','exchangeCode','userInfo']) {
    if (typeof d[key] !== 'function') throw new Error(`Required security adapter: ${key}`);
  }
  const now = d.now || Date.now;
  const config = () => {
    if (d.enabled !== true) deny('roblox_v2_disabled');
    if (!d.clientId || !d.redirectUri) deny('roblox_v2_configuration_missing');
    const uri = new URL(d.redirectUri);
    if (uri.protocol !== 'https:' || uri.username || uri.password || uri.hash || uri.search) deny('roblox_v2_redirect_invalid');
  };
  async function authority(req) {
    const binding = await d.captureAuthority(req);
    if (!binding || typeof binding.userId !== 'string' || binding.userId !== req.user?.id
      || typeof binding.sessionId !== 'string' || !binding.sessionId
      || !((typeof binding.credentialVersion === 'string' && binding.credentialVersion.length > 0)
        || (Number.isSafeInteger(binding.credentialVersion) && binding.credentialVersion >= 0))) deny('oauth_initiating_session_invalid');
    return {userId:binding.userId,sessionId:binding.sessionId,credentialVersion:binding.credentialVersion};
  }
  const sameBinding = (a,b) => a?.userId === b.userId && a?.sessionId === b.sessionId
    && a?.credentialVersion === b.credentialVersion;
  async function locked(tx,binding) {
    await d.assertAuthority(tx,binding,true);
    const user = await tx.user.findUnique({where:{id:binding.userId}});
    if (!user) deny('oauth_initiating_session_invalid');
    return user;
  }
  return {
    async start(req) {
      config();
      const binding = await authority(req);
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const expiresAt = now() + 5 * 60_000;
      const sealed = await d.seal(verifier);
      await d.db.$transaction(async tx => {
        await locked(tx,binding);
        await tx.oAuthLink.deleteMany({where:{userId:binding.userId,provider:pendingProvider}});
        await tx.oAuthLink.create({data:{userId:binding.userId,provider:pendingProvider,providerSubject:digest(state),
          metadata:{binding,expiresAt,sealedVerifier:sealed}}});
      });
      const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
      const params = {client_id:d.clientId,redirect_uri:d.redirectUri,scope:'openid profile',response_type:'code',
        state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
      for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
      return {authorizationUrl:url.href,expiresAt};
    },
    async finish(req) {
      config();
      const binding = await authority(req);
      const {state,code} = req.query || {};
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)
        || typeof code !== 'string' || !code.length || code.length > 4096) deny('roblox_v2_callback_invalid');
      // Reserve once before network I/O. Failures require a fresh challenge.
      const pending = await d.db.$transaction(async tx => {
        await locked(tx,binding);
        const claim = await tx.oAuthLink.findUnique({where:{provider_providerSubject:{provider:pendingProvider,providerSubject:digest(state)}}});
        if (!claim || claim.userId !== binding.userId || !sameBinding(claim.metadata?.binding,binding)
          || !Number.isFinite(claim.metadata?.expiresAt) || claim.metadata.expiresAt <= now()) deny('roblox_v2_state_invalid');
        const consumed = await tx.oAuthLink.deleteMany({where:{id:claim.id,userId:binding.userId,provider:pendingProvider}});
        if (consumed.count !== 1) deny('roblox_v2_state_invalid');
        return claim;
      });
      const verifier = await d.unseal(pending.metadata.sealedVerifier);
      const tokens = await d.exchangeCode({code,codeVerifier:verifier,redirectUri:d.redirectUri,clientId:d.clientId});
      if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token
        || String(tokens.token_type).toLowerCase() !== 'bearer') deny('roblox_v2_token_invalid');
      if (typeof tokens.scope !== 'string' || !['openid','profile'].every(scope=>tokens.scope.split(/\s+/).includes(scope))) deny('roblox_v2_scope_missing');
      // Provider adapters use fixed HTTPS endpoints, no redirects, bounded bodies/timeouts.
      const profile = await d.userInfo(tokens.access_token);
      if (!idValid(profile?.sub)) deny('roblox_v2_subject_invalid');
      const subject = profile.sub;
      const user = await d.db.$transaction(async tx => {
        const current = await locked(tx,binding); // Recheck logout/reset during provider I/O.
        if (pending.metadata.expiresAt <= now()) deny('roblox_v2_state_expired');
        if (current.robloxUserId && current.robloxUserId !== subject) deny('roblox_unlink_required');
        const own = await tx.oAuthLink.findMany({where:{userId:current.id,provider:'roblox'}});
        if (own.some(link=>link.providerSubject !== subject)) deny('roblox_unlink_required');
        const linked = await tx.oAuthLink.findUnique({where:{provider_providerSubject:{provider:'roblox',providerSubject:subject}}});
        if (linked && linked.userId !== current.id) deny('roblox_profile_already_verified');
        if (await tx.user.findFirst({where:{robloxUserId:subject,id:{not:current.id}}})) deny('roblox_profile_already_verified');
        // Unique OAuthLink(provider,subject) resolves concurrent cross-account claims.
        const identity = {providerUsername:typeof profile.preferred_username === 'string' ? profile.preferred_username.slice(0,100) : null,
          metadata:{verifiedBy:'roblox_oauth_v2_pkce',verifiedAt:new Date(now()).toISOString(),scopes:['openid','profile']}};
        if (linked) await tx.oAuthLink.update({where:{id:linked.id},data:identity});
        else await tx.oAuthLink.create({data:{userId:current.id,provider:'roblox',providerSubject:subject,...identity}});
        return tx.user.update({where:{id:current.id},data:{robloxUserId:subject,robloxUsername:identity.providerUsername,robloxAvatarUrl:null}});
      });
      return {userId:user.id,robloxUserId:subject}; // No provider tokens or verifier returned/persisted.
    }
  };
}
