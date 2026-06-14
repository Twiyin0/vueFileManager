[English](./README_en.md)

# VueFileManager

VueFileManager 是一个基于 Vue 3、Express 和 TypeScript 的文件管理系统，支持多存储池、访客分享、WebDAV、回收站、收藏、API Key、主题和插件扩展，以及可切换的运行时数据库适配层。

## 当前状态

- 版本：`2.0.0-beta.1`
- 前端：Vue 3 + Vite
- 后端：Express + TypeScript
- 运行时数据库：`sqlite`、`mysql`、`postgres`
- 存储后端：`local`、`upyun`、`ftp`、`s3`、`sftp`

## 核心功能

- 用户注册、登录、JWT 鉴权、API Key
- 管理员用户管理、配额控制、封禁与解封、手动验证
- 每用户多存储池管理
- 文件列表、上传、流式上传、断点续传、下载、预览
- 跨存储池复制与移动
- 远程上传与离线下载任务
- 回收站与收藏系统
- 分享链接与访客文件夹分享
- 支持 JWT、API Key 和基础认证的 WebDAV
- 从 `plugins/` 目录发现主题与插件
- 基于 `public/i18n/` 的中英文界面切换

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

- `language`
  - 可选值：`zh-CN`、`en-US`
  - 默认值：`zh-CN`
  - 影响站点默认界面语言
- `upload_limit`
  - 单文件上传大小限制，单位 MB
- `max_concurrent_uploads`
  - 默认最大同时上传文件数
- `database`
  - 运行时数据库配置，支持 `sqlite`、`mysql`、`postgres`

管理员也可以在管理面板中修改：

- 默认语言
- 上传大小限制
- 最大并发上传数
- 数据库连接配置

## i18n 约定

- 语言文件目录：`public/i18n/`
- 当前内置语言：
  - `public/i18n/zh-CN.yml`
  - `public/i18n/en-US.yml`
- 默认语言来源：
  - 优先读取服务端 `/api/site-config`
  - 服务端值来自 `config.yml` 中的 `language`
- 管理员在管理面板修改语言后，会写回 `config.yml`

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

开发环境命令：

```bash
yarn migrate:db --target mysql --truncate
```

```bash
yarn migrate:db --target postgres --truncate
```

构建后的生产命令：

```bash
node dist-server/db-cli.js --target mysql --truncate
```

```bash
node dist-server/db-cli.js --target postgres --truncate
```

可用参数：

- `--source-sqlite /path/to/filemanager.db`
- `--target mysql|postgres`
- `--truncate`

迁移的数据表：

- `users`
- `user_settings`
- `storage_pools`
- `api_keys`
- `shares`
- `trash`
- `favourites`
- `guest_shares`
- `ip_blacklist`
- `ip_whitelist`
- `ip_list_config`
- `verification_codes`
- `offline_download_tasks`

说明：

- 主键会尽量保留
- 目标数据库结构会在导入前自动创建
- 上传文件本身不存放在数据库中
- 切换时请保持 `uploads/` 和外部存储配置不变

## 常用脚本

- `yarn dev`
- `yarn dev:client`
- `yarn dev:server`
- `yarn build`
- `yarn build:server`
- `yarn build:client`
- `yarn build:check`
- `yarn migrate:db`
- `yarn migrate:db:prod`
- `yarn start`

## 项目结构

```text
server/               Express 后端
src/                  Vue 前端
plugins/              主题与功能插件
public/               公共文档与静态资源
public/i18n/          语言文件
scripts/              构建与迁移脚本
dist/                 前端构建产物
dist-server/          后端构建产物
data/                 SQLite 数据目录
uploads/              本地存储根目录
```

## 相关文档

- [API 文档](./public/API.md)
- [插件文档](./public/Plugins.md)
- [主题文档](./public/Themes.md)

## 备注

- 本地存储会按用户隔离到 `storage_root/<username>/`
- `._*`、`.DS_Store`、`.trash` 等系统垃圾文件会从常规文件列表中过滤
- 主题和插件的开关会修改清单文件，通常需要重启服务后才能完整生效
