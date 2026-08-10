/* ============================================
   UniTab - Browser Bookmarks & Top Sites
   ============================================ */

const Bookmarks = (() => {
  const bookmarksList = document.getElementById('bookmarks-list');
  const MAX_ITEMS = 24;

  async function load() {
    try {
      let bookmarks = [];
      let topSites = [];

      /* Fetch bookmarks bar */
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        try {
          const tree = await chrome.bookmarks.getTree();
          const barNode = findBookmarksBar(tree);
          if (barNode && barNode.children) {
            bookmarks = barNode.children.filter(b => b.url);
          }
        } catch (e) {
          console.warn('UniTab: bookmarks access failed:', e.message);
        }
      } else if (typeof browser !== 'undefined' && browser.bookmarks) {
        try {
          const tree = await browser.bookmarks.getTree();
          const barNode = findBookmarksBar(tree);
          if (barNode && barNode.children) {
            bookmarks = barNode.children.filter(b => b.url);
          }
        } catch (e) {
          console.warn('UniTab: bookmarks access failed:', e.message);
        }
      }

      /* Fetch top sites (most visited) */
      if (typeof chrome !== 'undefined' && chrome.topSites) {
        try {
          topSites = await chrome.topSites.get();
        } catch (e) {
          console.warn('UniTab: topSites access failed:', e.message);
        }
      }

      /* Combine: bookmarks first, then top sites to fill remaining slots */
      const combined = mergeUnique(bookmarks, topSites).slice(0, MAX_ITEMS);
      render(combined);
    } catch (err) {
      console.warn('UniTab: Could not load bookmarks:', err.message);
      bookmarksList.innerHTML = '';
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
    if (!items || items.length === 0) {
      bookmarksList.innerHTML = '';
      return;
    }

    bookmarksList.innerHTML = items.map(item => {
      const safeTitle = escapeHtml(item.title || getDomain(item.url));
      const safeUrlAttr = escapeAttr(item.url);
      const safeTitleAttr = escapeAttr(item.title || getDomain(item.url));
      return `<a class="bookmark-item" href="${safeUrlAttr}" title="${safeTitleAttr}" draggable="false">${renderFavicon(item.url)}<span class="bookmark-title">${safeTitle}</span></a>`;
    }).join('');

    /* Click handler — open in current tab */
    bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = item.href;
      });
    });
  }

  function renderFavicon(url) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const safeUrl = escapeAttr(url);
        return `<img class="bookmark-favicon" src="chrome://favicon/${safeUrl}" alt="" loading="lazy">`;
      } catch {
        return renderDefaultFavicon();
      }
    }
    return renderDefaultFavicon();
  }

  function renderDefaultFavicon() {
    return `<div class="bookmark-favicon-placeholder"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>`;
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /* escapeHtml escapes & < > into HTML entities; sufficient for content and attribute values
     since both contexts use double-quoted attributes with " replaced below */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* Double-quote attribute escape – applied after escapeHtml */
  const QUOT_ENTITY = String.fromCharCode(38, 113, 117, 111, 116, 59); // "
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, QUOT_ENTITY);
  }

  return { load };
})();
