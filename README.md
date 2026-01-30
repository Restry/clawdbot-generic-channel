# Generic Channel

Generic WebSocket/Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

A flexible channel plugin that allows H5 pages to connect directly via WebSocket or Webhook without depending on third-party platforms.

[English](#english) | [中文](#中文)

---

## English

### Installation

```bash
openclaw plugins install @restry/generic-channel
```

Or install via npm:

```bash
npm install @restry/generic-channel
```

### Configuration

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"  # or "webhook"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
```

Or via CLI:

```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable the generic channel |
| `connectionMode` | enum | `"websocket"` | Connection mode: `"websocket"` or `"webhook"` |
| `wsPort` | number | `8080` | WebSocket server port |
| `wsPath` | string | `"/ws"` | WebSocket endpoint path |
| `webhookPath` | string | `"/generic/events"` | Webhook endpoint path |
| `webhookPort` | number | `3000` | Webhook server port |
| `webhookSecret` | string | - | Optional webhook signature secret |
| `dmPolicy` | enum | `"open"` | DM policy: `"open"`, `"pairing"`, or `"allowlist"` |
| `allowFrom` | array | `[]` | Allowed sender IDs (for allowlist policy) |
| `historyLimit` | number | `10` | Number of history messages to keep for group chats |
| `textChunkLimit` | number | `4000` | Maximum characters per message chunk |

### Features

- **Dual Connection Modes**: WebSocket and Webhook support
- **Multi-Client Management**: Support for multiple simultaneous WebSocket connections
- **Direct Message & Group Chat**: Handle both DM and group conversations
- **Message History**: Configurable history tracking for group chats
- **Access Control**: DM policy (open, pairing, allowlist)
- **Auto Heartbeat**: WebSocket heartbeat for connection health monitoring

### Quick Start

1. Enable the Generic Channel:
```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

2. Open `examples/h5-client.html` in your browser to test the connection

3. Enter the WebSocket URL (e.g., `ws://localhost:8080/ws`), your chat ID, and name, then click "Connect"

### Message Protocol

#### Inbound Message (H5 → Server)

```typescript
{
  messageId: string;      // Unique message ID
  chatId: string;         // Chat/conversation ID
  chatType: "direct" | "group";
  senderId: string;       // Sender user ID
  senderName?: string;    // Optional sender display name
  messageType: "text" | "image" | "file";
  content: string;        // Message content
  timestamp: number;      // Unix timestamp
  parentId?: string;      // Optional parent message ID for replies
}
```

#### Outbound Message (Server → H5)

```typescript
{
  messageId: string;      // Unique message ID
  chatId: string;         // Chat/conversation ID
  content: string;        // Message content
  contentType: "text" | "markdown";
  replyTo?: string;       // Optional message ID being replied to
  timestamp: number;      // Unix timestamp
}
```

### WebSocket Events

| Event Type | Description |
|------------|-------------|
| `message.receive` | Inbound message from client |
| `message.send` | Outbound message to client |
| `connection.open` | Connection established |
| `connection.close` | Connection closed |
| `typing` | Typing indicator (optional) |

### H5 Client Example

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:8080/ws?chatId=user-123');

ws.onopen = () => {
  console.log('Connected to Generic Channel');
};

// Send a message
const message = {
  type: 'message.receive',
  data: {
    messageId: 'msg-' + Date.now(),
    chatId: 'user-123',
    chatType: 'direct',
    senderId: 'user-123',
    senderName: 'Alice',
    messageType: 'text',
    content: 'Hello, AI!',
    timestamp: Date.now()
  }
};
ws.send(JSON.stringify(message));

// Receive messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'message.send') {
    console.log('AI Reply:', message.data.content);
  }
};
```

### FAQ

#### WebSocket connection failed

1. Check if OpenClaw is running
2. Verify the `wsPort` configuration
3. Make sure no other service is using the same port
4. Check firewall settings

#### Messages are not received

1. Verify `channels.generic.enabled` is set to `true`
2. Check the `chatId` in the connection URL matches your setup
3. Review OpenClaw logs for error messages

---

## 中文

### 安装

```bash
openclaw plugins install @restry/generic-channel
```

或通过 npm 安装：

```bash
npm install @restry/generic-channel
```

### 配置

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"  # 或 "webhook"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
```

或通过命令行：

```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 启用/禁用通用频道 |
| `connectionMode` | enum | `"websocket"` | 连接模式：`"websocket"` 或 `"webhook"` |
| `wsPort` | number | `8080` | WebSocket 服务器端口 |
| `wsPath` | string | `"/ws"` | WebSocket 端点路径 |
| `webhookPath` | string | `"/generic/events"` | Webhook 端点路径 |
| `webhookPort` | number | `3000` | Webhook 服务器端口 |
| `webhookSecret` | string | - | 可选的 Webhook 签名密钥 |
| `dmPolicy` | enum | `"open"` | 私聊策略：`"open"`、`"pairing"` 或 `"allowlist"` |
| `allowFrom` | array | `[]` | 允许的发送者 ID 列表（用于 allowlist 策略） |
| `historyLimit` | number | `10` | 群聊保留的历史消息数量 |
| `textChunkLimit` | number | `4000` | 每条消息的最大字符数 |

### 功能特性

- **双连接模式**：支持 WebSocket 和 Webhook
- **多客户端管理**：支持多个 WebSocket 连接同时在线
- **私聊与群聊**：处理私聊和群组对话
- **消息历史**：可配置的群聊历史记录
- **访问控制**：私聊策略（开放、配对、白名单）
- **自动心跳**：WebSocket 心跳保活机制

### 快速开始

1. 启用通用频道：
```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

2. 在浏览器中打开 `examples/h5-client.html` 测试连接

3. 输入 WebSocket URL（如 `ws://localhost:8080/ws`）、聊天 ID 和名称，然后点击"连接"

### 常见问题

#### WebSocket 连接失败

1. 检查 OpenClaw 是否正在运行
2. 验证 `wsPort` 配置
3. 确保没有其他服务占用相同端口
4. 检查防火墙设置

#### 消息无法接收

1. 确认 `channels.generic.enabled` 设置为 `true`
2. 检查连接 URL 中的 `chatId` 是否正确
3. 查看 OpenClaw 日志是否有错误信息

---

## License

MIT
