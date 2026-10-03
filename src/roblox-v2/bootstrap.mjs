// Prepared activation wiring only. No production route changes occur on import.
import {readRobloxV2Environment} from './environment.mjs';
import {createVerifierSealer} from './sealing.mjs';
import {createRobloxAuthorityAdapter} from './authority.mjs';
import {createRobloxProvider} from './provider.mjs';
import {createRobloxOAuthCandidate} from './robloxOAuthCandidate.mjs';
import {mountRobloxVerificationCandidate} from './httpAdapter.mjs';

export function prepareRobloxVerification({env=process.env,db,router,authenticate,csrf,rateLimit,
  captureOAuthInitiatingSession,assertOAuthInitiatingSession,invalidateAccountCache}) {
  const config=readRobloxV2Environment(env);
  // A disabled deploy must not read credentials, touch the database or mount routes.
  if(!config.enabled) return {enabled:false,mounted:false};
  const authority=createRobloxAuthorityAdapter({captureOAuthInitiatingSession,assertOAuthInitiatingSession});
  const sealer=createVerifierSealer(config.sealingKey);
  const provider=createRobloxProvider({clientSecret:config.clientSecret});
  const candidate=createRobloxOAuthCandidate({db,...config,...authority,...sealer,...provider});
  const validateOrigin=(req,res,next)=>req.get('origin')==='https://fimamacro.com'
    ?next():res.status(403).json({ok:false,code:'origin-required'});
  return mountRobloxVerificationCandidate({router,candidate,enabled:true,authenticate,csrf,rateLimit,
    validateOrigin,invalidateAccountCache,resultUrl:'https://fimamacro.com/dashboard/overview'});
}
