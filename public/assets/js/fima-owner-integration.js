export const OWNER_ROUTES = [
  { id: 'owner-setup', title: 'Üretim ve test araçları' },
  { id: 'owner-logs', title: 'Audit ve yedekler' },
  { id: 'owner-runtime', title: 'Bot çalışma durumu' },
  { id: 'owner-bot', title: 'Bot kimliği' }
];
const PAGES = {
  'owner-setup': 'setup', 'owner-logs': 'logs', 'owner-runtime': 'advanced', 'owner-bot': 'branding',
  channels: 'channels', roles: 'roles', applications: 'applications', tickets: 'tickets',
  moderation: 'moderation', security: 'blacklist', challenge: 'challenge', events: 'events',
  voice: 'voice', levels: 'xp', content: 'guides', sessions: 'operations', availability: 'availability',
  profiles: 'roster', leaderboards: 'leaderboard', branding: 'branding'
};
export function ownerPage(route) { return PAGES[route] || null; }
export function disposeOwnerTools(root) {
  root?.ownerAbort?.abort();
  if (root) { root.hidden = true; root.replaceChildren(); root.ownerContext = null; }
}
export async function renderOwnerTools(root, options) {
  const controller = new AbortController();
  root.ownerAbort = controller;
  const response = await fetch(`${options.apiBase}/api/fima-bot/owner-tools`, {
    credentials: 'include', cache: 'no-store', signal: controller.signal, headers: { accept: 'text/html' }
  });
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => ({}))).error || 'owner_tools_unavailable');
    error.status = response.status;
    throw error;
  }
  const markup = await response.text();
  const { initializeOwnerTools } = await import('./fima-owner-tools.js?v=20261007-6');
  if (controller.signal.aborted) return;
  root.className = 'owner-tools';
  root.innerHTML = `<details${['setup', 'logs', 'advanced', 'branding'].includes(options.page) ? ' open' : ''}><summary class="owner-tools-label">${options.language === 'en' ? 'Owner tools' : 'Owner araçları'}</summary>${markup}</details>`;
  root.hidden = false;
  await initializeOwnerTools(root, options);
}
