import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const aad = Buffer.from('fima:roblox-oauth-v2:pkce:v1');
// Supply a dedicated persistent secret through server configuration. Never generate on startup.
export function createVerifierSealer(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('roblox_v2_sealing_key_invalid');
  const secret = Buffer.from(key);
  return {
    seal(value) {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('roblox_v2_verifier_invalid');
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm',secret,nonce);
      cipher.setAAD(aad);
      const body = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
      return 'v1.' + Buffer.concat([nonce,cipher.getAuthTag(),body]).toString('base64url');
    },
    unseal(value) {
      if (typeof value !== 'string' || !/^v1\.[A-Za-z0-9_-]{95}$/.test(value)) throw new Error('roblox_v2_sealed_verifier_invalid');
      const bytes = Buffer.from(value.slice(3),'base64url');
      if (bytes.length !== 71 || bytes.toString('base64url') !== value.slice(3)) throw new Error('roblox_v2_sealed_verifier_invalid');
      const cipher = createDecipheriv('aes-256-gcm',secret,bytes.subarray(0,12));
      cipher.setAAD(aad); cipher.setAuthTag(bytes.subarray(12,28));
      const result = Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
      if (!/^[A-Za-z0-9_-]{43}$/.test(result)) throw new Error('roblox_v2_verifier_invalid');
      return result;
    }
  };
}
