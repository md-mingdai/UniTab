<div align="center">

<img src="icons/icon-128.png" width="128" alt="UniTab" />

# UniTab

A visually appealing, highly customizable new tab extension for Chromium browsers such as Chrome and Edge. It features a centered search bar with real-time suggestions, and supports custom backgrounds, video wallpapers, and mouse cursor effects.

[![Author](https://img.shields.io/badge/Author-mingdai-green)](https://github.com/md-mingdai) [![Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/md-mingdai/UniTab) [![License](https://img.shields.io/badge/License-MIT-red)](./LICENSE) [![Version](https://img.shields.io/github/v/release/md-mingdai/UniTab)](https://github.com/md-mingdai/UniTab/releases)

[中文](./README.md)

[Installation](#installation)·[Features](#features)·[Releases](https://github.com/md-mingdai/UniTab/releases/latest)

</div>

## Features

- **Glassmorphism UI** — Search box, suggestions, bottom dock and settings panel all use `backdrop-filter`, with frosted / liquid / matte glass styles and a 0–32px corner radius
- **Liquid glass** — Edges refract the wallpaper like the rim of a lens (SVG displacement maps), the middle is frosted and the highlight comes from the top left. Each pane measures what is behind it, picks dark or light glass, and solves for the least tint that keeps its text at the target contrast: as clear as legibility allows
- **Matte glass** — The earlier smoky-acrylic look, kept as its own option: heavy blur, fine grain and a denser tint. Plain CSS with no refraction engine, so it looks the same in every browser
- **Multi-engine search** — Google, Bing, Sogou and Baidu; live suggestions for Google / Bing / Baidu (Sogou has no public suggestion API)
- **Smart suggestions** — 150ms debounce, LRU cache, keyboard navigation (↑ / ↓ / Enter / Esc), Baidu JSONP and GBK support
- **Custom backgrounds** — Bing wallpaper of the day, uploaded image or image URL, solid color, or video; blur 0–50px, overlay 0–100% with 8 presets plus a custom color
- **Three image modes** — Single image / slideshow / time-scheduled. A slideshow can import multiple files or a whole folder, gives every image its own preview and theme color, rotates every 6 s – 1 h (or a custom interval), supports random order (no repeats within a round), offers fade / slow-zoom transitions, and switches instantly when you click a list entry. Scheduled wallpapers change automatically by time slot (e.g. 08:00–12:00), wrap across midnight, and rotate while the tab stays open
- **Video wallpaper** — Sound, volume and loop options; when playback ends, show black, hold the last frame, or switch to a custom image / Bing wallpaper
- **Wallpaper previews** — Per-type low-resolution WebP previews and preview colors; startup fades in placeholder color → preview → full wallpaper
- **Bottom dock** — Bookmarks bar and top sites merged and deduplicated, adjustable 1–10 items (6 by default), showing each site's real favicon (letter avatar as fallback); supports auto-hide (slides out when the pointer nears the bottom) and per-bookmark right-click actions (open in new tab / copy link)
- **Cross-tab sync** — Changing a setting in one tab applies live to every other open tab (language included); slideshow and scheduled-wallpaper list edits sync when you return to a tab
- **Settings search** — Filter the current tab's options by keyword from the box at the top of the panel; Esc clears it
- **Display & effects** — Clock (seconds, date, 12/24-hour), adjustable dock count, and 5 cursor effects (confetti / rain / bubble / star / Kivotos)
- **Advanced tools** — Export the current wallpaper, maintain or clear previews, clear the Bing cache, and wipe all data behind a typed confirmation
- **Dark mode** — Follows the system theme and respects `prefers-reduced-motion` and `prefers-reduced-transparency`
- **Cross-browser** — Chrome, Edge, Arc, Brave and other Chromium browsers, all on Manifest V3

## Installation

### Edge

UniTab is available on the [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/unitab/hhlkomjalcanmdafhghlpacfnndaabnf) store and can be installed directly.

### Chrome / Arc / Brave

1. Download the latest [UniTab Release](https://github.com/md-mingdai/UniTab/releases/latest) or the source code
2. Open `chrome://extensions` or go to the "Manage Extensions" page
3. Find and enable **Developer mode**
4. Drag the Release's `crx` file into the browser window, or click **Load unpacked** and select the `UniTab` folder
5. Open a new tab

## Usage

- **Search** — Type a query and press Enter or click the arrow button; the default engine can be changed in Settings → Search and is persisted
- **Suggestions** — Start typing to see suggestions; ↑ / ↓ to navigate, Enter to select, Esc to dismiss
- **Background** — Settings → Background: choose Bing wallpaper of the day, upload an image, paste an image URL, use a solid color, or upload a video
- **Image modes** — Custom images offer three modes: single image / slideshow / time-scheduled. Switching modes never clears the others' data
- **Slideshow** — Open "Slideshow list": add multiple files or a whole folder, remove entries individually, and click any entry to make it the wallpaper. Configure the rotation interval (6 s – 1 h, or a custom number of minutes), random order (a shuffle bag prevents repeats within a round), and the switch effect (fade / slow zoom). Oversized images or very large batches ask for confirmation before importing
- **Scheduled wallpapers** — In the "Scheduled wallpapers" list, add time slots and adjust their start times; the slot covering the current clock time is shown automatically. Each slot runs until the next one starts, wrapping across midnight
- **Video wallpaper** — After choosing a local video, configure sound, volume, looping, and what happens when playback ends
- **Appearance** — Settings → Background for blur and overlay; Settings → Display for glass style and corner radius
- **Display & effects** — Settings → Display: clock seconds/date/12-hour format, dock count, cursor effects and style
- **Dock** — Automatically merges the bookmarks bar with top sites (adjustable 1–10 items, 6 by default). With "auto-hide" on, the dock slides out only when the pointer nears the bottom of the screen. Right-click a bookmark to open it in a new tab or copy its link
- **Advanced tools** — Settings → Advanced: export the current wallpaper, clear / regenerate previews, re-pick the preview color, clear the Bing cache, and export / import a settings backup (JSON, wallpaper files excluded)
- **Settings search** — The box at the top of the settings panel filters the active tab's options by keyword; Esc clears it and closing the panel resets it
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
│   ├── style.css           # All styles (frosted and matte glass, dark mode, responsive)
│   └── liquid-glass.css    # Liquid glass material (only active with data-glass="liquid")
├── js/
│   ├── boot.js             # Applies the saved look before first paint (incl. the last glass tone result); warms the preview
│   ├── liquid-glass.js     # Liquid glass engine: refraction maps, wallpaper sampling, adaptive tone and contrast
│   ├── main.js             # Entry point, Clock module, init order
│   ├── search.js           # Search engines, cached suggestions, JSONP parsing
│   ├── settings.js         # Settings panel, controls, persistence and advanced tools
│   ├── bookmarks.js        # Bookmarks + top sites, real site icons (letter-avatar fallback), auto-hide
│   ├── background.js       # Wallpaper / video / blur / overlay (IndexedDB)
│   ├── cursor.js           # Cursor effects (canvas and listeners created on demand)
│   └── effect-kivotos.js   # Kivotos effect (loaded only when selected)
├── lang/
│   ├── languages.json      # Supported-language list (the only one; not the extension manifest)
│   ├── zh_CN.json          # Simplified Chinese translations
│   ├── zh_TW.json          # Traditional Chinese translations
│   └── en.json             # English translations
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

- Frosted, liquid and matte glass are switched via `[data-glass]`. Liquid glass is built by `js/liquid-glass.js`: every pane gets a displacement map (`feDisplacementMap`: refracting rim + frosted middle) and a rim-light image on top of `backdrop-filter`; the wallpaper is sampled into a coarse colour field, each pane picks dark or light glass from the colours actually behind it and solves for the tint that just reaches its target contrast (search 3.8:1, dock 4.5:1, settings 4.2:1). The result is written to `<style id="lg-tokens">` and cached, so the next open has it before first paint
- Matte glass (`data-glass="matte"`) keeps the earlier liquid look as plain CSS: a 24–32px blur, 160% saturation, a tint chosen from the wallpaper's brightness (`data-wallpaper-tone`), plus a fine `feTurbulence` grain and a gradient rim light. It runs no engine, so it does not rely on an SVG filter as `backdrop-filter`
- Glass panes are siblings, never nested (a nested `backdrop-filter` cannot see the wallpaper). "Increase contrast" raises the targets and adds a border; "reduce transparency" and forced-colors fall back to opaque panes
- The clock uses `font-variant-numeric: tabular-nums` and ticks on second / minute boundaries
- Restrained 150–300ms motion, gated behind `prefers-reduced-motion`, with an opaque fallback for reduced transparency
- JetBrains Mono for Latin characters (`unicode-range` limited), system stack for CJK; slate-blue `#8b9dc3` accent

## Compatibility

| Feature | Support |
| --- | --- |
| Suggestions (Google / Bing / Baidu) | ✅ via service worker |
| Bookmarks API | ✅ |
| Top Sites API | ✅ |
| Manifest V3 | ✅ |
| Liquid-glass edge refraction (SVG filter as `backdrop-filter`) | ✅ |

## License

[MIT](./LICENSE)
