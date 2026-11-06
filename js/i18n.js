/* ============================================
   UniTab - Internationalization (i18n)
   ============================================ */

const I18n = (() => {
  /* --- Supported locales, parsed from lang/languages.json at init --- */
  let supportedLocales = [];
  let defaultLocale = null;
  const localeFiles = new Map(); /* locale code -> file name in lang/ */
  const localeNames = new Map(); /* locale code -> display name */
  const localeRegions = new Map(); /* locale code -> [region codes it is the default for] */

  /* --- State --- */
  let currentLocale = null;
  let messages = {};

  /* Read lang/languages.json to discover available languages.
     Falls back to an empty list; callers treat that as "nothing loaded". */
  async function loadConfig() {
    supportedLocales = [];
    localeFiles.clear();
    localeNames.clear();
    localeRegions.clear();
    defaultLocale = null;
    try {
      const res = await fetch(chrome.runtime.getURL('lang/languages.json'));
      if (!res.ok) {
        console.warn('[i18n] languages.json not reachable:', res.status);
        return;
      }
      const cfg = await res.json();
      const list = Array.isArray(cfg.languages) ? cfg.languages : [];
      for (const entry of list) {
        if (!entry || typeof entry.code !== 'string') continue;
        if (supportedLocales.includes(entry.code)) continue;
        supportedLocales.push(entry.code);
        localeFiles.set(entry.code, typeof entry.file === 'string' && entry.file
          ? entry.file
          : `${entry.code}.json`);
        if (typeof entry.name === 'string' && entry.name) {
          localeNames.set(entry.code, entry.name);
        }
        if (Array.isArray(entry.regions)) {
          const regions = entry.regions.filter((r) => typeof r === 'string' && r);
          if (regions.length) localeRegions.set(entry.code, regions);
        }
      }
      if (typeof cfg.default === 'string' && supportedLocales.includes(cfg.default)) {
        defaultLocale = cfg.default;
      } else {
        defaultLocale = supportedLocales[0] || null;
      }
    } catch (e) {
      console.warn('[i18n] Failed to load languages.json:', e);
    }
  }

  /* --- Init: resolve locale, load messages, apply to DOM --- */
  async function init() {
    await loadConfig();

    const savedLocale = readSavedLocale();
    currentLocale = savedLocale || detectBrowserLocale() || defaultLocale;

    if (currentLocale) {
      await loadMessages(currentLocale);
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = currentLocale.replace('_', '-');
      }
    }
    applyTranslations();

    return messages;
  }

  function readSavedLocale() {
    try {
      const saved = localStorage.getItem('unitab_locale');
      if (saved && supportedLocales.includes(saved)) return saved;
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

    if (supportedLocales.includes(normalized)) return normalized;

    /* A region explicitly claimed by a locale wins over a generic base match,
       so zh-HK / zh-MO resolve to zh_TW rather than the first zh_* locale. */
    const region = normalized.split('_')[1];
    if (region) {
      const regionMatch = [...localeRegions.entries()]
        .find(([, regions]) => regions.includes(region));
      if (regionMatch) return regionMatch[0];
    }

    /* Otherwise match on base language when the exact tag is not offered (en-GB -> en). */
    const baseMatch = supportedLocales.find((loc) => loc.split('_')[0] === base);
    if (baseMatch) return baseMatch;
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
      const file = localeFiles.get(loc) || `${loc}.json`;
      try {
        const res = await fetch(chrome.runtime.getURL(`lang/${file}`));
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
    /* Fall back to a sibling locale sharing the same base language
       (e.g. zh_TW -> zh_CN) when one exists and differs from the locale. */
    const base = locale.split('_')[0];
    const baseSibling = supportedLocales.find(
      (loc) => loc !== locale && loc.split('_')[0] === base
    );
    if (baseSibling && !chain.includes(baseSibling)) chain.push(baseSibling);
    /* Always end on the configured default as a last resort. */
    if (defaultLocale && !chain.includes(defaultLocale)) chain.push(defaultLocale);
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

  /* Live views so callers always see the values parsed from languages.json. */
  function getSupportedLocales() {
    return [...supportedLocales];
  }

  /* [{ code, name }] for building language pickers; name falls back to code. */
  function getAvailableLanguages() {
    return supportedLocales.map((code) => ({ code, name: localeNames.get(code) || code }));
  }

  function getDefaultLocale() {
    return defaultLocale;
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
    getSupportedLocales,
    getAvailableLanguages,
    getDefaultLocale
  };
})();
