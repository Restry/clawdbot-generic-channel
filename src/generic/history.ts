import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
const HISTORY_STORE_VERSION = 1;
const historyPersistPath = resolveHistoryPersistPath();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain = Promise.resolve();

type PersistedHistoryStore = {
  version: number;
  chats: Record<string, HistoryMessageRecord[]>;
};

loadPersistedHistory();

function resolveHistoryPersistPath(): string | null {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return null;
  }

  return join(homeDir, ".openclaw", "generic-channel-history.json");
}

function loadPersistedHistory(): void {
  if (!historyPersistPath) {
    return;
  }

  try {
    const raw = readFileSync(historyPersistPath, "utf8");
    if (!raw.trim()) {
      return;
    }

    const parsed = JSON.parse(raw) as PersistedHistoryStore;
    if (!parsed || typeof parsed !== "object" || parsed.version !== HISTORY_STORE_VERSION) {
      return;
    }

    for (const [chatId, records] of Object.entries(parsed.chats ?? {})) {
      if (!Array.isArray(records) || !chatId) {
        continue;
      }

      const normalized = records
        .filter((record): record is HistoryMessageRecord => Boolean(record?.messageId && record?.chatId))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-MAX_STORED_HISTORY_PER_CHAT);

      if (normalized.length > 0) {
        chatHistoryStore.set(chatId, normalized);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    console.error(`generic: failed to load persisted history: ${String(error)}`);
  }
}

function schedulePersistHistory(): void {
  if (!historyPersistPath) {
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    const snapshot = serializeHistoryStore();
    persistChain = persistChain
      .then(async () => {
        mkdirSync(dirname(historyPersistPath), { recursive: true });
        await writeFile(historyPersistPath, JSON.stringify(snapshot), "utf8");
      })
      .catch((error) => {
        console.error(`generic: failed to persist history: ${String(error)}`);
      });
  }, 100);
}

function serializeHistoryStore(): PersistedHistoryStore {
  return {
    version: HISTORY_STORE_VERSION,
    chats: Object.fromEntries(chatHistoryStore.entries()),
  };
}

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
  schedulePersistHistory();
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
  schedulePersistHistory();
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

  schedulePersistHistory();
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
