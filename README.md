# VueFileManager

A Vue 3 + Express file manager with multi-storage pools, guest sharing, WebDAV, recycle bin, favourites, API keys, plugin/theme support, and runtime-compatible database adapters.

## Status

- Version: `1.0.1`
- Frontend: Vue 3 + Vite
- Backend: Express + TypeScript
- Database runtime: `sqlite`, `mysql`, `postgres`
- Storage backends: `local`, `upyun`, `ftp`, `s3`, `sftp`

## Core features

- User registration, login, JWT auth, API keys
- Admin user management, quota control, ban/unban, verify user
- Multi-storage pool management per user
- File list, upload, stream upload, resumable upload, download, preview
- Cross-pool copy and move
- Remote upload and offline download tasks
- Recycle bin and favourites
- Share links and guest folder shares
- WebDAV access with JWT, API key, or basic auth
- Theme and plugin discovery from `plugins/`

## Runtime requirements

- Node.js `18+`
- Recommended Node.js `20 LTS`
- CPU: 2 cores
- Memory: 2 GB minimum
- Free disk: 2 GB minimum, excluding uploaded files

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

## Build

```bash
yarn build
```

Validation build:

```bash
yarn build:check
```

## Production

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
- `data/` if still using SQLite or preparing database migration

Install production dependencies only on the server:

```bash
yarn workspaces focus --all --production
```

Start the service:

```bash
yarn start
```

This runs:

```bash
node dist-server/index.js
```

Production runtime does not need `vite`, `tsx`, `vue-tsc`, or TypeScript compilation.

## Configuration

Main config file: `config.yml`

Example:

```yaml
admin:
  username: admin
  password: 21232f297a57a5a743894a0e4a801fc3

server:
  port: 3000
  host: ""
  jwt_secret: vue-file-manager-secret-key-2024

storage_root: ./uploads
upload_limit: 100
resumable_upload_cache_minutes: 120
ip_list_mode: blacklist

site:
  icp_beian: ""
  police_beian: ""

database:
  type: sqlite
  sqlite:
    path: ./data/filemanager.db
  mysql:
    host: 127.0.0.1
    port: 3306
    user: root
    password: ""
    database: vue_file_manager
    ssl: false
  postgres:
    host: 127.0.0.1
    port: 5432
    user: postgres
    password: ""
    database: vue_file_manager
    ssl: false

storage_pools:
  - name: Local Storage
    type: local
    default: true
    config: {}

smtp:
  enabled: false
  host: ""
  port: 465
  secure: true
  user: ""
  pass: ""
  from: ""

plugins:
  enabled: true
  dir: ./plugins
```

## Database support

The backend now uses a unified adapter layer:

- `sqlite` via `sql.js`
- `mysql` via `mysql2`
- `postgres` via `pg`

Business data is stored directly in the configured runtime database.

### Change database type

1. Update `config.yml`
2. If switching databases, migrate data first
3. Restart the service

Admin API also supports:

- `GET /api/admin/database`
- `PUT /api/admin/database`
- `POST /api/admin/database/test`

## SQLite WAL merge before using `sql.js`

If your old deployment contains:

- `data/filemanager.db-wal`
- `data/filemanager.db-shm`

merge WAL into the main database file before switching to the current runtime.

Stop the old service, then run:

```bash
chmod +x migrate-sqlite-wal.sh
./migrate-sqlite-wal.sh
```

Or with a custom database path:

```bash
./migrate-sqlite-wal.sh /path/to/filemanager.db
```

Do not switch to the `sql.js` runtime before WAL has been checkpointed.

## Database migration

Migrate existing SQLite data into MySQL or PostgreSQL.

Development command:

```bash
yarn migrate:db --target mysql --truncate
```

```bash
yarn migrate:db --target postgres --truncate
```

Production command after build:

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
- Keep `uploads/` and external storage config unchanged during cutover

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

## Project layout

```text
server/               Express backend
src/                  Vue frontend
plugins/              Theme and feature plugins
public/               Public documentation assets
scripts/              Build and migration helpers
dist/                 Built frontend
dist-server/          Built backend bundles
data/                 SQLite data directory
uploads/              Local storage root
```

## Related docs

- [API.md](public/API.md)
- [Plugins.md](public/Plugins.md)
- [Themes.md](public/Themes.md)

## Notes

- Local storage is isolated per user under `storage_root/<username>/`
- System junk files such as `._*`, `.DS_Store`, and `.trash` are filtered from normal file listings
- Theme and plugin toggles update manifest files and usually require a restart to fully apply
