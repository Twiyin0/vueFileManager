# VueFileManager 项目指南

## 暗色模式样式规范

本项目使用 Tailwind CSS v4，暗色模式通过 `.dark` 类触发。修改前端代码时**必须**保持暗色模式样式统一。

### CSS 变量（内联样式用）

在 `src/styles/main.css` 的 `:root` 和 `.dark` 中定义：

| 变量 | 浅色 | 暗色 | 用途 |
|------|------|------|------|
| `--bg-color` | #f8f9fa | #1a1b1e | 页面背景 |
| `--surface-color` | #ffffff | #222326 | 导航栏、侧边栏 |
| `--card-color` | #ffffff | #2a2b2f | 卡片、对话框 |
| `--border-color` | #e5e7eb | #3a3b3f | 边框 |
| `--hover-color` | #f3f4f6 | #323337 | 悬浮背景 |
| `--text-color` | #1f2937 | #e0e0e2 | 主文本 |
| `--text-secondary-color` | #6b7280 | #a0a0a4 | 次要文本 |
| `--accent-color` | #4f6ef7 | #6b7cff | 强调色 |
| `--accent-soft-color` | #dbeafe | #4a5080 | 强调色背景 |

### Tailwind 暗色类（`@theme` 中定义）

在 `@theme` 块中定义，配合 `dark:` 前缀使用：

- `dark:text-dark-text` / `dark:text-dark-text-secondary`
- `dark:bg-dark-surface` / `dark:bg-dark-card` / `dark:bg-dark-hover`
- `dark:border-dark-border`
- `dark:placeholder-dark-placeholder`
- `dark:text-dark-accent` / `dark:bg-dark-accent-soft`

### 规则

1. **输入框**：统一使用 `.input-field` 类，已内置暗色 placeholder 样式
2. **对话框/面板背景**：用 `style="background-color: var(--card-color)"` 或 `.card` 类，不要裸用 `bg-white`
3. **文本/代码预览**：用 `var(--surface-color)` 而非 `white`
4. **hover 状态**：必须带 `dark:hover:bg-dark-hover`，不可遗漏
5. **新增暗色颜色**：必须先在 `main.css` 的 `@theme` 块中定义，再使用
6. **CSS 变量**：只用上述已定义的变量名，不要自造（如 `--color-light-bg` 不存在）

## 对话框规范

所有对话框外层卡片容器**必须**添加 `max-h-[90vh] overflow-y-auto`，确保内容超出屏幕高度时可滚动。

### 模式 A：Teleport 对话框（推荐用于独立组件）

```html
<Teleport to="body">
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')"/>
    <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
      <!-- 内容 -->
    </div>
  </div>
</Teleport>
```

### 模式 B：内联对话框（视图内直接使用）

```html
<div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div class="card w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" style="background-color: var(--card-color)">
    <div class="p-6">
      <!-- 内容 -->
    </div>
  </div>
</div>
```

### 对话框列表

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/ConfirmDialog.vue` | 组件 | 通用确认弹窗 |
| `src/components/UploadDialog.vue` | 组件 | 拖拽上传 |
| `src/components/MoveDialog.vue` | 组件 | 移动文件（含文件夹浏览器） |
| `src/components/ShareDialog.vue` | 组件 | 创建分享链接 |
| `src/components/GuestShareDialog.vue` | 组件 | 分享至访客模式 |
| `src/views/StoragePools.vue` | 内联 | 添加/编辑存储池 |
| `src/views/Home.vue` | 内联 | 远程上传/新建文件夹/重命名 |
| `src/views/Admin.vue` | 内联 | 创建用户/用户详情 |
| `src/views/ApiKeys.vue` | 内联 | 创建 API Key |

## 文件预览系统

文件预览统一使用 `src/components/FilePreview.vue`，根据 `fileType` 选择渲染方案：

| 文件类型 | 渲染方案 | npm 包 |
|---------|---------|--------|
| 视频 | ArtPlayer | `artplayer` |
| 音频 | APlayer | `aplayer` |
| 图片 | ViewerJS | `viewerjs` |
| 文本/代码 | Monaco Editor | `@guolao/vue-monaco-editor` + `monaco-editor` |
| PDF | iframe | - |

### 预览组件使用

```vue
<FilePreview
  :show="showPreview"
  :file-path="fileToPreview.path"
  :file-name="fileToPreview.name"
  :pool-id="fileToPreview.poolId"
  @close="showPreview = false"
/>
```

- `filePath` 若以 `/api/` 开头则直接使用（分享预览），否则拼装 `/api/files/preview?path=...&poolId=...&token=...`
- 分享页面 (`Share.vue`) 复用同一组件，传分享预览 URL

### 第三方组件暗色模式适配

所有第三方播放器的暗色模式覆盖集中在 `src/styles/main.css` 底部（第195行起），使用 `.dark` 前缀选择器：

- **ArtPlayer**：通过 JS `theme` 选项设置强调色，UI 天生暗色无需 CSS
- **APlayer**：大量硬编码亮色值需覆盖（背景/文字/边框/进度条/列表），见 `main.css` 中 `.dark .aplayer` 规则
- **ViewerJS**：工具栏/导航栏底色覆盖为暗色半透明
- **Monaco Editor**：通过响应式 prop `:theme="isDark ? 'vs-dark' : 'vs'"` 切换

主题切换检测：`MutationObserver` 监听 `<html>` 的 `class` 变化，`isDark` ref 响应式联动。

### 视频播放器

- ArtPlayer 容器必须用 `v-if`（非 `v-show`），确保挂载时 DOM 已插入
- 设置 `autoSize: false` 让播放器填充容器；给容器加 `aspect-ratio: 16/9` 获得合适高度
- 视频预览 modal 使用 `max-w-7xl`（比常规 `max-w-5xl` 更宽）

### 类型声明

未提供 TypeScript 类型的包需在 `env.d.ts` 中添加声明：
- `declare module 'aplayer'` — 已添加，含 `APlayerOptions` 接口和 `APlayer` 类

## 访客模式

- 路由：`/guest`（用户列表）、`/guest/:username`（文件夹列表）、`/guest/:username/:shareId`（文件浏览）
- 访客页左上角使用 `logo.svg`（34×34px），与用户界面一致

## Mac 兼容性

### AppleDouble 文件（`._` 前缀）

macOS 在外部分区（如 ExFAT）上会生成 `._` 开头的 AppleDouble 元数据文件，需在 **3 个层级** 同时过滤：

1. **multer fileFilter** — 服务端上传中间件，拒绝接收 `._` 文件
2. **路由处理器** — 上传完成回调和文件列表查询中二次过滤
3. **客户端 handleUpload** — 前端上传前过滤 `._` 文件，避免无效请求

### 外置驱动器（crucialX8）路径解析

外置驱动器路径可能因 Unicode 编码差异（NFD vs NFC）导致 `fs.existsSync` / `fs.access` 失败。在 `LocalStorage` 的 `resolvePath()` 中实现回退逻辑：若直接拼接的路径不存在，尝试遍历父目录文件列表进行 Unicode 规范化匹配。

### Express JSON 限制

文本文件编辑功能需要增大 JSON body 限制：`express.json({ limit: '50mb' })`，服务端入口 `server.js` 中配置。

## 编码/Unicode

### 中文及特殊字符路径

文件路径含中文或特殊字符时，**必须使用 POST 请求体传参**，不可用 GET 查询参数。删除、重命名、移动等操作统一走 POST body。

### 又拍云 Keep-Alive

又拍云 SDK 默认短连接性能差，需传入自定义 `https.Agent`：

```js
const agent = new https.Agent({ keepAlive: true, maxSockets: 10, timeout: 60000 })
```

### 重试包装器

又拍云操作偶发网络抖动，需用 `withRetry()` 包装器自动重试（默认 3 次，指数退避）。

## 颜色对照速查

| 场景 | 浅色模式 | 暗色模式 |
|------|---------|---------|
| 页面背景 | `#f8f9fa` | `#1a1b1e` |
| 卡片/对话框 | `#ffffff` | `#2a2b2f` |
| 导航栏 | `#ffffff` | `#222326` |
| 强调色 | `#4f6ef7` | `#6b7cff` |
| 强调色背景 | `#dbeafe` | `#4a5080` |
