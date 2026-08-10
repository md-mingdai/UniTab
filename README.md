# UniTab

A minimalist, glassmorphism new tab page extension for all major browsers. Features a centered search box with smart suggestions, customizable backgrounds, and a clean frosted-glass interface.

## Features

- **Glassmorphism Design** - Frosted glass search box and UI panels with `backdrop-filter`
- **Multi-Engine Search** - Google, Bing, DuckDuckGo, and Baidu with live suggestions
- **Custom Background** - Upload an image or paste a URL, with adjustable Gaussian blur
- **Overlay Control** - Adjustable opacity and color overlay for readability
- **Dark Mode** - Automatically adapts to system theme preference
- **Minimalist** - Clock display, centered search, hidden settings panel
- **Cross-Browser** - Chrome, Edge, Firefox (all Manifest V3 compatible)
- **Accessibility** - Respects `prefers-reduced-motion` and `prefers-reduced-transparency`

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

## Usage

- **Search**: Type in the search box and press Enter or click the arrow button
- **Switch Engine**: Click any engine icon below the search box (Google, Bing, DuckDuckGo, Baidu)
- **Suggestions**: Start typing to see search suggestions; use arrow keys to navigate
- **Settings**: Click the gear icon (top-right) to open the settings panel
- **Background**: Upload an image or paste a URL in Settings > Background
- **Blur**: Adjust the background blur intensity (0-50px)
- **Overlay**: Darken the background for better text readability
- **Reset**: Click "Reset to Defaults" to clear all customizations

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `/` | Focus search box |
| `Enter` | Execute search |
| `Arrow Up/Down` | Navigate suggestions |
| `Escape` | Close suggestions or settings |

## Project Structure

```
UniTab/
├── manifest.json       # Extension manifest (V3)
├── newtab.html         # New tab page
├── css/
│   └── style.css       # All styles
├── js/
│   ├── main.js         # Entry point
│   ├── search.js       # Search engines & suggestions
│   ├── settings.js     # Settings panel logic
│   └── background.js   # Background image management
├── icons/              # SVG icons
└── README.md
```

## Design

Built with the glassmorphism aesthetic:
- `backdrop-filter: blur()` for authentic frosted glass
- Layered borders with inner highlights for edge refraction
- System font stack (no external dependencies)
- Dark mode and reduced-motion friendly
- Single accent color (slate-blue) for focus states

## License

MIT
