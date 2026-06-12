# VueFileManager API

Base URL examples:

- Development backend: `http://localhost:3000`
- API base: `http://localhost:3000/api`

## Authentication

### JWT

```http
Authorization: Bearer <token>
```

### API key

```http
X-API-Key: <key>
```

### WebDAV auth

Supported for `/dav`:

- Basic auth
- JWT bearer token
- API key
- query string testing with `?token=` or `?apiKey=`

## Auth routes

### `POST /api/auth/send-code`

Send email verification code when SMTP is enabled.

Request:

```json
{ "email": "user@example.com" }
```

### `POST /api/auth/register`

Request:

```json
{ "username": "user", "password": "secret123", "email": "user@example.com", "code": "123456" }
```

Notes:

- `email` and `code` are required only when SMTP registration is enabled
- password is stored as MD5 in current implementation

### `POST /api/auth/login`

Request:

```json
{ "username": "admin", "password": "admin" }
```

### `GET /api/auth/me`

Return current authenticated user and basic settings.

## File routes

All `/api/files/*` routes require JWT or API key unless noted.

Common permission model for API keys:

- `read`
- `write`
- `delete`

Most file routes accept `poolId` in query or body.

### `GET /api/files/list`

Query:

- `path`
- `poolId`

Behavior:

- if neither `path` nor `poolId` is provided, root can return storage pools as virtual folders
- junk files such as `._*`, `.DS_Store`, `.trash`, and temp upload files are filtered

### `GET /api/files/info`

Query:

- `path`
- `poolId`

### `GET /api/files/download`

Download file content.

### `GET /api/files/preview`

Preview file content.

Supported preview types include:

- images
- audio
- video
- PDF
- text and code files
- docx, xlsx, csv MIME mapping support

Notes:

- local audio/video supports `Range`
- preview responses use `ETag`

### `POST /api/files/upload`

Multipart upload.

Query/body:

- `path`
- `poolId`

Field:

- `file`

### `POST /api/files/upload-stream`

Streaming upload.

Headers:

- `X-File-Name`
- `X-Dir-Path`
- `X-Pool-Id`

### `POST /api/files/upload/init`

Initialize resumable upload.

Request:

```json
{
  "fileName": "large.zip",
  "fileSize": 104857600,
  "dirPath": "target-dir",
  "poolId": 1
}
```

### `PATCH /api/files/upload/:uploadId/chunk`

Upload chunk with `Content-Range`.

### `GET /api/files/upload/:uploadId/status`

Return resumable upload status.

### `POST /api/files/upload/:uploadId/complete`

Merge uploaded chunks and finalize file.

### `DELETE /api/files/upload/:uploadId`

Cancel and clean resumable upload cache.

### `POST /api/files/write`

Write text file content.

Request:

```json
{ "path": "notes.txt", "content": "hello", "poolId": 1 }
```

Notes:

- request content must be a string
- 10 MB limit
- 30 second timeout guard

### `POST /api/files/mkdir`

### `POST /api/files/rename`

### `POST /api/files/move`

### `POST /api/files/copy`

### `POST /api/files/cross-copy`

Request:

```json
{
  "srcPaths": ["a.txt"],
  "names": ["a.txt"],
  "srcPoolId": 1,
  "destPoolId": 2,
  "destPath": ""
}
```

### `POST /api/files/cross-move`

### `DELETE /api/files/delete`

### `POST /api/files/delete`

Delete to recycle bin by default. Use `permanent: true` for permanent delete.

### `POST /api/files/batch-delete`

### `POST /api/files/batch-move`

### `GET /api/files/search`

Query:

- `q`
- `path`
- `poolId`

### `POST /api/files/download-zip`

### `POST /api/files/remote-upload`

Create upload from a remote URL and save directly into storage.

### `POST /api/files/offline-download`

Create server-side offline download task.

### `GET /api/files/offline-download/tasks`

### `POST /api/files/offline-download/tasks/:id/cancel`

### `POST /api/files/offline-download/tasks/:id/retry`

### `POST /api/files/offline-download/tasks/clear-finished`

### `GET /api/files/storage-stats`

JWT only.

## Storage pool routes

JWT required.

### `GET /api/storage-pools`

Return user pools with masked secrets.

For local pools, response includes `resolvedPath`.

### `POST /api/storage-pools`

Supported `storageType` values:

- `local`
- `upyun`
- `ftp`
- `s3`
- `sftp`

### `PUT /api/storage-pools/:id`

### `DELETE /api/storage-pools/:id`

Cannot delete default pool.

### `POST /api/storage-pools/batch-delete`

### `POST /api/storage-pools/:id/set-default`

### `POST /api/storage-pools/:id/test`

Tests connectivity for the current pool config.

## Trash routes

JWT required.

- `GET /api/trash`
- `POST /api/trash/:id/restore`
- `DELETE /api/trash/:id`
- `DELETE /api/trash`

## Favourites routes

JWT required.

- `GET /api/favourites`
- `POST /api/favourites`
- `DELETE /api/favourites`
- `GET /api/favourites/check`

## Share routes

### `POST /api/share/create`

JWT required.

Request:

```json
{
  "filePath": "docs/file.txt",
  "fileType": "file",
  "password": "optional",
  "expiresIn": 24,
  "maxDownloads": 100,
  "storagePoolId": 1
}
```

Response includes:

- `shareCode`
- `signKey`
- `url`
- `signUrl`

### `GET /api/share/list`

JWT required.

### `DELETE /api/share/:id`

JWT required.

### `GET /api/share/s/:code`

Public metadata lookup.

### `GET /api/share/list/:code`

Public folder share listing.

Requires:

- `sign`
- `t`
- optional `password`

### `GET /api/share/download/:code`

Public download with sign verification.

### `GET /api/share/preview/:code`

Public preview with sign verification.

Share sign algorithm in current backend:

1. `hash = md5(username + signKey)`
2. `sign = hash.slice(4, 12) + timestamp`
3. query params: `sign` and `t`

## User routes

JWT required.

- `GET /api/user/info`
- `GET /api/user/settings`
- `PUT /api/user/settings`
- `GET /api/user/apikeys`
- `POST /api/user/apikeys`
- `DELETE /api/user/apikeys/:id`
- `GET /api/user/guest-shares`
- `POST /api/user/guest-shares`
- `PUT /api/user/guest-shares/:id`
- `DELETE /api/user/guest-shares/:id`

Notes:

- guest share default permission is `read`
- normalized guest permission model is `read`, `write`, `edit`, `delete`
- alias compatibility still exists for `preview`, `download`, `upload`, `rename`

## Admin routes

Admin JWT required.

### User management

- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id/role`
- `PUT /api/admin/users/:id/ban`
- `PUT /api/admin/users/:id/password`
- `DELETE /api/admin/users/:id`
- `PUT /api/admin/users/:id/quota`
- `PUT /api/admin/users/:id/verify`

### IP list management

- `GET /api/admin/ip-blacklist`
- `POST /api/admin/ip-blacklist`
- `DELETE /api/admin/ip-blacklist/:id`
- `GET /api/admin/ip-list/mode`
- `PUT /api/admin/ip-list/mode`

### System management

- `GET /api/admin/upload-limit`
- `PUT /api/admin/upload-limit`
- `GET /api/admin/database`
- `PUT /api/admin/database`
- `POST /api/admin/database/test`

## Guest routes

Public routes under `/api/guest`.

- `GET /api/guest`
- `GET /api/guest/:username/list`
- `GET /api/guest/:username/:shareId/list`
- `GET /api/guest/:username/:shareId/preview`
- `GET /api/guest/:username/:shareId/download`
- `POST /api/guest/:username/:shareId/upload`
- `POST /api/guest/:username/:shareId/write`
- `POST /api/guest/:username/:shareId/delete`
- `POST /api/guest/:username/:shareId/mkdir`
- `POST /api/guest/:username/:shareId/rename`

Guest permissions:

- `read`
- `write`
- `edit`
- `delete`

Alias handling:

- `read` covers `preview`, `download`
- `write` covers `upload`
- `edit` covers `rename`

## Public file route

### `GET /f/:username/*`

Legacy public file access route.

## Public platform routes

- `GET /api/site-config`
- `GET /api/themes/styles`
- `GET /api/themes/list`
- `PUT /api/themes/:name/toggle`
- `GET /api/plugins/list`
- `PUT /api/plugins/:name/toggle`

Notes:

- toggle routes currently verify JWT token presence and validity
- these routes do not currently enforce admin role in code

## WebDAV

Mounted at `/dav`.

Recommended URLs:

- default root: `/dav`
- specific pool: `/dav/pool/:id`

Supported methods include:

- `OPTIONS`
- `HEAD`
- `PROPFIND`
- `GET`
- `PUT`
- `DELETE`
- `MKCOL`
- `MOVE`

## Error shape

Most errors return:

```json
{ "error": "message" }
```

## Common status codes

- `200` success
- `400` bad request
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` conflict
- `410` expired or exceeded
- `413` payload too large
- `499` client cancelled upload
- `500` server error
