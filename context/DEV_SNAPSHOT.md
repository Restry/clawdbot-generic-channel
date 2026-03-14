# 1. 🎯 当前目标 (Project Intent)

当前在开发和收尾的是 `generic-channel` 的 H5 直连聊天链路与媒体链路，目标是让 OpenClaw 的 Generic WebSocket Channel 在真实浏览器和远端服务器环境下稳定支持以下能力：

- 文本聊天、思考状态、历史消息回放
- 图片选择、发送、预览、大图查看
- 音频/语音消息的识别、接收和展示
- 连接中断后的恢复，不被旧连接或旧重连任务干扰

业务目标是把这个插件做成一个可直接部署到 OpenClaw 网关上的通用 H5 聊天通道，最终要求是“改完即可打包、安装、真实 E2E 验证通过”。

# 2. 🛠️ 技术栈与规范 (Technical Stack)

- 语言与模块：TypeScript ESM
- 运行方式：插件直接以 `.ts` 被 OpenClaw 加载，无额外编译产物运行
- 核心依赖：
  - `openclaw >= 2026.1.29`
  - `ws ^8.19.0`
  - `zod ^4.3.6`
  - `typescript ^5.7.0`
- 本地校验命令：
  - `npm run typecheck`
  - `npm run pack:dist`
- 打包产物：
  - `dist/restry-generic-channel-2.0.0.tgz`
- H5 客户端主文件：
  - `examples/h5-client.html`
- 远端测试环境：
  - SSH: `ssh -p 18822 restry@wolf-sg.southeastasia.cloudapp.azure.com`
  - WS: `ws://wolf-sg.southeastasia.cloudapp.azure.com:18080/ws`
  - OpenClaw 配置：`~/.openclaw/openclaw.json`
  - 插件安装目录：`~/.openclaw/extensions/generic-channel`

规范与约束：

- 必须全程中文
- 修改代码统一使用 `apply_patch`
- 搜索优先 `rg`
- 不回滚用户已有改动
- 不能只分析，默认要直接修复、打包、部署、测试
- 只保留 `examples/h5-client.html` 这一份 H5 页面，`examples/h5-client-enhanced.html` 已不再保留
- 最终正确的远端更新流程：
  1. 本地修改并通过 `npm run typecheck`
  2. 执行 `npm run pack:dist`
  3. `scp` 包到服务器
  4. 远端临时移除 `generic-channel` 的 channel/plugin 配置
  5. 删除旧目录 `~/.openclaw/extensions/generic-channel`
  6. `openclaw plugins install /home/restry/restry-generic-channel-2.0.0.tgz`
  7. 恢复 `generic-channel` 配置
  8. `openclaw gateway restart`

# 3. ✅ 已完成的工作 (Finished Items)

已完成的核心文件与职责：

- `src/generic/history.ts`
  - 新增历史消息存储与回放
  - 核心函数：
    - `appendInboundHistoryMessage`
    - `appendOutboundHistoryMessage`
    - `updateHistoryMessage`
    - `removeHistoryMessage`
    - `getRecentHistoryMessages`
- `src/generic/monitor.ts`
  - 在 `onClientConnect` 时下发 `history.sync`
- `src/generic/media.ts`
  - 新增 `normalizeInboundMimeType`
  - 修正 `voice/audio` 被错误识别为 `video/webm` 的问题，统一归一到 `audio/*`
- `examples/h5-client.html`
  - 已整合为唯一保留的 H5 客户端
  - 核心能力：
    - WebSocket 连接/断开/重连
    - `history.sync` 渲染
    - 图片文件选择与发送预览
    - 图片点击大图预览
    - 音频消息卡片展示与 fallback 下载入口
    - 连接竞争保护，避免旧 socket 干扰当前连接
- `E2E_TEST_CASES.md`
  - 已整理为完整测试矩阵，不再只是零散已测列表

本轮已经稳定完成并验证的功能结论：

- `thinking.end` 不结束问题已修复
- `history.sync` 历史消息回放链路已打通
- `dmPolicy = pairing` 已补齐
- `presence` 30s 自动离线已修复
- `textChunkLimit` 已生效
- 图片按钮可正常拉起文件选择器
- 图片发送后可展示，图片点击可弹出大图
- H5 页面错误地址切回正确地址后，旧重连不会再干扰当前连接
- 远端插件已重装成功，`18080` 正常监听，协议级 `connection.open` / `history.sync` 已验证

**关键代码片段**

1. 历史消息数据结构与 upsert 逻辑，位于 `src/generic/history.ts`

```ts
export type HistoryMessageRecord = {
  messageId: string;
  chatId: string;
  direction: "sent" | "received";
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string;
  mimeType?: string;
  timestamp: number;
  replyTo?: string;
  senderId?: string;
  senderName?: string;
};

function upsertHistoryRecord(record: HistoryMessageRecord): void {
  const history = chatHistoryStore.get(record.chatId) ?? [];
  const index = history.findIndex((entry) => entry.messageId === record.messageId);

  if (index >= 0) {
    history[index] = { ...history[index], ...record };
  } else {
    history.push(record);
  }

  history.sort((a, b) => a.timestamp - b.timestamp);
  chatHistoryStore.set(record.chatId, history.slice(-MAX_STORED_HISTORY_PER_CHAT));
}
```

2. 客户端连接竞争保护与安全重连，位于 `examples/h5-client.html`

```js
let wsConnectionToken = 0;

function connect() {
    clearReconnectTimer();
    replaceActiveSocket();
    isManualDisconnect = false;
    const socket = new WebSocket(url);
    ws = socket;
    wsConnectionToken++;
    setupWebSocketHandlers(socket, wsConnectionToken);
}

function isCurrentSocket(socket, connectionToken) {
    return ws === socket && wsConnectionToken === connectionToken;
}

function scheduleReconnect(connectionToken) {
    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        if (connectionToken !== wsConnectionToken || ws) {
            return;
        }
        connect();
    }, delay);
}
```

3. H5 历史消息渲染保护，位于 `examples/h5-client.html`

```js
function handleHistorySync(payload) {
    if (!payload?.messages || !Array.isArray(payload.messages) || payload.chatId !== chatId) {
        return;
    }

    hideThinkingIndicator();
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';

    for (const entry of payload.messages) {
        try {
            renderHistoryMessage(entry);
        } catch (error) {
            console.error('Failed to render history message:', error, entry);
        }
    }
}
```

4. 入站媒体 MIME 归一化，位于 `src/generic/media.ts`

```ts
function normalizeInboundMimeType(params: {
  messageType: InboundMessage["messageType"];
  detectedContentType?: string;
  declaredContentType?: string;
}): string | undefined {
  const { messageType, detectedContentType, declaredContentType } = params;
  const detected = detectedContentType?.toLowerCase();
  const declared = declaredContentType?.toLowerCase();

  if (messageType === "voice" || messageType === "audio") {
    if (declared?.startsWith("audio/")) return declared;
    if (detected?.startsWith("audio/")) return detected;
    if (declared === "video/webm" || detected === "video/webm") return "audio/webm";
    return detectedContentType ?? declaredContentType ?? "audio/webm";
  }

  return detectedContentType ?? declaredContentType;
}
```

已确认通过的本轮重点 E2E：

- 远端 WebSocket 建连
- `connection.open`
- `history.sync`
- H5 页面展示历史消息
- 图片按钮拉起文件选择器
- 图片选择后预览
- 图片发送与聊天区展示
- 点击图片打开大图弹窗
- 手动断开与再次连接
- 错误地址切回正确地址后旧重连不干扰当前连接

完整矩阵见 [E2E_TEST_CASES.md](/Users/leway/Projects/clawdbot-generic-channel/E2E_TEST_CASES.md)。

# 4. ⏳ 待处理任务 (Pending TODOs)

优先级 1：

- 继续做音频/语音链路的完整真实 E2E
- 必测项：
  - 浏览器录音
  - 语音发送
  - 语音接收展示
  - 音频发送
  - 音频进入 Agent 上下文

优先级 2：

- 继续补齐 `E2E_TEST_CASES.md` 中仍为 `未执行` 的项目
- 重点包括：
  - 异常断开后的自动重连完整验证
  - 心跳保活 30s+
  - `parentId` 引用回复
  - Slash Command
  - `historyLimit` 群聊上下文注入

优先级 3：

- 清理与统一前端文档和页面说明，确认只保留一套 H5 客户端入口
- 如果后续遇到 Generic Channel 某些能力实现不清楚，可参考 OpenClaw 官方 channel 实现：
  - `https://github.com/openclaw/openclaw/tree/main/src/channels`

未解决的潜在风险 / Bug：

- 音频消息“展示层”本轮只确认了接收播放和 fallback 结构，录音与发送链路还未完整收口
- `thinking.update` 目前仍未实现，不应误标为通过
- 仍有部分协议能力只在服务端路径存在，H5 页面 UI 侧未实现，不要把 UI 未实现误判为服务端 bug
- 当前历史消息存储是内存级 `Map`，网关进程重启后历史会丢失；如果要做真正持久化，需要后续单独设计

