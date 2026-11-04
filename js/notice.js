/* ============================================
   UniTab - Global Toast Notification (bottom-right)
   Register one reusable notice function:
     Notice.show(text, severity, duration)
   severity is 'info' | 'success' | 'warning' | 'error' and drives the colour.
   duration (ms) is how long the notice stays before sliding back out; a
   deeper-coloured progress bar along the top edge counts it down.

   Multiple notices STACK bottom-to-top: each show() creates its own toast
   appended above the previous ones, and each slides out and is removed on its
   own timer. Styled as a fixed-size rectangle (not glass, not following the
   settings glass radius), translucent per-severity background, high-contrast
   text. Slides in from the right edge and slides back out to the right.
   ============================================ */

const Notice = (() => {
  'use strict';

  const GAP = 12;        /* vertical gap between stacked toasts */
  const SLIDE_MS = 900;  /* keep in sync with the CSS transition */

  let container = null;

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'app-notice-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function layout() {
    /* Re-stack from the bottom: the last-created toast sits lowest. */
    const toasts = Array.from(container.children);
    let offset = 0;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.style.bottom = offset + 'px';
      offset += t.offsetHeight + GAP;
    }
  }

  function show(text, severity = 'info', duration = 5000) {
    const box = ensureContainer();

    const el = document.createElement('div');
    el.className = 'app-notice';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="app-notice-progress"></div><div class="app-notice-text"></div>';
    el.dataset.severity = severity;
    el.querySelector('.app-notice-text').textContent = text;
    el.style.setProperty('--notice-duration', duration + 'ms');
    box.appendChild(el);
    layout();

    /* Entrance: drop to closed, force a paint, then open. */
    el.dataset.open = 'false';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.dataset.open = 'true'; });
    });

    /* Exit: slide back out, then remove and re-stack the rest. */
    setTimeout(() => {
      el.dataset.open = 'false';
      setTimeout(() => {
        el.remove();
        layout();
      }, SLIDE_MS);
    }, duration);
  }

  return { show };
})();
