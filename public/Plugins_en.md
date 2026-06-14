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
```

Each plugin directory must be self-contained and include at least one `manifest.json`.

## Supported Plugin Types

- `theme`
- `feature`

If `kind` is omitted, the current loader treats the plugin as a theme plugin.

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

Feature plugins can declare static assets and capability metadata:

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

Field notes:

- `entry`: optional JS entry file
- `docs`: optional documentation file
- `capabilities`: optional capability declaration list

Important note:

- Feature plugins are currently used mostly for metadata display and static file exposure
- They are not yet full runtime auto-extension points
- Real business behavior usually still requires changes in the main repository

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

## Debugging Tips

- After changing a manifest, check `/api/plugins/list`
- After changing theme styles, check `/api/themes/styles`
- Plugin toggle changes often require a service restart to fully apply
