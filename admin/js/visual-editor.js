(() => {
  const drawer = document.querySelector('[data-admin-visual-drawer]');
  const backdrop = document.querySelector('[data-admin-visual-backdrop]');
  const frame = document.querySelector('[data-admin-visual-frame]');
  const title = document.querySelector('[data-admin-visual-drawer-title]');
  const closeButton = document.querySelector('[data-admin-visual-close]');
  const pageSelect = document.querySelector('[data-admin-visual-page-select]');

  function openDrawer(url, label) {
    if (!drawer || !frame) {
      window.location.href = url;
      return;
    }

    if (title) {
      title.textContent = label || 'Edit content';
    }

    frame.src = url;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) {
      backdrop.hidden = false;
    }
  }

  function closeDrawer() {
    if (!drawer) {
      return;
    }

    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (backdrop) {
      backdrop.hidden = true;
    }
  }

  if (pageSelect) {
    pageSelect.addEventListener('change', () => {
      if (pageSelect.value) {
        window.location.href = pageSelect.value;
      }
    });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-admin-editor-url]');

    if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    openDrawer(trigger.getAttribute('data-admin-editor-url'), trigger.getAttribute('data-admin-editor-title'));
  });

  document.addEventListener('submit', (event) => {
    if (!event.target.closest('.admin-visual-drawer')) {
      event.preventDefault();
    }
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeDrawer);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeDrawer);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  });
})();
