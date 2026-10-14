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
  let hideTimer = 0;
  let lastFetchAt = -Infinity;
  let lastWorkerContact = 0;

  const DEBOUNCE_MS = 150;
  const CACHE_MAX = 60;
  /* "engine\0query" -> string[]; least recently used first. Lives as long as the page. */
  const suggestionCache = new Map();

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
    warmUpWorker();
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

    /* One delegated handler for every row: the list is rebuilt on each response, so
       per-row listeners were created (and thrown away) with every keystroke. */
    suggestionsList.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      if (!isNaN(idx) && suggestions[idx]) {
        performSearch(suggestions[idx]);
      }
    });

    /* Take the dropdown out of the layout once its close transition has played. */
    suggestionsDropdown.addEventListener('transitionend', (e) => {
      if (e.target === suggestionsDropdown) finishHide();
    });

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
      /* Nothing left to suggest: drop the pending / in-flight request as well, or its
         answer would pop the dropdown open under an empty box. */
      cancelPending();
      hideSuggestions();
      return;
    }
    warmUpWorker();
    debounceFetch(query);
  }

  function cancelPending() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    currentFetchToken++;
    if (abortController) abortController.abort();
  }

  /* A MV3 service worker is shut down after ~30 s idle and needs ~150 ms to start
     again, which used to be added to the first suggestion request. A no-op message
     wakes it ahead of time: when the page opens, and on the first key after a pause. */
  function warmUpWorker() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    const now = Date.now();
    if (now - lastWorkerContact < 20000) return;
    lastWorkerContact = now;
    try {
      chrome.runtime.sendMessage({ type: 'ping' }, () => { void chrome.runtime.lastError; });
    } catch {
      /* extension context invalidated (extension reloaded): nothing to warm */
    }
  }

  function onFocus() {
    const query = searchInput.value.trim();
    if (query.length >= 1) {
      showSuggestionsIfAvailable();
    }
  }

  function onKeyDown(e) {
    /* Keys that drive an input method (candidate selection, Enter that commits the
       composition) are not ours: Enter used to start a search for the raw letters. */
    if (e.isComposing || e.keyCode === 229) return;
    const isOpen = suggestionsDropdown.classList.contains('is-open');

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
    debounceTimer = null;
    /* Leading edge: the first key after a pause goes out at once instead of waiting
       DEBOUNCE_MS; keys typed in quick succession are coalesced into one trailing call. */
    if (performance.now() - lastFetchAt >= DEBOUNCE_MS) {
      fetchSuggestions(query);
      return;
    }
    debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
  }

  /* --- Suggestion cache (LRU) --- */
  function cacheGet(key) {
    const hit = suggestionCache.get(key);
    if (hit) {
      suggestionCache.delete(key);
      suggestionCache.set(key, hit);
    }
    return hit;
  }

  function cacheSet(key, list) {
    suggestionCache.set(key, list);
    if (suggestionCache.size > CACHE_MAX) {
      suggestionCache.delete(suggestionCache.keys().next().value);
    }
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

    /* A query seen before (typed again, or reached by backspacing): answer from memory. */
    const cacheKey = currentEngine + '\0' + query;
    const cached = cacheGet(cacheKey);
    if (cached) {
      applySuggestions(cached);
      return;
    }
    lastFetchAt = performance.now();

    /* Try background SW proxy first — this is the only reliable way to bypass CORS */
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      lastWorkerContact = Date.now();
      chrome.runtime.sendMessage(
        { type: 'fetch_jsonp', url: engine.suggestUrl + encodeURIComponent(query) },
        (response) => {
          if (token !== currentFetchToken) return; // stale
          if (signal.aborted) return;
          if (chrome.runtime.lastError || !response || !response.ok) {
            handleFetchError(response && response.error || 'SW fetch failed');
            return;
          }
          processResponse(response.text, engine, cacheKey);
        }
      );
      return;
    }

    /* Fallback: direct fetch (works for engines that DO send CORS headers,
       i.e. Google and Bing) */
    fetchDirect(engine.suggestUrl + encodeURIComponent(query), engine, token, signal, cacheKey);
  }

  async function fetchDirect(url, engine, token, signal, cacheKey) {
    try {
      const resp = await fetch(url, { signal });
      if (token !== currentFetchToken) return;
      if (!resp.ok) throw new Error('Suggestion fetch failed');
      const text = await resp.text();
      if (token !== currentFetchToken) return;
      processResponse(text, engine, cacheKey);
    } catch (err) {
      if (token !== currentFetchToken) return;
      if (err.name === 'AbortError') return;
      handleFetchError(err.message);
    }
  }

  function processResponse(text, engine, cacheKey) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e1) {
      /* Baidu returns JS object literal syntax with unquoted keys, e.g.:
            window.baidu.sug({q:"x",p:false,s:["a","b"]});
         JSON.parse requires quoted keys. We strip the wrapper, then quote
         any unquoted identifier keys to make it valid JSON. */
      const callMatch = text.match(/^[^(]*\(/);
      const start = callMatch ? text.indexOf('(', callMatch.index) : text.indexOf('(');
      let end = -1;
      if (start !== -1) {
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          const ch = text.charCodeAt(i);
          if (ch === 40) depth++;        // (
          else if (ch === 41) {         // )
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
      }
      if (start === -1 || end === -1 || end <= start) {
        console.warn('UniTab: No JSONP wrapper. text[0..200]=', text.slice(0, 200));
        handleFetchError('Unparseable response');
        return;
      }
      const payload = text.slice(start + 1, end);
      try {
        data = JSON.parse(quoteKeys(payload));
      } catch (e2) {
        console.warn('UniTab: JSONP parse failed. payload[0..200]=', payload.slice(0, 200), 'err:', e2.message);
        handleFetchError('Unparseable JSONP response');
        return;
      }
    }
    const list = engine.parser(data) || [];
    if (cacheKey) cacheSet(cacheKey, list);
    applySuggestions(list);
  }

  function applySuggestions(list) {
    suggestions = list;
    activeIndex = -1;
    renderSuggestions();
  }

  /* Quote unquoted object keys so JS object literal becomes valid JSON.
     Matches an identifier followed by a colon that is NOT inside a string. */
  function quoteKeys(input) {
    const out = [];
    let i = 0;
    let inString = false;
    let quote = '';
    let depth = 0;
    while (i < input.length) {
      const ch = input[i];
      if (inString) {
        out.push(ch);
        if (ch === '\\' && i + 1 < input.length) {
          out.push(input[i + 1]);
          i += 2;
          continue;
        }
        if (ch === quote) inString = false;
        i++;
        continue;
      }
      if (ch === '"' || ch === '\'') {
        inString = true;
        quote = ch;
        out.push(ch);
        i++;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      /* Detect identifier followed by colon — only at depth that allows object keys */
      if (/[A-Za-z_$]/.test(ch) && (i === 0 || /[^A-Za-z0-9_$]/.test(input[i - 1]))) {
        /* Scan identifier */
        let j = i;
        while (j < input.length && /[A-Za-z0-9_$]/.test(input[j])) j++;
        /* Skip whitespace */
        let k = j;
        while (k < input.length && /\s/.test(input[k])) k++;
        if (k < input.length && input[k] === ':' && depth > 0) {
          out.push('"' + input.slice(i, j) + '"');
          i = j;
          continue;
        }
      }
      out.push(ch);
      i++;
    }
    return out.join('');
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

    /* Toggle via class so the slide/fade transition can play.
       Set hidden=false first so display:block takes effect; then add
       .is-open on the next frame to trigger the transition. */
    clearTimeout(hideTimer);
    suggestionsDropdown.hidden = false;
    requestAnimationFrame(() => {
      suggestionsDropdown.classList.add('is-open');
    });
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
    /* Defensive guard: hideSuggestions() is called from a few places
       (setEngine, document click handler, etc.) and historically fired
       before Search.init() had bound its DOM refs. Bail out if refs
       aren't ready rather than throwing. */
    if (!suggestionsDropdown) return;
    suggestionsDropdown.classList.remove('is-open');
    activeIndex = -1;
    if (suggestionsDropdown.hidden) return; /* already out of the layout */
    /* The transitionend listener bound in bindEvents() hides it once the close
       transition has played. A listener used to be added here on every call (and only
       removed if a transition actually ran). The timer covers "no transition": reduced
       motion, or a close that interrupts the open one. */
    clearTimeout(hideTimer);
    hideTimer = setTimeout(finishHide, 400);
  }

  /* After the close transition: fully hide, so it is out of the layout / a11y tree. */
  function finishHide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    if (suggestionsDropdown && !suggestionsDropdown.classList.contains('is-open')) {
      suggestionsDropdown.hidden = true;
    }
  }

  function showSuggestionsIfAvailable() {
    if (suggestions.length > 0 && !suggestionsDropdown.classList.contains('is-open')) {
      clearTimeout(hideTimer);
      suggestionsDropdown.hidden = false;
      requestAnimationFrame(() => {
        suggestionsDropdown.classList.add('is-open');
      });
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
    cancelPending();
    hideSuggestions();
  }

  function getEngine() {
    return currentEngine;
  }

  /* --- Utilities --- */
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  }

  /* --- Public API --- */
  return { init, performSearch, setEngine, getEngine, ENGINES };
})();
