# UniTab

> 一款极简、毛玻璃风格的新标签页扩展，兼容主流浏览器。居中搜索框带实时建议，支持自定义背景、视频壁纸与鼠标特效。

- [![Author](https://img.shields.io/badge/Author-mingdai-green)](https://github.com/md-mingdai) [![Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/md-mingdai/UniTab) [![License](https://img.shields.io/badge/License-MIT-red)](./LICENSE) [![Version](https://img.shields.io/github/v/release/md-mingdai/UniTab)](https://github.com/md-mingdai/UniTab/releases)

[English](./README_en.md)

## 特性

- **毛玻璃界面** — 搜索框、建议列表、底部 Dock 与设置面板统一使用 `backdrop-filter`，提供「毛玻璃 / 液态玻璃」两种风格和 0–32px 圆角
- **多引擎搜索** — Google、Bing、搜狗、百度；Google / Bing / 百度支持实时建议（搜狗暂无公开建议 API）
- **智能建议** — 150ms 防抖、LRU 缓存、键盘导航（↑ / ↓ / Enter / Esc），兼容百度 JSONP 与 GBK 编码
- **自定义背景** — 必应每日壁纸、上传图片或粘贴链接、纯色、视频；模糊 0–50px，蒙版 0–100% 且支持 8 种预设色与自定义颜色
- **视频壁纸** — 支持声音、音量与循环；播放结束可黑屏、停在最后一帧、切回自定义图片或必应壁纸
- **壁纸预览** — 按类型缓存低分辨率 WebP 预览与预览色，启动时按「占位色 → 预览 → 完整壁纸」依次淡入
- **底部 Dock** — 书签栏与常访问站点去重合并，最多展示 6 个，使用字母头像 favicon
- **显示与特效** — 时钟秒数、Dock 开关、5 种鼠标特效（彩纸 / 落雨 / 气泡 / 星光 / 基沃托斯）
- **高级工具** — 导出当前壁纸、维护或清空预览、清除必应缓存，以及手动输入警告语清空全部配置
- **深色模式** — 自动跟随系统主题，并尊重 `prefers-reduced-motion`、`prefers-reduced-transparency`
- **跨浏览器** — Chrome、Edge、Arc、Brave、Firefox，均基于 Manifest V3

## 安装

### Chrome / Edge / Arc / Brave

1. 打开 `chrome://extensions`（Edge 用 `edge://extensions`）
2. 开启右上角的**开发者模式**
3. 点击**加载已解压的扩展程序**，选择 `UniTab` 文件夹
4. 打开新标签页即可看到效果

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击**临时载入附加组件**
3. 选择 `UniTab` 文件夹内的 `manifest.json`
4. 打开新标签页即可看到效果

> Firefox 的临时扩展在浏览器重启后会失效。如需长期使用，需自行签名或打包。

## 使用说明

- **搜索** — 输入关键词后按 Enter 或点击右侧箭头；可在设置 → 搜索中切换默认引擎，选择会持久保存
- **搜索建议** — 输入即触发建议；↑ / ↓ 切换、Enter 选中、Esc 关闭
- **背景** — 设置 → 背景：选择必应每日壁纸、上传图片、粘贴图片链接、纯色或视频壁纸
- **视频壁纸** — 选择本地视频后，可设置声音、音量、循环，以及播放结束后的行为
- **外观** — 设置 → 背景可调模糊与蒙版；设置 → 显示可切换玻璃风格、调整组件圆角
- **显示与特效** — 设置 → 显示：时钟秒数、Dock 栏、鼠标特效及样式
- **Dock** — 自动合并浏览器书签栏与常访问站点（最多 6 个）
- **高级工具** — 设置 → 高级：导出当前壁纸、清空 / 重新生成预览、重新拾取预览色、清除必应缓存
- **恢复默认** — 底部的「恢复默认设置」只重置当前选项卡；要删除全部设置、壁纸、预览和缓存，请使用 高级 → 危险区域 → 清空全部配置，并手动输入警告文字（禁止粘贴）

## 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `/` | 聚焦搜索框（当前无输入元素聚焦时） |
| `Enter` | 执行搜索 / 选中当前高亮的建议项 |
| `↑ / ↓` | 在建议列表中上下移动 |
| `Esc` | 关闭建议、关闭设置面板、取消输入焦点 |

## 项目结构

```
UniTab/
├── manifest.json           # 扩展清单（Manifest V3）
├── background.js           # Service Worker：搜索建议与必应 API 的跨域代理
├── newtab.html             # 新标签页结构
├── css/
│   └── style.css           # 全部样式（毛玻璃 / 液态玻璃、深色模式、响应式）
├── js/
│   ├── boot.js             # 首帧前应用已保存的外观，并预热壁纸预览
│   ├── main.js             # 入口、Clock 模块、初始化顺序
│   ├── search.js           # 搜索引擎、建议请求与缓存、JSONP 解析
│   ├── settings.js         # 设置面板、全部控件、持久化与高级工具
│   ├── bookmarks.js        # 书签 + 常访问站点、字母头像 favicon
│   ├── background.js       # 壁纸 / 视频 / 模糊 / 蒙版管理（IndexedDB）
│   ├── cursor.js           # 鼠标特效（画布与监听器按需创建）
│   └── effect-kivotos.js   # 基沃托斯特效（选中该样式时才加载）
├── lib/
│   └── anime.min.js        # 仅基沃托斯特效使用，按需加载
├── fonts/
│   ├── JetBrainsMono-Medium.ttf  # 拉丁字符字体（unicode-range 限定）
│   └── OFL.txt
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── _locales/
│   └── zh_CN/messages.json # 扩展名称与描述
├── README.md               # 中文（默认）
├── README_en.md            # 英文
├── LICENSE
└── .gitignore
```

项目为纯静态扩展，无需构建或安装依赖；修改代码后在扩展管理页重新加载即可。

## 实现要点

### 搜索建议

新标签页受 CORS 限制，无法直接请求建议 API，因此统一交给 Service Worker 代理：

- 页面发送 `chrome.runtime.sendMessage({ type: 'fetch_jsonp', url })`，SW 利用 `host_permissions` 跨域请求
- SW 返回原始字节，并显式按 BOM / `Content-Type` / GBK 启发式解码（部分浏览器的跨域响应会忽略 charset）
- 页面剥离 JSONP 外层，再用 `quoteKeys()` 把 `{q:"x",p:false}` 这类 JS 字面量转成合法 JSON

### 背景与存储

- 设置项存于 `localStorage`（`unitab_settings`，300ms 合并写入，标签页隐藏或关闭时立即落盘）
- 图片、视频 Blob、必应壁纸缓存和三类预览存于 IndexedDB（`unitab_bg` / `media`）
- 每次选择壁纸都会清空对应类型的旧预览，再静默生成新的 WebP（视频取首帧，最长边约 512px）
- 预览色按壁纸类型分别保存，切换类型时立即换用目标类型自己的颜色，不残留上一个类型的颜色
- 旧版本留在 `localStorage` 中的 base64 图片会在首次打开时自动迁移到 IndexedDB
- 以上数据均属于扩展自有存储，卸载扩展时自动清除

### 高级工具

「导出当前壁纸」优先把壁纸读成 Blob，通过临时 `<a download>` 交给浏览器下载管理器；跨域或 CSP 不允许读取字节时，退回让浏览器直接下载 URL。文件名优先使用上传时的原始文件名，扩展名按 Blob 的真实 MIME 修正，必应壁纸按日期命名。

预览维护只操作 `preview_*` 槽位，不会删除当前壁纸。清空全部配置会删除 `localStorage` 中以 `unitab_` 开头的键和 IndexedDB 中的全部数据，然后重新加载页面。

## 设计理念

- 通过 `[data-glass]` 与 CSS 变量切换毛玻璃 / 液态玻璃，边框内高光模拟玻璃边缘折射
- 时钟使用 `font-variant-numeric: tabular-nums`，切换秒数时不抖动，并按秒 / 分边界对齐刷新
- 动效克制（150–300ms），全部受 `prefers-reduced-motion` 守护；降低透明度时提供不透明回退
- 拉丁字符使用 JetBrains Mono（`unicode-range` 限定），中文走系统字体栈；强调色为板岩蓝 `#8b9dc3`

## 兼容性

| 特性 | Chrome / Edge | Firefox |
| --- | --- | --- |
| 搜索建议（Google / Bing / 百度） | ✅ 经 Service Worker 代理 | ✅ 经 Service Worker 代理 |
| 书签 API | ✅ | ✅（`browser.bookmarks`） |
| 常访问站点 API | ✅ | ⚠️ 不支持（自动仅显示书签） |
| Manifest V3 | ✅ | ✅（109+） |

## 许可证

[MIT](./LICENSE)
