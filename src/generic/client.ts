import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HTTPServer } from "http";
import type { GenericChannelConfig, WSEvent, InboundMessage } from "./types.js";
import type { ForwardedMessage } from "./forwarding.js";
import type { GroupAction } from "./groups.js";
import type { UserPresence } from "./presence.js";
import type { ReactionEvent } from "./reactions.js";
import type { MessageStatusUpdate } from "./status.js";

export type TypingIndicatorData = {
  chatId: string;
  senderId: string;
  senderName?: string;
  isTyping: boolean;
  timestamp?: number;
};

export type MessageEditData = {
  messageId: string;
  chatId: string;
  senderId: string;
  newContent: string;
  oldContent?: string;
  editedAt?: number;
};

export type MessageDeleteData = {
  messageId: string;
  chatId: string;
  senderId: string;
  deleteType?: "soft" | "hard";
  deletedAt?: number;
};

export type FileTransferData = {
  fileId: string;
  chatId: string;
  senderId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType: string;
  status: "pending" | "uploading" | "uploaded" | "downloading" | "completed" | "failed";
  progress?: number;
  uploadedBytes?: number;
  url?: string;
  error?: string;
  timestamp?: number;
};

export type FileProgressData = {
  fileId: string;
  chatId: string;
  progress: number;
  uploadedBytes?: number;
  totalBytes?: number;
  status?: "uploading" | "downloading" | "completed";
  timestamp?: number;
};

export type PinMessageData = {
  messageId: string;
  chatId: string;
  pinnedBy: string;
  pinnedAt?: number;
  expiresAt?: number;
};

export type UnpinMessageData = {
  messageId: string;
  chatId: string;
};

// Client connection manager
export class GenericWSManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map();
  private httpServer: HTTPServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000; // 1 second

  constructor(private config: GenericChannelConfig) {}

  start(httpServer?: HTTPServer): void {
    const port = this.config.wsPort ?? 8080;
    const path = this.config.wsPath ?? "/ws";

    if (httpServer) {
      // Attach to existing HTTP server
      this.httpServer = httpServer;
      this.wss = new WebSocketServer({ server: httpServer, path });
    } else {
      // Create standalone WebSocket server
      this.wss = new WebSocketServer({ port, path });
    }

    this.wss.on("connection", (ws: WebSocket, req) => {
      const chatId = this.extractChatId(req.url || "");
      console.log(`[generic] WebSocket client connected: ${chatId}`);

      if (chatId) {
        this.addClient(chatId, ws);
      }

      ws.on("message", (data: RawData) => {
        this.handleMessage(ws, chatId, data);
      });

      ws.on("close", () => {
        console.log(`[generic] WebSocket client disconnected: ${chatId}`);
        if (chatId) {
          this.removeClient(chatId, ws);
          // Reset reconnect attempts on clean disconnect
          this.reconnectAttempts.delete(chatId);
          this.onClientDisconnect?.(chatId);
        }
      });

      ws.on("error", (err) => {
        console.error(`[generic] WebSocket error for ${chatId}:`, err);
        // Track failed connections for potential reconnect
        const attempts = this.reconnectAttempts.get(chatId) || 0;
        this.reconnectAttempts.set(chatId, attempts + 1);
      });

      // Send connection confirmation
      this.sendEvent(ws, {
        type: "connection.open",
        data: { chatId, timestamp: Date.now() },
      });

      if (chatId) {
        this.onClientConnect?.({ chatId, ws });
      }
    });

    // Start heartbeat
    this.startHeartbeat();

    console.log(`[generic] WebSocket server started on ${httpServer ? "attached server" : `port ${port}`} at path ${path}`);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.clients.clear();
  }

  private extractChatId(url: string): string {
    const match = url.match(/[?&]chatId=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : `client-${Date.now()}`;
  }

  private handleMessage(ws: WebSocket, chatId: string, data: RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WSEvent;

      switch (message.type) {
        case "message.receive":
          this.onMessageReceive?.(message.data as InboundMessage);
          break;
        case "typing":
          this.onTypingIndicator?.(message.data as TypingIndicatorData);
          break;
        case "status.delivered":
        case "status.read":
          this.onStatusUpdate?.(message.data as MessageStatusUpdate);
          break;
        case "message.edit":
          this.onMessageEdit?.(message.data as MessageEditData);
          break;
        case "message.delete":
          this.onMessageDelete?.(message.data as MessageDeleteData);
          break;
        case "reaction.add":
        case "reaction.remove":
          this.onReactionEvent?.(message as ReactionEvent);
          break;
        case "message.forward":
          this.onMessageForward?.(message.data as ForwardedMessage);
          break;
        case "user.status":
          this.onUserStatusUpdate?.(message.data as UserPresence);
          break;
        case "file.transfer":
          this.onFileTransfer?.(message.data as FileTransferData);
          break;
        case "file.progress":
          this.onFileProgress?.(message.data as FileProgressData);
          break;
        case "group.action":
          this.onGroupAction?.(message.data as GroupAction);
          break;
        case "message.pin":
          this.onPinMessage?.(message.data as PinMessageData);
          break;
        case "message.unpin":
          this.onUnpinMessage?.(message.data as UnpinMessageData);
          break;
      }
    } catch (err) {
      console.error(`[generic] Failed to parse message from ${chatId}:`, err);
    }
  }

  private addClient(chatId: string, ws: WebSocket): void {
    const clients = this.clients.get(chatId) ?? new Set<WebSocket>();
    clients.add(ws);
    this.clients.set(chatId, clients);
  }

  private removeClient(chatId: string, ws: WebSocket): void {
    const clients = this.clients.get(chatId);
    if (!clients) {
      return;
    }
    clients.delete(ws);
    if (clients.size === 0) {
      this.clients.delete(chatId);
    }
  }

  private sendEvent(ws: WebSocket, event: WSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((clients, chatId) => {
        for (const ws of clients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
            continue;
          }

          clients.delete(ws);
        }

        if (clients.size === 0) {
          this.clients.delete(chatId);
        }
      });
    }, 30000); // 30 seconds
  }

  // Public API
  onMessageReceive?: (message: InboundMessage) => void;
  onStatusUpdate?: (data: MessageStatusUpdate) => void;
  onClientConnect?: (params: { chatId: string; ws: WebSocket }) => void;
  onClientDisconnect?: (chatId: string) => void;
  onTypingIndicator?: (data: TypingIndicatorData) => void;
  onMessageEdit?: (data: MessageEditData) => void;
  onMessageDelete?: (data: MessageDeleteData) => void;
  onReactionEvent?: (event: ReactionEvent) => void;
  onMessageForward?: (data: ForwardedMessage) => void;
  onUserStatusUpdate?: (data: UserPresence) => void;
  onFileTransfer?: (data: FileTransferData) => void;
  onFileProgress?: (data: FileProgressData) => void;
  onGroupAction?: (data: GroupAction) => void;
  onPinMessage?: (data: PinMessageData) => void;
  onUnpinMessage?: (data: UnpinMessageData) => void;

  sendToClient(chatId: string, event: WSEvent): boolean {
    const clients = this.clients.get(chatId);
    if (!clients || clients.size === 0) {
      return false;
    }

    let sent = false;
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendEvent(ws, event);
        sent = true;
      }
    }

    return sent;
  }

  sendDirect(ws: WebSocket, event: WSEvent): void {
    this.sendEvent(ws, event);
  }

  broadcast(event: WSEvent): void {
    this.clients.forEach((clients) => {
      clients.forEach((ws) => {
        this.sendEvent(ws, event);
      });
    });
  }

  isClientConnected(chatId: string): boolean {
    const clients = this.clients.get(chatId);
    if (!clients) {
      return false;
    }
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Singleton instance
let wsManager: GenericWSManager | null = null;

export function createGenericWSManager(config: GenericChannelConfig): GenericWSManager {
  if (!wsManager) {
    wsManager = new GenericWSManager(config);
  }
  return wsManager;
}

export function getGenericWSManager(): GenericWSManager | null {
  return wsManager;
}

export function destroyGenericWSManager(): void {
  if (wsManager) {
    wsManager.stop();
    wsManager = null;
  }
}
