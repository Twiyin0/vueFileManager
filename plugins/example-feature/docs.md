# example-feature

This is a sample feature plugin.

It demonstrates:

- `kind: "feature"` manifest structure
- `entry` and `docs` relative asset declarations
- `capabilities` metadata

## Current runtime behavior

This plugin is discoverable and publicly visible, but it is not auto-mounted as executable runtime logic.

Current behavior:

- appears in the plugin center
- appears in `GET /api/plugins/list`
- exposes static files under `/plugins/example-feature/*`

## Files

- `manifest.json`: plugin metadata
- `entry.js`: public example entry asset
- `docs.md`: this documentation file

## Capabilities

- `offline-task-hooks`
- `admin-panel-link`

These are descriptive declarations only in the current implementation.
