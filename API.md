# VueFileManager API 文档

## 认证方式

### JWT Token
在请求头中添加：
```
Authorization: Bearer <token>
```

### API Key
在请求头中添加：
```
X-API-Key: <your-api-key>
```

---

## 认证 API `/api/auth`

### POST `/api/auth/register` — 注册
```json
// Request Body
{ "username": "string", "password": "string" }
// Response
{ "message": "注册成功", "token": "jwt-token", "user": { "id": 1, "username": "test", "role": "user" } }
```

### POST `/api/auth/login` — 登录
```json
// Request Body
{ "username": "string", "password": "string" }
// Response
{ "message": "登录成功", "token": "jwt-token", "user": { "id": 1, "username": "admin", "role": "admin" } }
```

### GET `/api/auth/me` — 当前用户信息（需认证）
```json
// Response
{ "user": { "id": 1, "username": "admin", "role": "admin", "registerIp": "127.0.0.1", "lastLoginIp": "127.0.0.1", "settings": { ... } } }
```

---

## 文件 API `/api/files`（需认证或 API Key）

> 所有文件操作均支持 `poolId` 参数（query 或 body），指定操作的存储池。不传则使用默认存储池。

### GET `/api/files/list?path=&poolId=` — 文件列表
权限：`read`
```json
// Response
{ "files": [{ "name": "file.txt", "type": "file", "size": 1024, "modified": "2024-01-01T00:00:00Z", "path": "file.txt" }] }
```

### GET `/api/files/info?path=&poolId=` — 文件信息
权限：`read`
```json
// Response
{ "info": { "name": "file.txt", "type": "file", "size": 1024, "modified": "2024-01-01T00:00:00Z", "path": "file.txt" } }
```

### POST `/api/files/upload?path=&poolId=` — 上传文件
权限：`write`
```
Content-Type: multipart/form-data
Form Field: file
```
```json
// Response
{ "message": "上传成功", "path": "dir/file.txt", "poolId": 1, "storageType": "local" }
```

### GET `/api/files/download?path=&poolId=` — 下载文件
权限：`read`
```
Response: 文件流（Content-Disposition: attachment）
```

### GET `/api/files/preview?path=&poolId=` — 预览文件
权限：`read`
```
Response: 文件流（对应 MIME 类型，浏览器可直接显示）
支持：图片/视频/音频/PDF/文本/代码
```

### DELETE `/api/files/delete?path=&poolId=` — 删除文件/文件夹
权限：`delete`
```json
// Response
{ "message": "删除成功" }
```

### POST `/api/files/mkdir` — 创建文件夹
权限：`write`
```json
// Request Body
{ "path": "new-folder", "poolId": 1 }
// Response
{ "message": "文件夹创建成功" }
```

### POST `/api/files/rename` — 重命名
权限：`write`
```json
// Request Body
{ "path": "old-name.txt", "newName": "new-name.txt", "poolId": 1 }
// Response
{ "message": "重命名成功" }
```

### POST `/api/files/move` — 移动文件/文件夹（同池）
权限：`write`
```json
// Request Body
{ "src": "source-path", "dest": "dest-path", "poolId": 1 }
// Response
{ "message": "移动成功" }
```

### POST `/api/files/copy` — 复制文件/文件夹（同池）
权限：`write`
```json
// Request Body
{ "src": "source-path", "dest": "dest-path", "poolId": 1 }
// Response
{ "message": "复制成功" }
```

### POST `/api/files/cross-copy` — 跨存储池复制
权限：`write`
```json
// Request Body
{ "srcPaths": ["file1.txt", "file2.txt"], "names": ["file1.txt", "file2.txt"], "srcPoolId": 1, "destPoolId": 2, "destPath": "target-dir" }
// Response
{ "message": "跨池复制完成", "errors": [] }
```

### POST `/api/files/cross-move` — 跨存储池移动
权限：`write`
```json
// Request Body
{ "srcPaths": ["file1.txt"], "names": ["file1.txt"], "srcPoolId": 1, "destPoolId": 2, "destPath": "target-dir" }
// Response
{ "message": "跨池移动完成", "errors": [] }
```

### POST `/api/files/batch-delete` — 批量删除
权限：`delete`
```json
// Request Body
{ "paths": ["file1.txt", "file2.txt"], "poolId": 1 }
// Response
{ "message": "批量删除完成", "errors": [] }
```

### POST `/api/files/batch-move` — 批量移动（同池）
权限：`write`
```json
// Request Body
{ "paths": ["file1.txt", "file2.txt"], "dest": "target-dir", "poolId": 1 }
// Response
{ "message": "批量移动完成", "errors": [] }
```

### GET `/api/files/search?q=&path=&poolId=` — 搜索文件
权限：`read`
```json
// Response
{ "files": [{ "name": "match.txt", "type": "file", "size": 1024, "modified": "...", "path": "path/to/match.txt" }] }
```

### POST `/api/files/download-zip` — ZIP 打包下载
权限：`read`
```json
// Request Body
{ "paths": ["file1.txt", "dir/"], "poolId": 1 }
// Response: ZIP 文件流
```

### POST `/api/files/remote-upload` — 远程 URL 上传
权限：`write`
```json
// Request Body
{ "url": "https://example.com/file.zip", "dirPath": "target-dir", "poolId": 1 }
// Response
{ "message": "远程上传成功", "path": "target-dir/file.zip", "poolId": 1, "storageType": "local" }
```

---

## 分享 API `/api/share`（部分需认证）

### POST `/api/share/create` — 创建分享链接（需认证）
```json
// Request Body
{
  "filePath": "path/to/file.txt",
  "fileType": "file",
  "password": "optional-password",
  "expiresIn": 24,          // 小时，可选
  "maxDownloads": 100,       // 可选
  "storagePoolId": 1         // 存储池 ID
}
// Response
{ "message": "分享链接创建成功", "shareCode": "abc123", "url": "/s/abc123" }
```

### GET `/api/share/list` — 我的分享列表（需认证）
```json
// Response
{ "shares": [{ "id": 1, "file_path": "file.txt", "share_code": "abc123", "password": null, "expires_at": null, "download_count": 0, "max_downloads": null }] }
```

### DELETE `/api/share/:id` — 删除分享（需认证）
```json
// Response
{ "message": "分享已删除" }
```

### GET `/api/share/s/:code` — 访问分享链接（公开）
```json
// 如果需要密码
{ "needPassword": true, "fileType": "file", "fileName": "file.txt", "owner": "username" }
// 如果不需要密码
{ "needPassword": false, "fileType": "file", "filePath": "file.txt", "fileName": "file.txt", "owner": "username", "shareCode": "abc123" }
```

### GET `/api/share/download/:code?password=` — 下载分享文件（公开）
```
Response: 文件流
```

### GET `/api/share/preview/:code?password=` — 预览分享文件（公开）
```
Response: 文件流（对应 MIME 类型）
```

---

## 用户设置 API `/api/user`（需认证）

### GET `/api/user/settings` — 获取设置
### PUT `/api/user/settings` — 更新设置
### GET `/api/user/apikeys` — API Key 列表
### POST `/api/user/apikeys` — 创建 API Key
### DELETE `/api/user/apikeys/:id` — 删除 API Key

---

## 管理 API `/api/admin`（需 admin 角色）

### GET `/api/admin/users` — 用户列表
### PUT `/api/admin/users/:id/role` — 修改用户角色
### DELETE `/api/admin/users/:id` — 删除用户

---

## 访客 API `/api/guest`（公开）

### GET `/api/guest` — 有访客分享的用户列表
```json
// Response
{ "users": [{ "username": "admin", "share_count": 3 }] }
```

### GET `/api/guest/:username/list` — 用户的访客分享文件夹列表
```json
// Response
{ "shares": [{ "id": 1, "folder_path": "photos", "label": "照片", "pool_name": "本地存储", "created_at": "2024-01-01" }] }
```

### GET `/api/guest/:username/:shareId/list?path=` — 访客文件列表
```json
// Response
{ "files": [{ "name": "file.txt", "type": "file", "size": 1024, "modified": "...", "path": "file.txt" }] }
```

### GET `/api/guest/:username/:shareId/download?path=` — 访客下载
```
Response: 文件流
```

## 访客分享管理 API `/api/user`（需认证）

### GET `/api/user/guest-shares` — 我的访客分享列表
```json
// Response
{ "shares": [{ "id": 1, "folder_path": "photos", "label": "照片", "pool_name": "本地存储", "created_at": "..." }] }
```

### POST `/api/user/guest-shares` — 创建访客分享
```json
// Request Body
{ "folderPath": "photos", "storagePoolId": 1, "label": "照片" }
// Response
{ "message": "访客分享创建成功" }
```

### DELETE `/api/user/guest-shares/:id` — 删除访客分享
```json
// Response
{ "message": "访客分享已删除" }
```

---

## API Key 权限

| 权限 | 说明 |
|------|------|
| `read` | 查看文件列表、下载、预览、搜索 |
| `write` | 上传、创建文件夹、重命名、移动、复制 |
| `delete` | 删除文件/文件夹 |

权限用逗号分隔，例如：`read,write,delete`

---

## curl 示例

```bash
# 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 列出文件（默认存储池）
curl -s http://localhost:3000/api/files/list \
  -H "Authorization: Bearer $TOKEN"

# 列出指定存储池的文件
curl -s "http://localhost:3000/api/files/list?poolId=2" \
  -H "Authorization: Bearer $TOKEN"

# 上传文件到指定存储池
curl -X POST "http://localhost:3000/api/files/upload?path=test&poolId=1" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./myfile.txt"

# 搜索文件
curl -s "http://localhost:3000/api/files/search?q=readme&poolId=1" \
  -H "Authorization: Bearer $TOKEN"

# 跨存储池复制
curl -X POST http://localhost:3000/api/files/cross-copy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"srcPaths":["file.txt"],"names":["file.txt"],"srcPoolId":1,"destPoolId":2,"destPath":""}'

# 创建分享
curl -X POST http://localhost:3000/api/share/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"myfile.txt","expiresIn":24,"storagePoolId":1}'

# 创建访客分享
curl -X POST http://localhost:3000/api/user/guest-shares \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folderPath":"photos","storagePoolId":1,"label":"照片"}'

# 用 API Key 访问
curl -s http://localhost:3000/api/files/list \
  -H "X-API-Key: vfm_your_api_key_here"
```
