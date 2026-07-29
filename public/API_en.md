[中文](./API.md)

# VueFileManager API Docs

Base URL examples:

- Development backend: `http://localhost:3000`
- API base path: `http://localhost:3000/api`

## Response Language

- Backend responses use runtime i18n
- The server resolves language in this order:
  1. current account language
  2. `Accept-Language` request header
  3. English fallback
- Frontend locale files live in `public/i18n/`
- Backend runtime locale files live in `server/i18n/`

## Authentication

### JWT

```http
Authorization: Bearer <token>
```

### API Key

```http
X-API-Key: <key>
```

### Query Auth Helpers

For browser testing on share-style routes:

- `?token=<jwt>`
- `?apiKey=<key>`

### WebDAV Auth

For `/dav`:

- Basic Auth
- JWT Bearer Token
- API Key

## Public Endpoints

### `GET /api/site-config`

Returns public site config:

- `icp_beian`
- `police_beian`
- `smtp_enabled`
- `registration_enabled`
- `themes_enabled`
- `plugins_enabled`
- `webdav_enabled`

### `GET /api/themes/styles`

Returns active theme styles.

### `GET /api/themes/list`

Returns all discovered themes.

### `GET /api/plugins/list`

Returns all discovered plugins.

## Auth Endpoints

### `POST /api/auth/send-code`

Sends an email verification code when SMTP is enabled.

Request body:

```json
{ "email": "user@example.com" }
```

### `POST /api/auth/register`

Request body:

```json
{ "username": "user", "password": "secret123", "email": "user@example.com", "code": "123456" }
```

Notes:

- Registration can be globally disabled by the administrator
- `email` and `code` are only required when SMTP-backed registration is enabled
- Passwords are still stored with MD5 in the current implementation
- New users receive the current default language from `.env` on first initialization
- When registration is disabled, the endpoint returns `403` with `auth.userRegistrationDisabled`

### `POST /api/auth/login`

Request body:

```json
{ "username": "admin", "password": "admin" }
```

### `POST /api/auth/logout`

Logs out the current user.

### `GET /api/auth/me`

Returns the current signed-in user and basic settings.

## File Endpoints

Unless noted otherwise, all `/api/files/*` endpoints require JWT or API Key.

Generic API Key permission model:

- `read`
- `write`
- `delete`

Most file endpoints support `poolId` in query or body.

### `GET /api/files/list`

Query params:

- `path`
- `poolId`

Notes:

- When neither `path` nor `poolId` is provided, the endpoint returns virtual storage-pool folders
- Regular file rows include direct access fields such as `directUrl` and `fileUrl`

### `GET /api/files/info`

Returns file or folder metadata for one path.

### `POST /api/files/upload`

Multipart upload endpoint used by regular and concurrent uploads.

Common form fields:

- `path`
- `poolId`

### `POST /api/files/upload-stream`

Stream upload endpoint for large files.

### `POST /api/files/upload/init`

Initializes a resumable upload.

### `GET /api/files/upload/:uploadId/status`

Returns resumable upload status.

### `POST /api/files/upload/:uploadId/complete`

Finalizes a resumable upload.

### `DELETE /api/files/upload/:uploadId`

Cancels and removes a resumable upload session.

### `POST /api/files/write`

Writes text content back to a file.

Request body:

```json
{ "path": "/note.txt", "content": "hello", "poolId": 1 }
```

### `POST /api/files/mkdir`

Creates a directory.

### `POST /api/files/rename`

Renames a file or directory.
The `newName` field should contain only the new name, not a full destination path.
For storage backends without native directory rename support, the server automatically falls back to a recursive tree operation.

### `POST /api/files/move`

Moves a file or directory within the same pool.
For storage backends without native directory move support, the server automatically falls back to a recursive tree operation.

### `POST /api/files/copy`

Copies a file or directory within the same pool.
For storage backends without native directory copy support, the server automatically falls back to a recursive tree operation.

### `POST /api/files/batch-move`

Moves multiple items into a destination directory.

### `POST /api/files/cross-copy`

Copies items across storage pools.

### `POST /api/files/cross-move`

Moves items across storage pools.

### `DELETE /api/files/delete`

Deletes one file or directory.

### `POST /api/files/delete`

Alternative delete endpoint for clients that cannot send `DELETE` with a body.

### `POST /api/files/batch-delete`

Deletes multiple items.

### `GET /api/files/search`

Query params:

- `q`
- `path`
- `poolId`

Notes:

- When `q` starts with `//`, the endpoint switches to regular-expression search mode
- For example, `//^report-\\d+` matches file names that satisfy that expression
- Invalid regular expressions return `400`
- Results automatically exclude any `.trash` directory and its descendants

### `GET /api/files/download`

Downloads a single file.

### `POST /api/files/download-zip`

Downloads multiple files as a ZIP archive.

Request body:

```json
{ "paths": ["/a.txt", "/b.txt"], "poolId": 1 }
```

### `GET /api/files/preview`

Previews file content.

Notes:

- Text responses are returned without cache
- Binary preview responses use `ETag`
- Audio and video preview responses support `Range`
- Media preview uses server-side cache files when available

### `GET /api/files/thumbnail`

Returns a cached thumbnail for a supported file, or queues generation and returns `202`.

Query parameters:

- `path`: file path
- `poolId`: optional storage pool ID

Notes:

- Video thumbnails are generated in the background with `ffprobe` / `ffmpeg`
- Cache files are stored under `data/thumbnails/`
- Cache metadata is stored in `thumbnail_cache`
- `202` means generation is pending or processing; retry later
- `415` means no thumbnail provider supports the file type

### `GET /api/files/storage-stats`

Returns recursive storage statistics for the selected pool.

## Remote Upload and Offline Download

All endpoints below require JWT or API Key with `write` permission.

### `POST /api/files/remote-upload`

Uploads one or more remote files directly into the current directory.

Request body examples:

```json
{ "url": "https://example.com/file-a.zip", "dirPath": "demo", "poolId": 1 }
```

```json
{ "urls": ["https://example.com/a.zip", "https://example.com/b.zip"], "dirPath": "demo", "poolId": 1 }
```

```json
{ "url": "https://example.com/a.zip, https://example.com/b.zip", "dirPath": "demo", "poolId": 1 }
```

```json
{ "url": "https://example.com/a.zip\nhttps://example.com/b.zip", "dirPath": "demo", "poolId": 1 }
```

Response notes:

- `count` is the number of successful uploads
- `files` contains uploaded file metadata and direct URLs
- `errors` contains per-URL failures if only part of the batch succeeds
- Enabled feature plugins may rewrite the remote fetch URL before download begins
- The bundled `remote-transfer-accelerator` plugin uses this hook to swap source hosts for mirror hosts while keeping the original request URL in API responses

### `POST /api/files/offline-download`

Creates one or more background offline download tasks.

Request body accepts the same `url` / `urls` / comma-, vertical bar-, or newline-separated formats as remote upload.

Notes:

- Enabled feature plugins may rewrite the remote fetch URL before the background worker starts downloading
- Offline task records still keep the original URL submitted by the client
- If preflight validation already receives a `4xx` response from the remote source, that invalid link is skipped immediately instead of creating a background task, and the reason is returned in `errors`

### `GET /api/files/offline-download/tasks`

Returns current offline tasks for the signed-in user.

### `POST /api/files/offline-download/tasks/:id/cancel`

Cancels one offline task.

### `POST /api/files/offline-download/tasks/:id/retry`

Re-queues one failed or cancelled task.

### `POST /api/files/offline-download/tasks/clear-finished`

Clears finished tasks for the current user.

## Cross-Pool Shared Mount Endpoints

Unless noted otherwise, all `/api/share-mounts/*` endpoints require JWT or API Key auth. Listing endpoints accept API Keys, while mount and unmount management endpoints require a signed-in user session.

### `GET /api/share-mounts/list`

Query params:

- `path`
- `showAll`

Notes:

- By default, this returns the file and folder list for the current shared mount path
- `path` is relative to `/share`
- When `showAll=true`, the endpoint returns a flattened file list in the format required by automation clients

Default response example:

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

`showAll=true` response example:

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

Returns the mount directory list created by the current user.

Response example:

```json
{ "directories": ["", "abc", "abc/nested"] }
```

Notes:

- The empty string `""` represents the `/share` root

### `POST /api/share-mounts/directories`

Creates a virtual mount directory.

Request body:

```json
{ "path": "abc" }
```

### `POST /api/share-mounts/mount`

Mounts one or more source folders into a target directory.

Request body:

```json
{
  "targetPath": "abc",
  "items": [
    { "sourcePoolId": 1, "sourcePath": "/alist/test" },
    { "sourcePoolId": 2, "sourcePath": "/alist/test" }
  ]
}
```

Notes:

- `targetPath` is relative to `/share`
- Only folders can be mounted
- If names collide under the same target directory, the mounted folder name is rewritten as `<sourceFolderName>_<storagePoolId>`

### `POST /api/share-mounts/unmount`

Two request modes are supported:

1. Unmount a specific mounted item:

```json
{ "mountId": 3 }
```

2. Remove a virtual mount directory:

```json
{ "path": "abc" }
```

Notes:

- Passing `mountId` removes only one mounted item
- Passing `path` recursively removes mounted items and virtual directories under that shared mount directory

## Direct Shared Mount Access

### `GET /share`

### `GET /share/*`

Notes:

- These endpoints provide direct access to cross-pool shared mount folders and files
- JWT or API Key auth is required
- For browser testing, `?token=` and `?apiKey=` query parameters are supported
- When the path resolves to a directory, the response is `{ files, path }`
- When the path resolves to a file, the response is returned inline for preview by default
- Append `?download=true` to force download
- Audio and video files support preview cache and `Range` requests

Examples:

- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>`
- `GET {baseUrl}/share/abc/test_2/demo.txt?apiKey=<key>&download=true`

## Public Share Link Endpoints

### `POST /api/share/create`

Creates a public file or folder share link.

Request body example:

```json
{ "filePath": "", "fileType": "folder", "storagePoolId": 1 }
```

Notes:

- JWT auth is required
- `fileType` accepts `file` or `folder`
- For folder shares, `filePath: ""` represents the selected storage pool root

## User Endpoints

### `GET /api/user/info`

Returns the current user profile, pool list, storage stats, and dashboard counts.

Additional fields:

- `registration_enabled`

### `GET /api/user/settings`

Returns current user settings, including:

- `guestEnabled`
- `guestPath`
- `theme`
- `language`
- `uploadConcurrency`
- `serverDefaultUploadConcurrency`

### `PUT /api/user/settings`

Updates current user settings.

### `GET /api/user/apikeys`

Returns current user API keys.

### `POST /api/user/apikeys`

Creates one API key.

### `DELETE /api/user/apikeys/:id`

Deletes one API key.

### `GET /api/user/guest-shares`

Returns guest folder shares owned by the current user.

Each item includes `has_password` instead of returning the plaintext password.

### `POST /api/user/guest-shares`

Creates one guest folder share. If the same folder is already shared in the same storage pool, the existing guest share is updated instead of returning a duplicate error. Creating or updating a guest share through this endpoint enables guest mode for the current user.

Request body example:

```json
{ "folderPath": "", "storagePoolId": 1, "label": "USB", "permissions": "read,write", "password": "optional" }
```

Notes:

- `folderPath: ""` represents the selected storage pool root
- Guest access is still scoped to the selected storage pool
- `password` is optional. Send an empty string to clear password protection.

### `PUT /api/user/guest-shares/:id`

Updates one guest folder share. `password` is optional; omit it to keep the current password, send an empty string to clear it.

### `DELETE /api/user/guest-shares/:id`

Deletes one guest folder share.

## Guest Public Endpoints

### `GET /api/guest/:username/:shareId/list`

Lists a guest folder share. Password-protected guest shares accept `password` as a query parameter. When the password is missing or incorrect, the response contains `needPassword: true` and does not include files.

### `GET /api/guest/:username/:shareId/thumbnail`

Returns a cached thumbnail for a supported file in a guest share, or queues generation and returns `202`.

Query parameters:

- `path`: file path relative to the guest share root
- `password`: optional guest share password

## Admin Endpoints

All `/api/admin/*` endpoints require an admin JWT.

### `GET /api/admin/upload-limit`

Returns system settings:

- `upload_limit`
- `max_concurrent_uploads`
- `allow_user_registration`
- `log_level`

### `PUT /api/admin/upload-limit`

Updates system settings:

```json
{
  "upload_limit": 100,
  "max_concurrent_uploads": 3,
  "allow_user_registration": true,
  "log_level": 2
}
```

### `GET /api/admin/database`

Returns database config and current runtime status.

Notes:

- MySQL and PostgreSQL passwords are masked as `******` when already configured

### `PUT /api/admin/database`

Saves database config into `config.yml`.

### `POST /api/admin/database/test`

Tests database connectivity without forcing a runtime switch.

### `GET /api/admin/users`

Returns the user list with storage usage stats.

### `GET /api/admin/users/:id`

Returns user details, including:

- Basic profile
- Guest settings
- Storage pools
- Trash / favourites / shares / API key stats
- Storage quota and usage

### `POST /api/admin/users`

Creates a user.

### `PUT /api/admin/users/:id/role`

Updates the user role.

### `PUT /api/admin/users/:id/ban`

Bans or unbans a user.

### `PUT /api/admin/users/:id/password`

Resets a user password.

### `PUT /api/admin/users/:id/quota`

Updates storage quota.

### `PUT /api/admin/users/:id/verify`

Manually verifies a user.

### `DELETE /api/admin/users/:id`

Deletes a user.

### `GET /api/admin/ip-blacklist`

Returns current IP entries.

### `POST /api/admin/ip-blacklist`

Adds an IP entry.

### `DELETE /api/admin/ip-blacklist/:id`

Deletes an IP entry.

### `GET /api/admin/ip-list/mode`

Returns the current IP control mode: `blacklist` or `whitelist`.

### `PUT /api/admin/ip-list/mode`

Switches the IP control mode.

## WebDAV

Example endpoint:

- `http://127.0.0.1:3000/dav/pool/1`

Supported auth methods:

- Basic Auth
- JWT
- API Key

Notes:

- Windows Explorer is stricter about WebDAV compatibility
- For plain HTTP access, Windows often requires a relaxed `BasicAuthLevel`
- macOS Finder and Windows Explorer send different request patterns, so the server needs compatibility handling for both
