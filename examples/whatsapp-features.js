/**
 * WhatsApp-like Features Extension for Generic Channel H5 Client
 * This module adds 10 advanced features to the base H5 client
 */

// Feature 1: Message Reactions
class ReactionManager {
    constructor() {
        this.reactions = new Map(); // messageId -> {emoji -> [{senderId, timestamp}]}
        this.emojiList = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥'];
    }

    addReactionUI(messageElement, messageId) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="window.features.reactions.showReactionPicker('${messageId}', this)" title="添加反应">
                😊
            </button>
        `;

        const reactionsDisplay = document.createElement('div');
        reactionsDisplay.className = 'message-reactions';
        reactionsDisplay.id = `reactions-${messageId}`;

        messageElement.appendChild(actionsDiv);
        messageElement.appendChild(reactionsDisplay);
    }

    showReactionPicker(messageId, buttonElement) {
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        picker.innerHTML = this.emojiList.map(emoji =>
            `<button class="emoji-btn" onclick="window.features.reactions.addReaction('${messageId}', '${emoji}')">${emoji}</button>`
        ).join('');

        // Position picker
        const rect = buttonElement.getBoundingClientRect();
        picker.style.position = 'absolute';
        picker.style.top = `${rect.top - 50}px`;
        picker.style.left = `${rect.left}px`;

        document.body.appendChild(picker);

        // Remove picker when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function removePicker(e) {
                if (!picker.contains(e.target) && e.target !== buttonElement) {
                    picker.remove();
                    document.removeEventListener('click', removePicker);
                }
            });
        }, 100);
    }

    addReaction(messageId, emoji) {
        const message = {
            type: 'reaction.add',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                emoji,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.updateReactionDisplay(messageId, emoji, 'add');
    }

    removeReaction(messageId, emoji) {
        const message = {
            type: 'reaction.remove',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                emoji,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.updateReactionDisplay(messageId, emoji, 'remove');
    }

    updateReactionDisplay(messageId, emoji, action) {
        const key = messageId;
        if (!this.reactions.has(key)) {
            this.reactions.set(key, new Map());
        }

        const msgReactions = this.reactions.get(key);
        if (action === 'add') {
            if (!msgReactions.has(emoji)) {
                msgReactions.set(emoji, []);
            }
            msgReactions.get(emoji).push({
                senderId: window.chatState.userId,
                timestamp: Date.now()
            });
        } else {
            if (msgReactions.has(emoji)) {
                const users = msgReactions.get(emoji);
                const index = users.findIndex(u => u.senderId === window.chatState.userId);
                if (index >= 0) {
                    users.splice(index, 1);
                    if (users.length === 0) {
                        msgReactions.delete(emoji);
                    }
                }
            }
        }

        this.renderReactions(messageId);
    }

    renderReactions(messageId) {
        const container = document.getElementById(`reactions-${messageId}`);
        if (!container) return;

        const reactions = this.reactions.get(messageId);
        if (!reactions || reactions.size === 0) {
            container.innerHTML = '';
            return;
        }

        const html = Array.from(reactions.entries()).map(([emoji, users]) => {
            const count = users.length;
            const hasUserReacted = users.some(u => u.senderId === window.chatState.userId);
            return `
                <span class="reaction-badge ${hasUserReacted ? 'user-reacted' : ''}"
                      onclick="window.features.reactions.${hasUserReacted ? 'removeReaction' : 'addReaction'}('${messageId}', '${emoji}')">
                    ${emoji} ${count}
                </span>
            `;
        }).join('');

        container.innerHTML = html;
    }

    handleReactionEvent(event) {
        const { messageId, emoji } = event.data;
        const action = event.type === 'reaction.add' ? 'add' : 'remove';
        this.updateReactionDisplay(messageId, emoji, action);
    }
}

// Feature 2: Message Edit/Delete
class MessageEditManager {
    constructor() {
        this.editHistory = new Map();
    }

    addEditDeleteUI(messageElement, messageId, isSent) {
        if (!isSent) return; // Only for sent messages

        const menu = document.createElement('div');
        menu.className = 'message-menu';
        menu.innerHTML = `
            <button class="menu-btn" onclick="window.features.edit.showMenu('${messageId}', this)">⋮</button>
            <div class="menu-dropdown" id="menu-${messageId}" style="display: none;">
                <div class="menu-item" onclick="window.features.edit.editMessage('${messageId}')">✏️ 编辑</div>
                <div class="menu-item delete" onclick="window.features.edit.deleteMessage('${messageId}')">🗑️ 删除</div>
            </div>
        `;
        messageElement.appendChild(menu);
    }

    showMenu(messageId, button) {
        const menu = document.getElementById(`menu-${messageId}`);
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== button) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    }

    editMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const bubble = messageElement.querySelector('.message-bubble');
        const currentText = bubble.textContent;

        bubble.innerHTML = `
            <input type="text" class="edit-input" value="${currentText}" id="edit-${messageId}">
            <div class="edit-actions">
                <button onclick="window.features.edit.saveEdit('${messageId}', '${currentText}')">✓ 保存</button>
                <button onclick="window.features.edit.cancelEdit('${messageId}', '${currentText}')">✕ 取消</button>
            </div>
        `;

        document.getElementById(`edit-${messageId}`).focus();
    }

    saveEdit(messageId, oldText) {
        const input = document.getElementById(`edit-${messageId}`);
        const newText = input.value.trim();

        if (!newText || newText === oldText) {
            this.cancelEdit(messageId, oldText);
            return;
        }

        const message = {
            type: 'message.edit',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                newContent: newText,
                oldContent: oldText,
                editedAt: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.applyEdit(messageId, newText);
    }

    cancelEdit(messageId, oldText) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const bubble = messageElement.querySelector('.message-bubble');
            bubble.textContent = oldText;
        }
    }

    applyEdit(messageId, newText) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const bubble = messageElement.querySelector('.message-bubble');
            bubble.innerHTML = `${newText} <span class="edited-badge">(已编辑)</span>`;
        }
    }

    deleteMessage(messageId) {
        if (!confirm('确定要删除这条消息吗？')) return;

        const message = {
            type: 'message.delete',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                deleteType: 'soft',
                deletedAt: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.applyDelete(messageId);
    }

    applyDelete(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.classList.add('message-deleted');
            const bubble = messageElement.querySelector('.message-bubble');
            bubble.innerHTML = '<em>此消息已删除</em>';
        }
    }

    handleEditEvent(event) {
        const { messageId, newContent } = event.data;
        this.applyEdit(messageId, newContent);
    }

    handleDeleteEvent(event) {
        const { messageId } = event.data;
        this.applyDelete(messageId);
    }
}

// Feature 3: Read Receipts & Status
class MessageStatusManager {
    constructor() {
        this.statuses = new Map(); // messageId -> status
    }

    addStatusIndicator(messageElement, messageId, isSent) {
        if (!isSent) return;

        const indicator = document.createElement('span');
        indicator.className = 'status-indicator';
        indicator.id = `status-${messageId}`;
        indicator.innerHTML = '✓'; // sent

        const timeDiv = messageElement.querySelector('.message-time');
        if (timeDiv) {
            timeDiv.appendChild(indicator);
        }

        this.statuses.set(messageId, 'sent');
    }

    updateStatus(messageId, status) {
        this.statuses.set(messageId, status);
        const indicator = document.getElementById(`status-${messageId}`);
        if (!indicator) return;

        switch (status) {
            case 'delivered':
                indicator.innerHTML = '✓✓';
                indicator.style.color = '#9ca3af';
                break;
            case 'read':
                indicator.innerHTML = '✓✓';
                indicator.style.color = '#3b82f6';
                break;
        }
    }

    sendReadReceipt(messageId) {
        const message = {
            type: 'status.read',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                status: 'read',
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }
    }

    handleStatusEvent(event) {
        const { messageId, status } = event.data;
        this.updateStatus(messageId, status);
    }
}

// Feature 4: Typing Indicators
class TypingManager {
    constructor() {
        this.typingUsers = new Set();
        this.typingTimeout = null;
    }

    startTyping() {
        const message = {
            type: 'typing',
            data: {
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                senderName: window.chatState.userName,
                isTyping: true,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        // Auto-stop after 5 seconds
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        this.typingTimeout = setTimeout(() => this.stopTyping(), 5000);
    }

    stopTyping() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }

        const message = {
            type: 'typing',
            data: {
                chatId: window.chatState.chatId,
                senderId: window.chatState.userId,
                isTyping: false,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }
    }

    handleTypingEvent(event) {
        const { senderId, senderName, isTyping } = event.data;

        if (senderId === window.chatState.userId) return; // Ignore own typing

        if (isTyping) {
            this.typingUsers.add(senderName || senderId);
        } else {
            this.typingUsers.delete(senderName || senderId);
        }

        this.updateTypingIndicator();
    }

    updateTypingIndicator() {
        let indicator = document.getElementById('typing-indicator');

        if (this.typingUsers.size === 0) {
            if (indicator) {
                indicator.remove();
            }
            return;
        }

        const names = Array.from(this.typingUsers);
        const text = names.length === 1
            ? `${names[0]} 正在输入...`
            : `${names.join(', ')} 正在输入...`;

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'typing-indicator-status';
            const messagesContainer = document.getElementById('messages');
            messagesContainer.appendChild(indicator);
        }

        indicator.textContent = text;
    }
}

// Feature 5: Message Forwarding
class ForwardManager {
    constructor() {
        this.selectedMessages = new Set();
    }

    addForwardUI(messageElement, messageId) {
        const forwardBtn = document.createElement('button');
        forwardBtn.className = 'action-btn';
        forwardBtn.innerHTML = '↪️';
        forwardBtn.title = '转发';
        forwardBtn.onclick = () => this.forwardMessage(messageId);

        let actions = messageElement.querySelector('.message-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'message-actions';
            messageElement.appendChild(actions);
        }
        actions.appendChild(forwardBtn);
    }

    forwardMessage(messageId) {
        const targetChat = prompt('输入目标聊天 ID:');
        if (!targetChat) return;

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const bubble = messageElement.querySelector('.message-bubble');
        const content = bubble.textContent;

        const message = {
            type: 'message.forward',
            data: {
                originalMessageId: messageId,
                originalChatId: window.chatState.chatId,
                originalSenderId: window.chatState.userId,
                originalSenderName: window.chatState.userName,
                forwardedBy: window.chatState.userId,
                forwardedByName: window.chatState.userName,
                targetChatId: targetChat,
                content,
                messageType: 'text',
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
            alert(`消息已转发到 ${targetChat}`);
        }
    }
}

// Feature 6: User Presence
class PresenceManager {
    constructor() {
        this.heartbeatInterval = null;
    }

    startPresence() {
        this.updateStatus('online');

        // Send heartbeat every 25 seconds
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 25000);
    }

    stopPresence() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.updateStatus('offline');
    }

    updateStatus(status) {
        const message = {
            type: 'user.status',
            data: {
                userId: window.chatState.userId,
                userName: window.chatState.userName,
                status,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }
    }

    sendHeartbeat() {
        this.updateStatus('online');
    }

    handlePresenceEvent(event) {
        const { userId, userName, status, lastSeen } = event.data;
        console.log(`User ${userName} is ${status}`);
        // Could update UI to show online status
    }
}

// Feature 7: File Transfer Progress
class FileTransferManager {
    constructor() {
        this.transfers = new Map();
    }

    startUpload(file, chatId) {
        const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const message = {
            type: 'file.transfer',
            data: {
                fileId,
                chatId,
                senderId: window.chatState.userId,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                mimeType: file.type,
                status: 'uploading',
                progress: 0,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        // Simulate upload progress
        this.simulateProgress(fileId);
    }

    simulateProgress(fileId) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;

            const message = {
                type: 'file.progress',
                data: {
                    fileId,
                    chatId: window.chatState.chatId,
                    progress,
                    status: progress < 100 ? 'uploading' : 'completed',
                    timestamp: Date.now()
                }
            };

            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify(message));
            }

            if (progress >= 100) {
                clearInterval(interval);
            }
        }, 200);
    }

    handleProgressEvent(event) {
        const { fileId, progress } = event.data;
        console.log(`File ${fileId}: ${progress}%`);
        // Update UI progress bar
    }
}

// Feature 8: Message Search
class SearchManager {
    constructor() {
        this.searchResults = [];
    }

    showSearchUI() {
        const searchModal = document.createElement('div');
        searchModal.className = 'modal-overlay';
        searchModal.id = 'search-modal';
        searchModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>搜索消息</h2>
                    <button onclick="window.features.search.closeSearch()">✕</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="search-input" placeholder="搜索..." class="search-input">
                    <div id="search-results" class="search-results"></div>
                </div>
            </div>
        `;
        document.body.appendChild(searchModal);

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.performSearch(e.target.value);
        });
    }

    closeSearch() {
        const modal = document.getElementById('search-modal');
        if (modal) modal.remove();
    }

    performSearch(query) {
        if (!query.trim()) {
            document.getElementById('search-results').innerHTML = '';
            return;
        }

        // Search in local messages
        const messages = document.querySelectorAll('.message-bubble');
        const results = [];

        messages.forEach((bubble, index) => {
            const text = bubble.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                results.push({
                    text: bubble.textContent,
                    index
                });
            }
        });

        this.displayResults(results, query);
    }

    displayResults(results, query) {
        const container = document.getElementById('search-results');

        if (results.length === 0) {
            container.innerHTML = '<div class="no-results">未找到匹配的消息</div>';
            return;
        }

        const html = results.map(result => {
            const highlighted = result.text.replace(
                new RegExp(query, 'gi'),
                match => `<mark>${match}</mark>`
            );
            return `<div class="search-result-item">${highlighted}</div>`;
        }).join('');

        container.innerHTML = html;
    }
}

// Feature 9: Group Management
class GroupManager {
    constructor() {
        this.groups = new Map();
    }

    createGroup(groupName, description) {
        const groupId = `group-${Date.now()}`;

        const message = {
            type: 'group.action',
            data: {
                type: 'group.create',
                groupId,
                actorId: window.chatState.userId,
                data: {
                    groupName,
                    description,
                    createdBy: window.chatState.userId
                },
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }
    }

    addMember(groupId, userId) {
        const message = {
            type: 'group.action',
            data: {
                type: 'member.add',
                groupId,
                actorId: window.chatState.userId,
                targetUserId: userId,
                timestamp: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }
    }

    handleGroupEvent(event) {
        const { type, groupId, targetUserId } = event.data;
        console.log(`Group ${groupId}: ${type} for user ${targetUserId}`);
    }
}

// Feature 10: Pinning & Starring
class PinStarManager {
    constructor() {
        this.pinnedMessages = new Set();
        this.starredMessages = new Set();
    }

    addPinStarUI(messageElement, messageId) {
        const pinBtn = document.createElement('button');
        pinBtn.className = 'action-btn';
        pinBtn.innerHTML = '📌';
        pinBtn.title = '置顶';
        pinBtn.onclick = () => this.pinMessage(messageId);

        const starBtn = document.createElement('button');
        starBtn.className = 'action-btn';
        starBtn.innerHTML = '⭐';
        starBtn.title = '收藏';
        starBtn.onclick = () => this.starMessage(messageId);

        let actions = messageElement.querySelector('.message-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'message-actions';
            messageElement.appendChild(actions);
        }

        actions.appendChild(pinBtn);
        actions.appendChild(starBtn);
    }

    pinMessage(messageId) {
        if (this.pinnedMessages.has(messageId)) {
            this.unpinMessage(messageId);
            return;
        }

        if (this.pinnedMessages.size >= 3) {
            alert('最多只能置顶 3 条消息');
            return;
        }

        const message = {
            type: 'message.pin',
            data: {
                messageId,
                chatId: window.chatState.chatId,
                pinnedBy: window.chatState.userId,
                pinnedAt: Date.now()
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.pinnedMessages.add(messageId);
        this.updatePinnedDisplay();
    }

    unpinMessage(messageId) {
        const message = {
            type: 'message.unpin',
            data: {
                messageId,
                chatId: window.chatState.chatId
            }
        };

        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify(message));
        }

        this.pinnedMessages.delete(messageId);
        this.updatePinnedDisplay();
    }

    starMessage(messageId) {
        if (this.starredMessages.has(messageId)) {
            this.starredMessages.delete(messageId);
            alert('已取消收藏');
        } else {
            this.starredMessages.add(messageId);
            alert('已收藏');
        }

        // Stars are personal, no need to broadcast
    }

    updatePinnedDisplay() {
        let pinnedBar = document.getElementById('pinned-messages-bar');

        if (this.pinnedMessages.size === 0) {
            if (pinnedBar) pinnedBar.remove();
            return;
        }

        if (!pinnedBar) {
            pinnedBar = document.createElement('div');
            pinnedBar.id = 'pinned-messages-bar';
            pinnedBar.className = 'pinned-messages-bar';
            const chatHeader = document.querySelector('.chat-header');
            chatHeader.after(pinnedBar);
        }

        pinnedBar.innerHTML = `
            <div class="pinned-messages-content">
                📌 ${this.pinnedMessages.size} 条置顶消息
            </div>
        `;
    }

    handlePinEvent(event) {
        const { messageId } = event.data;
        if (event.type === 'message.pin') {
            this.pinnedMessages.add(messageId);
        } else {
            this.pinnedMessages.delete(messageId);
        }
        this.updatePinnedDisplay();
    }
}

// Initialize all features
window.features = {
    reactions: new ReactionManager(),
    edit: new MessageEditManager(),
    status: new MessageStatusManager(),
    typing: new TypingManager(),
    forward: new ForwardManager(),
    presence: new PresenceManager(),
    fileTransfer: new FileTransferManager(),
    search: new SearchManager(),
    group: new GroupManager(),
    pinStar: new PinStarManager()
};

// Global chat state
window.chatState = {
    chatId: '',
    userId: '',
    userName: ''
};

console.log('WhatsApp features loaded successfully!');
