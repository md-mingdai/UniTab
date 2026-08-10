/* ============================================
   UniTab - Main Entry Point
   ============================================ */

(function () {
  'use strict';

  /* --- Clock --- */
  const clockEl = document.getElementById('clock');

  function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}`;
  }

  function startClock() {
    updateClock();
    setInterval(updateClock, 30000);
  }

  /* --- Initialize --- */
  function init() {
    /* 1. Start clock */
    startClock();

    /* 2. Initialize search */
    Search.init({
      searchInput: document.getElementById('search-input'),
      searchButton: document.getElementById('search-button'),
      suggestionsDropdown: document.getElementById('suggestions-dropdown'),
      suggestionsList: document.getElementById('suggestions-list')
    });

    /* 3. Initialize settings (loads saved state and applies) */
    Settings.init();

    /* 4. Apply all settings to the DOM */
    Settings.applyAllToDom();

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
