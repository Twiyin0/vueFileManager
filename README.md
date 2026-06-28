[English](./README_en.md)

# VueFileManager

VueFileManager 是一个基于 Vue 3、Express 和 TypeScript 的文件管理系统，支持多存储池、访客分享、WebDAV、回收站、收藏、API Key、主题与插件发现、跨池共享挂载、后台离线下载、远程上传，以及前后端统一的运行时 i18n。

## 当前状态

- 版本：`2.0.0-beta.9`
- 前端：Vue 3 + Vite
- 后端：Express + TypeScript
- 运行时数据库：`sqlite`、`mysql`、`postgres`
- 存储后端：`local`、`upyun`、`ftp`、`s3`、`sftp`

## 核心功能

- 用户注册、登录、JWT 鉴权、API Key
- 管理员用户管理、配额控制、封禁与解封、手动验证
- 每用户多存储池管理
- 文件列表、上传、流式上传、断点续传、剪贴板粘贴上传（自动生成 16 位十六进制文件名）、下载、预览、搜索（支持 `//` 开头启用正则模式）、ZIP 批量下载
- 中等列表视图，支持基于服务端缩略图缓存的懒加载视频缩略图
- 跨存储池复制与移动
- 跨池共享挂载，可将多个存储池目录统一挂载到 `/share`
- 远程上传与后台离线下载任务，支持逗号分隔的多链接批量提交
- 文件目录支持按名称、修改时间、文件类型、大小进行升序或降序排序
- 回收站、收藏、访客文件夹分享与公开分享
- 支持基础认证、JWT、API Key 的 WebDAV
- 从 `plugins/` 目录发现主题与插件
- 前端界面语言来自 `public/i18n/`
- 后端运行时返回文案来自 `server/i18n/`，并以英文为兜底

## 跨池共享挂载

- 侧边栏提供独立的共享挂载工作区，根目录固定为 `/share`
- 在文件管理中可对文件夹执行“跨池挂载”，支持单个或批量挂载
- 挂载目标路径使用相对 `/share` 的目录，例如 `abc` 表示挂载到 `/share/abc`
- 如果多个来源目录在同一挂载目标下发生重名，系统会自动重命名为 `<源文件夹名称>_<存储池ID>`
- 支持创建和删除虚拟挂载目录
- 可通过 `/api/share-mounts/*` 获取共享挂载列表
- 认证后可直接通过 `/share/<path>` 访问共享挂载内容
- 共享挂载文件预览已使用和普通文件预览一致的媒体缓存策略

## 远程上传与离线任务

- 文件管理支持直接远程上传和服务端后台离线下载
- 输入框支持一个或多个远程链接，多个链接之间使用逗号分隔
- 立即上传模式会立刻拉取远程资源并写入当前存储池
- 离线模式会创建后台任务，可在“离线任务”页面查看、取消和重试
- 出于 SSRF 防护，仅允许 `http` / `https` 链接，且会拒绝指向回环、内网、链路本地（含云元数据 `169.254.169.254`）等保留地址的目标，重定向的每一跳都会重新校验

## 安全说明

- **JWT 密钥**：若 `config.yml` 中 `server.jwt_secret` 为空或仍为内置默认占位值，服务启动时会自动生成随机密钥并写回 `config.yml`，避免使用公开的默认密钥被伪造 Token
- **密码哈希**：账户口令使用 `bcrypt` 存储；旧版无盐 MD5 哈希会在下次登录成功时自动升级为 bcrypt。`config.yml` 中的初始管理员口令兼容旧版 MD5，首次登录后同样会升级，建议部署后立即修改默认管理员密码
- **登录限流**：登录、注册、发送验证码接口按客户端 IP 限流，超过阈值返回 `429`
- **远程地址校验**：远程上传与离线下载会拦截指向内网/保留地址的链接（见上）
- **分享签名**：访客分享与公开分享链接的签名改用 HMAC-SHA256。升级后旧的分享直链需要在“我的分享”中重新复制
- **IP 白名单**：白名单模式下若校验过程出现内部错误，会拒绝请求（fail-closed），避免故障导致放行
- **响应安全头**：默认下发 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy: no-referrer`（避免直链中的访问令牌经 Referer 泄露）
- 生产环境务必修改默认管理员账号密码，并将服务置于 HTTPS 反向代理之后

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

## 开发

启动完整开发模式：

```bash
yarn dev
```

也可以分开启动前后端：

```bash
yarn dev:client
yarn dev:server
```

开发服务默认仅监听 `localhost`。如需让局域网设备访问前端开发服务，可显式传入 Vite 的 host 参数：

```bash
yarn dev --host 0.0.0.0
```

开发模式下，后台通过管理接口写回 `config.yml` 时会跳过一次多余的热重启，不再额外生成配置写入标记文件。

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
- `server.trusted_proxies`
  - 受信任反向代理 IP 列表
  - 只有请求直接来自这些代理时，服务端才会采信 `X-Forwarded-For`
  - 留空时会忽略代理头，直接使用 TCP 连接来源地址
- `log_level`
  - 日志级别
  - `1 = error`
  - `2 = info`
  - `3 = debug`
  - 默认值：`2`
- `database`
  - 运行时数据库配置，支持 `sqlite`、`mysql`、`postgres`
- `storage_pools`
  - 预配置存储池，新建用户会自动继承
  - 本地存储池可通过 `config.path` 挂载服务器本地目录，例如 `/mnt/usb`；留空时使用 `storage_root` 下按用户名隔离的目录
  - 也支持 `storages` 简写形式，例如 `{ name, type: local, path }`，启动时会归一化为 `storage_pools`

## 缩略图

- 缩略图缓存目录：`data/thumbnails/`
- 缩略图元数据表：`thumbnail_cache`
- 视频缩略图使用 `ffprobe` 和 `ffmpeg`，通过后台队列生成，不阻塞目录列表加载
- 支持的视频扩展名：`mp4`、`mkv`、`avi`、`mov`、`webm`、`ts`、`flv`
- 缓存键包含文件路径、修改时间和文件大小
- 优先生成 WebP，失败时回退到 JPG

管理员也可以在管理面板中修改：

- 上传大小限制
- 最大并发上传数
- 日志级别
- 数据库连接配置

## 语言与 i18n

- `config.yml` 不再保存界面语言
- `.env` 中的 `DEFAULT_LANGUAGE` 只在首次初始化 `user_settings.language` 时作为默认值使用
- 用户创建完成后，界面语言会保存到 `user_settings.language`
- 后续启动、登录和切换语言时，始终以当前账户保存的语言设置为准
- 修改语言不会重启前后端服务
- 旧版遗留的 `config.yml` 中 `language` 或 `default_language` 字段会被忽略，并在后续保存配置时移除
- 前端语言文件位于：
  - `public/i18n/zh-CN.yml`
  - `public/i18n/en-US.yml`
- 后端运行时语言文件位于：
  - `server/i18n/zh-cn.json`
  - `server/i18n/en-us.json`
- 后端接口返回优先按账户语言解析，其次参考请求头，最后回退到英文

`.env` 示例：

```env
DEFAULT_LANGUAGE=zh-CN
```

可选值：

- `zh-CN`
- `en-US`

新增文案时建议：

1. 先在 `public/i18n/zh-CN.yml` 添加中文键值。
2. 再在 `public/i18n/en-US.yml` 补齐对应英文。
3. 如果后端接口要返回新文案，再同步补齐 `server/i18n/zh-cn.json` 和 `server/i18n/en-us.json`。
4. 在 `ts` 和 `vue` 源文件中始终使用英文作为 fallback。

## 日志说明

- 日志目录：`data/log/`
- 日志文件按天写入
- 文件名格式：`year-month-day_number.log`
  - 示例：`2026-06-14_1.log`
- 默认情况下，同一天持续追加到当天编号文件，不再按小时或分钟拆分
- 日志内容固定使用英文输出，不走 i18n
- 日志级别由 `config.yml` 中的 `log_level` 控制
  - `1`：仅记录 `error`
  - `2`：记录 `error` 和 `info`
  - `3`：记录 `error`、`info` 和 `debug`

当前日志来源标签：

- `[api]`
- `[web]`
- `[webdav]`
- `[system]`

日志格式：

```text
[source][level]YYYY-MM-DD_HH:mm:ss.SSS(file.ts): message
```

## 数据库支持

后端已经通过统一适配层支持以下数据库：

- `sqlite`，通过 `sql.js`
- `mysql`，通过 `mysql2`
- `postgres`，通过 `pg`

业务数据会直接写入当前配置的运行时数据库。

### 切换数据库类型

1. 修改 `config.yml`
2. 如果是跨数据库切换，先迁移数据
3. 需要切换运行时连接时再重启服务

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

生产构建产物命令：

```bash
node dist-server/db-cli.js --target mysql --truncate
```

```bash
node dist-server/db-cli.js --target postgres --truncate
```

常用参数：

- `--source-sqlite /path/to/filemanager.db`
- `--target mysql|postgres`
- `--truncate`

## 脚本列表

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
server/i18n/          后端运行时语言文件
src/                  Vue 前端
plugins/              主题与功能插件
public/               对外文档与静态资源
public/i18n/          前端语言文件
scripts/              构建与迁移辅助脚本
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

- 本地存储按用户隔离，路径为 `storage_root/<username>/`
- 常见系统垃圾文件如 `._*`、`.DS_Store`、`.trash` 会在常规列表中被过滤
- 主题和插件的启停会更新 manifest，通常需要重启服务才能完全生效
