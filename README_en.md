[中文](./README.md)

# VueFileManager

VueFileManager is a file manager built with Vue 3, Express, and TypeScript. It supports multi-storage pools, guest sharing, WebDAV, recycle bin, favourites, API keys, theme and plugin discovery, cross-pool shared mounts, background offline downloads, remote uploads, and a runtime i18n layer for both frontend and backend responses.

## Current Status

- Version: `2.0.0-beta.9`
- Frontend: Vue 3 + Vite
- Backend: Express + TypeScript
- Runtime databases: `sqlite`, `mysql`, `postgres`
- Storage backends: `local`, `upyun`, `ftp`, `s3`, `sftp`

## Core Features

- User registration, login, JWT auth, and API keys
- Admin user management, quota control, ban or unban, and manual verification
- Per-user multi-storage-pool management
- File listing, upload, stream upload, resumable upload, clipboard paste upload with auto-generated 16-digit hexadecimal filenames, download, preview, search, and ZIP download
- Cross-pool copy and move
- Cross-pool shared mounts under `/share`
- Remote upload and background offline download tasks, including comma-separated batch URLs
- Recycle bin, favourites, guest folder shares, and public shares
- WebDAV with basic auth, JWT, and API key support
- Theme and plugin discovery from `plugins/`
- Frontend i18n from `public/i18n/`
- Backend runtime i18n from `server/i18n/` with English fallback

## Cross-Pool Shared Mounts

- The sidebar exposes a dedicated shared mount workspace rooted at `/share`
- In File Manager, folders can be mounted into `/share` individually or in batches
- Mount targets are relative to `/share`; for example, `abc` maps to `/share/abc`
- If mounted source folders collide inside the same target directory, the folder name is rewritten as `<sourceFolderName>_<storagePoolId>`
- Virtual mount directories can be created and removed
- Shared mount files and folders can be listed through `/api/share-mounts/*`
- Authenticated direct access is available through `/share/<path>`
- Shared mount file preview now uses the same media cache strategy as regular file preview

## Remote Upload and Offline Tasks

- File Manager supports direct remote upload and server-side offline download
- The input accepts one or more URLs separated by commas
- Immediate mode downloads the remote resource and writes it into the selected storage pool right away
- Offline mode creates background tasks that can be viewed and retried from the Offline Tasks page

## Runtime Requirements

- Node.js `18+`
- Recommended Node.js `20 LTS`
- CPU: at least 2 cores
- Memory: at least 2 GB
- Free disk: at least 2 GB, excluding uploaded files

## Install

```bash
yarn install
```

## Development

Run full development mode:

```bash
yarn dev
```

Or run frontend and backend separately:

```bash
yarn dev:client
yarn dev:server
```

In development mode, when the backend writes `config.yml` through admin APIs, it skips the redundant hot restart and no longer creates an extra config-write marker file.

## Build

```bash
yarn build
```

Validation build:

```bash
yarn build:check
```

## Production Deployment

Build on a machine with full dependencies:

```bash
yarn install --immutable
yarn build
```

Artifacts to deploy:

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
- `uploads/` if using local storage
- `data/` if still using SQLite or preparing migration

Install production dependencies only on the server:

```bash
yarn workspaces focus --all --production
```

Start the service:

```bash
yarn start
```

Equivalent runtime command:

```bash
node dist-server/index.js
```

Production runtime does not require `vite`, `tsx`, `vue-tsc`, or TypeScript compilation tools.

## Configuration

Main config file: `config.yml`

Important fields:

- `upload_limit`
  - Single file upload limit in MB
- `max_concurrent_uploads`
  - Default max number of concurrent uploads
- `log_level`
  - Log verbosity level
  - `1 = error`
  - `2 = info`
  - `3 = debug`
  - Default: `2`
- `database`
  - Runtime database config for `sqlite`, `mysql`, and `postgres`
- `storage_pools`
  - Preconfigured storage pools inherited by newly created users

Admins can update these from the admin panel:

- Upload limit
- Max concurrent uploads
- Log level
- Database connection settings

## Language and i18n

- `config.yml` no longer stores the UI language
- `DEFAULT_LANGUAGE` in `.env` is only used when initializing `user_settings.language` for the first time
- After a user is created, the active UI language is stored in `user_settings.language`
- Future startup, login, and language switching always use the language saved in the current account
- Changing language does not restart the frontend or backend service
- Legacy `language` or `default_language` fields in `config.yml` are ignored and removed on later config saves
- Frontend locale files live in:
  - `public/i18n/zh-CN.yml`
  - `public/i18n/en-US.yml`
- Backend runtime locale files live in:
  - `server/i18n/zh-cn.json`
  - `server/i18n/en-us.json`
- Backend API responses resolve by account language first, then request headers, and finally fall back to English

Example `.env`:

```env
DEFAULT_LANGUAGE=zh-CN
```

Supported values:

- `zh-CN`
- `en-US`

Suggested workflow for new copy:

1. Add the Chinese key to `public/i18n/zh-CN.yml`.
2. Add the matching English key to `public/i18n/en-US.yml`.
3. Add backend response keys to `server/i18n/zh-cn.json` and `server/i18n/en-us.json` when needed.
4. Use English as the fallback string in `ts` and `vue` source files.

## Logging

- Log directory: `data/log/`
- Logs are written into daily files
- File name format: `year-month-day_number.log`
  - Example: `2026-06-14_1.log`
- By default, logs keep appending to the same numbered file for that day instead of splitting by hour or minute
- Log output is always English and does not use i18n
- The active log level is controlled by `log_level` in `config.yml`
  - `1`: `error` only
  - `2`: `error` and `info`
  - `3`: `error`, `info`, and `debug`

Current log source tags:

- `[api]`
- `[web]`
- `[webdav]`
- `[system]`

Log format:

```text
[source][level]YYYY-MM-DD_HH:mm:ss.SSS(file.ts): message
```

## Database Support

The backend uses a unified adapter layer for:

- `sqlite` via `sql.js`
- `mysql` via `mysql2`
- `postgres` via `pg`

Business data is stored directly in the configured runtime database.

### Change Database Type

1. Update `config.yml`
2. Migrate data first if switching across database types
3. Restart the service when you want runtime connections to switch

Admin APIs:

- `GET /api/admin/database`
- `PUT /api/admin/database`
- `POST /api/admin/database/test`

## SQLite WAL Merge Before Using `sql.js`

If your old deployment contains:

- `data/filemanager.db-wal`
- `data/filemanager.db-shm`

merge the WAL log back into the main database before switching to the current runtime.

Stop the old service, then run:

```bash
chmod +x migrate-sqlite-wal.sh
./migrate-sqlite-wal.sh
```

For a custom database path:

```bash
./migrate-sqlite-wal.sh /path/to/filemanager.db
```

Do not switch to the `sql.js` runtime before the WAL has been checkpointed.

## Database Migration

You can migrate existing SQLite data into MySQL or PostgreSQL.

Development commands:

```bash
yarn migrate:db --target mysql --truncate
```

```bash
yarn migrate:db --target postgres --truncate
```

Built production commands:

```bash
node dist-server/db-cli.js --target mysql --truncate
```

```bash
node dist-server/db-cli.js --target postgres --truncate
```

Options:

- `--source-sqlite /path/to/filemanager.db`
- `--target mysql|postgres`
- `--truncate`

## Scripts

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

## Project Layout

```text
server/               Express backend
server/i18n/          Backend runtime locale files
src/                  Vue frontend
plugins/              Theme and feature plugins
public/               Public docs and static assets
public/i18n/          Frontend locale files
scripts/              Build and migration helpers
dist/                 Built frontend
dist-server/          Built backend bundles
data/                 SQLite data directory
uploads/              Local storage root
```

## Related Documents

- [API Docs](./public/API_en.md)
- [Plugin Docs](./public/Plugins_en.md)
- [Theme Docs](./public/Themes_en.md)

## Notes

- Local storage is isolated per user under `storage_root/<username>/`
- System junk files such as `._*`, `.DS_Store`, and `.trash` are filtered from normal file listings
- Theme and plugin toggles update manifest files and usually require a restart to fully apply
