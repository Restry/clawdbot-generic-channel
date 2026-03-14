import type { InboundMessage, OutboundMessage } from "./types.js";

export type HistoryMessageDirection = "sent" | "received";

export type HistoryMessageRecord = {
  messageId: string;
  chatId: string;
  direction: HistoryMessageDirection;
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string;
  mimeType?: string;
  timestamp: number;
  replyTo?: string;
  senderId?: string;
  senderName?: string;
};

const MAX_STORED_HISTORY_PER_CHAT = 200;
const chatHistoryStore = new Map<string, HistoryMessageRecord[]>();

function upsertHistoryRecord(record: HistoryMessageRecord): void {
  const history = chatHistoryStore.get(record.chatId) ?? [];
  const index = history.findIndex((entry) => entry.messageId === record.messageId);

  if (index >= 0) {
    history[index] = {
      ...history[index],
      ...record,
    };
  } else {
    history.push(record);
  }

  history.sort((a, b) => a.timestamp - b.timestamp);

  if (history.length > MAX_STORED_HISTORY_PER_CHAT) {
    history.splice(0, history.length - MAX_STORED_HISTORY_PER_CHAT);
  }

  chatHistoryStore.set(record.chatId, history);
}

export function appendInboundHistoryMessage(message: InboundMessage): void {
  upsertHistoryRecord({
    messageId: message.messageId,
    chatId: message.chatId,
    direction: "sent",
    content: message.content,
    contentType: message.messageType,
    mediaUrl: message.mediaUrl,
    mimeType: message.mimeType,
    timestamp: message.timestamp,
    senderId: message.senderId,
    senderName: message.senderName,
  });
}

export function appendOutboundHistoryMessage(message: OutboundMessage): void {
  upsertHistoryRecord({
    messageId: message.messageId,
    chatId: message.chatId,
    direction: "received",
    content: message.content,
    contentType: message.contentType,
    mediaUrl: message.mediaUrl,
    mimeType: message.mimeType,
    timestamp: message.timestamp,
    replyTo: message.replyTo,
  });
}

export function updateHistoryMessage(params: {
  chatId: string;
  messageId: string;
  content?: string;
  contentType?: HistoryMessageRecord["contentType"];
  mediaUrl?: string;
  mimeType?: string;
  timestamp?: number;
}): boolean {
  const { chatId, messageId, ...patch } = params;
  const history = chatHistoryStore.get(chatId);
  if (!history) {
    return false;
  }

  const index = history.findIndex((entry) => entry.messageId === messageId);
  if (index < 0) {
    return false;
  }

  history[index] = {
    ...history[index],
    ...patch,
  };
  chatHistoryStore.set(chatId, history);
  return true;
}

export function removeHistoryMessage(params: { chatId: string; messageId: string }): boolean {
  const { chatId, messageId } = params;
  const history = chatHistoryStore.get(chatId);
  if (!history) {
    return false;
  }

  const nextHistory = history.filter((entry) => entry.messageId !== messageId);
  if (nextHistory.length === history.length) {
    return false;
  }

  if (nextHistory.length === 0) {
    chatHistoryStore.delete(chatId);
  } else {
    chatHistoryStore.set(chatId, nextHistory);
  }

  return true;
}

export function getRecentHistoryMessages(params: {
  chatId: string;
  limit?: number;
}): HistoryMessageRecord[] {
  const { chatId, limit = 20 } = params;
  const history = chatHistoryStore.get(chatId) ?? [];
  return history.slice(-limit);
}
