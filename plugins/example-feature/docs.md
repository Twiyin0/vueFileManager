# example-feature

这是一个功能插件示例。

它用于演示以下约定：

- `kind: "feature"` 的 manifest 写法
- `entry` 与 `docs` 的相对路径声明
- `capabilities` 能力标签的组织方式

当前版本中，这类插件不会被宿主自动执行，但它们会：

- 出现在插件中心页面
- 出现在 `/api/plugins/list`
- 通过 `/plugins/example-feature/*` 暴露静态资源
