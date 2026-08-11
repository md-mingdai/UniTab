/* ============================================
   UniTab - Main Entry Point
   ============================================ */

(function () {
  'use strict';

  /* --- Clock Module --- */
  const Clock = (() => {
    const clockEl = document.getElementById('clock');
    let minuteTimeoutId = null;
    let intervalId = null;

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
      if (shouldShowSeconds()) {
        const ss = now.getSeconds().toString().padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}:${ss}`;
      } else {
        clockEl.textContent = `${hh}:${mm}`;
      }
    }

    function clearTimers() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (minuteTimeoutId !== null) {
        clearTimeout(minuteTimeoutId);
        minuteTimeoutId = null;
      }
    }

    function start() {
      clearTimers();
      update();
      /* Tick at 1s when seconds are visible so the display is live.
         When only minutes are shown, align to the next minute boundary
         then tick every 30s to keep the display fresh without burning
         a tick every second. */
      if (shouldShowSeconds()) {
        intervalId = setInterval(update, 1000);
      } else {
        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        minuteTimeoutId = setTimeout(() => {
          update();
          intervalId = setInterval(update, 30000);
        }, msUntilNextMinute);
      }
    }

    /* Called by Settings.applyToDom when the user toggles the switch,
       so the cadence matches the new mode without waiting for the next tick. */
    function setShowSeconds() {
      start();
    }

    return { start, setShowSeconds };
  })();

  /* --- Initialize --- */
  function init() {
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

    /* 8. Handle system theme changes */
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const s = Settings.getState();
        if (s.bgImageData) {
          Background.load(s.bgImageData);
        }
      });
    }
  }

  /* --- Boot --- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
