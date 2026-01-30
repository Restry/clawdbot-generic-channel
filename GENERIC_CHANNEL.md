# Generic Channel Plugin

A generic channel plugin for OpenClaw that supports WebSocket and Webhook connections, allowing H5 pages to connect directly without depending on third-party platforms.

## Features

- **Dual Connection Modes**: WebSocket and Webhook support
- **Multi-Client Management**: Support for multiple simultaneous WebSocket connections
- **Direct Message & Group Chat**: Handle both DM and group conversations
- **Message History**: Configurable history tracking for group chats
- **Access Control**: DM policy (open, pairing, allowlist)
- **Auto Heartbeat**: WebSocket heartbeat for connection health monitoring

## Configuration

### WebSocket Mode (Default)

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
```

### Webhook Mode

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "webhook"
    webhookPath: "/generic/events"
    webhookPort: 3000
    webhookSecret: "your-secret-key"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
```

## Configuration Options

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

## Message Protocol

### Inbound Message (H5 → Server)

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

### Outbound Message (Server → H5)

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

## WebSocket Events

### Event Types

- `message.receive` - Inbound message from client
- `message.send` - Outbound message to client
- `connection.open` - Connection established
- `connection.close` - Connection closed
- `typing` - Typing indicator (optional)

### WebSocket Event Format

```typescript
{
  type: WSEventType;
  data: unknown;
}
```

## Usage Example

### H5 Client Connection

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

### Try the H5 Example

Open `examples/h5-client.html` in your browser to see a working chat interface:

1. Start OpenClaw with Generic channel enabled
2. Open `examples/h5-client.html` in a web browser
3. Enter the WebSocket server URL (default: `ws://localhost:8080/ws`)
4. Enter your chat ID and name
5. Click "Connect"
6. Start chatting with the AI!

## API Reference

### Public Functions

```typescript
// Monitor provider (starts the WebSocket/Webhook server)
import { monitorGenericProvider } from '@m1heng-clawd/feishu';

// Send a message
import { sendMessageGeneric } from '@m1heng-clawd/feishu';

// Probe channel status
import { probeGeneric } from '@m1heng-clawd/feishu';

// Access the plugin
import { genericPlugin } from '@m1heng-clawd/feishu';
```

## Architecture

The Generic Channel follows the same architecture as the Feishu channel:

```
src/generic/
├── types.ts           - TypeScript type definitions
├── config-schema.ts   - Zod configuration schema
├── runtime.ts         - Runtime state management
├── client.ts          - WebSocket server and client manager
├── bot.ts             - Inbound message handler
├── send.ts            - Outbound message sender
├── reply-dispatcher.ts - Streaming reply handler
├── outbound.ts        - Outbound adapter implementation
├── monitor.ts         - WebSocket/Webhook listener
├── probe.ts           - Health check utility
└── channel.ts         - Channel plugin definition
```

## Differences from Feishu Channel

- No external platform dependencies (Feishu SDK, etc.)
- Simplified message format without complex platform-specific features
- Direct WebSocket support for real-time communication
- No media upload/download (media URLs sent as text)
- No native typing indicators or reactions
- No directory services (no user/group lookup)

## Development

Type check:
```bash
npx tsc --noEmit
```

## License

MIT
