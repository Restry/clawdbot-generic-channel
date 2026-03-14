# Generic Channel

Generic WebSocket/Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

A flexible channel plugin that allows H5 pages to connect directly without depending on third-party platforms. The current recommended and E2E-verified access path is `websocket`.

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
  generic-channel:
    enabled: true
    connectionMode: "websocket"  # or "webhook"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
    transcription:
      enabled: true
      pythonPath: "/home/restry/.openclaw/workspace/.venv/bin/python"
      model: "tiny"
```

Or via CLI:

```bash
openclaw config set channels.generic-channel.enabled true
openclaw config set channels.generic-channel.connectionMode websocket
openclaw config set channels.generic-channel.wsPort 8080
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
| `mediaMaxMb` | number | `30` | Maximum inbound media size in MB |
| `transcription` | object | - | Automatic voice/audio transcription settings |

### Features

#### Core Features
- **Primary Access Path**: WebSocket is the current recommended and E2E-verified access mode
- **Multi-Client Management**: Support for multiple simultaneous WebSocket connections
- **Direct Message & Group Chat**: Handle both DM and group conversations
- **Proactive DM Support**: OpenClaw can send messages without receiving a message first ([docs](docs/PROACTIVE_DM.md))
- **Rich Media Support**: Send and receive images, voice messages, and audio files
- **Thinking Indicators**: Real-time "AI is thinking" status updates
- **Message History**: Configurable history tracking for group chats
- **Access Control**: DM policy (open, pairing, allowlist)
- **Auto Heartbeat**: WebSocket heartbeat for connection health monitoring

#### Advanced WhatsApp-like Features
- **Message Reactions**: Add emoji reactions to messages
- **Message Editing & Deletion**: Edit or delete sent messages with history tracking
- **Read Receipts & Delivery Status**: Track message delivery and read status
- **Enhanced Typing Indicators**: Real-time typing status with auto-timeout
- **Message Forwarding**: Forward messages to other chats (single or multiple)
- **User Status/Presence**: Online/offline/away/busy status with last seen tracking
- **File Sharing with Progress**: File uploads/downloads with real-time progress tracking
- **Message Search**: Full-text search by content, sender, date, and more
- **Group Administration**: Full group management with roles, permissions, and settings
- **Message Pinning & Starring**: Pin important messages (max 3) and bookmark favorites

📖 **See [docs/README.md](docs/README.md) for the current documentation set.**

### Quick Start

1. Enable the Generic Channel:
```bash
openclaw config set channels.generic-channel.enabled true
openclaw config set channels.generic-channel.connectionMode websocket
openclaw config set channels.generic-channel.wsPort 8080
```

2. Open `examples/h5-client.html` in your browser to test the connection

3. Enter the WebSocket URL (e.g., `ws://localhost:8080/ws`), your chat ID, and name, then click "Connect"

4. For direct H5 / App / WeChat Mini Program integration, see `docs/INTEGRATION_GUIDE.md`
5. First-time readers should use this order: `README` -> `docs/INTEGRATION_GUIDE.md` -> `docs/CONFIG_EXAMPLES*.md` -> `examples/h5-client.html`

### Message Protocol

#### Inbound Message (H5 → Server)

```typescript
{
  messageId: string;      // Unique message ID
  chatId: string;         // Chat/conversation ID
  chatType: "direct" | "group";
  senderId: string;       // Sender user ID
  senderName?: string;    // Optional sender display name
  messageType: "text" | "image" | "voice" | "audio" | "file";
  content: string;        // Message content or caption
  mediaUrl?: string;      // Media URL (for image/voice/audio)
  mimeType?: string;      // MIME type of media
  timestamp: number;      // Unix timestamp
  parentId?: string;      // Optional parent message ID for replies
}
```

### Automatic Voice/Audio Transcription

The plugin can automatically transcribe inbound `voice` and `audio` messages before they are sent to the agent.

Requirements:
- `ffmpeg` must be installed on the gateway host
- The selected Python runtime must have `faster-whisper` installed

Example:

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    transcription:
      enabled: true
      provider: "faster-whisper"
      pythonPath: "/home/restry/.openclaw/workspace/.venv/bin/python"
      model: "tiny"
      device: "cpu"
      computeType: "int8"
      timeoutMs: 120000
```

Behavior:
- `voice` messages are auto-transcribed by default when transcription is enabled
- `audio` messages are also auto-transcribed by default
- The transcript is injected into the agent context as `[Voice transcript]` or `[Audio transcript]`
- If transcription fails, the original media placeholder is still delivered and the message does not fail

#### Outbound Message (Server → H5)

```typescript
{
  messageId: string;      // Unique message ID
  chatId: string;         // Chat/conversation ID
  content: string;        // Message content
  contentType: "text" | "markdown" | "image" | "voice" | "audio";
  mediaUrl?: string;      // Media URL (for image/voice/audio)
  mimeType?: string;      // MIME type of media
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
| `thinking.start` | AI started thinking/processing |
| `thinking.update` | AI thinking status update |
| `thinking.end` | AI finished thinking |

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

1. Verify `channels.generic-channel.enabled` is set to `true`
2. Check the `chatId` in the connection URL matches your setup
3. Review OpenClaw logs for error messages

#### Chat cannot use `sudo` or install software

If the Linux account already has `sudo` rights but chat commands are still blocked, the restriction is usually from OpenClaw exec policy rather than the OS user.

Add the following to `~/.openclaw/openclaw.json` on the gateway host:

```json
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "generic-channel": ["*"]
      }
    },
    "exec": {
      "host": "gateway",
      "security": "full",
      "ask": "off"
    }
  }
}
```

Then restart the gateway and enable elevated mode in the chat session:

```bash
openclaw gateway restart
```

```text
/elevated full
```

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
  generic-channel:
    enabled: true
    connectionMode: "websocket"  # 或 "webhook"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
    transcription:
      enabled: true
      pythonPath: "/home/restry/.openclaw/workspace/.venv/bin/python"
      model: "tiny"
```

或通过命令行：

```bash
openclaw config set channels.generic-channel.enabled true
openclaw config set channels.generic-channel.connectionMode websocket
openclaw config set channels.generic-channel.wsPort 8080
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
| `mediaMaxMb` | number | `30` | 入站媒体最大大小，单位 MB |
| `transcription` | object | - | 自动语音/音频转写配置 |

### 功能特性

#### 核心功能
- **主接入路径**：当前推荐且已完成 E2E 验证的是 WebSocket
- **多客户端管理**：支持多个 WebSocket 连接同时在线
- **私聊与群聊**：处理私聊和群组对话
- **主动 DM 支持**：OpenClaw 可以主动发送消息，无需先接收消息（[文档](docs/PROACTIVE_DM.md)）
- **富媒体支持**：发送和接收图片、语音消息、音频文件
- **思考指示器**：实时显示"AI 正在思考"状态
- **消息历史**：可配置的群聊历史记录
- **访问控制**：私聊策略（开放、配对、白名单）
- **自动心跳**：WebSocket 心跳保活机制

#### WhatsApp 风格高级功能
- **消息表情反应**：为消息添加表情符号反应
- **消息编辑与删除**：编辑或删除已发送消息，支持历史记录追踪
- **已读回执与送达状态**：追踪消息送达和已读状态
- **增强型输入指示器**：实时输入状态显示，自动超时
- **消息转发**：转发消息到其他聊天（单条或多条）
- **用户状态/在线状态**：在线/离线/离开/忙碌状态，支持最后在线追踪
- **文件分享与进度追踪**：文件上传/下载，实时进度显示
- **消息搜索**：全文搜索，支持按内容、发送者、日期等筛选
- **群组管理**：完整的群组管理，支持角色、权限和设置
- **消息置顶与收藏**：置顶重要消息（最多 3 条）和收藏喜欢的消息

📖 **当前文档入口见 [docs/README.md](docs/README.md)。**

### 快速开始

1. 启用通用频道：
```bash
openclaw config set channels.generic-channel.enabled true
openclaw config set channels.generic-channel.connectionMode websocket
openclaw config set channels.generic-channel.wsPort 8080
```

2. 在浏览器中打开 `examples/h5-client.html` 测试连接

3. 输入 WebSocket URL（如 `ws://localhost:8080/ws`）、聊天 ID 和名称，然后点击"连接"

4. H5 / 聊天 App / 微信小程序的真实接入方式见 `docs/INTEGRATION_GUIDE.md`
5. 第一次接入建议按 `README -> docs/INTEGRATION_GUIDE.md -> docs/CONFIG_EXAMPLES_ZH.md -> examples/h5-client.html` 的顺序阅读

### 接入说明

- 当前真实配置键是 `channels.generic-channel`
- 当前 H5 参考实现只有 `examples/h5-client.html`
- 客户端统一通过 `ws://host:port/ws?chatId=会话ID` 建连
- 客户端发消息时统一发送 `type: "message.receive"`
- 图片、音频、语音都通过 `mediaUrl + mimeType + messageType` 传入
- 多用户并发场景建议把 `session.dmScope` 设为 `per-account-channel-peer`

### 自动语音/音频转写

插件可以在把消息交给 agent 之前，自动把传入的 `voice` / `audio` 媒体先转成文本。

前置条件：
- gateway 主机已安装 `ffmpeg`
- 所配置的 Python 运行时里已安装 `faster-whisper`

示例配置：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    transcription:
      enabled: true
      provider: "faster-whisper"
      pythonPath: "/home/restry/.openclaw/workspace/.venv/bin/python"
      model: "tiny"
      device: "cpu"
      computeType: "int8"
      timeoutMs: 120000
```

行为说明：
- 开启后默认自动转写 `voice`
- 开启后默认也会自动转写 `audio`
- 转写文本会以 `[Voice transcript]` 或 `[Audio transcript]` 注入给 agent
- 如果转写失败，消息不会失败，插件仍会继续把原始媒体占位符传给 agent

### 常见问题

#### WebSocket 连接失败

1. 检查 OpenClaw 是否正在运行
2. 验证 `wsPort` 配置
3. 确保没有其他服务占用相同端口
4. 检查防火墙设置

#### 消息无法接收

1. 确认 `channels.generic-channel.enabled` 设置为 `true`
2. 检查连接 URL 中的 `chatId` 是否正确
3. 查看 OpenClaw 日志是否有错误信息

#### 聊天里无法使用 `sudo` 或安装软件

如果 Linux 账户本身已经有 `sudo` 权限，但聊天里执行命令仍然被拒，通常不是系统权限问题，而是 OpenClaw 的 exec / elevated 策略没有放开。

在 gateway 主机的 `~/.openclaw/openclaw.json` 中加入：

```json
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "generic-channel": ["*"]
      }
    },
    "exec": {
      "host": "gateway",
      "security": "full",
      "ask": "off"
    }
  }
}
```

然后重启 gateway，并在聊天会话里打开提权：

```bash
openclaw gateway restart
```

```text
/elevated full
```

---

## License

MIT
