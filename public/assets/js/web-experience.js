(() => {
  'use strict';
  // Decorative icons never replace labels or change the account route handlers.
  const paths = [
    'M3 10 12 3l9 7v10h-6v-6H9v6H3Z',
    'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
    'm3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10',
    'M3 5h18v14H3ZM3 10h18M7 15h4',
    'M3 8h18v4H3Zm2 4v9h14v-9M12 8v13M12 8C3 8 5 1 9 3l3 5Zm0 0c9 0 7-7 3-5Z',
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6',
    'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    'M3 13v-1a9 9 0 0 1 18 0v1M3 12h4v7H3Zm14 0h4v7h-4M17 19c0 2-3 3-5 3',
    'M4 4h16v16H4ZM8 8h8M8 12h8M8 16h4'
  ];
  document.querySelectorAll('.account-dashboard-nav a').forEach((link, index) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('dashboard-nav-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[index] || paths[1]); svg.append(path); link.prepend(svg);
  });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const cancelScroll = () => { cancelAnimationFrame(frame); frame = 0; };
  ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, cancelScroll, { passive: true }));
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash || url.hash === '#logout') return;
    let target;
    try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch { return; }
    if (!target || target.closest('[hidden]') || !target.getClientRects().length) return;
    event.preventDefault(); cancelScroll();
    const header = document.querySelector('.site-header, .bot-header, .page-header, .topbar');
    const offset = header && ['sticky', 'fixed'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height + 20 : 20;
    const start = scrollY;
    const end = Math.max(0, Math.min(start + target.getBoundingClientRect().top - offset, document.documentElement.scrollHeight - innerHeight));
    const finish = () => {
      history.pushState(null, '', url.hash);
      const temporary = !target.hasAttribute('tabindex');
      if (temporary) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (temporary) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    };
    if (motion.matches) { window.scrollTo({ top: end, behavior: 'instant' }); finish(); return; }
    const duration = Math.min(850, Math.max(480, Math.abs(end - start) * .25));
    let began;
    const step = time => {
      began ??= time;
      const progress = Math.min(1, (time - began) / duration);
      const ease = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      window.scrollTo({ top: start + (end - start) * ease, behavior: 'instant' });
      if (progress < 1) frame = requestAnimationFrame(step);
      else { frame = 0; finish(); }
    };
    frame = requestAnimationFrame(step);
  });
  if (!('IntersectionObserver' in window)) return;
  // Content is always visible; only elements reaching the viewport get an entrance.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (!motion.matches) entry.target.classList.add('experience-enter');
      observer.unobserve(entry.target);
    });
  }, { threshold: .08 });
  document.querySelectorAll('body[data-page] .section-heading, body[data-page] .hero-copy, body[data-page] .hero-visual, body[data-page] .macro-card, body[data-page] .feature-card, body[data-page] .price-card, body[data-page] .download-panel, body[data-account-page] .panel, body[data-fima-product="bot"] .section-heading, body[data-fima-product="bot"] .page-hero, body[data-fima-product="bot"] .guild-card, body[data-fima-product="bot"] .feedback-card, body[data-fima-product="bot"] .command-card, body[data-fima-product="bot"] .gate').forEach(el => observer.observe(el));
  motion.addEventListener('change', () => {
    if (motion.matches) { cancelScroll(); document.querySelectorAll('.experience-enter').forEach(el => el.classList.remove('experience-enter')); }
  });
})();
