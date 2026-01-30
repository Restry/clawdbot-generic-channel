# Generic Channel Configuration Examples

## Quick Start Guide

### Step 1: Install the Plugin

Choose one of the following methods:

**Option A: Using OpenClaw CLI (Recommended)**
```bash
openclaw plugins install @restry/generic-channel
```

**Option B: Using npm**
```bash
npm install @restry/generic-channel
```

### Step 2: Plugin Location

After installation, the plugin is automatically placed in the OpenClaw plugins directory:
- **Linux/macOS**: `~/.openclaw/plugins/@restry/generic-channel/`
- **Windows**: `%USERPROFILE%\.openclaw\plugins\@restry\generic-channel\`

You don't need to move any files manually - the OpenClaw plugin system handles this.

### Step 3: Configure the Channel

Edit your OpenClaw config file at `~/.openclaw/config.yaml` (or the path shown by `openclaw config path`):

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
```

Or use the CLI:
```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

### Step 4: Start OpenClaw

```bash
openclaw start
```

You should see in the logs:
```
[generic] WebSocket server started on port 8080 at path /ws
```

### Step 5: Connect with H5 Client

There are two ways to connect:

#### Option A: Use the Included Example Client

1. Locate the example client file:
   - If installed via npm: `node_modules/@restry/generic-channel/examples/h5-client.html`
   - If installed via OpenClaw: `~/.openclaw/plugins/@restry/generic-channel/examples/h5-client.html`

2. Open `h5-client.html` in your web browser (double-click or use `file://` URL)

3. In the connection form:
   - **WebSocket URL**: `ws://localhost:8080/ws` (adjust host/port as needed)
   - **Chat ID**: Any unique identifier (e.g., `user-123`)
   - **Your Name**: Your display name

4. Click **Connect** and start chatting!

#### Option B: Integrate into Your Own H5 Page

Add WebSocket connection code to your H5 application:

```javascript
// Connect to Generic Channel
const ws = new WebSocket('ws://localhost:8080/ws?chatId=user-123');

ws.onopen = () => {
  console.log('Connected to AI');
};

// Send a message
function sendMessage(text) {
  ws.send(JSON.stringify({
    type: 'message.receive',
    data: {
      messageId: 'msg-' + Date.now(),
      chatId: 'user-123',
      chatType: 'direct',
      senderId: 'user-123',
      senderName: 'User',
      messageType: 'text',
      content: text,
      timestamp: Date.now()
    }
  }));
}

// Receive AI responses
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'message.send') {
    console.log('AI says:', msg.data.content);
  }
};
```

---

## Configuration Examples

### Example 1: WebSocket Mode (Default)

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

### Example 2: Webhook Mode

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

### Example 3: With Allowlist (Restricted Access)

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "allowlist"
    allowFrom:
      - "user-123"
      - "user-456"
      - "admin-user"
    historyLimit: 10
    textChunkLimit: 4000
```

### Example 4: Pairing Mode (Approval Required)

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "pairing"
    historyLimit: 10
    textChunkLimit: 4000
```

## Testing Your Configuration

1. Save your config to `~/.openclaw/config.yaml` or your OpenClaw config location
2. Start OpenClaw:
   ```bash
   openclaw start
   ```
3. Check the logs to verify the Generic Channel started successfully:
   ```
   [generic] WebSocket server started on port 8080 at path /ws
   ```
4. Open `examples/h5-client.html` in your browser
5. Connect using `ws://localhost:8080/ws` (or your configured port/path)

## Environment-Specific Configurations

### Development
```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    dmPolicy: "open"
```

### Production
```yaml
channels:
  generic:
    enabled: true
    connectionMode: "webhook"
    webhookPath: "/generic/events"
    webhookPort: 3000
    webhookSecret: "${GENERIC_WEBHOOK_SECRET}"
    dmPolicy: "allowlist"
    allowFrom:
      - "${APPROVED_USER_1}"
      - "${APPROVED_USER_2}"
```

## Troubleshooting

### WebSocket Connection Failed
- Check if the port is already in use: `lsof -i :8080`
- Verify firewall settings allow the port
- Check OpenClaw logs for error messages

### Messages Not Being Received
- Verify the chatId in your client matches what you configured
- Check if dmPolicy is "allowlist" and your user is in allowFrom
- Look for errors in browser console and OpenClaw logs

### Configuration Not Applied
- Restart OpenClaw after config changes
- Verify YAML syntax is correct (indentation matters)
- Check OpenClaw logs for config validation errors

---

## Network & Deployment Considerations

### Local Development

For local development, use WebSocket mode with default settings:
```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
```

The H5 client connects to `ws://localhost:8080/ws`.

### Production Deployment

For production, consider these factors:

1. **Use HTTPS/WSS**
   - Place a reverse proxy (nginx, Caddy, etc.) in front of OpenClaw
   - Configure SSL certificates
   - H5 clients connect via `wss://your-domain.com/ws`

2. **Firewall Configuration**
   - Open the WebSocket port (default: 8080) or webhook port (default: 3000)
   - For cloud servers, update security groups accordingly

3. **Use Webhook Mode for Serverless**
   - If your hosting doesn't support long-running WebSocket connections, use webhook mode
   - Configure a webhook secret for security

### Reverse Proxy Example (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### Docker Deployment

```dockerfile
FROM node:20
WORKDIR /app
RUN npm install -g openclaw
RUN openclaw plugins install @restry/generic-channel
EXPOSE 8080
CMD ["openclaw", "start"]
```

```bash
docker build -t openclaw-generic .
# Mount config at runtime (recommended for security)
docker run -p 8080:8080 -v /path/to/config.yaml:/root/.openclaw/config.yaml openclaw-generic
```

> **Note**: Mount `config.yaml` at runtime instead of copying it into the image to avoid hardcoding sensitive credentials.

---

## See Also

- [Generic Channel Documentation](../GENERIC_CHANNEL.md) - Full API reference
- [README](../README.md) - Overview and setup
- [H5 Client Example](./h5-client.html) - Working demo client
