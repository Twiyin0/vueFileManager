[中文](./docs.md)

# example-feature

This is a sample feature plugin.

It demonstrates:

- a `kind: "feature"` manifest structure
- relative asset declarations for `entry` and `docs`
- the `capabilities` metadata field

## Current Runtime Behavior

This plugin is discoverable and publicly visible, but it is not auto-mounted as executable runtime logic.

Current behavior:

- Appears in the plugin center
- Appears in `GET /api/plugins/list`
- Exposes static files under `/plugins/example-feature/*`

## Files

- `manifest.json`: plugin metadata
- `entry.js`: public example entry asset
- `docs.md`: Chinese documentation
- `docs_en.md`: English documentation

## Capabilities

- `offline-task-hooks`
- `admin-panel-link`

These fields are descriptive only in the current implementation.
