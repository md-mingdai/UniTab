/* ============================================
   UniTab - Browser Bookmarks & Top Sites
   ============================================ */

const Bookmarks = (() => {
  const bookmarksList = document.getElementById('bookmarks-list');
  const bookmarksBar = document.getElementById('bookmarks-bar');
  const MAX_ITEMS = 6;

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

  function setVisible(visible) {
    if (!bookmarksBar) return;
    bookmarksBar.hidden = !visible;
    if (visible && pendingLoad) {
      pendingLoad = false;
      load();
    }
  }

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
      const combined = mergeUnique(bookmarks, topSites).slice(0, MAX_ITEMS);
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
        .slice(0, MAX_ITEMS);
      if (valid.length) render(valid);
    } catch {
      /* missing or corrupt cache: wait for the real data */
    }
  }

  function saveCache(items) {
    try {
      const slim = JSON.stringify(items.map((i) => ({ title: i.title || '', url: i.url })));
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
      return `<a class="bookmark-item" href="${safeUrlAttr}" title="${safeTitleAttr}" draggable="false">${renderFavicon(item.url)}<span class="bookmark-title">${safeTitle}</span></a>`;
    }).join('');
    bookmarksBar.classList.remove('is-empty');
  }

  /* Render favicon as a colored letter avatar. Works in every browser without
     any cross-origin requests or chrome:// / edge:// resource loads. */
  function renderFavicon(url) {
    const domain = getDomain(url);
    const initial = (domain.charAt(0) || '?').toUpperCase();
    /* Deterministic background color from domain hash */
    const hue = hashHue(domain);
    const bg = `hsl(${hue} 35% 28%)`;
    const fg = `hsl(${hue} 60% 78%)`;
    return `<div class="bookmark-favicon-letter" style="background:${bg};color:${fg}">${escapeHtml(initial)}</div>`;
  }

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

  return { load, setVisible };
})();
