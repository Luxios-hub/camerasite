// CamerasNYC — minimal site JS
// No framework. No build. Just the few things HTML can't do alone.

(() => {
  // 1. Auto-fill the footer copyright year. Saves an annual edit.
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // 2. Mobile nav toggle. The toggle button shows below 880px (see CSS).
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      links.classList.toggle('is-open');
    });
  }

  // 3. Highlight the current page in the nav. Matches by filename.
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('is-active');
    }
  });
})();
