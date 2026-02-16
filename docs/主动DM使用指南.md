# 主动 DM 使用指南

## 问题解答

**问题：** 这个新建的通道怎样才能支持 OpenClaw 发 DM 主动消息？

**答案：** Generic Channel **已经支持** OpenClaw 发送主动 DM 消息！不需要进行任何调整。

## 工作原理

Generic Channel 已经实现了 OpenClaw 的 `ChannelOutboundAdapter` 接口，这意味着：

1. ✅ OpenClaw Agent 可以使用内置工具主动发送消息
2. ✅ 可以通过程序化 API (`sendMessageGeneric`) 主动推送消息
3. ✅ 支持文本、Markdown、图片、语音、音频等多种消息类型
4. ✅ 支持向单个用户或群组发送消息

## 三种使用方法

### 1️⃣ 通过 OpenClaw Agent（最简单）

直接告诉 Agent 发送消息即可：

```
请向用户 user-123 发送一条提醒消息
```

Agent 会自动调用消息工具完成发送。

### 2️⃣ 通过程序化 API（适合定时任务、webhook 等）

```typescript
import { sendMessageGeneric } from '@restry/generic-channel';

// 发送文本消息
await sendMessageGeneric({
  cfg,                          // OpenClaw 配置
  to: "user-123",              // 目标用户 ID
  text: "这是一条主动消息"
});

// 发送 Markdown 消息
await sendMessageGeneric({
  cfg,
  to: "user-123",
  text: "# 标题\n\n这是 **Markdown** 消息",
  contentType: "markdown"
});
```

### 3️⃣ 发送媒体消息

```typescript
import { sendMediaGeneric } from '@restry/generic-channel';

// 发送图片
await sendMediaGeneric({
  cfg,
  to: "user-123",
  mediaUrl: "https://example.com/image.jpg",
  mediaType: "image",
  caption: "图片说明"
});
```

## 实用场景示例

### 场景 1：定时提醒

```typescript
// 每天早上 9 点发送提醒
async function sendDailyReminder(cfg, userId) {
  await sendMessageGeneric({
    cfg,
    to: userId,
    text: "早上好！这是你的每日提醒 ☀️"
  });
}
```

### 场景 2：事件通知

```typescript
// 外部事件触发通知
async function notifyUserOfEvent(cfg, userId, eventData) {
  const message = `
# 事件通知

**类型**: ${eventData.type}
**时间**: ${new Date(eventData.timestamp).toLocaleString()}
**详情**: ${eventData.description}
  `.trim();

  await sendMessageGeneric({
    cfg,
    to: userId,
    text: message,
    contentType: "markdown"
  });
}
```

### 场景 3：广播消息

```typescript
// 向所有在线用户广播
async function broadcastMessage(cfg, userIds, message) {
  const promises = userIds.map(userId =>
    sendMessageGeneric({ cfg, to: userId, text: message })
  );
  await Promise.all(promises);
}
```

## 配置要求

建议使用以下配置以支持主动 DM：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
    dmPolicy: "open"           # 允许主动发送消息
    textChunkLimit: 4000
```

## 重要注意事项

1. **客户端必须在线**：只有当客户端 WebSocket 连接处于活跃状态时，消息才能送达
2. **使用正确的 chatId**：必须使用客户端连接时使用的相同 `chatId`
3. **WebSocket 模式**：只有 WebSocket 模式支持主动推送，Webhook 模式不支持
4. **消息不会排队**：如果客户端未连接，消息会被忽略（不会保存）

## 目标格式

支持三种目标格式：

| 格式 | 说明 | 示例 |
|------|------|------|
| `user-id` | 直接使用用户 ID | `"user-123"` |
| `user:user-id` | 明确指定为用户 | `"user:user-123"` |
| `chat:chat-id` | 发送到群聊 | `"chat:group-789"` |

## 故障排除

### 消息没有送达？

1. **检查客户端是否在线**
   ```typescript
   import { getGenericWSManager } from '@restry/generic-channel/src/generic/client.js';

   const wsManager = getGenericWSManager();
   const isConnected = wsManager?.hasClient(chatId);
   console.log(`客户端 ${chatId} 在线状态:`, isConnected);
   ```

2. **查看 OpenClaw 日志**
   查找 `Client ${chatId} not connected` 警告信息

3. **验证 chatId**
   确保使用的 chatId 与客户端连接时使用的完全一致

## 完整文档

完整的双语文档（中英文）请查看：[docs/PROACTIVE_DM.md](./PROACTIVE_DM.md)

## 总结

Generic Channel 从一开始就设计为支持主动 DM 发送。你不需要做任何修改，只需要：

1. 确保使用 WebSocket 模式
2. 客户端保持连接
3. 使用正确的 API 或让 Agent 帮你发送

就是这么简单！🎉
