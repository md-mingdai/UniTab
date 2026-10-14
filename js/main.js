/* ============================================
   UniTab - Main Entry Point
   ============================================ */

(function () {
  'use strict';

  /* --- Clock Module --- */
  const Clock = (() => {
    const clockEl = document.getElementById('clock');
    let timerId = null;
    let lastText = '';

    /* Read the current setting directly from Settings so the clock always
       reflects the saved preference, even if the apply path is missed
       (e.g. due to init ordering or a swallowed event). */
    function shouldShowSeconds() {
      try {
        const s = (typeof Settings !== 'undefined' && Settings.getState)
          ? Settings.getState()
          : null;
        return !!(s && s.showSeconds);
      } catch {
        return true;
      }
    }

    function update() {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      const text = shouldShowSeconds()
        ? `${hh}:${mm}:${now.getSeconds().toString().padStart(2, '0')}`
        : `${hh}:${mm}`;
      /* Only touch the DOM when the text changes. */
      if (text !== lastText) {
        lastText = text;
        clockEl.textContent = text;
      }
    }

    function clearTimer() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    /* Wake exactly when the displayed value changes: on the next second boundary when
       seconds are shown, otherwise on the next minute boundary. A fixed setInterval(…,
       1000) keeps whatever phase it started with, so the seconds could run up to a
       second behind the real clock (and a 30 s interval re-checked a minute display
       twice a minute for nothing). */
    function schedule() {
      clearTimer();
      if (document.hidden) return; /* nothing to see: resumes on visibilitychange */
      const now = Date.now();
      const period = shouldShowSeconds() ? 1000 : 60000;
      const delay = period - (now % period) + 2; /* +2 ms: land just after the boundary */
      timerId = setTimeout(() => {
        update();
        schedule();
      }, delay);
    }

    function start() {
      update();
      schedule();
    }

    /* A hidden tab neither shows nor needs a ticking clock; catch up when it returns. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimer();
      } else {
        start();
      }
    });

    /* Called by Settings.applyToDom when the user toggles the switch,
       so the cadence matches the new mode without waiting for the next tick. */
    function setShowSeconds() {
      start();
    }

    return { start, setShowSeconds };
  })();

  /* Settings.applyToDom() looks for a global `Clock` to retune the clock the moment
     "show seconds" is toggled. It was only ever visible inside this closure, so that
     call never happened and the display changed on the next tick instead (up to a full
     second late with the old interval, up to a minute late with a minute-aligned timer). */
  window.Clock = Clock;

  /* --- Initialize --- */
  function init() {
    /* The page starts in `preload` (css): transitions and animations are off, so the
       saved settings applied below take effect without animating "into" place. Lift
       it two frames after this task, i.e. once the first frame is on screen. Queued
       first so that it happens even if something below throws. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.documentElement.classList.remove('preload'));
    });

    /* 1. Initialize settings (loads saved state, binds events, applies background) */
    Settings.init();

    /* 2. Initialize search first — applyAllToDom() below calls Search.setEngine(),
          which itself calls hideSuggestions(), so Search must be initialized
          (its DOM refs bound) before any settings are applied. */
    Search.init({
      searchInput: document.getElementById('search-input'),
      searchButton: document.getElementById('search-button'),
      suggestionsDropdown: document.getElementById('suggestions-dropdown'),
      suggestionsList: document.getElementById('suggestions-list')
    });

    /* 3. Apply all saved settings to the DOM (engine, bg, show-seconds, ...) */
    Settings.applyAllToDom();

    /* 4. Start clock (uses showSeconds preference applied above) */
    Clock.start();

    /* 5. Load bookmarks */
    Bookmarks.load();

    /* 6. Init cursor effect (visibility controlled by settings) */
    const s = Settings.getState();
    CursorEffect.init(s.showCursorEffect, s.cursorEffectStyle);

    /* 6. Focus search input (desktop only) */
    const searchInput = document.getElementById('search-input');
    if (window.innerWidth > 640) {
      searchInput.focus();
    }

    /* 7. Keyboard shortcut: "/" to focus search */
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    /* (A system light/dark switch used to reload the wallpaper here. Nothing about the
       background depends on the colour scheme, so that was a pointless re-decode, and
       for a video wallpaper it restarted playback with the default sound / loop
       options. The stylesheet handles the scheme on its own.) */
  }

  /* --- Boot --- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
