# 通用频道配置示例

## 快速开始指南

### 第一步：安装插件

选择以下任一方式安装：

**方式 A：使用 OpenClaw CLI（推荐）**
```bash
openclaw plugins install @restry/generic-channel
```

**方式 B：使用 npm**
```bash
npm install @restry/generic-channel
```

### 第二步：插件位置

安装后，插件会自动放置在 OpenClaw 的插件目录中：
- **Linux/macOS**: `~/.openclaw/plugins/@restry/generic-channel/`
- **Windows**: `%USERPROFILE%\.openclaw\plugins\@restry\generic-channel\`

你不需要手动移动任何文件 - OpenClaw 插件系统会自动处理。

### 第三步：配置频道

编辑 OpenClaw 配置文件 `~/.openclaw/config.yaml`（或通过 `openclaw config path` 查看路径）：

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"
```

或使用命令行配置：
```bash
openclaw config set channels.generic.enabled true
openclaw config set channels.generic.connectionMode websocket
openclaw config set channels.generic.wsPort 8080
```

### 第四步：启动 OpenClaw

```bash
openclaw start
```

你应该在日志中看到：
```
[generic] WebSocket server started on port 8080 at path /ws
```

### 第五步：连接 H5 客户端

有两种方式连接：

#### 方式 A：使用自带的示例客户端

1. 找到示例客户端文件：
   - 如果通过 npm 安装：`node_modules/@restry/generic-channel/examples/h5-client.html`
   - 如果通过 OpenClaw 安装：`~/.openclaw/plugins/@restry/generic-channel/examples/h5-client.html`

2. 在浏览器中打开 `h5-client.html`（双击或使用 `file://` URL）

3. 在连接表单中填写：
   - **WebSocket URL**: `ws://localhost:8080/ws`（根据需要调整主机和端口）
   - **Chat ID**: 任意唯一标识符（如 `user-123`）
   - **Your Name**: 你的显示名称

4. 点击 **Connect** 开始聊天！

#### 方式 B：集成到你自己的 H5 页面

在你的 H5 应用中添加 WebSocket 连接代码：

```javascript
// 连接到通用频道
const ws = new WebSocket('ws://localhost:8080/ws?chatId=user-123');

ws.onopen = () => {
  console.log('已连接到 AI');
};

// 发送消息
function sendMessage(text) {
  ws.send(JSON.stringify({
    type: 'message.receive',
    data: {
      messageId: 'msg-' + Date.now(),
      chatId: 'user-123',
      chatType: 'direct',
      senderId: 'user-123',
      senderName: '用户',
      messageType: 'text',
      content: text,
      timestamp: Date.now()
    }
  }));
}

// 接收 AI 回复
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'message.send') {
    console.log('AI 回复:', msg.data.content);
  }
};
```

---

## 配置示例

### 示例 1：WebSocket 模式（默认）

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

### 示例 2：Webhook 模式

```yaml
channels:
  generic:
    enabled: true
    connectionMode: "webhook"
    webhookPath: "/generic/events"
    webhookPort: 3000
    webhookSecret: "你的密钥"
    dmPolicy: "open"
    historyLimit: 10
    textChunkLimit: 4000
```

### 示例 3：使用白名单（限制访问）

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

### 示例 4：配对模式（需要审批）

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

---

## 配置选项说明

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
| `allowFrom` | array | `[]` | 允许的发送者 ID（用于 allowlist 策略） |
| `historyLimit` | number | `10` | 群聊保留的历史消息数量 |
| `textChunkLimit` | number | `4000` | 每条消息的最大字符数 |

---

## 测试你的配置

1. 将配置保存到 `~/.openclaw/config.yaml` 或你的 OpenClaw 配置位置
2. 启动 OpenClaw：
   ```bash
   openclaw start
   ```
3. 检查日志确认通用频道启动成功：
   ```
   [generic] WebSocket server started on port 8080 at path /ws
   ```
4. 在浏览器中打开 `examples/h5-client.html`
5. 使用 `ws://localhost:8080/ws` 连接（或你配置的端口/路径）

---

## 环境特定配置

### 开发环境
```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    dmPolicy: "open"
```

### 生产环境
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

---

## 故障排除

### WebSocket 连接失败
- 检查端口是否被占用：`lsof -i :8080`
- 检查防火墙设置是否允许该端口
- 查看 OpenClaw 日志中的错误信息

### 消息没有被接收
- 确认客户端中的 chatId 与配置匹配
- 检查 dmPolicy 是否为 "allowlist"，且你的用户在 allowFrom 列表中
- 查看浏览器控制台和 OpenClaw 日志中的错误

### 配置未生效
- 配置修改后需要重启 OpenClaw
- 检查 YAML 语法是否正确（缩进很重要）
- 查看 OpenClaw 日志中的配置验证错误

---

## 网络与部署注意事项

### 本地开发

本地开发时，使用 WebSocket 模式和默认配置：
```yaml
channels:
  generic:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
```

H5 客户端连接到 `ws://localhost:8080/ws`。

### 生产环境部署

生产环境部署需要考虑以下因素：

1. **使用 HTTPS/WSS**
   - 在 OpenClaw 前面配置反向代理（nginx、Caddy 等）
   - 配置 SSL 证书
   - H5 客户端通过 `wss://your-domain.com/ws` 连接

2. **防火墙配置**
   - 开放 WebSocket 端口（默认：8080）或 Webhook 端口（默认：3000）
   - 云服务器需要更新安全组规则

3. **无服务器环境使用 Webhook 模式**
   - 如果你的托管环境不支持长连接 WebSocket，使用 webhook 模式
   - 配置 webhook 密钥以增强安全性

### 反向代理示例（nginx）

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

### Docker 部署

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
# 在运行时挂载配置文件（出于安全考虑推荐此方式）
docker run -p 8080:8080 -v /path/to/config.yaml:/root/.openclaw/config.yaml openclaw-generic
```

> **注意**：在运行时挂载 `config.yaml` 而不是将其复制到镜像中，以避免在镜像中硬编码敏感凭据。

---

## 相关文档

- [通用频道文档](../GENERIC_CHANNEL.md) - 完整 API 参考
- [README](../README.md) - 概述及配置说明
- [H5 客户端示例](./h5-client.html) - 可运行的演示客户端
