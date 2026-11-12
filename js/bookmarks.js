/* ============================================
   UniTab - Browser Bookmarks & Top Sites
   ============================================ */

const Bookmarks = (() => {
  const bookmarksList = document.getElementById('bookmarks-list');
  const bookmarksBar = document.getElementById('bookmarks-bar');
  const DEFAULT_MAX_ITEMS = 6;
  const MAX_MAX_ITEMS = 10;

  /* How many items the dock shows (设置 → 显示 → Dock 数量, 1–10). Read on every
     render so a slider change re-slices the list without a reload. */
  function maxItems() {
    try {
      const s = (typeof Settings !== 'undefined' && Settings.getState)
        ? Settings.getState()
        : null;
      const n = s ? parseInt(s.dockCount, 10) : NaN;
      if (Number.isFinite(n)) return Math.min(MAX_MAX_ITEMS, Math.max(1, n));
    } catch {}
    return DEFAULT_MAX_ITEMS;
  }

  /* The list shown last time (title + url, a few hundred bytes). It is painted straight
     away on the next new tab; the browser's answer then only touches the DOM if it
     differs. Without it the dock appeared only after two extension-API round trips. */
  const CACHE_KEY = 'unitab_dock';

  let loadPromise = null;
  let pendingLoad = false;
  let renderedKey = null; /* identity of the list currently in the DOM */

  /* One delegated handler instead of a listener per rendered item.
     Click handler — open in current tab. */
  bookmarksList.addEventListener('click', (e) => {
    const item = e.target.closest('.bookmark-item');
    if (!item) return;
    e.preventDefault();
    window.location.href = item.href;
  });

  /* Settings → Dock 数量 changed: paint the cached list at the new size right
     away, then ask the browser again (lowering the count only needs the cache,
     raising it may need items the cache never held). */
  function setMaxItems() {
    renderedKey = null;
    renderFromCache();
    loadPromise = null;
    load();
  }

  function setVisible(visible) {
    if (!bookmarksBar) return;
    bookmarksBar.hidden = !visible;
    if (visible && pendingLoad) {
      pendingLoad = false;
      load();
    }
  }

  /* --- Auto-hide (slide the dock down until the pointer nears the bottom) ---
     This is a positional slide with a springy easing, deliberately distinct
     from the settings gear's opacity fade. settings.js only switches it on
     when the dock itself is enabled; the <html data-dock-autohide> attribute
     (set before first paint in boot.js) drives the CSS. */
  const DOCK_HOT_ZONE_PX = 110;  /* bottom strip that summons the dock */
  const DOCK_HIDE_DELAY_MS = 300; /* grace period before it slides back down */
  let autoHide = false;
  let peekTimer = 0;

  function setAutoHide(on) {
    autoHide = !!on;
    if (!autoHide) {
      clearTimeout(peekTimer);
      bookmarksBar.classList.remove('dock-peeking');
    }
  }

  /* Touch screens have no hovering pointer to summon the dock with, so the
     auto-hide stays inert there (matches the settings-gear behaviour). */
  function hoverCapable() {
    return !window.matchMedia || !window.matchMedia('(hover: none)').matches;
  }

  document.addEventListener('mousemove', (e) => {
    if (!autoHide || bookmarksBar.hidden || !hoverCapable()) return;
    const inZone = e.clientY >= window.innerHeight - DOCK_HOT_ZONE_PX;
    if (inZone) {
      clearTimeout(peekTimer);
      peekTimer = 0;
      bookmarksBar.classList.add('dock-peeking');
    } else if (bookmarksBar.classList.contains('dock-peeking')) {
      if (peekTimer) return; /* already counting down */
      peekTimer = setTimeout(() => {
        peekTimer = 0;
        bookmarksBar.classList.remove('dock-peeking');
      }, DOCK_HIDE_DELAY_MS);
    }
  });

  function load() {
    /* Dock switched off: nothing to show, so do not ask the browser for the data until
       it is switched on. */
    if (bookmarksBar && bookmarksBar.hidden) {
      pendingLoad = true;
      return Promise.resolve();
    }
    if (!loadPromise) loadPromise = fetchAndRender();
    return loadPromise;
  }

  async function fetchAndRender() {
    renderFromCache();

    try {
      /* The two lookups do not depend on each other: run them side by side. */
      const [bookmarks, topSites] = await Promise.all([readBookmarksBar(), readTopSites()]);

      /* Combine: bookmarks first, then top sites to fill remaining slots */
      const combined = mergeUnique(bookmarks, topSites).slice(0, maxItems());
      render(combined);
      saveCache(combined);
    } catch (err) {
      console.warn('UniTab: Could not load bookmarks:', err.message);
      render([]);
    }
  }

  /* Fetch bookmarks bar */
  async function readBookmarksBar() {
    const api = (typeof chrome !== 'undefined' && chrome.bookmarks) ? chrome
      : (typeof browser !== 'undefined' && browser.bookmarks) ? browser
        : null;
    if (!api) return [];
    try {
      const tree = await api.bookmarks.getTree();
      const barNode = findBookmarksBar(tree);
      return barNode && barNode.children ? barNode.children.filter(b => b.url) : [];
    } catch (e) {
      console.warn('UniTab: bookmarks access failed:', e.message);
      return [];
    }
  }

  /* Fetch top sites (most visited) */
  async function readTopSites() {
    if (typeof chrome === 'undefined' || !chrome.topSites) return [];
    try {
      return await chrome.topSites.get();
    } catch (e) {
      console.warn('UniTab: topSites access failed:', e.message);
      return [];
    }
  }

  function renderFromCache() {
    try {
      const items = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (!Array.isArray(items)) return;
      const valid = items
        .filter((i) => i && typeof i.url === 'string' && i.url && typeof i.title === 'string')
        .slice(0, maxItems());
      if (valid.length) render(valid);
    } catch {
      /* missing or corrupt cache: wait for the real data */
    }
  }

  function saveCache(items) {
    try {
      const slim = JSON.stringify(items.map((i) => ({
        title: i.title || '',
        url: i.url,
        favIconUrl: i.favIconUrl || undefined, /* Firefox: real icon survives restarts */
      })));
      if (localStorage.getItem(CACHE_KEY) !== slim) localStorage.setItem(CACHE_KEY, slim);
    } catch {
      /* storage unavailable: the dock still works, it just is not pre-painted */
    }
  }

  function findBookmarksBar(nodes) {
    for (const node of nodes) {
      if (node.title === 'Bookmarks bar' || node.title === 'Bookmarks Bar'
        || node.title === '书签栏' || node.title === '书签'
        || node.id === '2' || node.id === 'toolbar_____') {
        return node;
      }
      if (node.children) {
        const found = findBookmarksBar(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  function mergeUnique(primary, secondary) {
    const seen = new Set();
    const result = [];
    const normalize = (url) => {
      try {
        const u = new URL(url);
        return (u.hostname + u.pathname).replace(/\/$/, '');
      } catch {
        return url;
      }
    };
    for (const item of [...primary, ...secondary]) {
      if (!item.url) continue;
      const key = normalize(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  function render(items) {
    const list = items || [];
    const key = JSON.stringify(list.map((i) => [i.title || '', i.url]));
    if (key === renderedKey) return; /* same list already on screen: leave the DOM alone */
    renderedKey = key;

    if (list.length === 0) {
      bookmarksList.innerHTML = '';
      bookmarksBar.classList.add('is-empty');
      return;
    }

    bookmarksList.innerHTML = list.map(item => {
      const safeTitle = escapeHtml(item.title || getDomain(item.url));
      const safeUrlAttr = escapeAttr(item.url);
      const safeTitleAttr = escapeAttr(item.title || getDomain(item.url));
      return `<a class="bookmark-item" href="${safeUrlAttr}" title="${safeTitleAttr}" draggable="false">${renderFavicon(item)}<span class="bookmark-title">${safeTitle}</span></a>`;
    }).join('');
    bookmarksBar.classList.remove('is-empty');
  }

  /* Real favicon via the official MV3 favicon resource:
     chrome-extension://<id>/_favicon/?pageUrl=<url>&size=<px> (declared by the
     "favicon" permission in manifest.json). Firefox has no such resource, but
     its bookmarks/topSites APIs hand back favIconUrl, which is preferred above.
     If neither yields an icon the <img> errors and the delegated error handler
     below swaps in the letter avatar encoded in its data-* attributes. */
  function renderFavicon(item) {
    const url = item.url;
    const domain = getDomain(url);
    const initial = (domain.charAt(0) || '?').toUpperCase();
    const hue = hashHue(domain);
    const bg = `hsl(${hue} 35% 28%)`;
    const fg = `hsl(${hue} 60% 78%)`;
    const iconUrl = item.favIconUrl || faviconResourceUrl(url);
    return `<img class="bookmark-favicon" src="${escapeAttr(iconUrl)}" draggable="false" data-fb-bg="${escapeAttr(bg)}" data-fb-fg="${escapeAttr(fg)}" data-fb-initial="${escapeHtml(initial)}">`;
  }

  /* Build the official favicon URL. Empty string when the runtime API is
     unavailable — the <img> then errors out into the letter avatar. */
  function faviconResourceUrl(pageUrl) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return '';
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', pageUrl);
      u.searchParams.set('size', '32');
      return u.toString();
    } catch {
      return '';
    }
  }

  /* favicon load failed (site has no icon / favicon resource could not serve
     it): swap the <img> for the letter avatar encoded in its data-* attributes.
     'error' does not bubble, so listen in the capture phase on the shared list. */
  bookmarksList.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('bookmark-favicon')) return;
    const div = document.createElement('div');
    div.className = 'bookmark-favicon-letter';
    div.style.background = img.dataset.fbBg || '';
    div.style.color = img.dataset.fbFg || '';
    div.textContent = img.dataset.fbInitial || '?';
    img.replaceWith(div);
  }, true);

  function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h) % 360;
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url || '';
    }
  }

  /* escapeHtml escapes & < > into HTML entities; sufficient for content and attribute values */
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  }

  /* Double-quote attribute escape – applied after escapeHtml */
  const QUOT_ENTITY = String.fromCharCode(38, 113, 117, 111, 116, 59); // "
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, QUOT_ENTITY);
  }

  return { load, setVisible, setAutoHide, setMaxItems };
})();
