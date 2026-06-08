# VueFileManager 主题开发文档

## 概述

VueFileManager 支持通过自定义 CSS 主题修改界面样式。主题放置在 `plugins/` 目录下，每个主题是一个独立文件夹，包含 `manifest.json` 和 `style.css`。

主题通过覆盖 CSS 变量和组件样式类来自定义外观，同时支持亮色/暗色模式分别定义。主题 CSS 在服务端启动时加载，通过 `<link>` 标签注入页面，优先级高于系统默认样式。

---

## 目录结构

```
plugins/
  my-theme/
    manifest.json      # 必须：主题元信息
    style.css          # 必须：自定义样式
```

---

## manifest.json

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "description": "我的自定义主题",
  "author": "作者名",
  "enabled": true,
  "style": "style.css"
}
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 主题唯一标识（文件夹名） |
| `version` | string | ✅ | 语义化版本号 |
| `description` | string | ❌ | 主题描述 |
| `author` | string | ❌ | 作者 |
| `enabled` | boolean | ❌ | 是否启用（默认 `true`，设为 `false` 可禁用） |
| `style` | string | ✅ | CSS 文件名 |

---

## CSS 变量系统

主题通过覆盖 CSS 变量来自定义样式。所有变量在 `src/styles/main.css` 中定义，主题只需覆盖需要修改的变量。

### 基础颜色变量

在 `:root`（亮色模式）和 `.dark`（暗色模式）中分别定义：

| 变量 | 浅色默认 | 暗色默认 | 用途 |
|------|----------|----------|------|
| `--bg-color` | `#f8f9fa` | `#1a1b1e` | 页面背景 |
| `--surface-color` | `#ffffff` | `#222326` | 导航栏、侧边栏背景 |
| `--card-color` | `#ffffff` | `#2a2b2f` | 卡片、对话框背景 |
| `--border-color` | `#e5e7eb` | `#3a3b3f` | 边框颜色 |
| `--hover-color` | `#f3f4f6` | `#323337` | 悬浮背景 |
| `--text-color` | `#1f2937` | `#e0e0e2` | 主文本颜色 |
| `--text-secondary-color` | `#6b7280` | `#a0a0a4` | 次要文本颜色 |
| `--accent-color` | `#4f6ef7` | `#6b7cff` | 强调色（按钮、链接、激活态） |
| `--accent-soft-color` | `#dbeafe` | `#4a5080` | 强调色背景（激活态侧边栏、标签） |

### Tailwind 暗色类（`@theme` 块）

在 `main.css` 的 `@theme` 块中定义，配合 `dark:` 前缀使用：

```css
@theme {
  --color-dark-text: #e0e0e2;
  --color-dark-text-secondary: #a0a0a4;
  --color-dark-surface: #222326;
  --color-dark-card: #2a2b2f;
  --color-dark-hover: #323337;
  --color-dark-border: #3a3b3f;
  --color-dark-placeholder: #6b6d73;
  --color-dark-accent: #6b7cff;
  --color-dark-accent-soft: #4a5080;
}
```

使用示例：`dark:bg-dark-card dark:text-dark-text dark:border-dark-border`

---

## 组件样式类

系统预定义了以下样式类，主题可以覆盖它们的样式。

### 按钮

| 类名 | 说明 | 暗色模式行为 |
|------|------|-------------|
| `.btn-primary` | 主按钮（强调色背景） | 暗色模式下使用 `accent-soft-color` 背景 + `accent-color` 文字，hover 变为 `accent-color` 背景 + 白色文字 |
| `.btn-secondary` | 次要按钮（灰色背景 + 边框） | 暗色模式下使用 `card-color` 背景 + `text-secondary-color` 文字 |
| `.btn-danger` | 危险按钮（红色背景） | 暗色模式下使用深红背景 |

### 输入框

| 类名 | 说明 |
|------|------|
| `.input-field` | 统一输入框（圆角、边框、focus 高亮） |
| `select.input-field` | 下拉选择框（紧凑内边距） |

### 卡片

| 类名 | 说明 |
|------|------|
| `.card` | 卡片容器（圆角、边框、轻微阴影） |
| `.card.cursor-pointer:hover` | 可点击卡片（hover 变背景色） |

### 文件列表

| 类名 | 说明 |
|------|------|
| `.file-row:hover` | 文件行悬浮高亮 |

### 视图切换

| 类名 | 说明 |
|------|------|
| `.view-mode-toggle` | 列表/网格切换容器 |
| `.view-mode-active` | 激活态按钮（`accent-soft-color` 背景 + `accent-color` 文字） |

### 工具栏

| 类名 | 说明 |
|------|------|
| `.toolbar-btn` | 预览工具栏按钮（透明背景，hover 边框色） |

### 缩略图

| 类名 | 说明 |
|------|------|
| `.thumb-container` | 缩略图容器（1:1 比例，圆角顶部） |
| `.thumb-img` | 缩略图图片（cover 填充） |
| `.thumb-icon` | 非图片文件图标容器 |

### 复选框

全局自绘复选框（`input[type="checkbox"]:not(.sr-only)`），自动适配亮/暗模式。排除 `sr-only` 类（toggle 开关使用）。

---

## 布局结构

```
Layout.vue
├── Header (h-11)
│   ├── Logo (28×28px) + "VueFileManager" 文字（移动端隐藏）
│   ├── 页面标题（带切换动效，移动端隐藏）
│   ├── 更多菜单（移动端：⋮ 图标，桌面端：直接显示链接）
│   │   ├── API 文档
│   │   ├── 主题开发
│   │   ├── GitHub
│   │   ├── 设置（登录状态）
│   │   └── 退出/登录
│   └── ThemeToggle（下拉菜单，显示当前模式文字）
│
├── Sidebar（桌面端：可收缩可拖拽 160-400px，移动端：覆盖层）
│   ├── 激活项：左侧 3px 竖条 + accent-soft-color 背景
│   ├── 分隔线（管理区、访客模式）
│   └── hover 态：hover-color 背景
│
├── Main Content（router-view，独立滚动）
│   └── Page Content
│
└── Footer（版权 + 备案信息）
```

### 设计规范

- **扁平化设计**：轻微阴影分层，无厚重阴影
- **圆角**：卡片/按钮 `rounded-lg`（8px），输入框 `rounded-lg`
- **阴影**：卡片 `0 1px 3px rgba(0,0,0,0.06)`，暗色 `0 1px 3px rgba(0,0,0,0.2)`
- **间距**：Header 高度 `2.75rem`（44px），侧边栏 padding `px-2`
- **动效**：过渡时间 150-250ms，缓动 `ease` 或 `cubic-bezier(0.4, 0, 0.2, 1)`

---

## 响应式设计

系统使用 Tailwind CSS 断点，`sm:`（640px）为移动端/桌面端分界。

### 移动端适配（<640px）

| 元素 | 桌面端 | 移动端 |
|------|--------|--------|
| Header | 显示所有链接 + 主题切换文字 | 仅 Logo + ThemeToggle + 更多菜单 |
| 侧边栏 | 内联可收缩 | 覆盖层（fixed + 半透明遮罩） |
| 工具栏按钮 | 图标 + 文字 | 仅图标（文字 `hidden sm:inline`） |
| 对话框 padding | `p-4` | `p-2` |
| APlayer | 左下角 288px | 底部全宽 |
| 文件列表 | 显示大小/修改时间列 | 隐藏（`hidden sm:block`） |
| 操作按钮 | 4px 间距 | 最小 36×36px 点击区域 |

### 全局移动端样式

```css
@media (max-width: 639px) {
  html, body { overflow-x: hidden; }
  button, .btn-primary, .btn-secondary, .btn-danger { min-height: 36px; }
}
```

---

## 第三方组件暗色模式

系统为以下第三方组件提供了暗色模式覆盖，主题如需自定义这些组件样式，需使用 `.dark` 前缀选择器。

### APlayer（音频播放器）

```css
.dark .aplayer { background: var(--card-color); }
.dark .aplayer .aplayer-title { color: var(--text-color); }
.dark .aplayer .aplayer-author { color: var(--text-secondary-color); }
.dark .aplayer .aplayer-bar { background: var(--border-color); }
.dark .aplayer .aplayer-list ol li { color: var(--text-color); border-top-color: var(--border-color); }
.dark .aplayer .aplayer-list ol li:hover { background: var(--hover-color); }
```

### ViewerJS（图片查看器）

```css
.dark .viewer-toolbar { background-color: rgba(20, 20, 22, 0.9); }
.dark .viewer-navbar { background-color: rgba(20, 20, 22, 0.9); }
.dark .viewer-title { color: var(--text-color); }
```

### ArtPlayer（视频播放器）

通过 JS `theme` 选项设置强调色，UI 天生暗色无需 CSS 覆盖。

---

## 示例

### 示例 1：紫色主题

**manifest.json：**
```json
{
  "name": "purple-theme",
  "version": "1.0.0",
  "description": "紫色主题",
  "enabled": true,
  "style": "style.css"
}
```

**style.css：**
```css
:root {
  --accent-color: #8b5cf6;
  --accent-soft-color: #ede9fe;
}

.dark {
  --accent-color: #a78bfa;
  --accent-soft-color: #4c1d95;
}
```

### 示例 2：深绿色主题

**style.css：**
```css
:root {
  --accent-color: #059669;
  --accent-soft-color: #d1fae5;
  --bg-color: #f0fdf4;
}

.dark {
  --accent-color: #34d399;
  --accent-soft-color: #064e3b;
  --bg-color: #0a1f0f;
  --surface-color: #132a1a;
  --card-color: #1a3524;
}
```

### 示例 3：暖色主题（完整覆盖）

**style.css：**
```css
:root {
  --bg-color: #fefce8;
  --surface-color: #fef9c3;
  --card-color: #ffffff;
  --border-color: #e5e7eb;
  --hover-color: #fef3c7;
  --text-color: #1c1917;
  --text-secondary-color: #78716c;
  --accent-color: #d97706;
  --accent-soft-color: #fef3c7;
}

.dark {
  --bg-color: #1c1917;
  --surface-color: #292524;
  --card-color: #352f2b;
  --border-color: #44403c;
  --hover-color: #3e3a36;
  --text-color: #fafaf9;
  --text-secondary-color: #a8a29e;
  --accent-color: #f59e0b;
  --accent-soft-color: #451a03;
}
```

### 示例 4：自定义按钮样式

**style.css：**
```css
/* 自定义主按钮渐变背景 */
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #5a6fd6 0%, #6a4290 100%);
}

/* 自定义卡片圆角和阴影 */
.card {
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
```

### 示例 5：自定义侧边栏

**style.css：**
```css
/* 侧边栏背景渐变 */
.sidebar-aside {
  background: linear-gradient(180deg, #1e1b4b 0%, #312e81 100%) !important;
  border-right: none !important;
}

/* 侧边栏激活项自定义 */
.sidebar-item-active {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #c7d2fe !important;
}

.sidebar-item-active::before {
  background-color: #818cf8 !important;
}

/* 侧边栏文字颜色 */
.sidebar-item {
  color: #a5b4fc !important;
}

.sidebar-item:hover {
  background-color: rgba(255, 255, 255, 0.05) !important;
  color: #e0e7ff !important;
}
```

---

## 配置

`config.yml` 中的主题系统配置：

```yaml
plugins:
  enabled: true       # 是否启用主题系统
  dir: ./plugins      # 主题目录路径
```

---

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/themes/styles` | GET | 获取所有已启用主题的 CSS 路径 |
| `/api/themes/list` | GET | 获取所有主题列表（含禁用） |
| `/api/themes/:name/toggle` | PUT | 切换主题启用/禁用（需 JWT 认证） |

---

## 开发流程

1. 在 `plugins/` 下创建主题文件夹
2. 编写 `manifest.json`（必须包含 `name`、`version`、`style` 字段）
3. 编写 `style.css`（覆盖 CSS 变量或组件样式类）
4. 重启服务（或在 `/themes` 页面启用/禁用）
5. 在 `/themes` 页面查看和管理主题
6. 在 `/theme-docs` 页面查看本文档

---

## 注意事项

- 主题在服务启动时加载，修改后需重启（或在 `/themes` 页面切换开关触发重新加载）
- CSS 变量名必须与系统定义的一致，不要自造变量名
- 建议同时定义 `:root`（浅色）和 `.dark`（暗色）变量，确保两种模式都可用
- 主题 CSS 通过 `<link>` 标签注入，优先级高于系统默认样式
- 暗色模式使用 `.dark` 类触发（在 `<html>` 元素上），主题可用 `.dark` 选择器定义暗色样式
- 移动端断点为 640px（`sm:`），主题如需移动端适配请使用 `@media (max-width: 639px)`
- 所有组件样式类（`.card`、`.btn-primary` 等）均可被主题覆盖
