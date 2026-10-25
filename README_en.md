# UniTab

> A minimalist, glassmorphism new tab page for all major browsers. Centered search with live suggestions, customizable backgrounds and video wallpapers, and a clean frosted-glass interface.

- [![Author](https://img.shields.io/badge/Author-mingdai-green)](https://github.com/md-mingdai) [![Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/md-mingdai/UniTab) [![License](https://img.shields.io/badge/License-MIT-red)](./LICENSE) [![Version](https://img.shields.io/github/v/release/md-mingdai/UniTab)](https://github.com/md-mingdai/UniTab/releases)

[中文](./README.md)

## Features

- **Glassmorphism UI** — Search box, suggestions, bottom dock and settings panel all use `backdrop-filter`, with frosted / liquid glass styles and a 0–32px corner radius
- **Multi-engine search** — Google, Bing, Sogou and Baidu; live suggestions for Google / Bing / Baidu (Sogou has no public suggestion API)
- **Smart suggestions** — 150ms debounce, LRU cache, keyboard navigation (↑ / ↓ / Enter / Esc), Baidu JSONP and GBK support
- **Custom backgrounds** — Bing wallpaper of the day, uploaded image or image URL, solid color, or video; blur 0–50px, overlay 0–100% with 8 presets plus a custom color
- **Video wallpaper** — Sound, volume and loop options; when playback ends, show black, hold the last frame, or switch to a custom image / Bing wallpaper
- **Wallpaper previews** — Per-type low-resolution WebP previews and preview colors; startup fades in placeholder color → preview → full wallpaper
- **Bottom dock** — Browser bookmarks and top sites merged and deduplicated, up to 6 items, with letter-avatar favicons
- **Display & effects** — Clock seconds, dock toggle, and 5 cursor effects (confetti / rain / bubble / star / Kivotos)
- **Advanced tools** — Export the current wallpaper, maintain or clear previews, clear the Bing cache, and wipe all data behind a typed confirmation
- **Dark mode** — Follows the system theme and respects `prefers-reduced-motion` and `prefers-reduced-transparency`
- **Cross-browser** — Chrome, Edge, Arc, Brave and Firefox, all on Manifest V3

## Installation

### Chrome / Edge / Arc / Brave

1. Open `chrome://extensions` (or `edge://extensions` on Edge)
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `UniTab` folder
4. Open a new tab

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` in the `UniTab` folder
4. Open a new tab

> Temporary add-ons are removed when Firefox restarts. For persistent installation, sign or package the extension.

## Usage

- **Search** — Type a query and press Enter or click the arrow button; the default engine can be changed in Settings → Search and is persisted
- **Suggestions** — Start typing to see suggestions; ↑ / ↓ to navigate, Enter to select, Esc to dismiss
- **Background** — Settings → Background: choose Bing wallpaper of the day, upload an image, paste an image URL, use a solid color, or upload a video
- **Video wallpaper** — After choosing a local video, configure sound, volume, looping, and what happens when playback ends
- **Appearance** — Settings → Background for blur and overlay; Settings → Display for glass style and corner radius
- **Display & effects** — Settings → Display: clock seconds, dock, cursor effects and style
- **Dock** — Automatically merges the bookmarks bar with top sites (up to 6 items)
- **Advanced tools** — Settings → Advanced: export the current wallpaper, clear / regenerate previews, re-pick the preview color, clear the Bing cache
- **Reset** — The footer's "Restore defaults" only resets the active tab. To delete every setting, wallpaper, preview and cache entry, use Advanced → Danger Zone → Clear All Configuration and type the warning phrase by hand (pasting is blocked)

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search (when no input is focused) |
| `Enter` | Execute search / select highlighted suggestion |
| `↑ / ↓` | Navigate suggestions |
| `Esc` | Close suggestions or settings, blur input |

## Project Structure

```
UniTab/
├── manifest.json           # Extension manifest (Manifest V3)
├── background.js           # Service worker: CORS proxy for suggestions and the Bing API
├── newtab.html             # New tab page markup
├── css/
│   └── style.css           # All styles (frosted / liquid glass, dark mode, responsive)
├── js/
│   ├── boot.js             # Applies the saved look before first paint; warms the preview
│   ├── main.js             # Entry point, Clock module, init order
│   ├── search.js           # Search engines, cached suggestions, JSONP parsing
│   ├── settings.js         # Settings panel, controls, persistence and advanced tools
│   ├── bookmarks.js        # Bookmarks + top sites, letter-avatar favicons
│   ├── background.js       # Wallpaper / video / blur / overlay (IndexedDB)
│   ├── cursor.js           # Cursor effects (canvas and listeners created on demand)
│   └── effect-kivotos.js   # Kivotos effect (loaded only when selected)
├── lib/
│   └── anime.min.js        # Used only by the Kivotos effect, loaded on demand
├── fonts/
│   ├── JetBrainsMono-Medium.ttf  # Latin font (unicode-range limited)
│   └── OFL.txt
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── _locales/
│   └── zh_CN/messages.json # Extension name and description
├── README.md               # Chinese (default)
├── README_en.md            # English
├── LICENSE
└── .gitignore
```

This is a static extension with no build step or dependencies; reload it from the extensions page after editing.

## How It Works

### Search suggestions

The new tab page cannot call suggestion APIs directly because of CORS, so requests go through the service worker:

- The page sends `chrome.runtime.sendMessage({ type: 'fetch_jsonp', url })`; the worker fetches cross-origin with its `host_permissions`
- The worker returns raw bytes and decodes them explicitly using BOM / `Content-Type` / GBK heuristics (some browsers ignore the charset on cross-origin responses)
- The page strips the JSONP wrapper, then `quoteKeys()` quotes unquoted keys such as `{q:"x",p:false}` to produce valid JSON

### Backgrounds & storage

- Settings live in `localStorage` (`unitab_settings`, written in 300ms batches and immediately when the tab is hidden or closed)
- Image / video blobs, the Bing wallpaper cache and three preview slots live in IndexedDB (`unitab_bg` / `media`)
- Every wallpaper pick clears the old preview for that type, then silently generates a new WebP (first frame for video, longest side ≈ 512px)
- Preview colors are stored per wallpaper type, so switching types immediately uses the target type's own color
- A legacy base64 image left in `localStorage` is migrated to IndexedDB on the first visit
- All data belongs to the extension's own storage and is removed when the extension is uninstalled

### Advanced tools

"Export Current Wallpaper" reads the wallpaper into a Blob and hands it to the browser download manager via a temporary `<a download>`; when CORS or the CSP prevents reading the bytes, the browser downloads the URL directly. Uploaded files keep their original name, the extension is corrected from the Blob's real MIME type, and Bing wallpapers are named by date.

Preview maintenance only touches the `preview_*` slots and never deletes the active wallpaper. Clear All Configuration removes every `unitab_*` key from `localStorage` and all records in `unitab_bg`, then reloads the page.

## Design

- Frosted and liquid glass are switched via `[data-glass]` and CSS variables; inner highlights simulate edge refraction
- The clock uses `font-variant-numeric: tabular-nums` and ticks on second / minute boundaries
- Restrained 150–300ms motion, gated behind `prefers-reduced-motion`, with an opaque fallback for reduced transparency
- JetBrains Mono for Latin characters (`unicode-range` limited), system stack for CJK; slate-blue `#8b9dc3` accent

## Compatibility

| Feature | Chrome / Edge | Firefox |
| --- | --- | --- |
| Suggestions (Google / Bing / Baidu) | ✅ via service worker | ✅ via service worker |
| Bookmarks API | ✅ | ✅ (`browser.bookmarks`) |
| Top Sites API | ✅ | ⚠️ not available (bookmarks only) |
| Manifest V3 | ✅ | ✅ (109+) |

## License

[MIT](./LICENSE)
