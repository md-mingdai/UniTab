/* ============================================
   UniTab - Internationalization (i18n)
   ============================================ */

const I18n = (() => {
  /* --- Supported locales (populated from _locales directory at build/runtime) --- */
  const SUPPORTED_LOCALES = ['zh_CN', 'zh_TW', 'en'];
  const DEFAULT_LOCALE = 'en';

  /* --- State --- */
  let currentLocale = DEFAULT_LOCALE;
  let messages = {};
  let readyPromise = null;

  /* --- DOM --- */
  let languageSelect = null;

  /* --- Init: load locale messages and apply to DOM --- */
  async function init() {
    /* Detect browser language */
    const browserLocale = detectBrowserLocale();
    const savedLocale = localStorage.getItem('unitab_locale');
    currentLocale = savedLocale || browserLocale || DEFAULT_LOCALE;

    /* Load messages for current locale (with fallback chain) */
    await loadMessages(currentLocale);

    /* Apply translations to static HTML elements */
    applyTranslations();

    return messages;
  }

  function detectBrowserLocale() {
    if (typeof navigator === 'undefined') return null;
    const lang = navigator.language || navigator.userLanguage || '';
    if (!lang) return null;

    /* Normalize: zh-CN -> zh_CN, zh-TW -> zh_TW, en-US -> en */
    const normalized = lang.replace('-', '_');
    const base = normalized.split('_')[0];

    /* Exact match first */
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
    /* Fallback to base language */
    if (base === 'zh') {
      /* Prefer Traditional for HK/MO/TW, Simplified otherwise */
      const region = normalized.split('_')[1];
      if (region === 'TW' || region === 'HK' || region === 'MO') return 'zh_TW';
      return 'zh_CN';
    }
    if (base === 'en') return 'en';
    return null;
  }

  async function loadMessages(locale) {
    const chain = buildFallbackChain(locale);
    const combined = {};

    for (const loc of chain) {
      try {
        const res = await fetch(chrome.runtime.getURL(`lang/${loc}.json`));
        if (res.ok) {
          const data = await res.json();
          Object.assign(combined, data);
        }
      } catch (e) {
        /* Ignore missing locale files */
      }
    }

    /* Always ensure DEFAULT_LOCALE is at the end of chain */
    if (!chain.includes(DEFAULT_LOCALE)) {
      try {
        const res = await fetch(chrome.runtime.getURL(`lang/${DEFAULT_LOCALE}.json`));
        if (res.ok) {
          const data = await res.json();
          Object.assign(combined, data);
        }
      } catch (e) {
        /* Last resort */
      }
    }

    messages = combined;
    currentLocale = locale;
    return messages;
  }

  function buildFallbackChain(locale) {
    const chain = [locale];
    if (locale === 'zh_TW') chain.push('zh_CN'); /* TW falls back to CN */
    if (locale !== 'en') chain.push('en');
    return chain;
  }

  function flattenMessages(data) {
    const out = {};
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val.message === 'string') {
        out[key] = val.message;
      }
    }
    return out;
  }

  /* --- Translation function --- */
  function t(key, placeholders = null) {
    let msg = messages[key];
    if (!msg) {
      /* Development aid: missing key shows as key itself */
      console.warn(`[i18n] Missing translation key: ${key}`);
      return key;
    }
    if (placeholders) {
      msg = msg.replace(/\$(\d+)/g, (_, idx) => placeholders[parseInt(idx, 10) - 1] ?? `$${idx}`);
    }
    return msg;
  }

  /* --- Apply translations to elements with data-i18n attribute --- */
  function applyTranslations(root = document) {
    const elements = root.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.dataset.i18n;
      const msg = t(key);
      if (msg !== key) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.type === 'placeholder' || !el.type) {
            el.placeholder = msg;
          } else {
            el.value = msg;
          }
        } else if (el.hasAttribute('data-i18n-attr')) {
          const attr = el.dataset.i18nAttr;
          el.setAttribute(attr, msg);
        } else {
          el.textContent = msg;
        }
      }
    });

    /* Also handle data-i18n-aria-label for aria-label attributes */
    const ariaElements = root.querySelectorAll('[data-i18n-aria-label]');
    ariaElements.forEach(el => {
      const key = el.dataset.i18nAriaLabel;
      const msg = t(key);
      if (msg !== key) {
        el.setAttribute('aria-label', msg);
      }
    });

    /* data-i18n-title for title attribute */
    const titleElements = root.querySelectorAll('[data-i18n-title]');
    titleElements.forEach(el => {
      const key = el.dataset.i18nTitle;
      const msg = t(key);
      if (msg !== key) {
        el.setAttribute('title', msg);
      }
    });

    /* data-i18n-placeholder for placeholder attribute */
    const placeholderElements = root.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const msg = t(key);
      if (msg !== key) {
        el.placeholder = msg;
      }
    });
  }

  function getCurrentLocale() {
    return currentLocale;
  }

  function getMessages() {
    return { ...messages };
  }

  /* --- Public API --- */
  return {
    init,
    t,
    applyTranslations,
    detectBrowserLocale,
    loadMessages,
    getCurrentLocale,
    getMessages,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE
  };
})();