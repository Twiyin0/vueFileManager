# VueFileManager 主题开发文档

## 概述

VueFileManager 支持通过自定义 CSS 主题修改界面样式。主题放置在 `plugins/` 目录下，每个主题是一个独立文件夹，包含 `manifest.json` 和 `style.css`。

## 目录结构

```
plugins/
  my-theme/
    manifest.json      # 必须：主题元信息
    style.css          # 必须：自定义样式
```

## manifest.json

```json
{
  "name": "my-theme",
  "version": "1.0.0",
  "description": "我的自定义主题",
  "author": "作者名",
  "enabled": true,
  "style": "style.css"
}
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 主题唯一标识 |
| `version` | string | ✅ | 语义化版本号 |
| `description` | string | ❌ | 主题描述 |
| `author` | string | ❌ | 作者 |
| `enabled` | boolean | ❌ | 是否启用（默认 `true`，设为 `false` 可禁用） |
| `style` | string | ✅ | CSS 文件名 |

## CSS 变量

主题通过覆盖 CSS 变量来自定义样式。以下是可用的变量：

### 基础颜色（`:root` 和 `.dark`）

| 变量 | 浅色默认 | 暗色默认 | 用途 |
|------|----------|----------|------|
| `--bg-color` | `#f8f9fa` | `#1a1b1e` | 页面背景 |
| `--surface-color` | `#ffffff` | `#222326` | 导航栏、侧边栏 |
| `--card-color` | `#ffffff` | `#2a2b2f` | 卡片、对话框 |
| `--border-color` | `#e5e7eb` | `#3a3b3f` | 边框 |
| `--hover-color` | `#f3f4f6` | `#323337` | 悬浮背景 |
| `--text-color` | `#1f2937` | `#e0e0e2` | 主文本 |
| `--text-secondary-color` | `#6b7280` | `#a0a0a4` | 次要文本 |
| `--accent-color` | `#4f6ef7` | `#6b7cff` | 强调色 |
| `--accent-soft-color` | `#dbeafe` | `#4a5080` | 强调色背景 |

## 示例：紫色主题

**manifest.json：**
```json
{
  "name": "purple-theme",
  "version": "1.0.0",
  "description": "紫色主题",
  "enabled": true,
  "style": "style.css"
}
```

**style.css：**
```css
:root {
  --accent-color: #8b5cf6;
  --accent-soft-color: #ede9fe;
}

.dark {
  --accent-color: #a78bfa;
  --accent-soft-color: #4c1d95;
}
```

## 示例：深绿色主题

**style.css：**
```css
:root {
  --accent-color: #059669;
  --accent-soft-color: #d1fae5;
  --bg-color: #f0fdf4;
}

.dark {
  --accent-color: #34d399;
  --accent-soft-color: #064e3b;
  --bg-color: #0a1f0f;
  --surface-color: #132a1a;
  --card-color: #1a3524;
}
```

## 配置

`config.yml` 中的主题系统配置：

```yaml
plugins:
  enabled: true       # 是否启用主题系统
  dir: ./plugins      # 主题目录路径
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/themes/styles` | GET | 获取所有已启用主题的 CSS 路径 |
| `/api/themes/list` | GET | 获取所有主题列表（含禁用） |
| `/api/themes/:name/toggle` | PUT | 切换主题启用/禁用 |

## 开发流程

1. 在 `plugins/` 下创建主题文件夹
2. 编写 `manifest.json`（必须包含 `style` 字段）
3. 编写 `style.css`（覆盖 CSS 变量）
4. 重启服务
5. 在 `/themes` 页面查看和管理主题

## 注意事项

- 主题在服务启动时加载，修改后需重启
- CSS 变量名必须与系统定义的一致
- 建议同时定义 `:root`（浅色）和 `.dark`（暗色）变量
- 主题 CSS 通过 `<link>` 标签注入，优先级高于系统默认样式
