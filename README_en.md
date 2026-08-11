# UniTab

> A minimalist, glassmorphism new tab page extension for all major browsers. Centered search box with live suggestions, customizable backgrounds, and a clean frosted-glass interface.

- Author: [mingdai](https://github.com/md-mingdai)
- Repository: https://github.com/md-mingdai/UniTab
- License: [MIT](./LICENSE)
- Version: 0.3.6

[中文](./README.md)

## Features

- **Glassmorphism Design** — Frosted glass search box, suggestions dropdown, bookmarks bar, and settings panel, all built on `backdrop-filter`
- **Multi-Engine Search** — Google, Bing, Sogou (搜狗), and Baidu (百度), with live suggestions across all engines
- **Smart Suggestions** — Debounced fetch, keyboard navigation (↑ / ↓ / Enter / Esc), JSONP parsing for Baidu (GBK-aware)
- **Custom Background** — Upload an image or paste a URL, with adjustable Gaussian blur (0–50px)
- **Overlay Control** — Adjustable opacity and color overlay for readability
- **Bookmarks Bar** — Browser bookmarks + top sites, capped at 6, with letter-avatar favicons (no cross-origin favicon requests)
- **Display Settings** — Toggle seconds in the clock display (HH:MM / HH:MM:SS)
- **Dark Mode** — Automatically adapts to system theme preference
- **Minimalist** — Clock display, centered search, slide-in settings panel, no clutter
- **Cross-Browser** — Chrome, Edge, Arc, Brave, Firefox (all Manifest V3 compatible)
- **Accessibility** — Respects `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-color-scheme`

## Installation

### Chrome / Edge / Arc / Brave

1. Open `chrome://extensions` (or `edge://extensions` on Edge)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `UniTab` folder
4. Open a new tab

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file in the `UniTab` folder
4. Open a new tab

> Firefox temporary add-ons are removed when the browser restarts. For persistent installation, sign the extension or use a Firefox-specific build.

## Usage

- **Search** — Type in the search box and press Enter, or click the arrow button
- **Switch Engine** — Open Settings (gear icon, top-right) and pick a default engine. Switch persists across sessions
- **Suggestions** — Start typing to see live suggestions; use ↑ / ↓ to navigate, Enter to select, Esc to dismiss
- **Background** — Settings → Background: upload an image file or paste a URL
- **Blur** — Slider 0–50px; updates live
- **Overlay** — Slider 0–100% + color picker (9 presets + custom); updates live
- **Show Seconds** — Settings → Display: toggle between HH:MM and HH:MM:SS for the clock
- **Bookmarks** — Bottom glass bar; combines your bookmarks bar with top sites (most visited), up to 6 items
- **Reset** — Settings → "恢复默认设置" clears all customizations

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search box (when no input is focused) |
| `Enter` | Execute search / select highlighted suggestion |
| `Arrow Up / Down` | Navigate suggestions |
| `Escape` | Close suggestions, settings, or blur input |

## Project Structure

```
UniTab/
├── manifest.json         # Extension manifest (Manifest V3)
├── background.js         # Service worker — CORS proxy for suggestion APIs
├── newtab.html           # New tab page markup
├── css/
│   └── style.css         # All styles (glassmorphism, layout, dark mode)
├── js/
│   ├── main.js           # Entry point, Clock module, init order
│   ├── search.js         # Search engines, suggestions, JSONP parsing
│   ├── settings.js       # Settings panel, custom dropdowns & toggles
│   ├── bookmarks.js      # Bookmarks + top sites, letter-avatar favicons
│   └── background.js     # Background image / blur / overlay
├── fonts/
│   └── DingTalk_Sans.ttf # English/Latin font (unicode-range limited)
├── icons/
│   ├── icon-16.svg
│   ├── icon-48.svg
│   └── icon-128.svg
├── README.md             # Chinese (default)
├── README_en.md          # English
├── LICENSE
└── .gitignore
```

## How It Works

### Suggestion Fetching

Browser extensions can't directly call search suggestion APIs due to CORS. UniTab solves this with a background service worker that acts as a privileged fetch proxy:

- `chrome.runtime.sendMessage({ type: 'fetch_jsonp', url })` from the new tab page
- Service worker fetches with `host_permissions` privileges (bypasses CORS)
- Returns raw bytes; the SW decodes GBK / UTF-8 explicitly because some browsers ignore the charset parameter on `Content-Type` for cross-origin SW responses
- Page parses JSONP: strips the wrapper, then `quoteKeys()` converts JS literal syntax `{q:"x",p:false}` to valid JSON by quoting unquoted identifier keys

### Suggestions Dropdown

Positioned `absolute` below the search container so it overlays the page instead of pushing the centered search box on every keystroke. Glass parameters (background, blur, shadow, border, radius) match the search box exactly so both panels read as one continuous surface.

### Bookmarks & Top Sites

Reads `chrome.bookmarks.getTree()` (bookmarks bar) and `chrome.topSites.get()`, merges and deduplicates by `(hostname + pathname)`, caps at 6. Favicons are rendered as colored letter avatars — domain hashed to an HSL hue, first letter as the initial — eliminating `chrome://favicon/` errors and cross-origin requests.

### Background Storage

User-uploaded images are read via `FileReader.readAsDataURL()` and stored as base64 in `localStorage`. URLs are stored as-is and applied via CSS `background-image`. Both are scoped to the extension's own storage; uninstalling the extension clears them automatically.

## Design

Built with the glassmorphism aesthetic:

- `backdrop-filter: blur(24px) saturate(180%)` for authentic frosted glass
- Layered borders with inner highlights for edge refraction
- Tabular-nums clock for stable width when toggling seconds
- `font-variant-numeric: tabular-nums` keeps digits monospaced
- Restrained motion: 150–300ms cubic-bezier easing, all gated behind `prefers-reduced-motion: no-preference`
- Single accent color (slate-blue `#8b9dc3`) for focus states
- DingTalk Sans for Latin characters (`unicode-range` limited); system stack for CJK

## Compatibility Notes

| Feature | Chrome / Edge | Firefox |
| --- | --- | --- |
| Suggestion APIs | ✅ via service worker | ✅ via service worker |
| Bookmarks API | ✅ | ✅ (`browser.bookmarks`) |
| Top Sites API | ✅ | ⚠️ partial (Firefox doesn't expose `topSites`) |
| Manifest V3 | ✅ | ✅ (109+) |

Firefox falls back to bookmarks only when `topSites` isn't available.

## License

[MIT](./LICENSE)
