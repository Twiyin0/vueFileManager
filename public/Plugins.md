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

  remote-transfer-accelerator/
    manifest.json
    server.js
    config.json
    docs.md
    docs_en.md
```

每个插件目录都必须自包含，并至少包含一个 `manifest.json`。

## 支持的插件类型

- `theme`
- `feature`

如果省略 `kind`，加载器会把该插件视为主题插件。

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

- `name`：唯一插件 ID，建议与目录名一致
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

功能插件可以暴露前端资源、文档、能力标签，以及可选的服务端运行时入口：

```json
{
  "name": "remote-transfer-accelerator",
  "version": "1.0.0",
  "description": "Rewrite remote URLs through mirror hosts",
  "author": "VueFileManager",
  "enabled": true,
  "kind": "feature",
  "server": "server.js",
  "docs": "docs.md",
  "capabilities": ["server-hooks", "remote-url-transform"]
}
```

字段说明：

- `entry`：可选的浏览器侧 JS 入口文件
- `server`：可选的服务端运行时入口文件
- `docs`：可选的文档文件
- `capabilities`：可选的能力声明列表

## 服务端运行时 Hook

如果启用中的功能插件声明了 `server`，VueFileManager 会在服务启动时加载该模块。

模块应导出 `setup(context)`：

```js
export function setup(context) {
  context.hooks.registerRemoteUrlTransformer(({ url, operation }) => {
    if (operation !== 'remote-upload') return url
    return url.replace('pbs.twimg.com', 'api.example.com')
  })
}
```

当前 `context` 提供：

- `plugin`：插件注册记录
- `manifest`：解析后的功能插件清单
- `pluginDir`：插件目录绝对路径
- `logger`：带插件名前缀的 `info` / `warn` / `error` 日志方法
- `hooks.registerRemoteUrlTransformer(transformer)`：在 `remote-upload` 和 `offline-download` 发起远程抓取前改写 URL

远程 URL 改写器会收到：

- `url`
- `operation`：`remote-upload` 或 `offline-download`
- `userId`
- `poolId`
- `dirPath`

返回原始 URL 表示不改写，返回新的 URL 则表示替换这次远程抓取目标。

## 文档命名约定

项目内文档采用中英文双文件模式：

- 中文文档：默认文件名，例如 `docs.md`
- 英文文档：追加 `_en`，例如 `docs_en.md`

中英文文档互相链接：

- 中文页顶部写：`[English](./docs_en.md)`
- 英文页顶部写：`[中文](./docs.md)`

## 资源路径约束

- 插件资源路径必须保持相对路径
- 不能超出插件目录
- 不要引用构建后才存在的私有临时产物路径

## 运行时说明

- 功能插件的服务端 hook 只有在插件启用时才会加载
- 切换插件启用状态或修改 `server.js` 后，仍需要重启服务才能重新加载运行时模块
- 插件私有配置文件可以直接放在插件目录下，不必写入 `config.yml`

## 调试建议

- 修改清单后，检查 `/api/plugins/list`
- 修改主题样式后，检查 `/api/themes/styles`
- 修改功能插件运行时后，重启服务并验证对应 API 流程
