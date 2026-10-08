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
  if (!('IntersectionObserver' in window)) return;
  // Content is always visible; only elements reaching the viewport get an entrance.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (!motion.matches) entry.target.classList.add('experience-enter');
      observer.unobserve(entry.target);
    });
  }, { threshold: .08 });
  document.querySelectorAll('body[data-page] .section-heading, body[data-page] .hero-copy, body[data-page] .hero-visual, body[data-page] .macro-card, body[data-page] .feature-card, body[data-page] .price-card, body[data-page] .download-panel').forEach(el => observer.observe(el));
  motion.addEventListener('change', () => {
    if (motion.matches) document.querySelectorAll('.experience-enter').forEach(el => el.classList.remove('experience-enter'));
  });
})();
