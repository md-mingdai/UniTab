/* ============================================
   UniTab - Internationalization (i18n)
   ============================================ */

const I18n = (() => {
  /* --- Supported locales (files in lang/) --- */
  const SUPPORTED_LOCALES = ['zh_CN', 'zh_TW', 'en'];
  const DEFAULT_LOCALE = 'en';

  /* --- State --- */
  let currentLocale = DEFAULT_LOCALE;
  let messages = {};

  /* --- Init: resolve locale, load messages, apply to DOM --- */
  async function init() {
    const savedLocale = readSavedLocale();
    currentLocale = savedLocale || detectBrowserLocale() || DEFAULT_LOCALE;

    await loadMessages(currentLocale);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLocale.replace('_', '-');
    }
    applyTranslations();

    return messages;
  }

  function readSavedLocale() {
    try {
      const saved = localStorage.getItem('unitab_locale');
      if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function detectBrowserLocale() {
    if (typeof navigator === 'undefined') return null;
    const lang = navigator.language || navigator.userLanguage || '';
    if (!lang) return null;

    /* Normalize: zh-CN -> zh_CN, zh-TW -> zh_TW, en-US -> en */
    const normalized = lang.replace('-', '_');
    const base = normalized.split('_')[0];

    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
    if (base === 'zh') {
      const region = normalized.split('_')[1];
      if (region === 'TW' || region === 'HK' || region === 'MO') return 'zh_TW';
      return 'zh_CN';
    }
    if (base === 'en') return 'en';
    return null;
  }

  /* Flatten (defensive): accepts both flat {key:"value"} and Chrome-style
     {key:{message:"value"}} so a stray un-flattened file can never leak objects. */
  function flattenMessages(data) {
    const out = {};
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === 'object' && typeof val.message === 'string') {
        out[key] = val.message;
      } else if (typeof val === 'string') {
        out[key] = val;
      }
    }
    return out;
  }

  async function loadMessages(locale) {
    const chain = buildFallbackChain(locale);
    const combined = {};

    /* Load least-specific first so the most specific (primary) locale wins on
       merge: fallbacks only fill keys the primary does not define. */
    for (const loc of [...chain].reverse()) {
      try {
        const res = await fetch(chrome.runtime.getURL(`lang/${loc}.json`));
        if (res.ok) {
          const data = flattenMessages(await res.json());
          Object.assign(combined, data);
        }
      } catch (e) {
        console.warn(`[i18n] Failed to load ${loc}:`, e);
      }
    }

    messages = combined;
    currentLocale = locale;
    return messages;
  }

  function buildFallbackChain(locale) {
    const chain = [locale];
    if (locale === 'zh_TW') chain.push('zh_CN'); /* TW falls back to CN */
    if (locale !== DEFAULT_LOCALE) chain.push(DEFAULT_LOCALE);
    return chain;
  }

  /* --- Translation function ---
     Supports {1}-style and legacy $-style placeholders. */
  function t(key, placeholders = null) {
    let msg = messages[key];
    if (typeof msg !== 'string') {
      console.warn(`[i18n] Missing translation key: ${key}`);
      return key;
    }
    if (placeholders && placeholders.length) {
      msg = msg.replace(/\{(\d+)\}/g, (_, idx) => {
        const i = parseInt(idx, 10) - 1;
        return placeholders[i] != null ? String(placeholders[i]) : `{${idx}}`;
      });
      msg = msg.replace(/\$(\d+)/g, (_, idx) => {
        const i = parseInt(idx, 10) - 1;
        return placeholders[i] != null ? String(placeholders[i]) : `$${idx}`;
      });
    }
    return msg;
  }

  /* --- Apply translations to elements with data-i18n* attributes --- */
  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const msg = t(key);
      if (msg === key) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.type === 'text' || el.type === 'url' || el.type === 'search') {
          el.placeholder = msg;
        } else {
          el.value = msg;
        }
      } else {
        el.textContent = msg;
      }
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const msg = t(el.dataset.i18nPlaceholder);
      if (msg !== el.dataset.i18nPlaceholder) el.placeholder = msg;
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const msg = t(el.dataset.i18nAriaLabel);
      if (msg !== el.dataset.i18nAriaLabel) el.setAttribute('aria-label', msg);
    });

    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      const msg = t(el.dataset.i18nTitle);
      if (msg !== el.dataset.i18nTitle) el.setAttribute('title', msg);
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
