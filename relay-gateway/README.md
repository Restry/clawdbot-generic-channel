# relay-gateway

`relay-gateway` 是一个独立的 WebSocket 中转服务。

用途：

- OpenClaw 插件以 `connectionMode: "relay"` 主动连接网关的 `/backend`
- 第三方客户端连接网关的 `/client`
- 网关只负责鉴权配对与 JSON 帧转发，不解析 `generic-channel` 业务消息

## 启动

```bash
cd relay-gateway
npm install
RELAY_PORT=19080 \
RELAY_CHANNELS_JSON='{"demo":{"secret":"replace-me"}}' \
npm start
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RELAY_HOST` | `0.0.0.0` | 监听地址 |
| `RELAY_PORT` | `19080` | 监听端口 |
| `RELAY_CHANNELS_JSON` | `{}` | channel 配置，格式为 `{"channel-id":{"secret":"xxx"}}` |

## 接入路径

- backend: `ws://host:port/backend`
- client: `ws://host:port/client?channelId=<channelId>&chatId=<chatId>&agentId=<agentId>&token=<token>`
- health: `http://host:port/healthz`

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
- 客户端自己的用户身份仍通过 `token` 等 `generic-channel` 现有查询参数完成
- 如果服务端配置了自定义 token 参数名，relay 会透传原始查询串，不会强制改成 `token`
