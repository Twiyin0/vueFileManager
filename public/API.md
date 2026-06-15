[English](./API_en.md)

# VueFileManager API 文档

基础地址示例：

- 开发后端：`http://localhost:3000`
- API 基础路径：`http://localhost:3000/api`

## 返回语言

- 后端接口返回使用运行时 i18n
- 服务端解析语言顺序为：
  1. 当前账户保存的语言
  2. 请求头 `Accept-Language`
  3. 英文兜底
- 前端语言文件位于 `public/i18n/`
- 后端运行时语言文件位于 `server/i18n/`

## 认证方式

### JWT

```http
Authorization: Bearer <token>
```

### API Key

```http
X-API-Key: <key>
```

### 查询参数辅助认证

适合浏览器测试共享访问类接口：

- `?token=<jwt>`
- `?apiKey=<key>`

### WebDAV 认证

适用于 `/dav`：

- Basic Auth
- JWT Bearer Token
- API Key

## 公开接口

### `GET /api/site-config`

返回公开站点配置：

- `icp_beian`
- `police_beian`
- `smtp_enabled`
- `themes_enabled`
- `plugins_enabled`
- `webdav_enabled`

### `GET /api/themes/styles`

返回当前启用主题的样式列表。

### `GET /api/themes/list`

返回所有发现到的主题清单。

### `GET /api/plugins/list`

返回所有发现到的插件清单。

## 认证接口

### `POST /api/auth/send-code`

在启用 SMTP 时发送邮箱验证码。

请求体：

```json
{ "email": "user@example.com" }
```

### `POST /api/auth/register`

请求体：

```json
{ "username": "user", "password": "secret123", "email": "user@example.com", "code": "123456" }
```

说明：

- 只有在启用 SMTP 注册时才要求 `email` 和 `code`
- 当前实现中的密码仍以 MD5 存储
- 新用户首次初始化时会继承 `.env` 中的默认语言

### `POST /api/auth/login`

请求体：

```json
{ "username": "admin", "password": "admin" }
```

### `POST /api/auth/logout`

退出当前登录会话。

### `GET /api/auth/me`

返回当前登录用户和基础设置。

## 文件接口

除非特别说明，所有 `/api/files/*` 接口都要求 JWT 或 API Key。

API Key 的通用权限模型：

- `read`
- `write`
- `delete`

多数文件接口都支持在 query 或 body 中传入 `poolId`。

### `GET /api/files/list`

查询参数：

- `path`
- `poolId`

说明：

- 当 `path` 和 `poolId` 都不传时，会返回虚拟存储池目录列表
- 常规文件项会附带 `directUrl`、`fileUrl` 等直链字段

### `GET /api/files/info`

返回单个文件或目录的元数据。

### `POST /api/files/upload`

普通表单上传接口。

常用表单字段：

- `path`
- `poolId`

### `POST /api/files/upload-stream`

大文件流式上传接口。

### `POST /api/files/upload/init`

初始化断点续传任务。

### `GET /api/files/upload/:uploadId/status`

获取断点续传状态。

### `POST /api/files/upload/:uploadId/complete`

完成断点续传任务。

### `DELETE /api/files/upload/:uploadId`

取消并清理断点续传任务。

### `POST /api/files/write`

写回文本文件内容。

请求体：

```json
{ "path": "/note.txt", "content": "hello", "poolId": 1 }
```

### `POST /api/files/mkdir`

创建目录。

### `POST /api/files/rename`

重命名文件或目录。

### `POST /api/files/move`

在同一存储池内移动文件或目录。

### `POST /api/files/copy`

在同一存储池内复制文件或目录。

### `POST /api/files/batch-move`

批量移动多个项目到目标目录。

### `POST /api/files/cross-copy`

跨存储池复制文件或目录。

### `POST /api/files/cross-move`

跨存储池移动文件或目录。

### `DELETE /api/files/delete`

删除单个文件或目录。

### `POST /api/files/delete`

为不方便发送 `DELETE Body` 的客户端提供的删除等价接口。

### `POST /api/files/batch-delete`

批量删除多个项目。

### `GET /api/files/search`

查询参数：

- `q`
- `path`
- `poolId`

### `GET /api/files/download`

下载单个文件。

### `POST /api/files/download-zip`

将多个文件打包为 ZIP 下载。

请求体：

```json
{ "paths": ["/a.txt", "/b.txt"], "poolId": 1 }
```

### `GET /api/files/preview`

预览文件内容。

说明：

- 文本响应不做缓存
- 二进制预览响应带 `ETag`
- 音视频预览支持 `Range`
- 可命中的音视频预览会使用服务端缓存文件

### `GET /api/files/storage-stats`

返回所选存储池的递归统计信息。

## 远程上传与离线下载

以下接口都要求 JWT 或具备 `write` 权限的 API Key。

### `POST /api/files/remote-upload`

将一个或多个远程文件直接写入当前目录。

请求体示例：

```json
{ "url": "https://example.com/file-a.zip", "dirPath": "demo", "poolId": 1 }
```

```json
{ "urls": ["https://example.com/a.zip", "https://example.com/b.zip"], "dirPath": "demo", "poolId": 1 }
```

```json
{ "url": "https://example.com/a.zip, https://example.com/b.zip", "dirPath": "demo", "poolId": 1 }
```

返回说明：

- `count` 表示成功上传数量
- `files` 返回成功文件的元数据和直链
- 如果批量任务部分成功，`errors` 会返回逐链接失败信息

### `POST /api/files/offline-download`

创建一个或多个后台离线下载任务。

请求体支持与远程上传相同的 `url` / `urls` / 逗号分隔格式。

### `GET /api/files/offline-download/tasks`

返回当前用户的离线下载任务列表。

### `POST /api/files/offline-download/tasks/:id/cancel`

取消单个离线任务。

### `POST /api/files/offline-download/tasks/:id/retry`

重试单个失败或已取消任务。

### `POST /api/files/offline-download/tasks/clear-finished`

清理当前用户已完成任务。

## 跨池共享挂载接口

除非特别说明，所有 `/api/share-mounts/*` 接口都要求 JWT 或 API Key。列表接口支持 API Key，挂载和取消挂载管理接口要求登录用户会话。

### `GET /api/share-mounts/list`

查询参数：

- `path`
- `showAll`

说明：

- 默认返回当前跨池挂载路径下的文件/文件夹列表
- `path` 使用相对 `/share` 的路径
- 当 `showAll=true` 时，接口返回自动化场景所需的扁平文件列表格式

默认返回示例：

```json
{
  "files": [
    {
      "name": "test_2",
      "type": "folder",
      "path": "abc/test_2",
      "mountId": 3
    }
  ]
}
```

`showAll=true` 返回示例：

```json
{
  "file": [
    {
      "fileName": "demo.txt",
      "filePath": "abc/test_2/demo.txt",
      "fileDirect": "/share/abc/test_2/demo.txt?apiKey=***"
    }
  ]
}
```

### `GET /api/share-mounts/directories`

返回当前用户已创建的挂载目录列表。

返回示例：

```json
{ "directories": ["", "abc", "abc/nested"] }
```

说明：

- 空字符串 `""` 表示 `/share` 根目录

### `POST /api/share-mounts/directories`

创建虚拟挂载目录。

请求体：

```json
{ "path": "abc" }
```

### `POST /api/share-mounts/mount`

将一个或多个来源文件夹挂载到目标目录。

请求体：

```json
{
  "targetPath": "abc",
  "items": [
    { "sourcePoolId": 1, "sourcePath": "/alist/test" },
    { "sourcePoolId": 2, "sourcePath": "/alist/test" }
  ]
}
```

说明：

- `targetPath` 使用相对 `/share` 的路径
- 仅支持挂载文件夹
- 如果同一目标目录下发生名称冲突，系统会自动改名为 `<源文件夹名称>_<存储池ID>`

### `POST /api/share-mounts/unmount`

支持两种请求方式：

1. 取消单个挂载项：

```json
{ "mountId": 3 }
```

2. 删除虚拟挂载目录：

```json
{ "path": "abc" }
```

说明：

- 传 `mountId` 时只移除单个挂载项
- 传 `path` 时会递归移除该挂载目录及其子目录下的挂载项和虚拟目录

## 跨池共享直链访问

### `GET /share`

### `GET /share/*`

说明：

- 用于直接访问跨池共享挂载目录和文件
- 需要 JWT 或 API Key 认证
- 浏览器测试时可使用 `?token=` 或 `?apiKey=` 查询参数
- 当路径指向目录时，返回 `{ files, path }`
- 当路径指向文件时，默认以内联预览方式返回文件内容
- 追加 `?download=true` 时返回下载
- 音视频预览支持缓存和 `Range` 请求

示例：

- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>`
- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>&download=true`

## 用户接口

### `GET /api/user/info`

返回当前用户资料、存储池列表、空间统计和面板计数。

### `GET /api/user/settings`

返回当前用户设置，包括：

- `guestEnabled`
- `guestPath`
- `theme`
- `language`
- `uploadConcurrency`
- `serverDefaultUploadConcurrency`

### `PUT /api/user/settings`

更新当前用户设置。

### `GET /api/user/apikeys`

返回当前用户的 API Key 列表。

### `POST /api/user/apikeys`

创建一个 API Key。

### `DELETE /api/user/apikeys/:id`

删除一个 API Key。

### `GET /api/user/guest-shares`

返回当前用户创建的访客文件夹分享列表。

### `POST /api/user/guest-shares`

创建一个访客文件夹分享。

### `PUT /api/user/guest-shares/:id`

更新一个访客文件夹分享。

### `DELETE /api/user/guest-shares/:id`

删除一个访客文件夹分享。

## 管理接口

所有 `/api/admin/*` 接口都要求管理员 JWT。

### `GET /api/admin/upload-limit`

返回系统设置：

- `upload_limit`
- `max_concurrent_uploads`
- `log_level`

### `PUT /api/admin/upload-limit`

更新系统设置：

```json
{
  "upload_limit": 100,
  "max_concurrent_uploads": 3,
  "log_level": 2
}
```

### `GET /api/admin/database`

返回数据库配置和当前运行状态。

说明：

- MySQL 和 PostgreSQL 的已配置密码会以 `******` 掩码返回

### `PUT /api/admin/database`

将数据库配置写回 `config.yml`。

### `POST /api/admin/database/test`

测试数据库连接，不会强制切换当前运行时连接。

### `GET /api/admin/users`

返回用户列表及存储用量统计。

### `GET /api/admin/users/:id`

返回用户详情，包括：

- 基础信息
- 访客设置
- 存储池
- 回收站 / 收藏 / 分享 / API Key 统计
- 存储配额和用量

### `POST /api/admin/users`

创建用户。

### `PUT /api/admin/users/:id/role`

修改角色。

### `PUT /api/admin/users/:id/ban`

封禁或解封用户。

### `PUT /api/admin/users/:id/password`

重置用户密码。

### `PUT /api/admin/users/:id/quota`

修改用户存储配额。

### `PUT /api/admin/users/:id/verify`

手动验证用户。

### `DELETE /api/admin/users/:id`

删除用户。

### `GET /api/admin/ip-blacklist`

返回当前 IP 条目列表。

### `POST /api/admin/ip-blacklist`

添加 IP 条目。

### `DELETE /api/admin/ip-blacklist/:id`

删除 IP 条目。

### `GET /api/admin/ip-list/mode`

返回当前 IP 控制模式：`blacklist` 或 `whitelist`。

### `PUT /api/admin/ip-list/mode`

切换 IP 控制模式。

## WebDAV

WebDAV 入口示例：

- `http://127.0.0.1:3000/dav/pool/1`

支持认证：

- Basic Auth
- JWT
- API Key

说明：

- Windows 资源管理器对 WebDAV 的兼容性更严格
- 如果是 HTTP 明文访问，Windows 客户端通常需要放宽 `BasicAuthLevel`
- macOS Finder 与 Windows Explorer 的请求细节不同，服务端兼容逻辑需要同时考虑两端
