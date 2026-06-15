[English](./API_en.md)

# VueFileManager API 文档

基础地址示例：

- 开发后端：`http://localhost:3000`
- API 基础路径：`http://localhost:3000/api`

## 认证方式

### JWT

```http
Authorization: Bearer <token>
```

### API Key

```http
X-API-Key: <key>
```

### WebDAV 认证

适用于 `/dav`：

- Basic Auth
- JWT Bearer Token
- API Key
- 也支持通过 `?token=` 或 `?apiKey=` 查询参数测试

## 公开接口

### `GET /api/site-config`

返回站点基础配置：

- `language`
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

### `POST /api/auth/login`

请求体：

```json
{ "username": "admin", "password": "admin" }
```

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

用于列出目录内容。

### `POST /api/files/upload`

表单上传接口，支持普通上传和前端并发上传。

常用参数：

- `path`
- `poolId`

### `POST /api/files/mkdir`

创建目录。

请求体：

```json
{ "path": "/example", "poolId": 1 }
```

### `POST /api/files/rename`

重命名文件或目录。

### `POST /api/files/move`

移动文件或目录。

### `POST /api/files/copy`

复制文件或目录，支持跨存储池。

### `DELETE /api/files/delete`

删除单个文件或目录。

### `POST /api/files/batch-delete`

批量删除。

### `GET /api/files/download`

下载文件。

### `GET /api/files/preview`

预览文件内容，文本、图片、音频、视频等前端预览都会依赖这个接口。

### `POST /api/files/write`

写回文本文件内容，用于文本预览编辑保存。

请求体：

```json
{ "path": "/note.txt", "content": "hello", "poolId": 1 }
```

## 跨池共享挂载接口

除非特别说明，所有 `/api/share-mounts/*` 接口都要求 JWT 或 API Key，且 API Key 需要 `read` 或对应写权限。

### `GET /api/share-mounts/list`

查询参数：

- `path`
- `showAll`

说明：

- 默认返回当前跨池挂载路径下的文件/文件夹列表
- `path` 使用相对 `/share` 的路径
- 当 `showAll=true` 时，返回扁平化后的全部文件列表

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

创建挂载目录。

请求体：

```json
{ "path": "abc" }
```

说明：

- 上例会创建 `/share/abc`

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

取消挂载。

支持两种请求体：

1. 按具体挂载项取消：

```json
{ "mountId": 3 }
```

2. 按虚拟挂载目录取消：

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

示例：

- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>`
- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>&download=true`

## 用户设置接口

### `GET /api/user/settings`

返回当前用户设置，包括：

- `guestEnabled`
- `guestPath`
- `theme`
- `uploadConcurrency`

### `PUT /api/user/settings`

更新当前用户设置。

## 管理接口

所有 `/api/admin/*` 接口都要求管理员 JWT。

### `GET /api/admin/upload-limit`

返回系统设置：

- `upload_limit`
- `max_concurrent_uploads`
- `language`

### `PUT /api/admin/upload-limit`

更新系统设置：

```json
{
  "upload_limit": 100,
  "max_concurrent_uploads": 3,
  "language": "zh-CN"
}
```

### `GET /api/admin/database`

返回数据库配置和当前运行状态。

### `PUT /api/admin/database`

保存数据库配置。

### `POST /api/admin/database/test`

测试数据库连接。

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

### `GET /api/admin/ip-list/mode`

返回当前 IP 控制模式：`blacklist` 或 `whitelist`。

### `PUT /api/admin/ip-list/mode`

切换 IP 控制模式。

### `POST /api/admin/ip-blacklist`

添加 IP 条目。

### `DELETE /api/admin/ip-blacklist/:id`

删除 IP 条目。

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
