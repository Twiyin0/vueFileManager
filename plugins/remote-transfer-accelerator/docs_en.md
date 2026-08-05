[中文](./docs.md)

# Remote Transfer Accelerator

This feature plugin rewrites the host part of remote upload and offline download URLs before the server fetches the remote resource.

## Coverage

- `POST /api/files/remote-upload`
- `POST /api/files/offline-download`
- Offline task background execution and retries

## Configuration

Edit `config.json` in this directory:

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

If a rule should only apply to selected flows, add `operations`:

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

## Rule Notes

- Only the URL `host` / `hostname` is rewritten
- Protocol, path, and query string stay unchanged
- Rules are checked in array order and stop at the first match
- API responses and offline task lists still keep the original URL; only the server-side fetch uses the rewritten address
- Updating `config.json` takes effect on the next request without restarting the service

## Included Files

- `manifest.json`: plugin manifest
- `server.js`: server runtime hook
- `config.json`: live rules
- `config.example.json`: sample rules
