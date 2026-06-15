# AGENTS.md

This repository has project-specific guardrails for any future implementation work.

## Core Rules

1. The project already implements i18n. Any new user-facing language must use i18n, with English as the fallback language.
2. Avoid patchwork-style edits in implementation. Prefer directly rewriting the relevant file or complete code section when making changes.
3. When editing `config.yml`, do not remove, rewrite, or degrade its existing comments and examples.
4. After testing, clean up any temporary or extra files created during verification.
5. Every functional change must be aligned with the corresponding documentation updates.
6. Frontend changes must stay visually consistent with the existing product style and must account for both light and dark themes.
7. Do not modify existing routes in this project.

## Additional Notes

- Keep Chinese out of `ts` and `vue` source files unless it is stored in i18n resource files.
- Use English as the default fallback for both frontend and backend i18n flows.
- Preserve current behavior unless the requested change explicitly requires otherwise.
