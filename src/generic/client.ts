import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HTTPServer } from "http";
import type {
  GenericChannelConfig,
  WSEvent,
  InboundMessage,
  ChannelStatusRequest,
  AgentListRequest,
  AgentSelectRequest,
} from "./types.js";
import {
  authenticateGenericConnection,
  isGenericAgentAllowed,
  type GenericAuthUser,
} from "./auth.js";
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

export type ChannelStatusRequestData = ChannelStatusRequest;
export type AgentListRequestData = AgentListRequest;
export type AgentSelectRequestData = AgentSelectRequest;

type ClientConnectionState = {
  chatId: string;
  selectedAgentId?: string;
  authUser?: GenericAuthUser;
};

// Client connection manager
export class GenericWSManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map();
  private clientStates: WeakMap<WebSocket, ClientConnectionState> = new WeakMap();
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
    const verifyClient = this.verifyClient.bind(this);

    if (httpServer) {
      // Attach to existing HTTP server
      this.httpServer = httpServer;
      this.wss = new WebSocketServer({ server: httpServer, path, verifyClient });
    } else {
      // Create standalone WebSocket server
      this.wss = new WebSocketServer({ port, path, verifyClient });
    }

    this.wss.on("connection", (ws: WebSocket, req) => {
      const { chatId, agentId, authUser } = this.extractConnectionParams(req.url || "");
      console.log(`[generic] WebSocket client connected: ${chatId}`);

      if (chatId) {
        this.addClient(chatId, ws);
      }
      this.clientStates.set(ws, {
        chatId,
        selectedAgentId: agentId,
        authUser,
      });

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
        this.clientStates.delete(ws);
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

  private extractConnectionParams(url: string): {
    chatId: string;
    agentId?: string;
    authUser?: GenericAuthUser;
  } {
    const authResult = authenticateGenericConnection({
      config: this.config,
      url,
    });
    const authUser = authResult.ok ? authResult.authUser : undefined;
    const chatId = authUser?.chatId ?? authResult.query.chatId ?? `client-${Date.now()}`;

    return {
      chatId,
      agentId: authResult.query.agentId,
      authUser,
    };
  }

  private verifyClient(
    info: { origin: string; secure: boolean; req: InstanceType<typeof import("http").IncomingMessage> },
    callback: (res: boolean, code?: number, message?: string) => void,
  ): void {
    const authResult = authenticateGenericConnection({
      config: this.config,
      url: info.req.url || "",
    });

    if ("message" in authResult) {
      console.warn(`[generic] WebSocket auth rejected: ${authResult.message}`);
      callback(false, authResult.code, authResult.message);
      return;
    }

    callback(true);
  }

  private logRejectedEvent(chatId: string, eventType: WSEvent["type"], reason: string): void {
    console.warn(`[generic] Rejected ${eventType} from ${chatId}: ${reason}`);
  }

  private rewriteBoundFields<T extends Record<string, unknown>>(data: T, authUser: GenericAuthUser): T {
    const mutable = data as Record<string, unknown>;

    if ("chatId" in data) {
      mutable.chatId = authUser.chatId;
    }
    if ("senderId" in data) {
      mutable.senderId = authUser.senderId;
    }
    if ("userId" in data) {
      mutable.userId = authUser.senderId;
    }
    if ("readBy" in data) {
      mutable.readBy = authUser.senderId;
    }
    if ("pinnedBy" in data) {
      mutable.pinnedBy = authUser.senderId;
    }
    if ("actorId" in data) {
      mutable.actorId = authUser.senderId;
    }
    return data;
  }

  private handleMessage(ws: WebSocket, chatId: string, data: RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WSEvent;
      const authUser = this.clientStates.get(ws)?.authUser;

      switch (message.type) {
        case "message.receive": {
          const inbound = message.data as InboundMessage;
          if (authUser) {
            inbound.chatId = authUser.chatId;
            inbound.senderId = authUser.senderId;

            if (!isGenericAgentAllowed({
              allowedAgents: authUser.allowAgents,
              requestedAgentId: inbound.agentId,
            })) {
              this.logRejectedEvent(chatId, message.type, `agentId not allowed: ${String(inbound.agentId)}`);
              break;
            }
          }

          const selectedAgentId = this.getSelectedAgentId(ws);
          if (!String(inbound.agentId ?? "").trim() && selectedAgentId) {
            inbound.agentId = selectedAgentId;
          }
          this.onMessageReceive?.(inbound);
          break;
        }
        case "agent.list.get":
          this.onAgentListRequest?.({
            chatId,
            ws,
            data: (message.data as AgentListRequestData | undefined) ?? {},
          });
          break;
        case "agent.select":
          this.onAgentSelectRequest?.({
            chatId,
            ws,
            data: (message.data as AgentSelectRequestData | undefined) ?? {},
          });
          break;
        case "channel.status.get":
          this.onChannelStatusRequest?.({
            chatId,
            ws,
            data: (message.data as ChannelStatusRequestData | undefined) ?? {},
          });
          break;
        case "typing": {
          const typing = message.data as TypingIndicatorData;
          if (authUser) {
            this.rewriteBoundFields(typing as unknown as Record<string, unknown>, authUser);
          }
          this.onTypingIndicator?.(typing);
          break;
        }
        case "status.delivered":
        case "status.read": {
          const statusUpdate = message.data as MessageStatusUpdate;
          if (authUser) {
            this.rewriteBoundFields(statusUpdate as unknown as Record<string, unknown>, authUser);
          }
          this.onStatusUpdate?.(statusUpdate);
          break;
        }
        case "message.edit": {
          const edit = message.data as MessageEditData;
          if (authUser) {
            this.rewriteBoundFields(edit as unknown as Record<string, unknown>, authUser);
          }
          this.onMessageEdit?.(edit);
          break;
        }
        case "message.delete": {
          const deletion = message.data as MessageDeleteData;
          if (authUser) {
            this.rewriteBoundFields(deletion as unknown as Record<string, unknown>, authUser);
          }
          this.onMessageDelete?.(deletion);
          break;
        }
        case "reaction.add":
        case "reaction.remove": {
          const reactionEvent = message as ReactionEvent;
          if (authUser) {
            this.rewriteBoundFields(reactionEvent.data as unknown as Record<string, unknown>, authUser);
          }
          this.onReactionEvent?.(reactionEvent);
          break;
        }
        case "message.forward": {
          const forward = message.data as ForwardedMessage;
          if (authUser) {
            if (forward.targetChatId !== authUser.chatId || forward.originalChatId !== authUser.chatId) {
              this.logRejectedEvent(chatId, message.type, "forward target/origin must stay within bound chatId");
              break;
            }
            forward.forwardedBy = authUser.senderId;
          }
          this.onMessageForward?.(forward);
          break;
        }
        case "user.status": {
          const presence = message.data as UserPresence;
          if (authUser) {
            this.rewriteBoundFields(presence as unknown as Record<string, unknown>, authUser);
          }
          this.onUserStatusUpdate?.(presence);
          break;
        }
        case "file.transfer": {
          const transfer = message.data as FileTransferData;
          if (authUser) {
            this.rewriteBoundFields(transfer as unknown as Record<string, unknown>, authUser);
          }
          this.onFileTransfer?.(transfer);
          break;
        }
        case "file.progress": {
          const progress = message.data as FileProgressData;
          if (authUser) {
            this.rewriteBoundFields(progress as unknown as Record<string, unknown>, authUser);
          }
          this.onFileProgress?.(progress);
          break;
        }
        case "group.action": {
          const groupAction = message.data as GroupAction;
          if (authUser) {
            if (groupAction.groupId !== authUser.chatId) {
              this.logRejectedEvent(chatId, message.type, "groupId must match bound chatId");
              break;
            }
            this.rewriteBoundFields(groupAction as unknown as Record<string, unknown>, authUser);
          }
          this.onGroupAction?.(groupAction);
          break;
        }
        case "message.pin": {
          const pin = message.data as PinMessageData;
          if (authUser) {
            this.rewriteBoundFields(pin as unknown as Record<string, unknown>, authUser);
          }
          this.onPinMessage?.(pin);
          break;
        }
        case "message.unpin": {
          const unpin = message.data as UnpinMessageData;
          if (authUser) {
            this.rewriteBoundFields(unpin as unknown as Record<string, unknown>, authUser);
          }
          this.onUnpinMessage?.(unpin);
          break;
        }
      }
    } catch (err) {
      console.error(`[generic] Failed to parse message from ${chatId}:`, err);
    }
  }

  getSelectedAgentId(ws: WebSocket): string | undefined {
    return this.clientStates.get(ws)?.selectedAgentId;
  }

  getAllowedAgentIds(ws: WebSocket): string[] | undefined {
    return this.clientStates.get(ws)?.authUser?.allowAgents;
  }

  getAuthenticatedUser(ws: WebSocket): GenericAuthUser | undefined {
    return this.clientStates.get(ws)?.authUser;
  }

  setSelectedAgentId(ws: WebSocket, agentId?: string): void {
    const existing = this.clientStates.get(ws);
    if (!existing) {
      return;
    }

    this.clientStates.set(ws, {
      ...existing,
      selectedAgentId: agentId?.trim() || undefined,
    });
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

  private pruneClosedClients(): void {
    this.clients.forEach((clients, chatId) => {
      for (const ws of clients) {
        if (ws.readyState !== WebSocket.OPEN) {
          clients.delete(ws);
        }
      }

      if (clients.size === 0) {
        this.clients.delete(chatId);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.pruneClosedClients();
      this.clients.forEach((clients) => {
        for (const ws of clients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
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
  onChannelStatusRequest?: (params: {
    chatId: string;
    ws: WebSocket;
    data: ChannelStatusRequestData;
  }) => void;
  onAgentListRequest?: (params: {
    chatId: string;
    ws: WebSocket;
    data: AgentListRequestData;
  }) => void;
  onAgentSelectRequest?: (params: {
    chatId: string;
    ws: WebSocket;
    data: AgentSelectRequestData;
  }) => void;

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
    this.pruneClosedClients();
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
    this.pruneClosedClients();
    return Array.from(this.clients.keys());
  }

  getConnectionCount(chatId: string): number {
    this.pruneClosedClients();
    return this.clients.get(chatId)?.size ?? 0;
  }

  getConnectionStats(): {
    connectedChatCount: number;
    connectedSocketCount: number;
    connectedChats: string[];
  } {
    this.pruneClosedClients();

    let connectedSocketCount = 0;
    for (const clients of this.clients.values()) {
      connectedSocketCount += clients.size;
    }

    const connectedChats = Array.from(this.clients.keys());
    return {
      connectedChatCount: connectedChats.length,
      connectedSocketCount,
      connectedChats,
    };
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
