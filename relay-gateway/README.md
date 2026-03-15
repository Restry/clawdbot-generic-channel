# relay-gateway

`relay-gateway` 是一个独立的 WebSocket 中转服务，同时也是一个简单的 relay 管理台。

用途：

- OpenClaw 插件以 `connectionMode: "relay"` 主动连接网关的 `/backend`
- 第三方客户端连接网关的 `/client`
- 网关负责服务器列表、用户/token 管理、backend 鉴权，以及 JSON 帧转发
- 当某个 channel 在网关里配置了用户列表后，客户端 token 认证由网关完成，插件会信任网关下发的已认证用户身份

## 启动

```bash
cd relay-gateway
npm install
RELAY_PORT=19080 \
RELAY_CHANNELS_JSON='{"demo":{"secret":"replace-me"}}' \
npm start
```

或使用持久化配置文件：

```bash
cd relay-gateway
npm install
RELAY_PORT=19080 \
RELAY_CONFIG_PATH=/path/to/relay-config.json \
npm start
```

如果这是公网入口，推荐不要直接把 `RELAY_PORT` 暴露出去，而是让 `relay-gateway`
只监听本机回环地址，再由 Caddy/Nginx 提供 `https://` 和 `wss://`：

```bash
cd relay-gateway
npm install
RELAY_HOST=127.0.0.1 \
RELAY_PORT=18080 \
RELAY_CONFIG_PATH=/path/to/relay-config.json \
RELAY_ADMIN_TOKEN=replace-me \
npm start
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RELAY_HOST` | `0.0.0.0` | 监听地址 |
| `RELAY_PORT` | `19080` | 监听端口 |
| `RELAY_CHANNELS_JSON` | `{}` | 首次启动的种子配置，兼容旧格式 `{"channel-id":{"secret":"xxx"}}` |
| `RELAY_CONFIG_PATH` | `relay-gateway/data/relay-config.json` | 持久化配置文件路径 |
| `RELAY_ADMIN_TOKEN` | - | 可选管理台/API 管理 token |

## 接入路径

- backend: `ws://host:port/backend`
- client: `ws://host:port/client?channelId=<channelId>&chatId=<chatId>&agentId=<agentId>&token=<token>`
- health: `http://host:port/healthz`
- admin UI: `http://host:port/admin`
- admin API: `http://host:port/api/state`

如果前面挂了 TLS 反向代理，则第三方客户端应该改用：

- backend: `ws://127.0.0.1:18080/backend`（仅插件所在机器本地使用）
- client: `wss://relay.example.com/client?channelId=<channelId>&token=<token>`
- admin UI: `https://relay.example.com/admin`
- admin API: `https://relay.example.com/api/state`

## 插件侧配置示例

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "relay"
    relay:
      url: "ws://relay.example.com:19080/backend"
      channelId: "demo"
      secret: "replace-me"
      instanceId: "openclaw-sg-1"
```

## Caddy TLS 示例

建议让 `relay-gateway` 只监听 `127.0.0.1:18080`，再由 Caddy 申请证书并反代。

仓库里提供了一个模板文件：

- `relay-gateway/Caddyfile.example`

最小 Caddyfile 形态如下：

```caddyfile
{
  email ops@example.com
}

relay.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:18080
}
```

这样做之后：

- 第三方页面如果本身是 `https://`，就应该连接 `wss://relay.example.com/client?...`
- OpenClaw 插件仍然连本机 `ws://127.0.0.1:18080/backend`
- 外部网络不再需要直接访问裸露的 `18080`

## 运行说明

- `channelId` 用于把某一组客户端路由到同一个插件实例
- `secret` 只用于 backend 鉴权，客户端不需要知道
- 如果某个 channel 没有在网关里配置 users，relay 会继续把原始查询串透传给插件，兼容旧的“插件自己校验 token”模式
- 如果某个 channel 在网关里配置了 users，客户端 token 会先在网关校验，然后网关把已认证用户身份传给插件
- 如果第三方页面本身运行在 `https://`，客户端入口必须改成 `wss://`，否则浏览器会直接拦截 Mixed Content
- 管理台当前支持：
  - 展示服务器列表、backend 在线状态、实例 ID、当前 client 数
  - 新增/编辑/删除 channel
  - 为 channel 配置 `tokenParam`
  - 新增/编辑/删除用户、token、固定 `chatId`、`allowAgents`
