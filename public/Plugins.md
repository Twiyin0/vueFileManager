[English](./Plugins_en.md)

# 插件开发

VueFileManager 会从 `plugins/` 目录加载主题插件和功能插件。

## 插件目录结构

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

每个插件目录都必须自包含，并至少包含一个 `manifest.json`。

## 支持的插件类型

- `theme`
- `feature`

如果省略 `kind`，当前加载器会把该插件视为主题插件。

## 通用清单字段

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

字段说明：

- `name`：唯一插件 ID，建议与目录语义一致
- `version`：插件版本
- `description`：可选描述
- `author`：可选作者
- `enabled`：可选，除非显式设为 `false`，否则默认启用
- `kind`：`theme` 或 `feature`

## 主题插件

主题插件需要提供一个 `style` 文件：

```json
{
  "name": "example-theme",
  "version": "1.0.0",
  "description": "Example theme",
  "enabled": true,
  "style": "style.css"
}
```

说明：

- `style` 必须是插件目录内的相对路径
- 启用中的主题 CSS 会通过 `/api/themes/styles` 暴露

## 功能插件

功能插件可以声明静态资源和能力描述：

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

字段说明：

- `entry`：可选的 JS 入口文件
- `docs`：可选的文档文件
- `capabilities`：可选的能力声明列表

重要说明：

- 当前功能插件主要用于元数据展示和静态资源暴露
- 还不是完整的运行时自动扩展点
- 如果要扩展真实业务能力，通常仍需要修改主仓库代码

## 文档命名约定

项目内文档采用中英文双文件模式：

- 中文文档：默认文件名，例如 `docs.md`
- 英文文档：追加 `_en`，例如 `docs_en.md`

中英文文档互相链接：

- 中文页顶部写：`[English](./docs_en.md)`
- 英文页顶部写：`[中文](./docs.md)`

## 资源路径约束

- 插件资源路径必须保持相对路径
- 不能越出插件目录
- 不要引用构建后才存在的私有临时产物路径

## 调试建议

- 修改清单后，检查 `/api/plugins/list`
- 修改主题样式后，检查 `/api/themes/styles`
- 涉及插件开关时，通常需要重启服务让状态完全生效
