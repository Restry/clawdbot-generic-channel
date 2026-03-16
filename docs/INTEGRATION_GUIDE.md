# Generic Channel 接入指南

这份文档面向第三方接入方：你的 H5 页面、聊天 App、uni-app、Taro、微信小程序，怎样直接接入 `generic-channel`，把前端会话接到 OpenClaw。

当前已经完成真实 E2E 的接入路径有两条：

- `websocket` 直连
- `relay` 转发

如果是公网或半公网部署，优先走 `relay`；如果只是本地或内网调试，直连 `websocket` 更简单。

## 0. 快速接入

如果你是第三方集成方，先看这一节，不需要先读全文。

### 0.1 最短路径

1. 服务端开启 `channels.generic-channel`
2. 本地/内网调试时，客户端直连 `ws://host:port/ws`
3. 公网部署时，插件改成 `connectionMode: "relay"`，客户端连接 `ws://relay-host:19080/client?channelId=<channelId>`
4. 客户端发送 `message.receive`
5. 客户端处理 `connection.open`、`history.sync`、`message.send`
6. 如果启用了 token 认证，连接 URL 额外带 `token`
7. 如果服务端配置了多个 agent，可选接 `agent.list.get` / `agent.select`

### 0.2 服务端最小配置

最小直连 WebSocket 配置：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    dmPolicy: "open"
    historyLimit: 20
```

如果端口要暴露到公网或半公网，建议直接用 relay，而不是把插件的 `wsPort` 暴露出去。

插件改成 relay 模式：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "relay"
    relay:
      url: "ws://127.0.0.1:19080/backend"
      channelId: "demo"
      secret: "replace-me"
      instanceId: "openclaw-sg-1"
    auth:
      enabled: true
      tokenParam: "token"
      users:
        - senderId: "user-42"
          token: "gc_user42_xxxxxxxxx"
          allowAgents: ["main", "code"]
```

`relay-gateway` 的最小环境变量：

```bash
RELAY_PORT=19080
RELAY_CHANNELS_JSON='{"demo":{"secret":"replace-me"}}'
```

启动后可以直接打开管理页：

```text
http://relay-host:19080/admin
```

如果你的前端页面本身跑在 `https://`，客户端入口就必须是 `wss://`，不能再让浏览器去连
`ws://...`。推荐做法是：

1. `relay-gateway` 只监听本机回环，例如 `RELAY_HOST=127.0.0.1`、`RELAY_PORT=18080`
2. 用 Caddy / Nginx 在公网域名上提供 `https://relay-host` 和 `wss://relay-host`
3. OpenClaw 插件仍然连本机 `ws://127.0.0.1:18080/backend`
4. 第三方客户端只连 `wss://relay-host/client?...`

最小 Caddyfile 示例：

```caddyfile
{
  email ops@example.com
}

relay.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:18080
}
```

切到 TLS 反代后：

- 管理页：`https://relay-host/admin`
- client 入口：`wss://relay-host/client?channelId=demo`
- backend 入口：仍然只给插件本机使用 `ws://127.0.0.1:18080/backend`

管理页当前支持：

- 展示当前已配置服务器列表
- 展示 backend 在线状态和当前客户端连接数
- 配置 channel secret
- 配置该服务器下的用户、token、固定 `chatId` 和 `allowAgents`

如果你暂时还要直连暴露端口，建议一开始就开 token 认证：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    auth:
      enabled: true
      tokenParam: "token"
      users:
        - senderId: "user-42"
          token: "gc_user42_xxxxxxxxx"
          allowAgents: ["main", "code"]
```

多用户接入时，建议同时加上：

```yaml
session:
  dmScope: "per-account-channel-peer"
```

### 0.3 客户端最小示例

```javascript
const ws = new WebSocket("ws://localhost:18080/ws?token=gc_user42_xxxxxxxxx");

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "message.receive",
    data: {
      messageId: "msg-" + Date.now(),
      chatId: "conv-10001",
      chatType: "direct",
      senderId: "user-42",
      senderName: "Leway",
      messageType: "text",
      content: "你好",
      timestamp: Date.now()
    }
  }));
};

ws.onmessage = (event) => {
  const packet = JSON.parse(event.data);
  if (packet.type === "message.send") {
    console.log("AI 回复:", packet.data.content);
  }
};
```

如果你接的是仓库里的 [h5-client.html](/Users/leway/Projects/clawdbot-generic-channel/examples/h5-client.html)，现在还支持直接导入完整连接地址：

- `ws://host:18080/ws?chatId=xxx&token=xxx&senderId=xxx`
- `openclaw://connect?serverUrl=ws://...&token=xxx&chatId=xxx&name=xxx`

客户端会自动拆出 `serverUrl`、`token`、`chatId`、用户名称，并支持一键连接或扫码导入。
如果 URL 里额外带了 `agentId`，客户端首次连接时也会自动带上该 agent 选择。

### 0.4 先记住这几个规则

- `chatId` = 这条消息属于哪个会话
- `senderId` = 当前是谁在发言
- `token` 绑定的是用户身份，不默认绑定固定 `chatId`
- `channelId` = relay 网关里把一组客户端路由到哪个插件实例
- `relay-gateway` 可以直接托管这组客户端的用户/token
- 如果连接显式选中了 `agentId`，`history.sync` 和 `history.get` 会按 `chatId + agentId` 过滤
- `examples/h5-client.html` 是参考页，不是协议规范本身
- relay 模式下，客户端只连 `/client`，不能连 `/backend`

## 0.5 H5 示例页排障

这次接入里，最容易混淆的是：`http://127.0.0.1:4173/examples/h5-client.html` 能打开，只代表静态页面服务正常，不代表后端 WebSocket 一定可连。

建议按下面顺序排查：

1. 先确认页面本身是通过静态文件服务打开的，例如在仓库根目录运行：

```bash
python3 -m http.server 4173
```

2. 再确认页面里填写的 `serverUrl` 是真实的 WebSocket 端点

   - 直连模式示例：`ws://host:18080/ws`
   - relay 模式示例：`ws://relay-host:19080/client?channelId=demo`

3. 如果服务端启用了 user-token 认证，先确认 token 对应的是正确用户；只有在兼容旧模式、显式配置了固定 `chatId` 时，才需要检查 URL 里的 `chatId` 是否与它一致

4. 如果你之前测过别的环境，先检查浏览器 `localStorage`

   - H5 示例页会缓存 `serverUrl`、`chatId`、`userName` 和历史连接
   - `token` 出于安全考虑**不会**写入本地缓存
   - 所以“页面看起来像是新开的”，实际仍可能自动带着旧的 `serverUrl/chatId`

5. 真正连通后，页面会出现这几个信号：

   - 顶部状态从“未连接”变成“已连接”
   - 弹出“已连接到服务器”
   - 控制台会先后出现 `WebSocket connected`、`connection.open`，以及可能出现的 `history.sync` / `agent.list`

这次实测已确认：重新启动本地 `4173` 静态服务后，`examples/h5-client.html` 仍可正常连到远端 `generic-channel`，问题排查重点应放在 `serverUrl`、token 对应的用户身份、浏览器缓存，以及当前会话 ID 是否填对，而不是先怀疑静态页本身。

## 1. 服务端详细配置

如果你只想尽快接通，前面的 `0.2 服务端最小配置` 已经够用。这一节补充的是更完整的认证兼容模式、会话隔离建议和转写配置。

当前真实频道 ID 是 `generic-channel`，不是 `generic`。

如果你准备公网部署，建议把“插件服务”和“外部暴露端口”拆开：

- OpenClaw 插件只主动连 relay backend
- 第三方客户端只连 relay client
- 外部网络不再直接访问 OpenClaw 所在主机的插件端口

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

如果你要公网部署，建议改成 relay：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "relay"
    relay:
      url: "ws://127.0.0.1:19080/backend"
      channelId: "demo"
      secret: "replace-me"
      instanceId: "openclaw-sg-1"
    auth:
      enabled: true
      tokenParam: "token"
      users:
        - senderId: "user-42"
          chatId: "conv-10001" # 可选，仅用于兼容旧的一 token 一 chat 模式
          token: "gc_user42_xxxxxxxxx"
          allowAgents: ["main", "code"]
```

`allowAgents` 留空时表示不限制 agent；如果你更想显式表达“允许所有 agent”，也可以写成 `["*"]`。

如果你要把插件端口直接暴露到公网或半公网，建议至少加上一用户一 token 认证：

```yaml
channels:
  generic-channel:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    auth:
      enabled: true
      tokenParam: "token"
      users:
        - senderId: "user-42"
          chatId: "conv-10001" # 可选，仅用于兼容旧的一 token 一 chat 模式
          token: "gc_user42_xxxxxxxxx"
          allowAgents: ["main", "code"]
```

建议同时补上：

```yaml
session:
  dmScope: "per-account-channel-peer"
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
| `serverUrl` | WebSocket 地址 | 例如 `ws://host:18080/ws` 或 `ws://relay-host:19080/client?channelId=demo` |
| `channelId` | relay 路由键 | 仅 relay 模式需要；用于定位后端插件实例 |
| `chatId` | 会话 / 线程 / 群聊房间 ID | 私聊线程用线程 ID，群聊用群 ID |
| `token` | 连接认证凭证 | 服务端启用 auth 时必填 |
| `senderId` | 当前发言用户 ID | 业务系统里的用户主键 |
| `senderName` | 当前发言用户显示名 | 昵称 / 用户名 |
| `chatType` | 会话类型 | `direct` 或 `group` |

注意:

- H5 示例页为了最简化，默认把 `senderId` 直接写成了 `chatId`
- 真实 App 接入时，不要机械照搬这个简化写法
- 如果“用户 ID”和“会话 ID”不是一个东西，就必须分开传
- `serverUrl` 可以只是 WebSocket 端点本身；在 relay 模式下，通常还会固定带上 `channelId`
- `chatId` 现在可以作为“当前活跃会话”的动态字段，既可以放在建连查询参数里当初始会话，也可以在后续消息和 `history.get` 请求里按需切换

推荐映射方式:

| 场景 | `chatId` | `senderId` | `chatType` |
|------|----------|------------|------------|
| 用户和 AI 私聊 | 当前私聊会话 ID | 当前登录用户 ID | `direct` |
| 群聊 | 群 ID | 当前登录用户 ID | `group` |
| 一个用户多端登录 | 仍用同一个业务会话 ID | 同一个用户 ID | 按实际场景 |
| 多个不同业务线共用一个 OpenClaw | 给 `chatId` 加业务前缀 | 给 `senderId` 加业务前缀 | 按实际场景 |

一句话: `chatId` 是“这条消息属于哪个会话”，`senderId` 是“是谁发的”。

现在推荐的客户端模型是：

- 连接先绑定“用户身份”
- 会话列表再按 `chatId` 维度切换
- agent 选择由 `agentId` 控制

也就是说，同一个用户连接后，可以在一个 WebSocket 里切换多个 `chatId`，不需要每切一次会话就断线重连。

## 3.1 当前要特别区分：协议支持 != 示例页 UI 已实现

当前 `generic-channel` 有几类能力已经在协议和服务端实现，但 `examples/h5-client.html` 还没有把它们做成完整 UI。

这次接入最容易误解的两项是：

- **引用回复**
  - 协议支持
  - 服务端支持
  - 当前 H5 示例页**没有**“点某条消息后引用回复”的现成 UI
- **消息表情反应（emoji reaction）**
  - 协议支持
  - 服务端支持
  - 当前 H5 示例页**没有** reaction 按钮、emoji 面板或 reaction 展示 UI

所以如果你是自己接 H5 / App / 小程序：

- 可以直接按下面的协议接入这两项能力
- 但不要把自带的 `examples/h5-client.html` 当成“这两项已经有现成前端交互”

## 4. 多 Agent 列表与选择

如果你的 OpenClaw 服务端配置了:

```yaml
agents:
  list:
    - id: "main"
      name: "主助手"
      default: true
    - id: "code"
      name: "代码助手"
    - id: "editor"
      name: "编辑助手"
```

那么 `generic-channel` 现在支持两种路由模式:

- 不显式选 agent: 继续走 OpenClaw 自己的 `bindings / default agent` 自动路由
- 显式选 agent: 前端主动列出 agent，然后把当前会话绑定到某个 agent

当前协议新增了四个事件:

- `agent.list.get`: 客户端请求可选 agent 列表
- `agent.list`: 服务端返回 agent 列表
- `agent.select`: 客户端把当前连接切到某个 agent；传空值表示恢复自动路由
- `agent.selected`: 服务端确认当前连接实际生效的选择结果

### 请求 agent 列表

```json
{
  "type": "agent.list.get",
  "data": {
    "requestId": "agent-list-1"
  }
}
```

```json
{
  "type": "agent.list",
  "data": {
    "requestId": "agent-list-1",
    "defaultAgentId": "main",
    "selectedAgentId": "code",
    "agents": [
      {
        "id": "main",
        "name": "主助手",
        "isDefault": true
      },
      {
        "id": "code",
        "name": "代码助手",
        "isDefault": false
      },
      {
        "id": "editor",
        "name": "编辑助手",
        "isDefault": false
      }
    ],
    "timestamp": 1710000000000
  }
}
```

### 切换当前连接的 agent

```json
{
  "type": "agent.select",
  "data": {
    "requestId": "agent-select-1",
    "agentId": "code"
  }
}
```

```json
{
  "type": "agent.selected",
  "data": {
    "requestId": "agent-select-1",
    "ok": true,
    "mode": "explicit",
    "selectedAgentId": "code",
    "timestamp": 1710000000100
  }
}
```

恢复自动路由时:

```json
{
  "type": "agent.select",
  "data": {
    "requestId": "agent-select-2",
    "agentId": null
  }
}
```

此时响应里的 `mode` 会变成 `auto`。

一句话:

- 你可以只依赖 OpenClaw `bindings`
- 也可以在前端自己做“主助手 / 代码助手 / 编辑助手”三个入口
- 真正控制消息发给谁的，是 `agentId` 选择结果，而不是前端自己改 `chatId`

## 5. 连接方式

客户端连接时，`chatId` 已经不是必填项了；如果你想在连接建立时就预选一个 agent，或者顺手指定一个“初始会话”，都可以放到 URL 查询参数里:

```javascript
const chatId = "conv-10001";
const token = "gc_user42_xxxxxxxxx";
const ws = new WebSocket(
  `ws://localhost:18080/ws?chatId=${encodeURIComponent(chatId)}&agentId=code&token=${encodeURIComponent(token)}`
);
```

如果服务端启用了 user-token 认证，还要注意这几点：

- `token` 一定绑定的是某个固定的 `senderId`
- `chatId` 默认不再和 token 强绑定；同一用户可以在一个连接里切多个会话
- 只有当配置里显式给这个 token 写了固定 `chatId`，它才会退回“一个 token 只能进一个 chat”的兼容模式
- 建连后，服务端会以 token 绑定身份为准，不再信任客户端在消息体里自报的 `senderId`
- 如果 token 配置了 `allowAgents`，客户端只能选择这些 agent

连接成功后，服务端会先回一个 `connection.open`:

```json
{
  "type": "connection.open",
  "data": {
    "chatId": "conv-10001",
    "userId": "user-42",
    "timestamp": 1710000000000
  }
}
```

如果你建连时没有带初始 `chatId`，那 `data.chatId` 可能为空或直接不出现；启用了 token 认证时，`data.userId` 会是服务端按 token 解析出来的真实用户 ID。

如果当前会话有历史消息，服务端还会紧接着回 `history.sync`。

如果当前连接已经显式选中了 `agentId`:

- 建连后的首个 `history.sync` 会按 `chatId + agentId` 过滤
- 后续 `history.get` 也会沿用当前连接选中的 `agentId` 做过滤

这点对“一个 token 固定绑定同一个 `chatId`，但允许在 `main / code / writer` 之间切换”的客户端尤其重要，否则不同 agent 的历史会混在一起。

## 6. 前端 -> 插件: 发消息协议

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
  agentId?: string;
  messageType: "text" | "image" | "voice" | "audio" | "file";
  content: string;
  mediaUrl?: string;
  mimeType?: string;
  timestamp: number;
  parentId?: string;
};
```

这里的关键语义现在是：

- `senderId` = 当前登录用户是谁
- `chatId` = 这个用户当前正在操作哪一条会话 / 哪一个线程 / 哪一个群
- `agentId` = 这个会话当前要交给哪个 agent

### 引用回复：客户端发给插件

如果你要让“这条消息是在回复上一条消息”进入协议，做法就是在 `message.receive.data.parentId` 里带上被引用的消息 ID。

示例：

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-1710000000010",
    "chatId": "conv-10001",
    "chatType": "direct",
    "senderId": "user-42",
    "senderName": "Leway",
    "messageType": "text",
    "content": "我这里补充一下",
    "parentId": "msg-1710000000001",
    "timestamp": 1710000000010
  }
}
```

当前实现行为：

- 服务端会把这个 `parentId` 当作“这是一条引用回复”传给 agent 上下文
- 当前默认 AI 回复回客户端时，也会把 `replyTo` 设为当前入站消息 ID
- 但自带 H5 示例页目前没有“点消息 -> 自动填充引用回复”的 UI，你需要在自己的前端里做这层交互

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
    "agentId": "code",
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

## 7. `mediaUrl` 应该怎么传

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
- `mediaUrl` 指向的资源必须能被 gateway 主机访问；前端本地 `blob:` URL 或只在浏览器里可见的对象 URL 不能直接给插件下载

## 8. 插件 -> 前端: 收消息协议

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

这里的 `replyTo?: string` 表示“这条插件下发给前端的消息，是在回复哪条消息”。

如果你的前端想把 AI 回复渲染成引用样式，应该读取 `message.send.data.replyTo`，自己去关联本地消息列表并渲染引用块。

当前状态：

- 协议字段已存在
- 服务端已会填 `replyTo`
- 自带 H5 示例页目前**没有**把它渲染成完整引用气泡 UI

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

如果连接当前已经选中了 `agentId`，这里返回的 `messages[]` 会按 `chatId + agentId` 过滤，而不是把同一个 `chatId` 下其他 agent 的消息也一起带回来。

`direction` 规则:

- `sent`: 用户发给插件的消息
- `received`: agent / OpenClaw 回给客户端的消息

### `history.get`

如果你是“先连接，再切会话”的客户端模型，应该主动用 `history.get` 拉指定会话的历史：

```json
{
  "type": "history.get",
  "data": {
    "requestId": "history-1",
    "chatId": "conv-10001",
    "limit": 100
  }
}
```

服务端仍然返回 `history.sync`，只是这次是“按你指定的 `chatId` 回放”。

如果当前连接已经选中了某个 `agentId`，那么这次回放也会继续按 `chatId + agentId` 过滤。

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

### `agent.list.get` / `agent.list` / `agent.select` / `agent.selected`

这四个事件就是前端多 agent 接入所需的最小协议层:

- 先 `agent.list.get`
- 把返回的 `agents[]` 渲染成入口列表或下拉框
- 用户选中后发 `agent.select`
- 后续消息可继续依赖当前连接选择，也可以在单条 `message.receive.data.agentId` 上再次显式覆盖

### `conversation.list.get` / `conversation.list`

如果你的客户端是“一个用户下有多个会话列表”的模型，应该在连接成功后主动请求会话列表：

```json
{
  "type": "conversation.list.get",
  "data": {
    "requestId": "conversation-list-1",
    "agentId": "code",
    "limit": 50
  }
}
```

响应示例：

```json
{
  "type": "conversation.list",
  "data": {
    "requestId": "conversation-list-1",
    "conversations": [
      {
        "chatId": "conv-user42-code-1",
        "chatType": "direct",
        "lastContent": "帮我整理一下这个需求",
        "lastDirection": "sent",
        "lastTimestamp": 1710000003000,
        "agentIds": ["code"],
        "participantIds": ["user-42"]
      }
    ],
    "timestamp": 1710000004000
  }
}
```

这个列表是给“当前 token 对应的用户”看的，不是全局公开列表。

2026-03-15 的远端真实验证已经确认两点：

- 同一个 token 用户可以在同一条 WebSocket 连接里切多个 `chatId`
- `agentId` 过滤生效，`writer` 会话不会混进 `agentId=main` 的列表

### `reaction.add` / `reaction.remove`

如果你要做消息表情反应，当前协议直接使用这两个事件。

客户端添加 reaction：

```json
{
  "type": "reaction.add",
  "data": {
    "messageId": "msg-1710000001000",
    "chatId": "conv-10001",
    "senderId": "user-42",
    "emoji": "👍",
    "timestamp": 1710000003000
  }
}
```

客户端移除 reaction：

```json
{
  "type": "reaction.remove",
  "data": {
    "messageId": "msg-1710000001000",
    "chatId": "conv-10001",
    "senderId": "user-42",
    "emoji": "👍",
    "timestamp": 1710000004000
  }
}
```

当前实现行为：

- 插件会接收 `reaction.add` / `reaction.remove`
- 服务端会更新内存中的 reaction 状态
- 然后把同一个事件广播给当前 chat 下的其他客户端

注意边界：

- 这是当前的**协议与服务端能力**
- 自带 H5 示例页目前**没有** reaction UI，也没有 reaction 列表渲染
- reaction 目前是内存态，不是持久化存储；如果你要做正式产品，前端要把“断线重连后如何恢复 reaction 展示”单独设计清楚

### `channel.status.get` / `channel.status`

这是一个轻量级状态接口，只返回 `generic-channel` 自己的运行状态和当前连接统计，不返回 OpenClaw 全局的 `usage / agents / skills / sessions`。

客户端请求:

```json
{
  "type": "channel.status.get",
  "data": {
    "requestId": "status-1",
    "includeChats": false
  }
}
```

服务端响应:

```json
{
  "type": "channel.status",
  "data": {
    "requestId": "status-1",
    "channel": "generic-channel",
    "configured": true,
    "enabled": true,
    "running": true,
    "mode": "websocket",
    "port": 18080,
    "path": "/ws",
    "currentChatId": "conv-10001",
    "currentChatConnectionCount": 1,
    "connectedChatCount": 3,
    "connectedSocketCount": 4,
    "timestamp": 1710000002100
  }
}
```

字段说明:

- `currentChatId`: 发起这次查询的当前会话 ID
- `currentChatConnectionCount`: 当前这个 `chatId` 下有几个打开的连接
- `connectedChatCount`: 当前总共有多少个不同 `chatId` 在线
- `connectedSocketCount`: 当前总共有多少个打开的 WebSocket 连接
- `includeChats = true` 时，响应里会额外带 `connectedChats`

## 9. H5 最小可运行示例

这就是自己接页面时最小需要的逻辑:

```html
<script>
  const serverUrl = "ws://localhost:18080/ws";
  const senderId = "user-42";
  const senderName = "Leway";
  let selectedAgentId = "code";
  let currentChatId = "conv-10001";

  const ws = new WebSocket(
    `${serverUrl}?agentId=${encodeURIComponent(selectedAgentId)}`
  );

  ws.onmessage = (event) => {
    const packet = JSON.parse(event.data);

    if (packet.type === "message.send") {
      console.log("AI:", packet.data.content);
    }

    if (packet.type === "history.sync") {
      console.log("history:", packet.data.messages);
    }

    if (packet.type === "channel.status") {
      console.log("channel status:", packet.data);
    }

    if (packet.type === "agent.list") {
      console.log("agents:", packet.data.agents);
    }

    if (packet.type === "conversation.list") {
      console.log("conversations:", packet.data.conversations);
    }
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "agent.list.get",
      data: {
        requestId: `agent-list-${Date.now()}`
      }
    }));

    ws.send(JSON.stringify({
      type: "conversation.list.get",
      data: {
        requestId: `conversation-list-${Date.now()}`,
        agentId: selectedAgentId
      }
    }));
  };

  function sendText(content) {
    ws.send(JSON.stringify({
      type: "message.receive",
      data: {
        messageId: `msg-${Date.now()}`,
        chatId: currentChatId,
        chatType: "direct",
        senderId,
        senderName,
        agentId: selectedAgentId,
        messageType: "text",
        content,
        timestamp: Date.now()
      }
    }));
  }

  function openConversation(chatId) {
    currentChatId = chatId;
    ws.send(JSON.stringify({
      type: "history.get",
      data: {
        requestId: `history-${Date.now()}`,
        chatId
      }
    }));
  }

  function selectAgent(agentId) {
    selectedAgentId = agentId || "";
    ws.send(JSON.stringify({
      type: "agent.select",
      data: {
        requestId: `agent-select-${Date.now()}`,
        agentId: selectedAgentId || null
      }
    }));
  }

  function queryChannelStatus() {
    ws.send(JSON.stringify({
      type: "channel.status.get",
      data: {
        requestId: `status-${Date.now()}`,
        includeChats: false
      }
    }));
  }
</script>
```

真实参考实现直接看:

- `../examples/h5-client.html`

## 10. 当前能力边界

这次改造后，`generic-channel` 已经支持：

- 一个用户 token 建连后查看自己的 agent 列表
- 同一连接下切换多个 `chatId`
- 按 agent 维度拉这个用户的会话列表
- 按 `chatId` 拉会话历史

但“把多个 agent 同时拉进一个群里，让他们在同一个群里并行发言”这件事，目前还**不是** `generic-channel` 的通用现成能力。

当前群聊更接近：

- 一个群会话 `chatId`
- 由当前显式或默认选中的一个 agent 处理

如果你要真正的“多 agent 群聊编排”，下一步需要单独设计群成员、agent participant 以及 fan-out / fan-in 规则。

## 11. 微信上怎么接

微信小程序也一样，本质上就是:

1. `wx.connectSocket`
2. 收到文本 / 图片 / 音频后包装成同样的 JSON
3. 用 `socket.send({ data: JSON.stringify(packet) })` 发出去

示例:

```javascript
const chatId = "wx-conv-10001";
const senderId = "wx-user-42";
const senderName = "微信用户";
let selectedAgentId = "editor";

const socket = wx.connectSocket({
  url: `wss://example.com/ws?chatId=${encodeURIComponent(chatId)}&agentId=${encodeURIComponent(selectedAgentId)}`
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
        agentId: selectedAgentId,
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

## 12. 聊天 App / 第三方 IM 如何映射

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

## 13. 音频 / 语音自动转写怎么生效

开启 `transcription.enabled = true` 后:

- `messageType = "voice"` 会自动转写
- `messageType = "audio"` 也会自动转写
- 转写结果会自动注入到 agent 上下文
- 客户端协议不需要额外改字段

也就是说，前端只需要正常发 `voice` / `audio`，转文本逻辑已经放在插件里。

## 14. 接入时最容易踩的坑

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

### 直接把 `blob:` URL 发给插件

浏览器里的 `blob:` URL 只在当前页面上下文有效。前端要么转成 Data URL，要么先上传到你自己的存储，再把可访问的 HTTPS URL 发给插件。

## 15. 参考实现

真实接入参考:

- `../examples/h5-client.html`

相关文档:

- `../README.md`
- `./CONFIG_EXAMPLES.md`
- `./CONFIG_EXAMPLES_ZH.md`
- `./README.md`
