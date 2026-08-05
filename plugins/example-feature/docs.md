[English](./docs_en.md)

# example-feature

这是一个示例功能插件。

它主要演示：

- `kind: "feature"` 的清单结构
- `entry` 和 `docs` 的相对资源声明方式
- `capabilities` 元数据字段

## 当前运行时行为

这个插件当前可以被发现并公开展示，但不会被自动挂载为可执行的运行时代码。

当前行为包括：

- 会出现在插件中心
- 会出现在 `GET /api/plugins/list`
- 会通过 `/plugins/example-feature/*` 暴露静态文件

## 文件组成

- `manifest.json`：插件元数据
- `entry.js`：公开示例入口资源
- `docs.md`：当前中文文档
- `docs_en.md`：英文文档

## 能力声明

- `offline-task-hooks`
- `admin-panel-link`

这些字段在当前实现中仅作为描述性声明。
