[中文](./README.md)

# VueFileManager

VueFileManager is a file manager built with Vue 3, Express, and TypeScript. It supports multi-storage pools, guest sharing, WebDAV, recycle bin, favourites, API keys, theme and plugin extension, runtime-switchable database adapters, and a built-in i18n layer.

## Current Status

- Version: `2.0.0-beta.7`
- Frontend: Vue 3 + Vite
- Backend: Express + TypeScript
- Runtime databases: `sqlite`, `mysql`, `postgres`
- Storage backends: `local`, `upyun`, `ftp`, `s3`, `sftp`

## Core Features

- User registration, login, JWT auth, API keys
- Admin user management, quota control, ban or unban, manual verification
- Multi-storage pool management per user
- File list, upload, stream upload, resumable upload, download, preview
- Cross-pool copy and move
- Cross-pool shared mounts that unify folders from different storage pools under `/share`
- Remote upload and offline download tasks
- Recycle bin and favourites
- Share links and guest folder shares
- WebDAV with JWT, API key, and basic auth
- Theme and plugin discovery from `plugins/`
- UI translations loaded from `public/i18n/`

## Cross-Pool Shared Mounts

- A dedicated sidebar page exposes the cross-pool shared mount workspace, rooted at `/share`
- In File Manager, folders can be mounted into `/share` individually or in batches
- Mount targets are relative to `/share`; for example, `abc` maps to `/share/abc`
- When multiple mounted source folders collide inside the same target, the mounted folder name is rewritten as `<sourceFolderName>_<storagePoolId>`
- Virtual mount directories can be created and removed, and full mount directories can be unmounted from the shared mounts page
- The feature also exposes dedicated listing APIs and authenticated direct access through `/share/<path>`

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

## Development Deployment

Run full development mode:

```bash
yarn dev
```

Or run frontend and backend separately:

```bash
yarn dev:client
yarn dev:server
```

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

Admins can also update these from the admin panel:

- Upload limit
- Max concurrent uploads
- Log level
- Database connection settings

## Language Settings

- `config.yml` no longer stores the UI language
- `DEFAULT_LANGUAGE` in `.env` is only used when initializing `user_settings.language` for the first time
- After a user is created, the active UI language is stored in `user_settings.language`
- Later startup, login, and language switching always use the language saved in the current account
- Changing language does not restart the frontend or backend service
- Legacy `language` or `default_language` fields in `config.yml` are ignored and removed on later config saves

Example `.env`:

```env
DEFAULT_LANGUAGE=zh-CN
```

Supported values:

- `zh-CN`
- `en-US`

If you are upgrading an existing database:

- the migration adds the `language` field to `user_settings`
- existing users with an empty language field will receive the `.env` `DEFAULT_LANGUAGE` value during migration

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

Example:

```text
[web][info]2026-06-14_16:17:18.234(upload-routes.ts): User Admin uploaded a file in poolID:#1 /test/text/test.txt
```

Error logs additionally include:

- error name
- error message
- stack trace
- available context details

## i18n Convention

- Locale directory: `public/i18n/`
- Built-in locales:
  - `public/i18n/zh-CN.yml`
  - `public/i18n/en-US.yml`
- UI copy should use `useI18n().t('key.path')`
- User language is stored in account settings instead of `config.yml`

Suggested workflow for new copy:

1. Add the Chinese key to `zh-CN.yml`.
2. Add the matching English key to `en-US.yml`.
3. Read the value in the UI with `useI18n().t('key.path')`.

## Database Support

The backend uses a unified adapter layer for:

- `sqlite` via `sql.js`
- `mysql` via `mysql2`
- `postgres` via `pg`

Business data is stored directly in the configured runtime database.

### Change Database Type

1. Update `config.yml`
2. Migrate data first if switching across database types
3. Restart the service

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

Migrated tables:

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

Notes:

- Primary keys are preserved where possible
- Target schema is created automatically before import
- Uploaded files are not stored in the database
- Keep `uploads/` and external storage configuration unchanged during cutover

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
src/                  Vue frontend
plugins/              Theme and feature plugins
public/               Public docs and static assets
public/i18n/          Locale files
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
