/* ============================================
   UniTab - Browser Bookmarks
   ============================================ */

const Bookmarks = (() => {
  const bookmarksList = document.getElementById('bookmarks-list');

  async function load() {
    try {
      let barBookmarks = [];

      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        /* Chrome / Edge: get bookmarks bar children */
        const tree = await chrome.bookmarks.getTree();
        const barNode = findBookmarksBar(tree);
        if (barNode && barNode.children) {
          barBookmarks = barNode.children.filter(b => b.url);
        }
      } else if (typeof browser !== 'undefined' && browser.bookmarks) {
        /* Firefox */
        const tree = await browser.bookmarks.getTree();
        const barNode = findBookmarksBar(tree);
        if (barNode && barNode.children) {
          barBookmarks = barNode.children.filter(b => b.url);
        }
      }

      render(barBookmarks);
    } catch (err) {
      console.warn('UniTab: Could not load bookmarks:', err.message);
      bookmarksList.innerHTML = '';
    }
  }

  function findBookmarksBar(nodes) {
    for (const node of nodes) {
      /* The bookmarks bar node usually has id '2' or title 'Bookmarks Bar' / '书签栏' */
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

  function render(bookmarks) {
    if (!bookmarks || bookmarks.length === 0) {
      bookmarksList.innerHTML = '';
      return;
    }

    bookmarksList.innerHTML = bookmarks.map(bookmark => `
      <a class="bookmark-item"
         href="${escapeAttr(bookmark.url)}"
         title="${escapeAttr(bookmark.title)}"
         draggable="false">
        ${renderFavicon(bookmark)}
        <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
      </a>
    `).join('');

    /* Middle-click to open in new tab */
    bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = item.href;
      });
      item.addEventListener('auxclick', (e) => {
        /* Middle click - let browser handle, open in new tab */
        e.stopPropagation();
      });
    });
  }

  function renderFavicon(bookmark) {
    const url = bookmark.url || '';
    let domain = '';
    try {
      domain = new URL(url).origin;
    } catch {
      return `<div class="bookmark-favicon-placeholder">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </div>`;
    }

    /* Chrome favicon API */
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        const faviconUrl = 'chrome://favicon/' + url;
        return `<img class="bookmark-favicon" src="${escapeAttr(faviconUrl)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${escapeAttr(renderDefaultFavicon())}'">`;
      } catch {
        return renderDefaultFavicon();
      }
    }

    return renderDefaultFavicon();
  }

  function renderDefaultFavicon() {
    return `<div class="bookmark-favicon-placeholder">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
    </div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { load };
})();
