# VueFileManager 插件开发文档

## 概述

VueFileManager 现已将主题与可扩展功能统一到 `plugins/` 目录管理。当前版本提供：

- 统一插件发现与注册
- 主题插件样式自动注入
- 功能插件元信息展示与启用状态管理
- 静态资源托管与插件文档公开访问

这套结构的目标是先把插件边界约定稳定下来，让第三方开发者能够独立打包、分发和维护插件，同时不破坏现有主题系统。

## 当前宿主边界

从 `v1.0.1-preview` 开始，项目已经把“应用装配层”和“插件注册层”单独整理出来，核心目录包括：

```text
server/app/         # 启动、路由装配、中间件、SPA 入口保护
server/plugins/     # 插件注册表、类型定义、兼容加载器
src/app/            # 前端页面/导航注册中心
plugins/            # 第三方主题插件 / 功能插件目录
```

这意味着第三方开发者已经可以围绕稳定的插件目录结构、manifest 协议和静态资源暴露方式独立开发，而不需要直接改动宿主主题系统。

## 目录结构

```text
plugins/
  example-theme/
    manifest.json
    style.css

  example-feature/
    manifest.json
    docs.md
    entry.js
```

每个插件都是 `plugins/` 下的一个独立目录，最少需要一个 `manifest.json`。

## manifest.json

### 通用字段

```json
{
  "name": "example-feature",
  "version": "1.0.0",
  "description": "为离线任务和管理端预留扩展入口的示例功能插件",
  "author": "VueFileManager",
  "enabled": false,
  "kind": "feature"
}
```

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 插件唯一标识，建议与目录名一致 |
| `version` | string | 是 | 版本号 |
| `description` | string | 否 | 插件说明 |
| `author` | string | 否 | 作者名 |
| `enabled` | boolean | 否 | 是否启用，默认 `true` |
| `kind` | `theme` \| `feature` | 否 | 默认为 `theme` |

## 主题插件

主题插件保持向后兼容，未声明 `kind` 时会按主题处理。

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

### 主题插件字段

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `style` | string | 是 | 插件目录内的 CSS 相对路径 |

主题 CSS 会在服务端启动时扫描，并通过 `/api/themes/styles` 注入前端。

## 功能插件

功能插件用于描述额外能力、静态资源、脚本文档等。

```json
{
  "name": "example-feature",
  "version": "1.0.0",
  "description": "功能插件示例",
  "author": "VueFileManager",
  "enabled": false,
  "kind": "feature",
  "entry": "entry.js",
  "docs": "docs.md",
  "capabilities": ["offline-task-hooks", "admin-panel-link"]
}
```

### 功能插件字段

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `entry` | string | 否 | 插件入口脚本的相对路径 |
| `docs` | string | 否 | 插件说明文档的相对路径 |
| `capabilities` | string[] | 否 | 插件声明的能力标签 |

当前版本里，功能插件的 `entry` 主要作为约定和静态资源暴露，不会自动执行。这样做是为了先稳定插件协议，后续再逐步增加真正的挂载点。

## 路径与安全约束

插件资源路径必须满足以下要求：

- 必须是相对路径
- 不允许使用绝对路径
- 不允许包含 `..`
- 指向的文件必须真实存在于插件目录内

服务端会在启动加载插件时校验这些规则，非法插件会被跳过并输出错误日志。

## 公开 API

### GET `/api/plugins/list`

返回所有插件的概要信息。

```json
{
  "plugins": [
    {
      "id": "example-feature",
      "name": "example-feature",
      "version": "1.0.0",
      "description": "功能插件示例",
      "author": "VueFileManager",
      "enabled": false,
      "kind": "feature",
      "capabilities": ["offline-task-hooks", "admin-panel-link"],
      "docs": "/plugins/example-feature/docs.md",
      "entry": "/plugins/example-feature/entry.js",
      "assetBasePath": "/plugins/example-feature"
    }
  ]
}
```

### PUT `/api/plugins/:name/toggle`

管理员可切换功能插件启用状态。

```json
{
  "enabled": true
}
```

### GET `/api/themes/list`

保持兼容的主题列表接口，仅返回主题插件。

### PUT `/api/themes/:name/toggle`

保持兼容的主题启用接口。

## 开发建议

### 1. 插件目录尽量自包含

推荐把插件所需的 CSS、脚本、文档和静态资源都放在插件目录内部，避免依赖项目内部私有路径。

### 2. 先用 capabilities 表达意图

在真正的运行时挂载点完全开放前，推荐先通过 `capabilities` 告诉宿主和开发者这个插件“准备扩展什么”，例如：

- `theme-style`
- `offline-task-hooks`
- `admin-panel-link`
- `storage-provider`

### 3. 维持向后兼容

如果你开发的是纯主题插件，继续使用原来的 `manifest.json + style.css` 即可，不需要额外改造。

## 当前限制

- 主题插件已完整接入样式注入与启停管理
- 功能插件当前提供注册、静态资源暴露、文档展示和开关管理
- 功能插件的自动执行、前后端钩子挂载、权限声明仍是下一阶段能力

## 开发者建议

### 4. 把文档一起交付

如果插件包含复杂配置、外部依赖、兼容性限制或手动安装步骤，建议始终提供 `docs.md`，并在其中明确写出：

- 插件用途
- 支持的 VueFileManager 版本
- 是否依赖某种存储类型 / 管理员权限 / 第三方服务
- 是否只提供静态能力声明，还是已经具备真实运行逻辑

### 5. 预留能力标签而不是私自耦合内部模块

当前推荐通过 `capabilities` 描述未来意图，例如：

- `storage-provider`
- `webdav-extension`
- `offline-task-hooks`
- `admin-panel-link`
- `theme-style`

不建议插件直接依赖宿主私有内部路径，因为 `server/app/` 和 `src/app/` 仍会继续细化。

## 与旧文档的关系

旧版 `Themes.md` 的内容现在可以视为“主题插件子集说明”。为了便于外部开发者理解，推荐后续优先参考本文件。
