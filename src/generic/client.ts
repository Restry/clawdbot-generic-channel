import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HTTPServer } from "http";
import type { GenericChannelConfig, WSEvent, InboundMessage } from "./types.js";

// Client connection manager
export class GenericWSManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private httpServer: HTTPServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

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
        this.clients.set(chatId, ws);
      }

      ws.on("message", (data: RawData) => {
        this.handleMessage(ws, chatId, data);
      });

      ws.on("close", () => {
        console.log(`[generic] WebSocket client disconnected: ${chatId}`);
        if (chatId) {
          this.clients.delete(chatId);
        }
      });

      ws.on("error", (err) => {
        console.error(`[generic] WebSocket error for ${chatId}:`, err);
      });

      // Send connection confirmation
      this.sendEvent(ws, {
        type: "connection.open",
        data: { chatId, timestamp: Date.now() },
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

      if (message.type === "message.receive") {
        // Forward to message handler
        this.onMessageReceive?.(message.data as InboundMessage);
      } else if (message.type === "typing") {
        // Handle typing indicator (optional)
        console.log(`[generic] Typing indicator from ${chatId}`);
      }
    } catch (err) {
      console.error(`[generic] Failed to parse message from ${chatId}:`, err);
    }
  }

  private sendEvent(ws: WebSocket, event: WSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, chatId) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          this.clients.delete(chatId);
        }
      });
    }, 30000); // 30 seconds
  }

  // Public API
  onMessageReceive?: (message: InboundMessage) => void;

  sendToClient(chatId: string, event: WSEvent): boolean {
    const ws = this.clients.get(chatId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendEvent(ws, event);
      return true;
    }
    return false;
  }

  broadcast(event: WSEvent): void {
    this.clients.forEach((ws) => {
      this.sendEvent(ws, event);
    });
  }

  isClientConnected(chatId: string): boolean {
    const ws = this.clients.get(chatId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
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
