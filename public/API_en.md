[中文](./API.md)

# VueFileManager API Docs

Base URL examples:

- Development backend: `http://localhost:3000`
- API base path: `http://localhost:3000/api`

## Authentication

### JWT

```http
Authorization: Bearer <token>
```

### API Key

```http
X-API-Key: <key>
```

### WebDAV Auth

For `/dav`:

- Basic Auth
- JWT Bearer Token
- API Key
- You can also test with `?token=` or `?apiKey=` query parameters

## Public Endpoints

### `GET /api/site-config`

Returns basic site config:

- `language`
- `icp_beian`
- `police_beian`
- `smtp_enabled`
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

- `email` and `code` are only required when SMTP-backed registration is enabled
- Passwords are still stored with MD5 in the current implementation

### `POST /api/auth/login`

Request body:

```json
{ "username": "admin", "password": "admin" }
```

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

Lists directory contents.

### `POST /api/files/upload`

Multipart upload endpoint used by regular and concurrent uploads.

Common params:

- `path`
- `poolId`

### `POST /api/files/mkdir`

Creates a directory.

Request body:

```json
{ "path": "/example", "poolId": 1 }
```

### `POST /api/files/rename`

Renames a file or directory.

### `POST /api/files/move`

Moves a file or directory.

### `POST /api/files/copy`

Copies a file or directory, including cross-pool copies.

### `DELETE /api/files/delete`

Deletes a single file or directory.

### `POST /api/files/batch-delete`

Batch delete.

### `GET /api/files/download`

Downloads a file.

### `GET /api/files/preview`

Previews file content. Text, image, audio, and video previews depend on this endpoint.

### `POST /api/files/write`

Writes text content back to the file, used by text preview editing.

Request body:

```json
{ "path": "/note.txt", "content": "hello", "poolId": 1 }
```

## User Settings Endpoints

### `GET /api/user/settings`

Returns current user settings, including:

- `guestEnabled`
- `guestPath`
- `theme`
- `uploadConcurrency`

### `PUT /api/user/settings`

Updates current user settings.

## Admin Endpoints

All `/api/admin/*` endpoints require an admin JWT.

### `GET /api/admin/upload-limit`

Returns system settings:

- `upload_limit`
- `max_concurrent_uploads`
- `language`

### `PUT /api/admin/upload-limit`

Updates system settings:

```json
{
  "upload_limit": 100,
  "max_concurrent_uploads": 3,
  "language": "zh-CN"
}
```

### `GET /api/admin/database`

Returns database config and current runtime status.

### `PUT /api/admin/database`

Saves database config.

### `POST /api/admin/database/test`

Tests database connectivity.

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

### `GET /api/admin/ip-list/mode`

Returns the current IP control mode: `blacklist` or `whitelist`.

### `PUT /api/admin/ip-list/mode`

Switches the IP control mode.

### `POST /api/admin/ip-blacklist`

Adds an IP entry.

### `DELETE /api/admin/ip-blacklist/:id`

Deletes an IP entry.

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
