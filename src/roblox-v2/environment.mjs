// Candidate-only mapping. Importing this module neither mounts routes nor enables them.
export const ROBLOX_V2_REDIRECT_URI = 'https://fimamacro.com/api/roblox/v2/callback';

export function readRobloxV2Environment(env = process.env) {
  const flag = env.FIMA_ROBLOX_V2_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag)) throw new Error('Invalid Roblox v2 enable flag');
  const redirectUri = env.FIMA_ROBLOX_V2_REDIRECT_URI ?? ROBLOX_V2_REDIRECT_URI;
  if (redirectUri !== ROBLOX_V2_REDIRECT_URI) throw new Error('Unregistered Roblox v2 redirect');
  if (flag !== 'true') return { enabled: false, redirectUri };
  const clientId = env.FIMA_ROBLOX_V2_CLIENT_ID;
  const clientSecret = env.FIMA_ROBLOX_V2_CLIENT_SECRET;
  if (!clientId?.trim() || !clientSecret?.trim()) throw new Error('Missing Roblox v2 provider credentials');
  const encodedKey = env.FIMA_ROBLOX_V2_SEALING_KEY_BASE64 ?? '';
  const sealingKey = Buffer.from(encodedKey, 'base64');
  if (sealingKey.length !== 32 || sealingKey.toString('base64') !== encodedKey) {
    throw new Error('Missing or invalid dedicated persistent Roblox v2 sealing key');
  }
  return { enabled: true, clientId, clientSecret, redirectUri, sealingKey };
}
