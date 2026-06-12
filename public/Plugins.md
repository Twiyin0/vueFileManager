# Plugin Development

VueFileManager loads themes and feature plugins from the `plugins/` directory.

## Plugin directory

```text
plugins/
  example-theme/
    manifest.json
    style.css

  example-feature/
    manifest.json
    entry.js
    docs.md
```

Each plugin is a self-contained directory with a required `manifest.json`.

## Supported plugin kinds

- `theme`
- `feature`

If `kind` is omitted, the current loader treats the plugin as a theme.

## Common manifest fields

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

Fields:

- `name`: unique plugin id, should match directory intent
- `version`: plugin version
- `description`: optional description
- `author`: optional author
- `enabled`: optional, defaults to enabled unless explicitly `false`
- `kind`: `theme` or `feature`

## Theme plugin

Theme plugins require a `style` file:

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
- active theme CSS is exposed through `/api/themes/styles`

## Feature plugin

Feature plugins can declare static assets and capabilities:

```json
{
  "name": "example-feature",
  "version": "1.0.0",
  "description": "Example feature plugin",
  "author": "VueFileManager",
  "enabled": false,
  "kind": "feature",
  "entry": "entry.js",
  "docs": "docs.md",
  "capabilities": ["offline-task-hooks", "admin-panel-link"]
}
```

Fields:

- `entry`: optional JS entry file
- `docs`: optional markdown documentation file
- `capabilities`: optional list of declared capabilities

Important:

- current runtime exposes `entry` and `docs` as static assets
- current runtime does not automatically execute feature plugin code on backend or frontend boot
- `entry.js` is contract metadata and a public asset, not a live hook system yet

## Asset path rules

Plugin asset paths must:

- be relative paths
- stay inside the plugin directory
- not include `..`
- point to files that exist

Invalid plugin manifests are skipped at load time.

## Public plugin APIs

### `GET /api/plugins/list`

Returns plugin summaries.

Feature plugins include:

- `capabilities`
- `docs`
- `entry`
- `assetBasePath`

Theme plugins are returned with:

- `kind: "theme"`
- `capabilities: ["theme-style"]`

### `PUT /api/plugins/:name/toggle`

Enable or disable a plugin by updating its manifest file.

Current behavior:

- requires a valid JWT token
- does not currently enforce admin role in code
- usually requires restart for full runtime effect

## Theme compatibility APIs

Theme plugins also appear through:

- `GET /api/themes/list`
- `PUT /api/themes/:name/toggle`

## Recommended capability names

Current examples:

- `theme-style`
- `offline-task-hooks`
- `admin-panel-link`
- `storage-provider`
- `webdav-extension`

These are descriptive declarations only. They are not enforced runtime contracts yet.

## Example feature plugin

See:

- [plugins/example-feature/manifest.json](../plugins/example-feature/manifest.json)
- [plugins/example-feature/docs.md](../plugins/example-feature/docs.md)

## Practical guidance

- Keep plugin directories self-contained
- Treat `manifest.json` as the contract
- Avoid depending on private internal source paths
- Ship `docs.md` when the plugin needs setup or compatibility notes
