// Resolve both legacy names and the master's decorated names without changing identity.
export function ftChannelName(name) {
  const normalized = String(name || '').normalize('NFKC').toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '').replace(/[_\s]+/g, '-');
  return normalized === 'faq' ? 'support-faq' : normalized;
}
