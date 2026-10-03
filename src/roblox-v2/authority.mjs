// Bridge to the reviewed live-safe server helpers. No routes are mounted here.
export function createRobloxAuthorityAdapter({captureOAuthInitiatingSession, assertOAuthInitiatingSession}) {
  if (typeof captureOAuthInitiatingSession !== 'function' || typeof assertOAuthInitiatingSession !== 'function') {
    throw new Error('Reviewed initiating-session helpers required');
  }
  const reject = () => { throw Object.assign(new Error('oauth_initiating_session_invalid'), {code:'oauth_initiating_session_invalid'}); };
  return {
    async captureAuthority(req) {
      if (typeof req.user?.id !== 'string' || !req.user.id) reject();
      // The helper validates the request cookie against the current server session.
      const captured = await captureOAuthInitiatingSession(req, req.user);
      if (!captured?.sessionId || typeof captured.proof !== 'string' || !captured.proof) reject();
      return {userId:req.user.id, sessionId:captured.sessionId, credentialVersion:captured.proof};
    },
    async assertAuthority(tx, binding, lock) {
      if (lock !== true || typeof binding?.userId !== 'string' || !binding.userId
        || typeof binding.sessionId !== 'string' || !binding.sessionId
        || typeof binding.credentialVersion !== 'string' || !binding.credentialVersion) reject();
      const session = await tx.userSession.findUnique({where:{id:binding.sessionId}});
      if (!session || session.userId !== binding.userId || typeof session.tokenHash !== 'string' || !session.tokenHash) reject();
      // tokenHash stays server-side. The helper locks user then session and rereads
      // expiry, user identity and HMAC proof (including the password hash).
      // A concurrent change between this lookup and the locked read fails closed.
      await assertOAuthInitiatingSession(tx, {
        userId:binding.userId, sessionId:binding.sessionId,
        proof:binding.credentialVersion, tokenHash:session.tokenHash
      }, true);
    }
  };
}
