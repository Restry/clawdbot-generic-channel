# H5 客户端集成 WhatsApp 功能指南

## 概述

本指南说明如何将 10 个 WhatsApp 风格的高级功能集成到现有的 H5 客户端中。

## 快速集成

### 步骤 1: 引入资源文件

在 `h5-client.html` 的 `<head>` 标签中添加样式文件：

```html
<link rel="stylesheet" href="whatsapp-features.css">
```

在 `</body>` 标签之前添加脚本文件：

```html
<script src="whatsapp-features.js"></script>
```

### 步骤 2: 初始化聊天状态

在连接建立时设置全局聊天状态：

```javascript
// 在 connect() 函数中添加
window.chatState = {
    chatId: chatId,
    userId: chatId,  // 或使用独立的 userId
    userName: userName
};
```

### 步骤 3: 增强消息渲染

修改现有的消息渲染函数，添加新功能的 UI 元素：

```javascript
function addTextMessage(text, type, timestamp, messageId) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.setAttribute('data-message-id', messageId); // 添加消息 ID

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const time = timestamp ? new Date(timestamp) : new Date();
    timeDiv.textContent = time.toLocaleTimeString('zh-CN');

    messageDiv.appendChild(bubbleDiv);
    messageDiv.appendChild(timeDiv);

    // === 新增功能 UI ===
    // 1. 添加反应按钮
    window.features.reactions.addReactionUI(messageDiv, messageId);

    // 2. 添加编辑/删除菜单（仅发送的消息）
    if (type === 'sent') {
        window.features.edit.addEditDeleteUI(messageDiv, messageId, true);
    }

    // 3. 添加状态指示器（仅发送的消息）
    if (type === 'sent') {
        window.features.status.addStatusIndicator(messageDiv, messageId, true);
    }

    // 4. 添加转发按钮
    window.features.forward.addForwardUI(messageDiv, messageId);

    // 5. 添加置顶/收藏按钮
    window.features.pinStar.addPinStarUI(messageDiv, messageId);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 6. 发送已读回执（接收的消息）
    if (type === 'received') {
        window.features.status.sendReadReceipt(messageId);
    }
}
```

### 步骤 4: 扩展消息处理

在 `handleIncomingMessage` 函数中添加新事件类型的处理：

```javascript
function handleIncomingMessage(event) {
    switch (event.type) {
        case 'message.send':
            handleMessageSend(event.data);
            break;

        // === 新增事件处理 ===
        case 'reaction.add':
        case 'reaction.remove':
            window.features.reactions.handleReactionEvent(event);
            break;

        case 'message.edit':
            window.features.edit.handleEditEvent(event);
            break;

        case 'message.delete':
            window.features.edit.handleDeleteEvent(event);
            break;

        case 'status.delivered':
        case 'status.read':
            window.features.status.handleStatusEvent(event);
            break;

        case 'typing':
            window.features.typing.handleTypingEvent(event);
            break;

        case 'user.status':
            window.features.presence.handlePresenceEvent(event);
            break;

        case 'file.progress':
            window.features.fileTransfer.handleProgressEvent(event);
            break;

        case 'message.pin':
        case 'message.unpin':
            window.features.pinStar.handlePinEvent(event);
            break;

        case 'group.action':
            window.features.group.handleGroupEvent(event);
            break;

        case 'connection.open':
            console.log('Connection confirmed:', event.data);
            break;

        case 'thinking.start':
            showThinkingIndicator();
            break;

        case 'thinking.update':
            updateThinkingIndicator(event.data?.content);
            break;

        case 'thinking.end':
            hideThinkingIndicator();
            break;
    }
}
```

### 步骤 5: 添加输入状态检测

在消息输入框添加输入事件监听：

```javascript
const messageInput = document.getElementById('messageInput');

messageInput.addEventListener('input', () => {
    window.features.typing.startTyping();
});

messageInput.addEventListener('blur', () => {
    window.features.typing.stopTyping();
});
```

### 步骤 6: 启动在线状态

在 WebSocket 连接建立时启动在线状态：

```javascript
ws.onopen = () => {
    console.log('WebSocket connected');
    updateStatus('connected');

    // 启动在线状态
    window.features.presence.startPresence();

    // ... 其他代码
};

ws.onclose = () => {
    console.log('WebSocket disconnected');

    // 停止在线状态
    window.features.presence.stopPresence();

    // ... 其他代码
};
```

### 步骤 7: 添加搜索按钮

在页面头部添加搜索按钮：

```html
<div class="header-actions">
    <button class="icon-btn-header" onclick="window.features.search.showSearchUI()" title="搜索">
        🔍
    </button>
    <!-- 其他按钮 -->
</div>
```

### 步骤 8: 生成唯一消息 ID

确保每条消息都有唯一的 ID：

```javascript
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    messageCounter++;
    const messageId = `msg-${Date.now()}-${messageCounter}`;

    const message = {
        type: 'message.receive',
        data: {
            messageId: messageId,  // 确保包含 messageId
            chatId: chatId,
            chatType: 'direct',
            senderId: chatId,
            senderName: userName,
            messageType: 'text',
            content: text,
            timestamp: Date.now()
        }
    };

    ws.send(JSON.stringify(message));

    // 添加到界面时传递 messageId
    addTextMessage(text, 'sent', Date.now(), messageId);

    input.value = '';
    window.features.typing.stopTyping();
}
```

## 功能列表

### 1. 消息表情反应
- **UI**: 每条消息悬停时显示表情按钮
- **操作**: 点击表情按钮显示表情选择器，选择表情添加反应
- **显示**: 消息下方显示所有反应及数量

### 2. 消息编辑和删除
- **UI**: 发送的消息显示菜单按钮（⋮）
- **编辑**: 点击"编辑"将消息内容转为输入框，可修改后保存
- **删除**: 点击"删除"确认后将消息标记为已删除

### 3. 已读回执和送达状态
- **显示**: 发送的消息右下角显示状态图标
  - ✓ 已发送
  - ✓✓ 已送达（灰色）
  - ✓✓ 已读（蓝色）
- **自动**: 接收到消息自动发送已读回执

### 4. 输入状态指示器
- **触发**: 输入框输入时自动发送"正在输入"状态
- **显示**: 消息列表底部显示其他用户的输入状态
- **超时**: 5 秒无输入自动停止

### 5. 消息转发
- **UI**: 每条消息显示转发按钮（↪️）
- **操作**: 点击后输入目标聊天 ID，确认转发

### 6. 用户在线状态
- **自动**: 连接时自动设置为在线
- **心跳**: 每 25 秒发送一次心跳保持在线
- **断开**: 关闭连接时自动设置为离线

### 7. 文件传输进度
- **显示**: 文件上传时显示进度条
- **更新**: 实时更新进度百分比
- **完成**: 100% 时标记为完成

### 8. 消息搜索
- **入口**: 点击头部搜索按钮（🔍）
- **功能**: 输入关键词搜索所有消息
- **高亮**: 搜索结果中关键词高亮显示

### 9. 群组管理
- **功能**: 创建群组、添加/删除成员、设置管理员
- **API**: 通过 `window.features.group` 访问

### 10. 消息置顶和收藏
- **置顶**: 点击📌按钮置顶消息（最多 3 条）
- **收藏**: 点击⭐按钮收藏消息（个人）
- **显示**: 置顶的消息在顶部黄色横幅中显示

## 高级定制

### 自定义表情列表

修改 `whatsapp-features.js` 中的表情列表：

```javascript
this.emojiList = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '🎉', '✨'];
```

### 自定义置顶消息数量

修改置顶限制：

```javascript
if (this.pinnedMessages.size >= 5) {  // 改为 5 条
    alert('最多只能置顶 5 条消息');
    return;
}
```

### 自定义输入超时时间

修改输入状态超时：

```javascript
this.typingTimeout = setTimeout(() => this.stopTyping(), 10000);  // 改为 10 秒
```

## 样式定制

所有样式都在 `whatsapp-features.css` 中定义，可以根据需要修改：

- 反应徽章颜色
- 菜单样式
- 模态框样式
- 按钮样式
- 等等

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

所有功能均使用标准 Web API，无需额外依赖。

## 故障排除

### 消息 ID 未定义
确保在发送和接收消息时都包含 `messageId` 字段。

### 功能未生效
检查控制台是否有错误，确保正确引入了 JS 和 CSS 文件。

### WebSocket 事件未处理
检查 `handleIncomingMessage` 函数是否包含所有新事件类型的处理。

### 样式显示异常
确保 CSS 文件在 HTML 中正确引用，检查浏览器开发工具中的样式是否加载。

## 下一步

1. 测试所有功能确保正常工作
2. 根据实际需求调整样式和行为
3. 添加错误处理和用户反馈
4. 考虑添加本地存储以持久化收藏等数据
5. 优化性能，特别是消息搜索功能

## 示例代码

完整的集成示例请参考 `h5-client-full.html`（即将创建）。

## 技术支持

如有问题，请查看：
- `WHATSAPP_FEATURES.md` - 完整 API 文档
- `功能增强总结.md` - 功能总结
- GitHub Issues - 提交问题和建议
