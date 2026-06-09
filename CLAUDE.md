# VueFileManager 项目指南

## 项目架构脑图

```
VueFileManager v1.0.0-beta.12
├── 🏗️ 技术栈
│   ├── 前端：Vue 3 + TypeScript + Tailwind CSS 4 + Pinia
│   ├── 后端：Express + TypeScript (tsx) + better-sqlite3
│   ├── 存储：Local / Upyun / FTP / S3-OSS
│   └── 认证：JWT + API Key
│
├── 📁 文件管理
│   ├── 浏览/上传/下载/删除/重命名/移动/复制
│   ├── 搜索（递归）/ ZIP 打包下载
│   ├── 流式上传 + 断点续传
│   ├── 远程 URL 上传 / 拖拽上传
│   ├── 回收站（恢复/永久删除/清空）
│   ├── 收藏系统
│   └── 分享系统（密码/过期/下载限制/signToken）
│
├── 💾 存储池系统
│   ├── 多存储池管理（CRUD/切换默认/连接测试）
│   ├── 本地存储（用户目录自动隔离 storage_root/username）
│   ├── Upyun 云存储（keepalive + retry）
│   ├── FTP（basic-ftp）
│   ├── S3/OSS（@aws-sdk/client-s3，兼容 MinIO/阿里云）
│   └── 用户配额管理（默认 10GB，管理员可调）
│
├── 👤 用户系统
│   ├── 注册/登录（SMTP 邮箱验证码可选）
│   ├── JWT + API Key 双认证
│   ├── 管理员/普通用户角色
│   ├── 用户封禁/解封（3 入口统一检查）
│   └── 用户详情（存储配额/用量/统计）
│
├── 🔒 权限与安全
│   ├── API Key 权限（read/write/delete）
│   ├── 访客模式（四级权限：读取/写入/删除/编辑）
│   ├── IP 黑名单/白名单（精确 IP + CIDR）
│   ├── 路径越权防护（fullPath 安全检查）
│   └── 敏感文件拦截（.env/config.yml 等 403）
│
├── 🎨 主题系统
│   ├── plugins/ 目录，manifest.json + style.css
│   ├── CSS 变量覆盖（亮/暗模式分别定义）
│   ├── /themes 页面管理开关
│   └── /theme-docs 详细开发文档（含组件类、布局结构、响应式、示例）
│
├── 🖥️ 前端架构
│   ├── App.vue（Layout 持久化，路由切换不重建侧边栏）
│   ├── Layout.vue（Header + 侧边栏 + 主内容区 + Footer）
│   ├── Header：Logo + 页面标题 + 更多菜单（移动端 ⋮ 下拉）+ ThemeToggle（显示当前模式）
│   ├── Sidebar：扁平化设计，激活项左侧竖条动画，可收缩可拖拽（160-400px）
│   ├── FileList：常驻复选框，自动批量模式，右键菜单含批量操作
│   ├── FilePreview：ArtPlayer/APlayer/ViewerJS/CodeMirror 6/PDF.js
│   ├── APlayer：浮动播放器（桌面左下角/移动端底部全宽），移动端适配
│   ├── 移动端适配：Header 精简、侧边栏覆盖层、按钮图标化、对话框紧凑
│   ├── 页面切换动效（fade + translateY）
│   └── 通用组件：Toast/ConfirmDialog/MoveDialog/ShareDialog/SpotlightSearch
│
├── 🗄️ 数据库（SQLite）
│   ├── users（含 email/verified/storage_quota）
│   ├── user_settings / storage_pools / api_keys
│   ├── shares / trash / favourites / guest_shares
│   ├── verification_codes（SMTP 验证码）
│   └── ip_blacklist / ip_whitelist / ip_list_config
│
├── 🧪 测试（test/workflows.ts）
│   └── 104 项全流程测试覆盖所有 API
│
└── 🚀 部署
    ├── 构建：NODE_OPTIONS='--max-old-space-size=3072' yarn build
    ├── deploy.sh 自动部署脚本（rsync + Docker）
    ├── 2G 内存服务器需 4G swap
    └── CodeMirror 6 按需懒加载（替代 Monaco Editor）
```

## 暗色模式样式规范

本项目使用 Tailwind CSS v4，暗色模式通过 `.dark` 类触发。修改前端代码时**必须**保持暗色模式样式统一。

### CSS 变量（内联样式用）

在 `src/styles/main.css` 的 `:root` 和 `.dark` 中定义：

| 变量 | 浅色 | 暗色 | 用途 |
|------|------|------|------|
| `--bg-color` | #f8f9fa | #1a1b1e | 页面背景 |
| `--surface-color` | #ffffff | #222326 | 导航栏 |
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

1. **输入框/下拉框**：统一使用 `.input-field` 类，已内置暗色 placeholder、focus 样式。**禁止**手写 `bg-white dark:bg-dark-surface ...` 替代 `.input-field`。`<select>` 元素使用 `select.input-field` 自动获得紧凑内边距（`py-1.5`）
2. **对话框/面板背景**：用 `.card` 类或 `style="background-color: var(--card-color)"`，**禁止**裸用 `bg-white`
3. **对话框遮罩**：必须带 `dark:bg-black/60`，如 `bg-black/40 dark:bg-black/60`
4. **文本/代码预览**：用 `var(--surface-color)` 而非 `white`
5. **hover 状态**：必须带 `dark:hover:bg-dark-hover`，不可遗漏
6. **加载 spinner**：统一使用 `text-blue-500`（`<svg class="animate-spin h-N w-N text-blue-500" ...>`），不可省略颜色
7. **新增暗色颜色**：必须先在 `main.css` 的 `@theme` 块中定义，再使用
8. **CSS 变量**：只用上述已定义的变量名，不要自造（如 `--color-light-bg` 不存在）
9. **Tailwind 暗色类 vs CSS 变量**：优先用 CSS 变量（`var(--xxx)`），因其同时适配亮/暗。Tailwind `dark:` 类仅用于无法用变量的场景（如 `dark:hover:bg-dark-hover`）

## 图标系统

项目使用统一的图标组件 `src/components/Icon.vue`，图标库位于 `public/icon/iconlib/`（1702 个 stroke 风格 SVG）。

### 使用方式

```vue
<Icon name="folder" class="w-5 h-5 text-blue-500" />
```

- `name`：图标文件名（不含 `.svg`），如 `folder`、`trash`、`download`
- `class`：控制大小和颜色，SVG 内部 `#000000` 会被替换为 `currentColor`
- 通过 `fetch` 加载 SVG，内存缓存，暗色模式自动适配

### 常用图标映射

| 用途 | 图标名 | 颜色 |
|------|--------|------|
| 文件夹 | `folder` | `text-blue-500` |
| 默认文件 | `file-alt` | `text-gray-400` |
| 图片 | `image` | `text-green-500` |
| 视频 | `video` | `text-purple-500` |
| 音频 | `music` | `text-pink-500` |
| PDF | `file-alt` | `text-red-500` |
| 压缩包 | `box-archive` | `text-yellow-500` |
| 代码 | `code` | `text-cyan-500` |
| 收藏/星 | `star-sharp` | `text-yellow-500` |
| 存储池 | `container-storage` | — |
| 删除 | `trash` | `text-red-500` |
| 搜索 | `search` | 继承 |
| 上传 | `upload` | 继承 |
| 下载 | `download` | 继承 |

### 注意

- 加载 spinner（`animate-spin`）**不使用** Icon 组件，保留内联 SVG
- 图标名必须与 `public/icon/iconlib/` 下的文件名一致，使用前确认文件存在

## 布局系统

`Layout.vue` 为全局布局组件，在 `App.vue` 中持久化渲染（路由切换不销毁重建）。

结构：
- **Header** (`h-11`)：Logo（28×28px）+ 页面标题（桌面端，带切换动效）+ 外部链接（桌面端直接显示，移动端收进更多菜单 ⋮）+ ThemeToggle（下拉菜单，桌面端显示当前模式文字）+ 用户操作
- **侧边栏**：扁平化设计（无边框分隔，激活项左侧 3px 竖条 + 动画），可收缩可拖拽调节宽度（160-400px），移动端为覆盖层（fixed + 半透明遮罩 + 滑入动效）
- **主内容区**：`<slot />` 填充，独立滚动（`overflow-auto`），页面切换有 fade 动效
- **回到顶部按钮**：滚动超 300px 出现，弹跳动效，`fixed` 定位右下角
- **Footer**：版权信息 + 备案号（config.yml 可配置），内容区底部随内容滚动

认证页面通过 `App.vue` 中 `v-if="needsLayout"` 判断是否包裹 Layout。路由使用 `meta.noLayout` 标记不需要 Layout 的页面（登录、访客、分享等）。

### 复选框样式

全局自绘复选框（`main.css`），排除 `sr-only` 类（toggle 开关使用）。暗色模式自动适配。

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
| 文本/代码 | CodeMirror 6 | `codemirror` + 语言包（按需懒加载） |
| PDF | PDF.js CDN | - |
| Word (.docx) | docx-preview | `docx-preview` |
| Excel (.xls/.xlsx/.csv) | ExcelJS | `exceljs` |
| PowerPoint (.ppt/.pptx) | 不支持预览（提示下载） | - |

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
- 预览对话框头部使用半透明毛玻璃样式：`backdrop-blur-md` + `color-mix(in srgb, var(--surface-color) 75%, transparent)`
- 预览对话框支持全屏切换（header 右侧展开/压缩按钮）
- Excel 预览使用 ExcelJS 解析，自定义 sheet tab 栏支持多工作表切换

### 浮动 APlayer 音乐播放器

`Home.vue` 中实现了一个浮动 APlayer 音乐播放器，位于页面左下角：

- 点击音频文件直接触发（不走 FilePreview 预览对话框），自动将当前目录所有音频加入播放列表并播放点击的那首
- 目录切换时自动刷新播放列表
- 可收缩为圆形图标（40x40），展开为 288px 宽播放器
- 收缩/展开用 `v-show` 保持 APlayer DOM 挂载，避免销毁重建
- 暗色/亮色主题自动适配（`MutationObserver` 检测 `.dark` 类）
- APlayer 样式覆盖在 `main.css` 中：`margin: 0; border-radius: 0; box-shadow: none`

### 第三方组件暗色模式适配

所有第三方播放器的暗色模式覆盖集中在 `src/styles/main.css` 底部（第195行起），使用 `.dark` 前缀选择器：

- **ArtPlayer**：通过 JS `theme` 选项设置强调色，UI 天生暗色无需 CSS
- **APlayer**：大量硬编码亮色值需覆盖（背景/文字/边框/进度条/列表），见 `main.css` 中 `.dark .aplayer` 规则
- **ViewerJS**：工具栏/导航栏底色覆盖为暗色半透明
- **CodeMirror 6**：通过 `Compartment` 动态 reconfigure 主题（`EditorView.theme()` + `HighlightStyle`）

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
- 访客页 Header 与用户模式一致（h-11, logo 28×28px）
- 访客文件浏览页 UI 与用户模式对齐：分享文件夹下拉选择器（面包屑首位）、复选框批量操作、搜索、APlayer 音乐播放

### 访客权限系统

`guest_shares` 表有 `permissions` 字段（TEXT，逗号分隔），控制访客可执行的操作：

| 权限 | 说明 | 包含操作 | API 路由 |
|------|------|----------|----------|
| `read` | 读取 | 预览、下载 | `GET /preview`, `GET /download` |
| `write` | 写入 | 上传、创建文件夹 | `POST /upload`, `POST /mkdir` |
| `delete` | 删除 | 删除文件/文件夹 | `POST /delete` |
| `edit` | 文件编辑 | 编辑内容、重命名 | `POST /write`, `POST /rename` |

默认权限：`preview,download`（只读）。创建/编辑分享时可自定义。

前端实现：
- `Guest.vue`：与用户 Home.vue 对齐的 UI（分享下拉、复选框、搜索、APlayer、拖拽上传、上传进度条）
- `ContextMenu.vue`：`allowedActions` prop 控制菜单项，支持批量操作
- `GuestShareDialog.vue`：创建/编辑分享时的权限复选框
- `FilePreview.vue`：`guestBaseUrl` prop 支持访客预览 URL，`guestSaveUrl` + `editable` prop 支持访客编辑
- `FileList.vue`：`guestBaseUrl` prop 支持网格模式缩略图

## 主题系统

主题目录：`plugins/`（可在 `config.yml` 的 `plugins.dir` 配置）

每个主题包含 `manifest.json` + `style.css`：

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "description": "自定义主题",
  "enabled": true,
  "style": "style.css"
}
```

前端 `main.ts` 启动时 fetch `/api/themes/styles` 加载主题 CSS。
服务端 `server/plugins/loader.ts` 负责扫描和加载。
`/themes` 页面管理主题开关，`/theme-docs` 查看开发文档。

API：
- `GET /api/themes/styles` — 已启用主题的 CSS 路径
- `GET /api/themes/list` — 所有主题列表
- `PUT /api/themes/:name/toggle` — 切换启用/禁用

## SMTP 邮箱注册

`config.yml` 中 `smtp.enabled: true` 启用。注册页面自动显示邮箱和验证码字段。

API：
- `POST /api/auth/send-code` — 发送验证码 `{ email }`
- `POST /api/auth/register` — 注册 `{ username, password, email, code }`

数据库：`verification_codes` 表（验证码 5 分钟过期）

## FTP 存储驱动

`server/services/ftp.ts` 实现 `StorageProvider` 接口，使用 `basic-ftp` 包。
`config.yml` 存储池类型 `type: ftp`，配置项：`ftpHost`、`ftpPort`、`ftpUser`、`ftpPassword`、`ftpRemotePath`。

## 用户封禁系统

用户封禁字段 `users.banned`（INTEGER, 0/1），需在 **3 个认证入口** 同时检查：

1. **登录路由** (`server/routes/auth.ts`) — 密码验证通过后、生成 JWT 前检查 `user.banned`
2. **API Key 中间件** (`server/middleware/apikey.ts` `apiKeyMiddleware`) — 查询时 JOIN users 并 SELECT `u.banned`，验证后检查
3. **统一认证** (`server/middleware/apikey.ts` `flexibleAuth`) — JWT 路径查询用户时 SELECT `banned`，验证后检查；API Key 路径委托给已修复的 `apiKeyMiddleware`

封禁响应统一为 `403 { error: '账号已被封禁' }`。

**管理员保护**：管理员账户（`role = 'admin'`）不能被封禁，ban 接口会返回 `400 { error: '不能封禁管理员账户' }`。

## IP 黑名单/白名单系统

数据库表 `ip_blacklist` + `ip_whitelist`（`server/db.ts` 迁移创建），各自独立存储，支持精确 IPv4 和 CIDR 网段。配置表 `ip_list_config` 存储当前模式（`blacklist` / `whitelist`），中间件和管理路由按模式查询对应表。

### 模式

- **黑名单模式**（默认）：拦截列表中的 IP
- **白名单模式**：仅允许列表中的 IP，127.0.0.1 / ::1 / localhost 始终放行，127.0.0.1 不可删除

默认模式可在 `config.yml` 中通过 `ip_list_mode` 配置。切换到白名单时若列表为空，自动添加 127.0.0.1、::1、localhost。

### 中间件

`ipBlacklistMiddleware`（`server/middleware/auth.ts`）在所有 API 路由之前执行，根据模式检查客户端 IP。在 `server/index.ts` 中通过 `app.use('/api', ipBlacklistMiddleware)` 注册。

IP 获取优先级：`X-Forwarded-For` 头 → `req.socket.remoteAddress`，自动去除 `::ffff:` IPv6 前缀。

### API 路由（`server/routes/admin.ts`）

均需 `authMiddleware` + `adminMiddleware`：

- `GET /api/admin/ip-blacklist` — 查询列表
- `POST /api/admin/ip-blacklist` — 添加 `{ ip_pattern, reason? }`
- `DELETE /api/admin/ip-blacklist/:id` — 删除（白名单模式下 127.0.0.1 不可删除）
- `GET /api/admin/ip-list/mode` — 获取当前模式
- `PUT /api/admin/ip-list/mode` — 切换模式 `{ mode: 'blacklist' | 'whitelist' }`

IP 格式校验：正则 `(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/)` + 每段 0-255 + 掩码 0-32。

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

## 亮/暗模式风格统一检查清单

修改前端代码时，逐项检查：

- [ ] 输入框、select 是否使用 `.input-field`（而非手写 Tailwind 类）
- [ ] 对话框遮罩是否带 `dark:bg-black/60`
- [ ] 对话框/卡片背景是否用 `.card` 或 `var(--card-color)`（而非 `bg-white`）
- [ ] hover 状态是否带 `dark:hover:bg-dark-hover`
- [ ] 加载 spinner 是否带 `text-blue-500`
- [ ] 图标是否通过 `<Icon>` 组件引入（而非内联 SVG）
- [ ] 文本颜色是否用 `var(--text-color)` / `var(--text-secondary-color)` 或对应的 Tailwind 暗色类
- [ ] 新增颜色是否已在 `main.css` 的 `@theme` 和 `:root`/`.dark` 中定义

## 颜色对照速查

| 场景 | 浅色模式 | 暗色模式 |
|------|---------|---------|
| 页面背景 | `#f8f9fa` | `#1a1b1e` |
| 卡片/对话框 | `#ffffff` | `#2a2b2f` |
| 导航栏 | `#ffffff` | `#222326` |
| 强调色 | `#4f6ef7` | `#6b7cff` |
| 强调色背景 | `#dbeafe` | `#4a5080` |
