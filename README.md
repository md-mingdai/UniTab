# UniTab

> 一款极简、毛玻璃风格的新标签页美化扩展，兼容主流浏览器。居中的搜索框带实时建议，可自定义背景，整体采用清爽的毛玻璃界面。

- [![Author](https://img.shields.io/badge/Author-mingdai-green)](https://github.com/md-mingdai) [![Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/md-mingdai/UniTab) [![License](https://img.shields.io/badge/License-MIT-red)](./LICENSE) [![Version](https://img.shields.io/github/v/release/md-mingdai/UniTab)](https://github.com/md-mingdai/UniTab/releases)

[English](./README_en.md)

## 特性

- **毛玻璃设计** — 搜索框、搜索建议、底部书签栏、设置面板，全部基于 `backdrop-filter` 实现
- **多引擎搜索** — Google、Bing、搜狗、百度，四大引擎均支持实时搜索建议
- **智能建议** — 防抖请求、键盘导航（↑ / ↓ / Enter / Esc）、百度 JSONP 解析（兼容 GBK 编码）
- **自定义背景** — 支持上传本地图片或粘贴图片链接，可调高斯模糊（0–50px）
- **高级工具** — 一键导出当前必应 / 自定义图片 / 视频壁纸，维护预览缓存与预览色，清理必应缓存，并可输入警告文字后清空全部配置
- **蒙版控制** — 可调节蒙版不透明度（0–100%）与颜色（9 种预设 + 自定义）
- **底部书签栏** — 浏览器书签 + 常访问站点合并去重，最多展示 6 个，字母头像 favicon（无需跨域请求）
- **显示设置** — 时钟可切换显示秒（HH:MM / HH:MM:SS）
- **深色模式** — 自动跟随系统主题切换
- **极简风格** — 顶部时钟、居中搜索、侧滑设置面板，无冗余元素
- **跨浏览器** — Chrome、Edge、Arc、Brave、Firefox，全部基于 Manifest V3
- **无障碍友好** — 尊重 `prefers-reduced-motion`、`prefers-reduced-transparency` 与 `prefers-color-scheme`

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

- **搜索** — 在搜索框输入关键词，按回车或点击右侧箭头按钮执行搜索
- **切换默认引擎** — 点击右上角齿轮打开设置 → 搜索 → 默认搜索引擎；选择会持久保存
- **搜索建议** — 输入即触发建议；↑ / ↓ 切换、Enter 选中、Esc 关闭
- **设置背景** — 设置 → 背景：上传图片或粘贴图片链接
- **背景模糊** — 0–50px 滑块，实时生效
- **蒙版** — 0–100% 不透明度滑块 + 颜色选择器，实时生效
- **显示秒** — 设置 → 显示 → 显示秒 开关
- **底部书签栏** — 自动合并浏览器书签栏与常访问站点（最多 6 个）
- **导出当前壁纸** — 设置 → 高级 → 导出当前壁纸；必应、自定义图片、视频壁纸都会交给浏览器下载
- **预览维护** — 设置 → 高级：清空预览缓冲区、重新生成当前预览、重新拾取预览色
- **清理缓存** — 设置 → 高级 → 存储与缓存：清除必应壁纸缓存
- **恢复默认** — 设置底部的“恢复默认设置”只重置当前选项卡；要删除全部设置、壁纸、预览和缓存，请使用 高级 → 危险区域 → 清空全部配置，并手动输入警告文字（输入框禁止粘贴）

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
├── manifest.json         # 扩展清单（Manifest V3）
├── background.js         # Service Worker：跨域建议 API 代理
├── newtab.html           # 新标签页结构
├── css/
│   └── style.css         # 所有样式（毛玻璃、布局、深色模式）
├── js/
│   ├── boot.js           # 首帧前运行：把已保存的外观（玻璃风格 / 圆角 / 模糊 / 蒙版）先套到 <html>
│   ├── main.js           # 入口、Clock 模块、初始化顺序
│   ├── search.js         # 搜索引擎、建议请求（带缓存）、JSONP 解析
│   ├── settings.js       # 设置面板、自定义下拉与开关、设置的批量保存
│   ├── bookmarks.js      # 书签 + 常访问站点，字母头像 favicon
│   ├── background.js     # 背景图 / 视频 / 模糊 / 蒙版管理（IndexedDB 存储）
│   ├── cursor.js         # 鼠标特效（按需创建画布、按需绑定事件）
│   └── effect-kivotos.js # 基沃托斯特效（选中该样式时才与 lib/anime.min.js 一起加载）
├── lib/
│   └── anime.min.js      # 仅基沃托斯特效使用，按需加载
├── fonts/
│   └── DingTalk_Sans.ttf # 英文字体（unicode-range 限定拉丁字符）
├── icons/
│   ├── icon-16.svg
│   ├── icon-48.svg
│   └── icon-128.svg
├── README.md             # 中文（默认）
├── README_en.md          # 英文
├── LICENSE
└── .gitignore
```

## 实现细节

### 搜索建议

浏览器扩展由于 CORS 限制，无法直接请求搜索建议 API。UniTab 用 background service worker 当代理：

- 新标签页调用 `chrome.runtime.sendMessage({ type: 'fetch_jsonp', url })`
- Service Worker 利用 `host_permissions` 拿到跨域权限，发起请求
- 返回原始字节流，SW 显式按 GBK / UTF-8 解码（部分浏览器在跨域响应上忽略 `Content-Type` 的 charset 参数）
- 前端解析 JSONP：剥离外层包裹，再用 `quoteKeys()` 把 JS 字面量语法（`{q:"x",p:false}`）通过加引号转为合法 JSON

### 建议下拉框

使用 `position: absolute` 绝对定位在搜索框下方，浮于页面之上而**不推动居中的搜索框**。玻璃参数（背景、模糊、阴影、边框、圆角）与搜索框完全一致，两块面板视觉上读作同一个连续表面。

### 书签与常访问站点

读取 `chrome.bookmarks.getTree()`（书签栏）与 `chrome.topSites.get()`，按 `(hostname + pathname)` 合并去重，最多展示 6 个。Favicon 用字母头像渲染 —— 域名哈希到 HSL 色相、首个字母作为字符 —— 避免了 `chrome://favicon/` 加载失败和跨域请求。

### 背景存储

上传的图片、视频以 Blob 形式存进 IndexedDB（库 `unitab_bg`），设置面板里的各项开关与数值存在 `localStorage`（键 `unitab_settings`，只有几百字节，300ms 内合并写入，切走或关闭标签页时立即落盘）。图片链接直接保存，应用时通过 CSS `background-image` 设置；必应每日壁纸会把最近一张的图片数据缓存在 IndexedDB，新标签页直接从本地读取。旧版本存在 `localStorage` 里的 base64 图片会在首次打开后自动迁移到 IndexedDB。以上均属于扩展自有存储，卸载扩展时随扩展一起清除。

### 壁纸预览（preview）

每次选定壁纸（上传图片 / 应用图片链接 / 拉取必应每日 / 选择视频）都会静默生成一份低分辨率 WebP 预览，并以必应、图片、视频三个独立键位分开存进 IndexedDB（`preview_bing` / `preview_image` / `preview_video`，视频取首帧、图片等比缩小，最长边约 512px）。生成前会先清空对应槽位，避免缓存堆积。预览色也按类型分别持久化（`bgThemeColorBing` / `bgThemeColorImage` / `bgThemeColorVideo`），因此从必应（黄）切到自定义图片或视频（绿）时，占位色会同步换成目标类型自己的颜色，不会残留上一个类型的颜色；若该类型尚未生成过预览色，则先用中性色占位，等 preview 读取或生成完成再即时补上。启动时 `<head>` 里就预热读取当前类型的 preview，加载顺序固定为预览色 → 异步解码并显示 preview → 完整壁纸解码后淡入；切换类型同样始终使用对应类型的 preview 与其预览色，预览色停留时间尽可能短。previews 解码速度优先，保证壁纸出现前页面不闪黑。

### 高级工具与存储清理

“导出当前壁纸”会优先把当前壁纸读成 Blob，再通过临时 `<a download>` 交给浏览器下载管理器：上传图片/视频直接读 IndexedDB，必应壁纸复用本地缓存（没有则下载一次），图片链接尝试 `fetch`。若跨域或 CSP 不允许读取字节，则退回让浏览器直接下载该 URL。文件名优先使用上传时的原始文件名，扩展名按 Blob 的真实 MIME 修正；必应壁纸按日期命名。

预览维护只操作 `preview_*` 槽位，不会删除当前壁纸；“重新生成当前预览”会按当前类型重新生成 WebP 并更新预览色，“重新拾取预览色”优先从已有预览取平均色，没有预览时才从壁纸源计算。清空全部配置会同时删除 `localStorage` 中以 `unitab_` 开头的键和 IndexedDB `unitab_bg` 中的全部数据，并在确认后重新加载页面；确认输入框会拦截 `paste`、`beforeinput` 的粘贴/拖放输入类型以及 `drop` 事件。

## 设计理念

整体遵循毛玻璃美学：

- `backdrop-filter: blur(24px) saturate(180%)` 实现真实毛玻璃
- 边框叠加内高光，模拟玻璃边缘折射
- 时钟使用 `font-variant-numeric: tabular-nums` 等宽数字，切换秒数时不抖动
- 克制的动效：150–300ms cubic-bezier 缓动，全部受 `prefers-reduced-motion: no-preference` 守护
- 单一强调色（板岩蓝 `#8b9dc3`）用于聚焦状态
- 拉丁字符用 DingTalk Sans（`unicode-range` 限定），中文走系统字体栈

## 兼容性

| 特性 | Chrome / Edge | Firefox |
| --- | --- | --- |
| 搜索建议 | ✅ 经 Service Worker 代理 | ✅ 经 Service Worker 代理 |
| 书签 API | ✅ | ✅（`browser.bookmarks`） |
| 常访问站点 API | ✅ | ⚠️ 部分支持（Firefox 不暴露 `topSites`） |
| Manifest V3 | ✅ | ✅（109+） |

Firefox 在没有 `topSites` 时会自动回退到只显示书签。

## 许可证

[MIT](./LICENSE)
