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

## 运行说明

- `channelId` 用于把某一组客户端路由到同一个插件实例
- `secret` 只用于 backend 鉴权，客户端不需要知道
- 如果某个 channel 没有在网关里配置 users，relay 会继续把原始查询串透传给插件，兼容旧的“插件自己校验 token”模式
- 如果某个 channel 在网关里配置了 users，客户端 token 会先在网关校验，然后网关把已认证用户身份传给插件
- 管理台当前支持：
  - 展示服务器列表、backend 在线状态、实例 ID、当前 client 数
  - 新增/编辑/删除 channel
  - 为 channel 配置 `tokenParam`
  - 新增/编辑/删除用户、token、固定 `chatId`、`allowAgents`
