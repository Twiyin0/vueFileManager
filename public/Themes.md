# Theme Development

Themes are loaded from the `plugins/` directory and applied as CSS overrides.

## Minimal structure

```text
plugins/
  my-theme/
    manifest.json
    style.css
```

## Theme manifest

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "description": "My custom theme",
  "author": "Author",
  "enabled": true,
  "style": "style.css"
}
```

Fields:

- `name`: theme id
- `version`: version string
- `description`: optional
- `author`: optional
- `enabled`: optional, defaults to enabled unless set to `false`
- `style`: required relative CSS path

## Loading model

- theme CSS files are discovered from plugin manifests
- enabled theme styles are returned by `GET /api/themes/styles`
- frontend loads those styles as external CSS assets

## Theme APIs

- `GET /api/themes/styles`
- `GET /api/themes/list`
- `PUT /api/themes/:name/toggle`

Current toggle behavior:

- requires a valid JWT token
- does not currently enforce admin role in code
- updates plugin manifest on disk
- restart is recommended for predictable full reload behavior

## What to style

Themes should mainly override CSS variables and stable component classes instead of patching deep DOM structure.

Useful targets include:

- page background colors
- surface and card colors
- text colors
- accent colors
- button styles
- sidebar styles
- dialog styles

## Recommended approach

Use CSS variables first, then component-level overrides only where necessary.

Example:

```css
:root {
  --accent-color: #2563eb;
  --accent-soft-color: #dbeafe;
}

.dark {
  --accent-color: #60a5fa;
  --accent-soft-color: #1e3a8a;
}
```

## Responsive considerations

- test both desktop and mobile layouts
- do not assume a fixed sidebar width
- verify dialog, player, and preview overlays

## Dark mode

The frontend uses a `.dark` class mode. Provide both light and dark values when your theme changes color identity.

## Compatibility notes

- theme CSS is injected after base styles, so it can override default rules
- avoid relying on private build artifact names
- prefer class and variable overrides over raw element selectors

## Example

See:

- [plugins/example-theme/manifest.json](../plugins/example-theme/manifest.json)
