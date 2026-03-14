# Generic Channel 接入指南

这份文档只讲一件事: 你的 H5 页面、聊天 App、uni-app、Taro、微信小程序，怎样直接接入 `generic-channel`，把前端会话接到 OpenClaw。

如果你只想先跑通，请先看这三项:

1. 服务端开启 `channels.generic-channel`
2. 客户端用 WebSocket 连接 `ws://host:port/ws?chatId=会话ID`
3. 客户端按协议发送 `message.receive` 事件

## 1. 服务端最小配置

当前真实频道 ID 是 `generic-channel`，不是 `generic`。

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 20
    mediaMaxMb: 30
```

推荐同时保证 OpenClaw 会话粒度是按「频道 + 用户 / 会话」隔离的。多用户并发时，建议把 `session.dmScope` 设为 `per-account-channel-peer`，否则不同窗口或不同用户可能串到同一个 DM 会话。

如果你要自动语音 / 音频转写，再加上:

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

前置条件:

- gateway 主机已安装 `ffmpeg`
- 上面配置的 Python 里已安装 `faster-whisper`

## 2. 接入模型

你可以把 `generic-channel` 当成一个很薄的聊天协议层:

- 你的前端负责建立 WebSocket 连接
- 你的前端负责把用户输入包装成 JSON 事件
- 插件负责把消息转给 OpenClaw agent
- 插件再把 agent 的回复推回你的前端

也就是说，它不是“只能接 H5 示例页”，而是任何能发 WebSocket JSON 的客户端都能接:

- H5 / Web App
- iOS / Android 聊天 App
- uni-app / Taro / React Native / Flutter
- 微信小程序

## 3. 客户端必须准备的身份字段

最少需要这几个值:

| 字段 | 作用 | 建议来源 |
|------|------|----------|
| `serverUrl` | WebSocket 地址 | 例如 `ws://host:18080/ws` |
| `chatId` | 会话 ID | 私聊用会话 ID，群聊用群 ID |
| `senderId` | 当前发言用户 ID | 业务系统里的用户主键 |
| `senderName` | 当前发言用户显示名 | 昵称 / 用户名 |
| `chatType` | 会话类型 | `direct` 或 `group` |

注意:

- H5 示例页为了最简化，默认把 `senderId` 直接写成了 `chatId`
- 真实 App 接入时，不要机械照搬这个简化写法
- 如果“用户 ID”和“会话 ID”不是一个东西，就必须分开传

推荐映射方式:

| 场景 | `chatId` | `senderId` | `chatType` |
|------|----------|------------|------------|
| 用户和 AI 私聊 | 当前私聊会话 ID | 当前登录用户 ID | `direct` |
| 群聊 | 群 ID | 当前登录用户 ID | `group` |
| 一个用户多端登录 | 仍用同一个业务会话 ID | 同一个用户 ID | 按实际场景 |
| 多个不同业务线共用一个 OpenClaw | 给 `chatId` 加业务前缀 | 给 `senderId` 加业务前缀 | 按实际场景 |

一句话: `chatId` 是“这条消息属于哪个会话”，`senderId` 是“是谁发的”。

## 4. 连接方式

客户端连接时，当前协议要求把 `chatId` 放在 WebSocket URL 查询参数里:

```javascript
const chatId = "conv-10001";
const ws = new WebSocket(
  `ws://localhost:18080/ws?chatId=${encodeURIComponent(chatId)}`
);
```

连接成功后，服务端会先回一个 `connection.open`:

```json
{
  "type": "connection.open",
  "data": {
    "chatId": "conv-10001",
    "timestamp": 1710000000000
  }
}
```

如果当前会话有历史消息，服务端还会紧接着回 `history.sync`。

## 5. 前端 -> 插件: 发消息协议

所有客户端发给插件的消息，外层都要包一层事件信封:

```json
{
  "type": "message.receive",
  "data": {
    "...": "..."
  }
}
```

`data` 字段定义如下:

```ts
type InboundMessage = {
  messageId: string;
  chatId: string;
  chatType: "direct" | "group";
  senderId: string;
  senderName?: string;
  messageType: "text" | "image" | "voice" | "audio" | "file";
  content: string;
  mediaUrl?: string;
  mimeType?: string;
  timestamp: number;
  parentId?: string;
};
```

### 文本消息示例

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-1710000000001",
    "chatId": "conv-10001",
    "chatType": "direct",
    "senderId": "user-42",
    "senderName": "Leway",
    "messageType": "text",
    "content": "帮我总结一下这张图片",
    "timestamp": 1710000000001
  }
}
```

### 图片消息示例

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-1710000000002",
    "chatId": "conv-10001",
    "chatType": "direct",
    "senderId": "user-42",
    "senderName": "Leway",
    "messageType": "image",
    "content": "请描述图片内容",
    "mediaUrl": "data:image/jpeg;base64,...",
    "mimeType": "image/jpeg",
    "timestamp": 1710000000002
  }
}
```

### 语音消息示例

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-1710000000003",
    "chatId": "conv-10001",
    "chatType": "direct",
    "senderId": "user-42",
    "senderName": "Leway",
    "messageType": "voice",
    "content": "",
    "mediaUrl": "data:audio/webm;base64,...",
    "mimeType": "audio/webm",
    "timestamp": 1710000000003
  }
}
```

### 音频文件示例

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-1710000000004",
    "chatId": "conv-10001",
    "chatType": "direct",
    "senderId": "user-42",
    "senderName": "Leway",
    "messageType": "audio",
    "content": "这是会议录音",
    "mediaUrl": "https://cdn.example.com/audio/meeting.mp3",
    "mimeType": "audio/mpeg",
    "timestamp": 1710000000004
  }
}
```

## 6. `mediaUrl` 应该怎么传

当前插件支持两种方式:

1. 直接传 Data URL
2. 传一个插件可访问的 `http(s)` URL

推荐:

- H5 / 小程序本地选图、本地录音: 直接转成 Data URL 最简单
- 大文件或长期存储: 先传到你自己的对象存储，再把 HTTPS URL 发给插件

注意:

- `messageType = "image"` 时，`mimeType` 应为 `image/*`
- `messageType = "voice"` 时，推荐 `audio/webm`
- `messageType = "audio"` 时，推荐真实音频 MIME，例如 `audio/mpeg`、`audio/mp4`
- 现在 GPT-5.2 这类模型支持 image 输入，插件会把图片媒体保留下来传给 agent

## 7. 插件 -> 前端: 收消息协议

### `message.send`

agent 的普通回复:

```ts
type OutboundMessage = {
  messageId: string;
  chatId: string;
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio";
  mediaUrl?: string;
  mimeType?: string;
  replyTo?: string;
  timestamp: number;
};
```

示例:

```json
{
  "type": "message.send",
  "data": {
    "messageId": "msg-1710000001000",
    "chatId": "conv-10001",
    "content": "这张图片里有一只猫，坐在窗边。",
    "contentType": "text",
    "timestamp": 1710000001000
  }
}
```

### `history.sync`

连接建立后推送当前会话历史:

```json
{
  "type": "history.sync",
  "data": {
    "chatId": "conv-10001",
    "messages": [
      {
        "messageId": "msg-1",
        "chatId": "conv-10001",
        "direction": "sent",
        "content": "你好",
        "contentType": "text",
        "timestamp": 1710000000000
      },
      {
        "messageId": "msg-2",
        "chatId": "conv-10001",
        "direction": "received",
        "content": "你好，有什么可以帮你？",
        "contentType": "text",
        "timestamp": 1710000000500
      }
    ],
    "timestamp": 1710000002000
  }
}
```

`direction` 规则:

- `sent`: 用户发给插件的消息
- `received`: agent / OpenClaw 回给客户端的消息

### `thinking.start` / `thinking.update` / `thinking.end`

用于显示“AI 正在思考”:

```json
{
  "type": "thinking.update",
  "data": {
    "chatId": "conv-10001",
    "content": "正在分析图片内容",
    "timestamp": 1710000000900
  }
}
```

### `connection.open`

连接成功确认，前面已经展示。

## 8. H5 最小可运行示例

这就是自己接页面时最小需要的逻辑:

```html
<script>
  const serverUrl = "ws://localhost:18080/ws";
  const chatId = "conv-10001";
  const senderId = "user-42";
  const senderName = "Leway";

  const ws = new WebSocket(
    `${serverUrl}?chatId=${encodeURIComponent(chatId)}`
  );

  ws.onmessage = (event) => {
    const packet = JSON.parse(event.data);

    if (packet.type === "message.send") {
      console.log("AI:", packet.data.content);
    }

    if (packet.type === "history.sync") {
      console.log("history:", packet.data.messages);
    }
  };

  function sendText(content) {
    ws.send(JSON.stringify({
      type: "message.receive",
      data: {
        messageId: `msg-${Date.now()}`,
        chatId,
        chatType: "direct",
        senderId,
        senderName,
        messageType: "text",
        content,
        timestamp: Date.now()
      }
    }));
  }
</script>
```

真实参考实现直接看:

- `../examples/h5-client.html`

## 9. 微信上怎么接

微信小程序也一样，本质上就是:

1. `wx.connectSocket`
2. 收到文本 / 图片 / 音频后包装成同样的 JSON
3. 用 `socket.send({ data: JSON.stringify(packet) })` 发出去

示例:

```javascript
const chatId = "wx-conv-10001";
const senderId = "wx-user-42";
const senderName = "微信用户";

const socket = wx.connectSocket({
  url: `wss://example.com/ws?chatId=${encodeURIComponent(chatId)}`
});

socket.onMessage((res) => {
  const packet = JSON.parse(res.data);
  if (packet.type === "message.send") {
    console.log("AI:", packet.data.content);
  }
});

function sendText(content) {
  socket.send({
    data: JSON.stringify({
      type: "message.receive",
      data: {
        messageId: `msg-${Date.now()}`,
        chatId,
        chatType: "direct",
        senderId,
        senderName,
        messageType: "text",
        content,
        timestamp: Date.now()
      }
    })
  });
}
```

如果是图片 / 语音:

- 先把本地文件读成 base64
- 拼成 Data URL
- 填到 `mediaUrl`
- 对应设置 `messageType` 和 `mimeType`

示意:

```javascript
function fileToDataUrl(path, mimeType) {
  const fs = wx.getFileSystemManager();
  const base64 = fs.readFileSync(path, "base64");
  return `data:${mimeType};base64,${base64}`;
}
```

## 10. 聊天 App / 第三方 IM 如何映射

如果你不是直接写页面，而是把现有聊天系统桥接过来，按下面映射就够了:

| 你自己的字段 | generic-channel 字段 |
|--------------|----------------------|
| 会话 ID / dialogId / threadId | `chatId` |
| 当前发消息的用户 ID | `senderId` |
| 当前发消息的昵称 | `senderName` |
| 私聊 / 单聊 | `chatType = "direct"` |
| 群聊 / 频道 / 讨论组 | `chatType = "group"` |
| 文本内容 | `content` |
| 图片 / 语音 / 音频资源地址 | `mediaUrl` |

桥接原则只有两条:

1. `chatId` 必须稳定，不能每次页面刷新都变
2. `senderId` 必须是业务真实用户，而不是临时随机值

## 11. 音频 / 语音自动转写怎么生效

开启 `transcription.enabled = true` 后:

- `messageType = "voice"` 会自动转写
- `messageType = "audio"` 也会自动转写
- 转写结果会自动注入到 agent 上下文
- 客户端协议不需要额外改字段

也就是说，前端只需要正常发 `voice` / `audio`，转文本逻辑已经放在插件里。

## 12. 接入时最容易踩的坑

### 把频道名写成 `generic`

现在真实配置键是:

```yaml
channels:
  generic-channel:
```

### `chatId` 和 `senderId` 混用

示例页为了简单把两者写成一样，但真实业务接入时通常不是一回事。

### 同一套 OpenClaw 被多个 H5 / 多个用户同时使用

建议把 `session.dmScope` 配成 `per-account-channel-peer`，否则多个用户可能共用一条 DM 线程。

### 语音消息 MIME 不对

`voice` 推荐 `audio/webm`。如果浏览器录到的是 `video/webm` 容器，插件也会按音频处理，但前端最好仍明确传 `audio/webm`。

### 发了图片但模型看不到

先确认:

1. `messageType` 是不是 `image`
2. `mimeType` 是不是 `image/*`
3. `mediaUrl` 是不是有效的 Data URL 或 HTTPS URL
4. 你当前所选模型本身是否支持图像输入

## 13. 参考实现

真实接入参考:

- `../examples/h5-client.html`

相关文档:

- `../README.md`
- `./CONFIG_EXAMPLES.md`
- `./CONFIG_EXAMPLES_ZH.md`
- `./README.md`
