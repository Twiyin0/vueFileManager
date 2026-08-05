[中文](./Themes.md)

# Theme Development

Themes are loaded from `plugins/` and applied to the frontend as CSS overrides.

## Minimal Directory Structure

```text
plugins/
  my-theme/
    manifest.json
    style.css
```

## Theme Manifest

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

Field notes:

- `name`: theme ID
- `version`: version number
- `description`: optional description
- `author`: optional author
- `enabled`: optional, defaults to enabled unless explicitly set to `false`
- `style`: required relative CSS path

## Loading Model

- Theme CSS files are discovered from plugin manifests
- Enabled theme styles are returned by `GET /api/themes/styles`
- The frontend loads those styles as external CSS resources

## Theme APIs

- `GET /api/themes/styles`
- `GET /api/themes/list`
- `PUT /api/themes/:name/toggle`

Current toggle behavior:

- Requires a valid JWT
- The current code does not strictly enforce an admin role
- Updates the plugin manifest on disk
- A service restart is recommended for a fully clean refresh

## What to Override

Themes should prefer CSS variables and stable component classes instead of deeply depending on internal DOM structure.

Common targets:

- Page background
- Surface and card colors
- Text colors
- Accent colors
- Button styles
- Sidebar styles
- Dialog styles

## Recommended Approach

Prefer CSS variables, and add component-level overrides only when needed.

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

## Responsive Considerations

- Verify both desktop and mobile layouts
- Do not assume a fixed sidebar width
- Pay extra attention to dialogs, players, and preview overlays

## Dark Mode

The frontend toggles dark mode with the `.dark` class. If the theme changes the color system, provide both light and dark variables.

## Compatibility Notes

- Theme CSS is injected after the base styles, so it can override defaults
- Avoid relying on private build output names
- Prefer class names and CSS variables over raw element selectors
