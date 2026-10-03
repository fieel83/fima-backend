const base = 'https://apis.roblox.com/oauth/v1/';
export function createRobloxProvider({clientSecret,fetchImpl=fetch,timeoutMs=10_000}) {
  if (typeof clientSecret !== 'string' || !clientSecret) throw new Error('Roblox confidential client secret unavailable');
  async function request(endpoint,options) {
    const response = await fetchImpl(base+endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if (!response.body) throw new Error('Roblox provider response unavailable');
    const reader=response.body.getReader();let count=0;const chunks=[];
    try {while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>65536)throw new Error('Roblox provider response too large');chunks.push(Buffer.from(value));}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok) {
      // Only OAuth error fields reach logs; token responses and request values never do.
      const errorCode=typeof result.error==='string' && /^[a-z_]{1,80}$/.test(result.error) ? result.error : 'provider_error';
      const description=typeof result.error_description==='string' ? result.error_description.slice(0,400) : '';
      const authorization=options.headers?.authorization;
      const forbidden=[clientSecret,...(options.body instanceof URLSearchParams ? [options.body.get('code'),options.body.get('code_verifier')] : []),authorization,authorization?.replace(/^Bearer /i,''),result.access_token,result.refresh_token,result.id_token].filter(value=>typeof value==='string' && value.length>0);
      const safeDescription=forbidden.some(value=>description.includes(value)) ? '[redacted]' : description;
      console.warn('Roblox v2 provider rejection',JSON.stringify({endpoint,status:response.status,error:errorCode,error_description:safeDescription}));
      throw Object.assign(new Error('Roblox provider rejected request'),{code:'roblox_v2_provider_rejected'});
    }
    return result;
  }
  return {
    exchangeCode: ({code,codeVerifier,redirectUri,clientId})=>request('token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:codeVerifier,redirect_uri:redirectUri,client_id:clientId,client_secret:clientSecret})}),
    userInfo: token=>request('userinfo',{headers:{authorization:`Bearer ${token}`}})
  };
}
