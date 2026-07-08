[中文](./Plugins.md)

# Plugin Development

VueFileManager loads theme plugins and feature plugins from the `plugins/` directory.

## Plugin Directory Structure

```text
plugins/
  example-theme/
    manifest.json
    style.css

  example-feature/
    manifest.json
    entry.js
    docs.md
    docs_en.md

  remote-transfer-accelerator/
    manifest.json
    server.js
    config.json
    docs.md
    docs_en.md
```

Each plugin directory must be self-contained and include at least one `manifest.json`.

## Supported Plugin Types

- `theme`
- `feature`

If `kind` is omitted, the loader treats the plugin as a theme plugin.

## Common Manifest Fields

```json
{
  "name": "example-feature",
  "version": "1.0.0",
  "description": "Example feature plugin",
  "author": "VueFileManager",
  "enabled": false,
  "kind": "feature"
}
```

Field notes:

- `name`: unique plugin ID, ideally aligned with the directory name
- `version`: plugin version
- `description`: optional description
- `author`: optional author
- `enabled`: optional, defaults to enabled unless explicitly set to `false`
- `kind`: `theme` or `feature`

## Theme Plugins

Theme plugins should provide a `style` file:

```json
{
  "name": "example-theme",
  "version": "1.0.0",
  "description": "Example theme",
  "enabled": true,
  "style": "style.css"
}
```

Notes:

- `style` must be a relative path inside the plugin directory
- Enabled theme CSS files are exposed through `/api/themes/styles`

## Feature Plugins

Feature plugins can expose frontend assets, docs, capability metadata, and optional server runtime hooks:

```json
{
  "name": "remote-transfer-accelerator",
  "version": "1.0.0",
  "description": "Rewrite remote URLs through mirror hosts",
  "author": "VueFileManager",
  "enabled": true,
  "kind": "feature",
  "server": "server.js",
  "docs": "docs.md",
  "capabilities": ["server-hooks", "remote-url-transform"]
}
```

Field notes:

- `entry`: optional browser-side JS entry file
- `server`: optional server runtime entry file
- `docs`: optional documentation file
- `capabilities`: optional capability declaration list

## Server Runtime Hooks

If an enabled feature plugin declares `server`, VueFileManager loads that module during server bootstrap.

The module should export `setup(context)`:

```js
export function setup(context) {
  context.hooks.registerRemoteUrlTransformer(({ url, operation }) => {
    if (operation !== 'remote-upload') return url
    return url.replace('pbs.twimg.com', 'api.example.com')
  })
}
```

`context` currently provides:

- `plugin`: plugin registry record
- `manifest`: parsed feature manifest
- `pluginDir`: absolute plugin directory path
- `logger`: namespaced `info` / `warn` / `error` helpers
- `hooks.registerRemoteUrlTransformer(transformer)`: rewrites remote URLs before `remote-upload` and `offline-download` fetches

The remote URL transformer receives:

- `url`
- `operation`: `remote-upload` or `offline-download`
- `userId`
- `poolId`
- `dirPath`

Return the original URL to leave it unchanged, or return a new URL to rewrite the fetch target.

## Documentation Naming Convention

This repository uses paired Chinese and English docs:

- Chinese doc: default filename, for example `docs.md`
- English doc: append `_en`, for example `docs_en.md`

Cross-link both files:

- Chinese doc header: `[English](./docs_en.md)`
- English doc header: `[中文](./docs.md)`

## Asset Path Constraints

- Asset paths must remain relative
- Paths must stay inside the plugin directory
- Do not reference private temporary outputs that only exist after build

## Runtime Notes

- Feature plugin server hooks are loaded only when the plugin is enabled
- Toggling a plugin or editing `server.js` still requires a service restart to reload the runtime module
- Plugin-private config files can stay inside the plugin directory instead of `config.yml`

## Debugging Tips

- After changing a manifest, check `/api/plugins/list`
- After changing theme styles, check `/api/themes/styles`
- After changing a feature plugin runtime, restart the service and test the related API flow
