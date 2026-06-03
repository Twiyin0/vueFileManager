# VueFileManager

一个类似 AList 的网页文件管理系统，支持本地存储和 Upyun 云存储，支持多存储池管理。

## ✨ 功能特性

### 文件管理
- 📁 文件浏览、上传、下载、删除
- 📝 重命名、移动、复制
- 🔍 文件搜索（递归）
- 📦 创建文件夹
- 👁️ 文件预览（图片/视频/音频/PDF/代码）
- 📋 批量选择、批量删除、批量移动
- 🖱️ 右键上下文菜单
- 📊 文件详情面板
- 🗂️ 文件夹导航树
- ⌘ Spotlight 全局搜索 (Ctrl+K)
- 📦 ZIP 打包下载
- 📡 远程 URL 上传
- 📥 拖拽上传 + 上传进度条

### 存储池系统
- 💾 多存储池管理（创建/编辑/删除/切换）
- ☁️ 本地存储 + Upyun 云存储
- 🔄 存储池独立配置，一键切换默认
- 🧪 存储池连接测试
- 📝 config.yml 预配置存储池，新用户自动继承

### 用户系统
- 👤 用户注册/登录
- 🔐 JWT + API Key 双模式认证
- 👑 管理员/普通用户角色
- 📊 记录注册IP和最后登录IP
- 🚫 用户封禁/解封

### 管理面板
- 👥 用户列表（搜索/筛选）
- ➕ 创建用户
- 🔒 封禁/解封用户
- 🔑 重置用户密码
- ⬆️⬇️ 升级/降级用户角色
- 🗑️ 删除用户
- 📋 用户详情（存储池、统计数据）

### 回收站
- 🗑️ 文件删除自动移入回收站
- ♻️ 恢复文件到原路径
- 🗑️ 永久删除单个项目
- 🧹 一键清空回收站

### 收藏系统
- ⭐ 收藏/取消收藏文件和文件夹
- 📋 收藏列表管理
- 🚀 从收藏快速跳转

### 分享系统
- 🔗 生成分享链接
- 🔒 密码保护
- ⏰ 过期时间设置
- 📉 下载次数限制

### 权限系统
- 🔑 API Key 权限管理（read/write/delete）
- 🚪 访客模式（可配置可访问路径）
- 🛡️ 管理员面板

### 界面
- 🌙 暗色/亮色/跟随系统主题
- 📱 响应式设计
- 🎨 柔和的暗色模式配色

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装
```bash
# 克隆项目
git clone <repo-url>
cd vueFileManager

# 安装依赖
npm install
```

### 配置

**1. 主配置 (config.yml)**
```yaml
admin:
  username: admin
  # 密码的 MD5 值，默认为 MD5("admin")
  password: 21232f297a57a5a743894a0e4a801fc3

server:
  port: 3000
  jwt_secret: vue-file-manager-secret-key-2024

# 存储池配置（新用户自动继承）
storage_pools:
  - name: 本地存储
    type: local
    default: true
    config:
      localPath: ./uploads

  # 又拍云示例
  # - name: 又拍云存储
  #   type: upyun
  #   default: false
  #   config:
  #     upyunOperator: your-operator
  #     upyunPassword: your-password
  #     upyunBucket: your-bucket
  #     upyunEndpoint: v0.api.upyun.com
```

> 💡 密码使用 MD5 值，可通过 `echo -n "your-password" | md5` 计算

**2. Upyun 测试配置 (.env)**

复制并编辑 `.env` 文件（仅用于测试脚本）：
```bash
cp .env.example .env
```

```env
ENV_upyun_operator=操作员名称
ENV_upyun_password=操作员密码
ENV_upyun_bucket=服务名称
ENV_upyun_endpoint=v0.api.upyun.com
```

> ⚠️ `.env` 文件包含敏感信息，已加入 `.gitignore`，不会提交到版本库

### 启动
```bash
# 开发模式（同时启动前后端）
npm run dev

# 仅前端
npm run dev:client

# 仅后端
npm run dev:server

# 构建生产版本
npm run build
```

### 访问
- 前端: http://localhost:5173
- 后端 API: http://localhost:3000/api

### 默认管理员
- 用户名: `admin`
- 密码: `admin`

## 📁 项目结构

```
vueFileManager/
├── config.yml                  # 配置文件
├── .env                        # 环境变量（测试用）
├── server/                     # Express 后端
│   ├── index.ts               # 入口
│   ├── config.ts              # 配置加载
│   ├── db.ts                  # SQLite 数据库
│   ├── middleware/            # 中间件
│   │   ├── auth.ts           # JWT 认证 + 封禁检查
│   │   └── apikey.ts         # API Key 认证
│   ├── routes/               # API 路由
│   │   ├── auth.ts           # 认证
│   │   ├── files.ts          # 文件操作
│   │   ├── user.ts           # 用户设置 + API Key
│   │   ├── admin.ts          # 管理面板
│   │   ├── guest.ts          # 访客
│   │   ├── share.ts          # 分享
│   │   ├── storage-pools.ts  # 存储池管理
│   │   ├── trash.ts          # 回收站
│   │   └── favourites.ts     # 收藏
│   └── services/             # 存储服务
│       ├── storage.ts        # 接口定义
│       ├── local.ts          # 本地存储
│       ├── upyun.ts          # Upyun 存储
│       └── factory.ts        # 工厂模式（含存储池缓存）
├── src/                        # Vue 前端
│   ├── main.ts               # 入口
│   ├── router/               # 路由
│   ├── stores/               # 状态管理
│   ├── api/                  # API 封装
│   ├── components/           # 组件
│   │   ├── Sidebar.vue       # 侧边栏
│   │   ├── FileList.vue      # 文件列表
│   │   ├── ContextMenu.vue   # 右键菜单
│   │   ├── SpotlightSearch.vue # 全局搜索
│   │   ├── FileDetailPanel.vue # 文件详情
│   │   ├── FolderTree.vue    # 文件夹树
│   │   ├── UploadProgress.vue # 上传进度
│   │   └── ConfirmDialog.vue # 确认弹窗
│   └── views/                # 页面
│       ├── Home.vue          # 文件管理主页
│       ├── StoragePools.vue  # 存储池管理
│       ├── Trash.vue         # 回收站
│       ├── Favourites.vue    # 收藏
│       ├── MyShares.vue      # 我的分享
│       ├── UserSettings.vue  # 用户设置
│       ├── ApiKeys.vue       # API Key
│       ├── Admin.vue         # 管理面板
│       ├── Share.vue         # 分享访问页
│       └── Login.vue         # 登录注册
├── test/                       # 测试
│   ├── workflows.ts          # API 全流程测试（76 项）
│   └── upyun.ts              # Upyun 存储测试
└── API.md                      # API 文档
```

## 🧪 测试

```bash
# 启动服务
npm run dev:server

# 运行 API 全流程测试（另开终端）
npx tsx test/workflows.ts

# 运行 Upyun 存储测试
npx tsx test/upyun.ts
```

测试覆盖（76 项）：
- ✅ 认证 API（注册/登录/用户信息/Token校验）
- ✅ 存储池 API（CRUD/切换默认/连接测试）
- ✅ 文件 API（列表/创建/重命名/移动/复制/搜索/批量删除/回收站删除/永久删除）
- ✅ 回收站 API（列表/恢复/永久删除/清空）
- ✅ 收藏 API（添加/检查/列表/取消收藏）
- ✅ 分享 API（创建/密码分享/列表/访问/删除）
- ✅ API Key API（创建/列表/认证/删除）
- ✅ 用户设置 API（获取/更新/恢复默认）
- ✅ 访客 API（用户列表/文件列表）
- ✅ 管理 API（列表/详情/创建/封禁/解封/重置密码/升降级/权限控制）

## 📖 API 文档

详见 [API.md](./API.md)

### 认证方式

**JWT Token:**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/files/list
```

**API Key:**
```bash
curl -H "X-API-Key: <key>" http://localhost:3000/api/files/list
```

### 主要端点

| 模块 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /api/auth/login` | 登录 |
| 认证 | `POST /api/auth/register` | 注册 |
| 认证 | `GET /api/auth/me` | 当前用户信息 |
| 文件 | `GET /api/files/list` | 文件列表 |
| 文件 | `POST /api/files/upload` | 上传 |
| 文件 | `GET /api/files/download` | 下载 |
| 文件 | `GET /api/files/preview` | 预览 |
| 文件 | `POST /api/files/rename` | 重命名 |
| 文件 | `POST /api/files/move` | 移动 |
| 文件 | `POST /api/files/copy` | 复制 |
| 文件 | `DELETE /api/files/delete` | 删除（回收站） |
| 文件 | `POST /api/files/batch-delete` | 批量删除 |
| 文件 | `POST /api/files/batch-move` | 批量移动 |
| 文件 | `GET /api/files/search` | 搜索 |
| 文件 | `GET /api/files/info` | 文件信息 |
| 文件 | `GET /api/files/storage-stats` | 存储统计 |
| 文件 | `POST /api/files/download-zip` | ZIP打包下载 |
| 文件 | `POST /api/files/remote-upload` | 远程URL上传 |
| 存储池 | `GET /api/storage-pools` | 存储池列表 |
| 存储池 | `POST /api/storage-pools` | 创建存储池 |
| 存储池 | `PUT /api/storage-pools/:id` | 更新存储池 |
| 存储池 | `DELETE /api/storage-pools/:id` | 删除存储池 |
| 存储池 | `POST /api/storage-pools/:id/set-default` | 设为默认 |
| 存储池 | `POST /api/storage-pools/:id/test` | 测试连接 |
| 回收站 | `GET /api/trash` | 回收站列表 |
| 回收站 | `POST /api/trash/:id/restore` | 恢复文件 |
| 回收站 | `DELETE /api/trash/:id` | 永久删除 |
| 回收站 | `DELETE /api/trash` | 清空回收站 |
| 收藏 | `GET /api/favourites` | 收藏列表 |
| 收藏 | `POST /api/favourites` | 添加收藏 |
| 收藏 | `DELETE /api/favourites` | 取消收藏 |
| 收藏 | `GET /api/favourites/check` | 检查收藏状态 |
| 分享 | `POST /api/share/create` | 创建分享 |
| 分享 | `GET /api/share/list` | 我的分享列表 |
| 分享 | `GET /api/share/s/:code` | 访问分享 |
| 用户 | `GET /api/user/settings` | 获取设置 |
| 用户 | `PUT /api/user/settings` | 更新设置 |
| 用户 | `GET /api/user/apikeys` | API Key 列表 |
| 用户 | `POST /api/user/apikeys` | 创建 API Key |
| 管理 | `GET /api/admin/users` | 用户列表 |
| 管理 | `GET /api/admin/users/:id` | 用户详情 |
| 管理 | `POST /api/admin/users` | 创建用户 |
| 管理 | `PUT /api/admin/users/:id/role` | 修改角色 |
| 管理 | `PUT /api/admin/users/:id/ban` | 封禁/解封 |
| 管理 | `PUT /api/admin/users/:id/password` | 重置密码 |
| 管理 | `DELETE /api/admin/users/:id` | 删除用户 |

## 🛠️ 技术栈

**前端:**
- Vue 3 (Composition API)
- TypeScript
- Tailwind CSS 4
- Vue Router 4
- Pinia
- Fetch API

**后端:**
- Node.js
- Express
- TypeScript (tsx)
- better-sqlite3
- JWT (jsonwebtoken)
- js-yaml
- archiver (ZIP 打包)
- Upyun SDK

## 📄 许可证

MIT License
