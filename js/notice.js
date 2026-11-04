/* ============================================
   UniTab - Global Toast Notification (bottom-right)
   Register one reusable notice function:
     Notice.show(text, severity, duration)
   severity is 'info' | 'success' | 'warning' | 'error' and drives the colour.
   duration (ms) is how long the notice stays before sliding back out; a
   deeper-coloured progress bar along the top edge counts it down.

   Styled as a fixed-size rectangle (not glass, not following the settings
   glass radius), translucent per-severity background, high-contrast text.
   Slides in from the right edge and slides back out to the right.
   ============================================ */

const Notice = (() => {
  'use strict';

  let el = null;
  let timer = 0;

  function show(text, severity = 'info', duration = 5000) {
    if (!el) {
      el = document.createElement('div');
      el.className = 'app-notice';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<div class="app-notice-progress"></div><div class="app-notice-text"></div>';
      document.body.appendChild(el);
    }
    el.dataset.severity = severity;
    el.querySelector('.app-notice-text').textContent = text;
    /* The progress bar runs for exactly `duration` ms, matching the timer, so
       it reaches empty the moment the notice starts sliding out. */
    el.style.setProperty('--notice-duration', duration + 'ms');
    /* Restart the entrance animation if a notice is already on screen:
       drop to closed, force a paint, then open again. */
    el.dataset.open = 'false';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.dataset.open = 'true'; });
    });
    clearTimeout(timer);
    timer = setTimeout(() => { el.dataset.open = 'false'; }, duration);
  }

  return { show };
})();
