/* ============================================
   UniTab - Background Image Management
   ============================================ */

const Background = (() => {
  const imageEl = document.getElementById('background-image');

  function load(source) {
    if (!source) {
      clear();
      return;
    }

    if (isBase64(source)) {
      applyImage(source);
    } else {
      /* Treat as URL */
      fetchAndApply(source);
    }
  }

  function isBase64(str) {
    return typeof str === 'string' && str.startsWith('data:image');
  }

  function applyImage(src) {
    imageEl.style.backgroundImage = `url(${src})`;
  }

  function fetchAndApply(url) {
    /* Try loading directly as background-image URL */
    /* This avoids CORS issues with fetching then converting */
    const img = new Image();
    img.onload = () => {
      applyImage(url);
    };
    img.onerror = () => {
      console.warn('UniTab: Could not load background image from URL:', url);
      clear();
    };
    img.src = url;
  }

  function clear() {
    imageEl.style.backgroundImage = '';
  }

  return { load, clear };
})();
