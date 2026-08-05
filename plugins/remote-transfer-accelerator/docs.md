[English](./docs_en.md)

# 远程传输镜像加速插件

这个功能插件会在服务端真正发起远程请求之前，按规则把远程上传和离线下载里的 URL 域名切换到自定义加速域名。

## 适用范围

- `POST /api/files/remote-upload`
- `POST /api/files/offline-download`
- 离线下载任务的后台执行与重试

## 配置方式

编辑当前目录下的 `config.json`：

```json
{
  "rules": [
    {
      "sourceHost": "pbs.twimg.com",
      "targetHost": "api.example.com"
    }
  ]
}
```

如果只想让某条规则作用在部分场景，可以额外声明 `operations`：

```json
{
  "rules": [
    {
      "sourceHost": "pbs.twimg.com",
      "targetHost": "api.example.com",
      "operations": ["remote-upload"]
    }
  ]
}
```

## 规则说明

- 只改写 URL 的 `host` / `hostname`
- 原始协议、路径、查询参数会保持不变
- 按 `rules` 数组顺序匹配，命中第一条后立即停止
- 接口返回和离线任务列表里仍保留原始 URL，只有服务端抓取远程资源时才使用改写后的地址
- 修改 `config.json` 后，新请求会自动读取最新规则，不需要重启服务

## 附带文件

- `manifest.json`：插件清单
- `server.js`：服务端运行时 hook
- `config.json`：实际生效的规则配置
- `config.example.json`：示例配置
