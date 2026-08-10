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
      suggestUrl: null, // 搜狗暂无公开 Suggestion API
      parser: null
    },
    baidu: {
      name: '百度',
      searchUrl: 'https://www.baidu.com/s?wd=',
      // Baidu returns JSONP text: window.baidu.sug({...});
      // The SW proxy returns the raw text, which we strip in processResponse().
      suggestUrl: 'https://suggestion.baidu.com/su?wd=',
      parser: (data) => {
        return (data && Array.isArray(data.s)) ? data.s : [];
      }
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

  /* --- Fetch suggestions ---
     All engines route through the background service worker for cross-origin
     fetches. The SW has privileged access via host_permissions that bypasses
     CORS for cross-origin hosts in the extension's manifest. This avoids both
     the CSP block on external <script> tags (which prevents JSONP injection)
     and the CORS block on direct fetch() from the new tab page. */
  let currentFetchToken = 0;

  function debounceFetch(query) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(query), 150);
  }

  function fetchSuggestions(query) {
    const engine = ENGINES[currentEngine];
    if (!engine.suggestUrl) {
      hideSuggestions();
      return;
    }

    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    const token = ++currentFetchToken;

    /* Try background SW proxy first — this is the only reliable way to bypass CORS */
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'fetch_jsonp', url: engine.suggestUrl + encodeURIComponent(query) },
        (response) => {
          if (token !== currentFetchToken) return; // stale
          if (signal.aborted) return;
          if (chrome.runtime.lastError || !response || !response.ok) {
            handleFetchError(response && response.error || 'SW fetch failed');
            return;
          }
          processResponse(response.text, engine);
        }
      );
      return;
    }

    /* Fallback: direct fetch (works for engines that DO send CORS headers,
       i.e. Google and Bing) */
    fetchDirect(engine.suggestUrl + encodeURIComponent(query), engine, token, signal);
  }

  async function fetchDirect(url, engine, token, signal) {
    try {
      const resp = await fetch(url, { signal });
      if (token !== currentFetchToken) return;
      if (!resp.ok) throw new Error('Suggestion fetch failed');
      const text = await resp.text();
      if (token !== currentFetchToken) return;
      processResponse(text, engine);
    } catch (err) {
      if (token !== currentFetchToken) return;
      if (err.name === 'AbortError') return;
      handleFetchError(err.message);
    }
  }

  function processResponse(text, engine) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      /* Strip JSONP wrapper – extract the first top-level (...) payload */
      const start = text.indexOf('(');
      const end = text.lastIndexOf(')');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          data = JSON.parse(text.slice(start + 1, end));
        } catch (e2) {
          handleFetchError('Unparseable JSONP response');
          return;
        }
      } else {
        handleFetchError('Unparseable response');
        return;
      }
    }
    suggestions = engine.parser(data) || [];
    activeIndex = -1;
    renderSuggestions();
  }

  function handleFetchError(msg) {
    suggestions = [];
    hideSuggestions();
    /* Avoid noisy console output for expected CORS cases */
    if (msg && msg.indexOf('CORS') === -1 && msg.indexOf('Failed to fetch') === -1) {
      console.warn('UniTab: suggestion fetch failed:', msg);
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
