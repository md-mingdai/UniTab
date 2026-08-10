/* ============================================
   UniTab - Search Engine & Suggestions
   ============================================ */

const Search = (() => {
  /* --- Search Engine Definitions --- */
  const ENGINES = {
    google: {
      name: 'Google',
      searchUrl: 'https://www.google.com/search?q=',
      suggestUrl: 'https://suggestqueries.google.com/complete/search?client=chrome&q=',
      parser: (data) => (data && data[1]) ? data[1] : []
    },
    bing: {
      name: 'Bing',
      searchUrl: 'https://www.bing.com/search?q=',
      suggestUrl: 'https://api.bing.com/osjson.aspx?query=',
      parser: (data) => (data && data[1]) ? data[1] : []
    },
    sogou: {
      name: '搜狗',
      searchUrl: 'https://www.sogou.com/web?query=',
      suggestUrl: null, /* Sogou uses JSONP with dynamic callback */
      parser: null
    },
    baidu: {
      name: '百度',
      searchUrl: 'https://www.baidu.com/s?wd=',
      suggestUrl: null,
      parser: null
    }
  };

  /* --- State --- */
  let currentEngine = 'google';
  let activeIndex = -1;
  let suggestions = [];
  let debounceTimer = null;
  let abortController = null;

  /* --- DOM refs (set on init) --- */
  let searchInput;
  let searchButton;
  let suggestionsDropdown;
  let suggestionsList;

  function init(refs) {
    searchInput = refs.searchInput;
    searchButton = refs.searchButton;
    suggestionsDropdown = refs.suggestionsDropdown;
    suggestionsList = refs.suggestionsList;

    bindEvents();
    /* Load saved engine */
    const saved = localStorage.getItem('unitab_engine');
    if (saved && ENGINES[saved]) {
      setEngine(saved, false);
    }
  }

  function bindEvents() {
    searchInput.addEventListener('input', onInput);
    searchInput.addEventListener('keydown', onKeyDown);
    searchInput.addEventListener('focus', onFocus);
    searchButton.addEventListener('click', onSearch);

    /* Close suggestions on outside click */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-container')) {
        hideSuggestions();
      }
    });
  }

  /* --- Input handler --- */
  function onInput() {
    const query = searchInput.value.trim();
    if (query.length < 1) {
      hideSuggestions();
      return;
    }
    debounceFetch(query);
  }

  function onFocus() {
    const query = searchInput.value.trim();
    if (query.length >= 1) {
      showSuggestionsIfAvailable();
    }
  }

  function onKeyDown(e) {
    const isOpen = !suggestionsDropdown.hidden;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && searchInput.value.trim().length >= 1) {
        debounceFetch(searchInput.value.trim());
        return;
      }
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
      renderActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      renderActive();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        performSearch(suggestions[activeIndex]);
      } else {
        onSearch();
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
      searchInput.blur();
    }
  }

  function onSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchInput.focus();
      return;
    }
    performSearch(query);
  }

  /* --- Fetch suggestions --- */
  function debounceFetch(query) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(query), 150);
  }

  async function fetchSuggestions(query) {
    const engine = ENGINES[currentEngine];
    if (!engine.suggestUrl) {
      hideSuggestions();
      return;
    }

    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    try {
      const url = engine.suggestUrl + encodeURIComponent(query);
      const resp = await fetch(url, { signal: abortController.signal });
      if (!resp.ok) throw new Error('Suggestion fetch failed');

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        /* JSONP fallback */
        const match = text.match(/^[^(]*\((\[.*\])\)\s*;?\s*$/s);
        if (match) {
          data = JSON.parse(match[1]);
        } else {
          throw new Error('Unparseable suggestion response');
        }
      }

      suggestions = engine.parser(data) || [];
      activeIndex = -1;
      renderSuggestions();
    } catch (err) {
      if (err.name !== 'AbortError') {
        suggestions = [];
        hideSuggestions();
      }
    }
  }

  /* --- Render --- */
  function renderSuggestions() {
    if (suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    suggestionsList.innerHTML = suggestions
      .map((suggestion, i) => `
        <li class="suggestion-item" role="option" data-index="${i}">
          <svg class="suggestion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span class="suggestion-text">${escapeHtml(suggestion)}</span>
        </li>
      `).join('');

    suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        if (!isNaN(idx) && suggestions[idx]) {
          performSearch(suggestions[idx]);
        }
      });
    });

    suggestionsDropdown.hidden = false;
    activeIndex = -1;
  }

  function renderActive() {
    const items = suggestionsList.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
      if (i === activeIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });

    if (activeIndex >= 0 && suggestions[activeIndex]) {
      searchInput.value = suggestions[activeIndex];
    }
  }

  function hideSuggestions() {
    suggestionsDropdown.hidden = true;
    activeIndex = -1;
  }

  function showSuggestionsIfAvailable() {
    if (suggestions.length > 0) {
      suggestionsDropdown.hidden = false;
    }
  }

  /* --- Search execution --- */
  function performSearch(query) {
    const engine = ENGINES[currentEngine];
    const url = engine.searchUrl + encodeURIComponent(query);
    hideSuggestions();
    window.location.href = url;
  }

  /* --- Engine management --- */
  function setEngine(engineKey, save = true) {
    if (!ENGINES[engineKey]) return;
    currentEngine = engineKey;
    if (save) {
      localStorage.setItem('unitab_engine', engineKey);
    }
    hideSuggestions();
  }

  function getEngine() {
    return currentEngine;
  }

  /* --- Utilities --- */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* --- Public API --- */
  return { init, performSearch, setEngine, getEngine, ENGINES };
})();
