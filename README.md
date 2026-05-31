# VueFileManager

一个类似 AList 的网页文件管理系统，支持本地存储和 Upyun 云存储。

## ✨ 功能特性

### 文件管理
- 📁 文件浏览、上传、下载、删除
- 📝 重命名、移动、复制
- 🔍 文件搜索（递归）
- 📦 创建文件夹
- 👁️ 文件预览（图片/视频/音频/PDF/代码）

### 用户系统
- 👤 用户注册/登录
- 🔐 JWT + API Key 双模式认证
- 👑 管理员/普通用户角色
- 📊 记录注册IP和最后登录IP

### 权限系统
- 🔑 API Key 权限管理（read/write/delete）
- 🚪 访客模式（可配置可访问路径）
- 🛡️ 管理员面板

### 分享系统
- 🔗 生成分享链接
- 🔒 密码保护
- ⏰ 过期时间设置
- 📉 下载次数限制

### 存储系统
- 💾 本地存储
- ☁️ Upyun 云存储
- 🔄 用户独立配置切换

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
  password: 21232f297a57a5a743894a0e4a801fc3  # MD5("admin")

server:
  port: 3000
  jwt_secret: your-secret-key

storage:
  default_type: local
  local_path: ./uploads
```

> 💡 密码使用 MD5 值，可通过 `echo -n "your-password" | md5` 计算

**2. Upyun 配置 (.env)**

如果使用 Upyun 存储，复制并编辑 `.env` 文件：
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
├── server/                     # Express 后端
│   ├── index.ts               # 入口
│   ├── config.ts              # 配置加载
│   ├── db.ts                  # SQLite 数据库
│   ├── middleware/            # 中间件
│   │   ├── auth.ts           # JWT 认证
│   │   └── apikey.ts         # API Key 认证
│   ├── routes/               # API 路由
│   │   ├── auth.ts           # 认证
│   │   ├── files.ts          # 文件操作
│   │   ├── user.ts           # 用户设置
│   │   ├── admin.ts          # 管理
│   │   ├── guest.ts          # 访客
│   │   └── share.ts          # 分享
│   └── services/             # 存储服务
│       ├── storage.ts        # 接口定义
│       ├── local.ts          # 本地存储
│       ├── upyun.ts          # Upyun 存储
│       └── factory.ts        # 工厂模式
├── src/                        # Vue 前端
│   ├── main.ts               # 入口
│   ├── router/               # 路由
│   ├── stores/               # 状态管理
│   ├── api/                  # API 封装
│   ├── components/           # 组件
│   └── views/                # 页面
├── test/                       # 测试
│   └── workflows.ts          # API 全流程测试
├── API.md                      # API 文档
└── README.md                   # 项目说明
```

## 🧪 测试

```bash
# 启动服务
npm run dev:server

# 运行 API 测试（另开终端）
npx tsx test/workflows.ts
```

测试覆盖：
- ✅ 认证 API（注册/登录/用户信息）
- ✅ 文件 API（列表/创建/重命名/移动/复制/搜索/删除）
- ✅ API Key API（创建/列表/认证）
- ✅ 用户设置 API（获取/更新）
- ✅ 访客 API（用户列表/文件列表）
- ✅ 分享 API（创建/列表/访问/删除）
- ✅ 管理 API（用户列表/修改角色/权限控制）

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
| 文件 | `GET /api/files/list` | 文件列表 |
| 文件 | `POST /api/files/upload` | 上传 |
| 文件 | `GET /api/files/download` | 下载 |
| 文件 | `GET /api/files/preview` | 预览 |
| 文件 | `POST /api/files/rename` | 重命名 |
| 文件 | `POST /api/files/move` | 移动 |
| 文件 | `POST /api/files/copy` | 复制 |
| 文件 | `GET /api/files/search` | 搜索 |
| 分享 | `POST /api/share/create` | 创建分享 |
| 分享 | `GET /api/share/s/:code` | 访问分享 |
| 用户 | `GET /api/user/settings` | 获取设置 |
| 用户 | `PUT /api/user/settings` | 更新设置 |
| 管理 | `GET /api/admin/users` | 用户列表 |

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
- TypeScript
- better-sqlite3
- JWT (jsonwebtoken)
- js-yaml
- Upyun SDK

## 📝 配置说明

### config.yml

```yaml
# 管理员配置
admin:
  username: admin
  password: 21232f297a57a5a743894a0e4a801fc3  # MD5 值

# 服务器配置
server:
  port: 3000
  jwt_secret: your-jwt-secret

# 存储配置
storage:
  default_type: local    # local 或 upyun
  local_path: ./uploads
```

### 用户独立配置
每个用户可以在设置页面独立配置：
- 存储类型（本地/Upyun）
- 存储路径
- Upyun 凭证
- 访客模式
- 主题偏好

## 📄 许可证

MIT License
