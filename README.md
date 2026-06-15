[English](./README_en.md)

# VueFileManager

VueFileManager 是一个基于 Vue 3、Express 和 TypeScript 的文件管理系统，支持多存储池、访客分享、WebDAV、回收站、收藏、API Key、主题和插件扩展，以及可切换的运行时数据库适配层。

## 核心功能

- 用户注册、登录、JWT 鉴权、API Key
- 管理员用户管理、配额控制、封禁与解封、手动验证
- 每用户多存储池管理
- 文件列表、上传、流式上传、断点续传、下载、预览
- 跨存储池复制与移动
- 跨池共享挂载，可将多个存储池目录统一挂载到 `/share`
- 远程上传与离线下载任务
- 回收站与收藏系统
- 分享链接与访客文件夹分享
- 支持 JWT、API Key 和基础认证的 WebDAV
- 从 `plugins/` 目录发现主题与插件
- 基于 `public/i18n/` 的中英文界面切换

## 跨池共享挂载

- 侧边栏提供独立的“跨池共享挂载”页面，根目录固定为 `/share`
- 在文件管理中可对文件夹执行“跨池挂载”，支持单个或批量挂载
- 挂载目标路径使用相对 `/share` 的目录，例如 `abc` 表示挂载到 `/share/abc`
- 如果多个来源目录在同一挂载目标下发生重名，系统会自动重命名为 `<源文件夹名称>_<存储池ID>`
- 支持创建虚拟挂载目录，也支持在跨池挂载页面中对整个挂载目录执行取消挂载
- 提供专用 API 列表接口，以及经过认证后的 `/share/<path>` 直接访问能力

## 运行环境要求

- Node.js `18+`
- 推荐 Node.js `20 LTS`
- CPU：至少 2 核
- 内存：至少 2 GB
- 可用磁盘：至少 2 GB，不含上传文件占用空间

## 安装

```bash
yarn install
```

## 开发环境部署

启动完整开发模式：

```bash
yarn dev
```

也可以分开启动前后端：

```bash
yarn dev:client
yarn dev:server
```

## 构建

```bash
yarn build
```

校验构建：

```bash
yarn build:check
```

## 生产环境部署

先在具备完整依赖的构建机上执行：

```bash
yarn install --immutable
yarn build
```

部署时需要带上的产物：

- `dist/`
- `dist-server/`
- `config.yml`
- `.env`
- `package.json`
- `yarn.lock`
- `.yarn/`
- `.yarnrc.yml`
- `public/`
- `plugins/`
- `uploads/`，如果使用本地存储
- `data/`，如果仍在使用 SQLite 或准备迁移数据库

在生产服务器上只安装生产依赖：

```bash
yarn workspaces focus --all --production
```

启动服务：

```bash
yarn start
```

等价命令：

```bash
node dist-server/index.js
```

生产环境运行不依赖 `vite`、`tsx`、`vue-tsc` 或 TypeScript 编译工具。

## 配置说明

主配置文件：`config.yml`

关键配置项：

- `upload_limit`
  - 单文件上传大小限制，单位 MB
- `max_concurrent_uploads`
  - 默认最大同时上传文件数
- `log_level`
  - 日志级别
  - `1 = error`
  - `2 = info`
  - `3 = debug`
  - 默认值：`2`
- `database`
  - 运行时数据库配置，支持 `sqlite`、`mysql`、`postgres`

管理员也可以在管理面板中修改：

- 上传大小限制
- 最大并发上传数
- 日志级别
- 数据库连接配置

## 日志说明

- 日志目录：`data/log/`
- 日志文件按天写入
- 文件名格式：`year-month-day_number.log`
  - 示例：`2026-06-14_1.log`
- 默认情况下，同一天持续追加到当天编号文件，不再按小时或分钟拆分
- 日志级别由 `config.yml` 中的 `log_level` 控制
  - `1`：仅记录 `error`
  - `2`：记录 `error` 和 `info`
  - `3`：记录 `error`、`info` 和 `debug`
- 日志内容固定使用英文输出，不走 i18n

当前日志来源标签：

- `[api]`
- `[web]`
- `[webdav]`
- `[system]`

日志格式：

```text
[source][level]YYYY-MM-DD_HH:mm:ss.SSS(file.ts): message
```

示例：

```text
[web][info]2026-06-14_16:17:18.234(upload-routes.ts): User Admin uploaded a file in poolID:#1 /test/text/test.txt
```

错误日志会额外包含：

- 错误名称
- 错误消息
- 堆栈信息
- 可用的上下文信息

## 语言设置说明

- `config.yml` 不再配置语言
- `.env` 中的 `DEFAULT_LANGUAGE` 只在首次初始化 `user_settings.language` 时作为默认值使用
- 用户创建完成后，界面语言会保存到 `user_settings.language`
- 后续启动、登录和切换语言时，始终以当前账户保存的语言设置为准
- 修改语言不会重启前后端服务
- 旧版遗留的 `config.yml` 中 `language` 或 `default_language` 字段会被忽略，并在后续保存配置时移除

`.env` 示例：

```env
DEFAULT_LANGUAGE=zh-CN
```

可选值：

- `zh-CN`
- `en-US`

如果是已有数据库升级：

- 系统会自动给 `user_settings` 增加 `language` 字段
- 旧用户在首次迁移时，如果语言为空，会写入 `.env` 中的 `DEFAULT_LANGUAGE`

## i18n 约定

- 语言文件目录：`public/i18n/`
- 当前内置语言：
  - `public/i18n/zh-CN.yml`
  - `public/i18n/en-US.yml`
- 页面中通过 `useI18n().t('key.path')` 调用
- 后端i18n在文件`service/server-i18n.ts`暂未开放外部yml配置
- 用户语言保存在账户设置中，而不是 `config.yml`

新增文案时建议：

1. 先在 `zh-CN.yml` 添加中文键值。
2. 再在 `en-US.yml` 补齐对应英文。
3. 页面中通过 `useI18n().t('key.path')` 调用。

## 数据库支持

后端已经通过统一适配层支持以下数据库：

- `sqlite`，通过 `sql.js`
- `mysql`，通过 `mysql2`
- `postgres`，通过 `pg`

业务数据会直接写入当前配置的运行时数据库。

### 切换数据库类型

1. 修改 `config.yml`
2. 如果是跨数据库切换，先迁移数据
3. 重启服务

管理端接口：

- `GET /api/admin/database`
- `PUT /api/admin/database`
- `POST /api/admin/database/test`

## 切换到 `sql.js` 前的 SQLite WAL 合并

如果旧部署目录中存在：

- `data/filemanager.db-wal`
- `data/filemanager.db-shm`

请先把 WAL 日志合并回主数据库，再切换到当前运行时。

停止旧服务后执行：

```bash
chmod +x migrate-sqlite-wal.sh
./migrate-sqlite-wal.sh
```

如果数据库路径不是默认值：

```bash
./migrate-sqlite-wal.sh /path/to/filemanager.db
```

在 WAL 还没有 checkpoint 完成之前，不要切换到 `sql.js` 运行时。

## 数据库迁移

可以把现有 SQLite 数据迁移到 MySQL 或 PostgreSQL。
