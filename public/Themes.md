[English](./Themes_en.md)

# 主题开发

主题从 `plugins/` 目录加载，并以 CSS 覆盖的形式应用到前端。

## 最小目录结构

```text
plugins/
  my-theme/
    manifest.json
    style.css
```

## 主题清单

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

字段说明：

- `name`：主题 ID
- `version`：版本号
- `description`：可选描述
- `author`：可选作者
- `enabled`：可选，除非显式设为 `false`，否则默认启用
- `style`：必填的相对 CSS 路径

## 加载模型

- 主题 CSS 文件会从插件清单中发现
- 启用中的主题样式通过 `GET /api/themes/styles` 返回
- 前端会把这些样式作为外部 CSS 资源加载

## 主题接口

- `GET /api/themes/styles`
- `GET /api/themes/list`
- `PUT /api/themes/:name/toggle`

当前切换行为：

- 需要有效的 JWT
- 目前代码中没有强制管理员角色校验
- 会更新磁盘上的插件清单
- 为了获得稳定的完整刷新效果，建议重启服务

## 建议覆盖的内容

主题应优先覆盖 CSS 变量和稳定的组件类，而不是深度依赖内部 DOM 结构。

常见目标包括：

- 页面背景色
- 表面层与卡片颜色
- 文本颜色
- 强调色
- 按钮样式
- 侧边栏样式
- 对话框样式

## 推荐做法

优先使用 CSS 变量，只在必要时增加组件级覆盖。

示例：

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

## 响应式注意事项

- 同时验证桌面端和移动端布局
- 不要假设侧边栏宽度固定
- 重点检查对话框、播放器和预览浮层

## 深色模式

前端通过 `.dark` 类切换深色模式。主题如果改变颜色体系，最好同时提供浅色和深色变量。

## 兼容性说明

- 主题 CSS 会在基础样式之后注入，因此可以覆盖默认规则
- 避免依赖私有构建产物名称
- 比起原始元素选择器，更推荐使用类名和 CSS 变量
