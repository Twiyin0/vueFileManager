# VueFileManager 项目指南

## 暗色模式样式规范

本项目使用 Tailwind CSS v4，暗色模式通过 `.dark` 类触发。修改前端代码时**必须**保持暗色模式样式统一。

### CSS 变量（内联样式用）

在 `src/styles/main.css` 的 `:root` 和 `.dark` 中定义：

| 变量 | 浅色 | 暗色 | 用途 |
|------|------|------|------|
| `--bg-color` | #f8f9fa | #1a1b1e | 页面背景 |
| `--surface-color` | #ffffff | #222326 | 导航栏、侧边栏 |
| `--card-color` | #ffffff | #2a2b2f | 卡片、对话框 |
| `--border-color` | #e5e7eb | #3a3b3f | 边框 |
| `--hover-color` | #f3f4f6 | #323337 | 悬浮背景 |
| `--text-color` | #1f2937 | #e0e0e2 | 主文本 |
| `--text-secondary-color` | #6b7280 | #a0a0a4 | 次要文本 |
| `--accent-color` | #4f6ef7 | #6b7cff | 强调色 |
| `--accent-soft-color` | #dbeafe | #4a5080 | 强调色背景 |

### Tailwind 暗色类（`@theme` 中定义）

在 `@theme` 块中定义，配合 `dark:` 前缀使用：

- `dark:text-dark-text` / `dark:text-dark-text-secondary`
- `dark:bg-dark-surface` / `dark:bg-dark-card` / `dark:bg-dark-hover`
- `dark:border-dark-border`
- `dark:placeholder-dark-placeholder`
- `dark:text-dark-accent` / `dark:bg-dark-accent-soft`

### 规则

1. **输入框**：统一使用 `.input-field` 类，已内置暗色 placeholder 样式
2. **对话框/面板背景**：用 `style="background-color: var(--card-color)"` 或 `.card` 类，不要裸用 `bg-white`
3. **文本/代码预览**：用 `var(--surface-color)` 而非 `white`
4. **hover 状态**：必须带 `dark:hover:bg-dark-hover`，不可遗漏
5. **新增暗色颜色**：必须先在 `main.css` 的 `@theme` 块中定义，再使用
6. **CSS 变量**：只用上述已定义的变量名，不要自造（如 `--color-light-bg` 不存在）
