import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HTTPServer } from "http";
import type {
  GenericChannelConfig,
  WSEvent,
  InboundMessage,
  ChannelStatusRequest,
  HistoryRequest,
  AgentListRequest,
  AgentSelectRequest,
  ConversationListRequest,
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
export type HistoryRequestData = HistoryRequest;
export type AgentListRequestData = AgentListRequest;
export type AgentSelectRequestData = AgentSelectRequest;
export type ConversationListRequestData = ConversationListRequest;

type ClientConnectionState = {
  connectionId: string;
  currentChatId?: string;
  subscribedChatIds: Set<string>;
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
      const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const connectionLabel = authUser?.senderId ?? chatId ?? connectionId;
      console.log(`[generic] WebSocket client connected: ${connectionLabel}`);

      this.clientStates.set(ws, {
        connectionId,
        currentChatId: chatId,
        subscribedChatIds: new Set<string>(),
        selectedAgentId: agentId,
        authUser,
      });
      if (chatId) {
        this.subscribeClientToChat(ws, chatId);
      }

      ws.on("message", (data: RawData) => {
        this.handleMessage(ws, connectionLabel, data);
      });

      ws.on("close", () => {
        const state = this.clientStates.get(ws);
        console.log(`[generic] WebSocket client disconnected: ${connectionLabel}`);
        this.removeClientFromAllChats(ws);
        this.reconnectAttempts.delete(connectionId);
        this.onClientDisconnect?.({
          chatId: state?.currentChatId,
          ws,
          userId: state?.authUser?.senderId,
        });
        this.clientStates.delete(ws);
      });

      ws.on("error", (err) => {
        console.error(`[generic] WebSocket error for ${connectionLabel}:`, err);
        // Track failed connections for potential reconnect
        const attempts = this.reconnectAttempts.get(connectionId) || 0;
        this.reconnectAttempts.set(connectionId, attempts + 1);
      });

      // Send connection confirmation
      this.sendEvent(ws, {
        type: "connection.open",
        data: {
          chatId,
          userId: authUser?.senderId,
          timestamp: Date.now(),
        },
      });

      this.onClientConnect?.({
        chatId,
        ws,
        userId: authUser?.senderId,
      });
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
    chatId?: string;
    agentId?: string;
    authUser?: GenericAuthUser;
  } {
    const authResult = authenticateGenericConnection({
      config: this.config,
      url,
    });
    const authUser = authResult.ok ? authResult.authUser : undefined;
    return {
      chatId: authUser?.chatId ?? authResult.query.chatId,
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

    if (authUser.chatId && "chatId" in data) {
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

  private isChatAllowed(authUser: GenericAuthUser | undefined, targetChatId?: string | null): boolean {
    if (!authUser?.chatId) {
      return true;
    }

    const normalizedTarget = String(targetChatId ?? "").trim();
    return !normalizedTarget || normalizedTarget === authUser.chatId;
  }

  private resolveTargetChatId(params: {
    ws: WebSocket;
    incomingChatId?: string | null;
    fallbackChatId?: string | null;
  }): string | undefined {
    const state = this.clientStates.get(params.ws);
    const candidates = [params.incomingChatId, params.fallbackChatId, state?.currentChatId];

    for (const candidate of candidates) {
      const normalized = String(candidate ?? "").trim();
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private subscribeClientToChat(ws: WebSocket, chatId: string): void {
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return;
    }

    const existing = this.clientStates.get(ws);
    if (existing) {
      existing.currentChatId = normalizedChatId;
      existing.subscribedChatIds.add(normalizedChatId);
      this.clientStates.set(ws, existing);
    }

    const clients = this.clients.get(normalizedChatId) ?? new Set<WebSocket>();
    clients.add(ws);
    this.clients.set(normalizedChatId, clients);
  }

  private removeClientFromAllChats(ws: WebSocket): void {
    const state = this.clientStates.get(ws);
    if (!state) {
      return;
    }

    for (const chatId of state.subscribedChatIds) {
      const clients = this.clients.get(chatId);
      if (!clients) {
        continue;
      }

      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(chatId);
      }
    }
  }

  private handleMessage(ws: WebSocket, sourceId: string, data: RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WSEvent;
      const state = this.clientStates.get(ws);
      const authUser = this.clientStates.get(ws)?.authUser;

      switch (message.type) {
        case "message.receive": {
          const inbound = message.data as InboundMessage;
          const resolvedChatId = this.resolveTargetChatId({
            ws,
            incomingChatId: inbound.chatId,
          });
          if (!resolvedChatId) {
            this.logRejectedEvent(sourceId, message.type, "missing chatId");
            break;
          }

          if (!this.isChatAllowed(authUser, resolvedChatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }

          inbound.chatId = resolvedChatId;
          if (authUser) {
            inbound.senderId = authUser.senderId;

            if (!isGenericAgentAllowed({
              allowedAgents: authUser.allowAgents,
              requestedAgentId: inbound.agentId,
            })) {
              this.logRejectedEvent(sourceId, message.type, `agentId not allowed: ${String(inbound.agentId)}`);
              break;
            }
          }

          this.subscribeClientToChat(ws, inbound.chatId);
          const selectedAgentId = this.getSelectedAgentId(ws);
          if (!String(inbound.agentId ?? "").trim() && selectedAgentId) {
            inbound.agentId = selectedAgentId;
          }
          this.onMessageReceive?.(inbound);
          break;
        }
        case "history.get": {
          const request = (message.data as HistoryRequestData | undefined) ?? ({} as HistoryRequestData);
          const resolvedChatId = this.resolveTargetChatId({
            ws,
            incomingChatId: request.chatId,
          });
          if (!resolvedChatId) {
            this.logRejectedEvent(sourceId, message.type, "missing chatId");
            break;
          }
          if (!this.isChatAllowed(authUser, resolvedChatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          request.chatId = resolvedChatId;
          this.subscribeClientToChat(ws, resolvedChatId);
          this.onHistoryRequest?.({
            chatId: resolvedChatId,
            ws,
            data: request,
          });
          break;
        }
        case "agent.list.get":
          this.onAgentListRequest?.({
            chatId: state?.currentChatId,
            ws,
            data: (message.data as AgentListRequestData | undefined) ?? {},
          });
          break;
        case "agent.select":
          this.onAgentSelectRequest?.({
            chatId: state?.currentChatId,
            ws,
            data: (message.data as AgentSelectRequestData | undefined) ?? {},
          });
          break;
        case "conversation.list.get":
          this.onConversationListRequest?.({
            chatId: state?.currentChatId,
            ws,
            data: (message.data as ConversationListRequestData | undefined) ?? {},
          });
          break;
        case "channel.status.get":
          this.onChannelStatusRequest?.({
            chatId: state?.currentChatId,
            ws,
            data: (message.data as ChannelStatusRequestData | undefined) ?? {},
          });
          break;
        case "typing": {
          const typing = message.data as TypingIndicatorData;
          const resolvedChatId = this.resolveTargetChatId({
            ws,
            incomingChatId: typing.chatId,
          });
          if (!resolvedChatId || !this.isChatAllowed(authUser, resolvedChatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          typing.chatId = resolvedChatId;
          if (authUser) {
            this.rewriteBoundFields(typing as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, typing.chatId);
          this.onTypingIndicator?.(typing);
          break;
        }
        case "status.delivered":
        case "status.read": {
          const statusUpdate = message.data as MessageStatusUpdate;
          if (!this.isChatAllowed(authUser, statusUpdate.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(statusUpdate as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, statusUpdate.chatId);
          this.onStatusUpdate?.(statusUpdate);
          break;
        }
        case "message.edit": {
          const edit = message.data as MessageEditData;
          if (!this.isChatAllowed(authUser, edit.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(edit as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, edit.chatId);
          this.onMessageEdit?.(edit);
          break;
        }
        case "message.delete": {
          const deletion = message.data as MessageDeleteData;
          if (!this.isChatAllowed(authUser, deletion.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(deletion as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, deletion.chatId);
          this.onMessageDelete?.(deletion);
          break;
        }
        case "reaction.add":
        case "reaction.remove": {
          const reactionEvent = message as ReactionEvent;
          const reactionData = reactionEvent.data as Record<string, unknown>;
          if (!this.isChatAllowed(authUser, String(reactionData.chatId ?? ""))) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(reactionData, authUser);
          }
          this.subscribeClientToChat(ws, String(reactionData.chatId ?? ""));
          this.onReactionEvent?.(reactionEvent);
          break;
        }
        case "message.forward": {
          const forward = message.data as ForwardedMessage;
          if (authUser) {
            if (!this.isChatAllowed(authUser, forward.targetChatId) || !this.isChatAllowed(authUser, forward.originalChatId)) {
              this.logRejectedEvent(sourceId, message.type, "forward target/origin must stay within allowed chat scope");
              break;
            }
            forward.forwardedBy = authUser.senderId;
          }
          this.subscribeClientToChat(ws, forward.originalChatId);
          this.subscribeClientToChat(ws, forward.targetChatId);
          this.onMessageForward?.(forward);
          break;
        }
        case "user.status": {
          const presence = message.data as UserPresence;
          if (!this.isChatAllowed(authUser, (presence as { chatId?: string }).chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(presence as unknown as Record<string, unknown>, authUser);
          }
          this.onUserStatusUpdate?.(presence);
          break;
        }
        case "file.transfer": {
          const transfer = message.data as FileTransferData;
          if (!this.isChatAllowed(authUser, transfer.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(transfer as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, transfer.chatId);
          this.onFileTransfer?.(transfer);
          break;
        }
        case "file.progress": {
          const progress = message.data as FileProgressData;
          if (!this.isChatAllowed(authUser, progress.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(progress as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, progress.chatId);
          this.onFileProgress?.(progress);
          break;
        }
        case "group.action": {
          const groupAction = message.data as GroupAction;
          if (authUser) {
            if (!this.isChatAllowed(authUser, groupAction.groupId)) {
              this.logRejectedEvent(sourceId, message.type, "groupId not allowed for this token");
              break;
            }
            this.rewriteBoundFields(groupAction as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, groupAction.groupId);
          this.onGroupAction?.(groupAction);
          break;
        }
        case "message.pin": {
          const pin = message.data as PinMessageData;
          if (!this.isChatAllowed(authUser, pin.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(pin as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, pin.chatId);
          this.onPinMessage?.(pin);
          break;
        }
        case "message.unpin": {
          const unpin = message.data as UnpinMessageData;
          if (!this.isChatAllowed(authUser, unpin.chatId)) {
            this.logRejectedEvent(sourceId, message.type, "chatId not allowed for this token");
            break;
          }
          if (authUser) {
            this.rewriteBoundFields(unpin as unknown as Record<string, unknown>, authUser);
          }
          this.subscribeClientToChat(ws, unpin.chatId);
          this.onUnpinMessage?.(unpin);
          break;
        }
      }
    } catch (err) {
      console.error(`[generic] Failed to parse message from ${sourceId}:`, err);
    }
  }

  getSelectedAgentId(ws: WebSocket): string | undefined {
    return this.clientStates.get(ws)?.selectedAgentId;
  }

  getCurrentChatId(ws: WebSocket): string | undefined {
    return this.clientStates.get(ws)?.currentChatId;
  }

  getSubscribedChatIds(ws: WebSocket): string[] {
    return Array.from(this.clientStates.get(ws)?.subscribedChatIds ?? []);
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
  onClientConnect?: (params: { chatId?: string; ws: WebSocket; userId?: string }) => void;
  onClientDisconnect?: (params: { chatId?: string; ws: WebSocket; userId?: string }) => void;
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
    chatId?: string;
    ws: WebSocket;
    data: ChannelStatusRequestData;
  }) => void;
  onHistoryRequest?: (params: {
    chatId?: string;
    ws: WebSocket;
    data: HistoryRequestData;
  }) => void;
  onAgentListRequest?: (params: {
    chatId?: string;
    ws: WebSocket;
    data: AgentListRequestData;
  }) => void;
  onAgentSelectRequest?: (params: {
    chatId?: string;
    ws: WebSocket;
    data: AgentSelectRequestData;
  }) => void;
  onConversationListRequest?: (params: {
    chatId?: string;
    ws: WebSocket;
    data: ConversationListRequestData;
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
    const seen = new Set<WebSocket>();
    this.clients.forEach((clients) => {
      clients.forEach((ws) => {
        if (seen.has(ws)) {
          return;
        }
        seen.add(ws);
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

    const sockets = new Set<WebSocket>();
    for (const clients of this.clients.values()) {
      for (const ws of clients) {
        sockets.add(ws);
      }
    }

    const connectedChats = Array.from(this.clients.keys());
    return {
      connectedChatCount: connectedChats.length,
      connectedSocketCount: sockets.size,
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
