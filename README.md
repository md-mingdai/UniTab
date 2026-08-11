# UniTab

> 一款极简、毛玻璃风格的新标签页美化扩展，兼容主流浏览器。居中的搜索框带实时建议，可自定义背景，整体采用清爽的毛玻璃界面。

- 作者：[mingdai](https://github.com/md-mingdai)
- 仓库地址：https://github.com/md-mingdai/UniTab
- 许可证：[MIT](./LICENSE)
- 当前版本：0.3.6

[English](./README_en.md)

## 特性

- **毛玻璃设计** — 搜索框、搜索建议、底部书签栏、设置面板，全部基于 `backdrop-filter` 实现
- **多引擎搜索** — Google、Bing、搜狗、百度，四大引擎均支持实时搜索建议
- **智能建议** — 防抖请求、键盘导航（↑ / ↓ / Enter / Esc）、百度 JSONP 解析（兼容 GBK 编码）
- **自定义背景** — 支持上传本地图片或粘贴图片链接，可调高斯模糊（0–50px）
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
- **恢复默认** — 设置底部"恢复默认设置"按钮可清空所有自定义

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
│   ├── main.js           # 入口、Clock 模块、初始化顺序
│   ├── search.js         # 搜索引擎、建议请求、JSONP 解析
│   ├── settings.js       # 设置面板、自定义下拉与开关
│   ├── bookmarks.js      # 书签 + 常访问站点，字母头像 favicon
│   └── background.js     # 背景图 / 模糊 / 蒙版管理
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

上传的图片经 `FileReader.readAsDataURL()` 转 base64，存到 `localStorage`。图片链接直接保存，应用时通过 CSS `background-image` 设置。两者均属于扩展自有存储，卸载扩展时随扩展一起清除。

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
