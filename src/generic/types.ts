import type { GenericChannelConfigSchema } from "./config-schema.js";
import type { z } from "zod";

export type GenericChannelConfig = z.infer<typeof GenericChannelConfigSchema>;

export type GenericConnectionMode = "websocket" | "webhook";

export type ResolvedGenericAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
};

// Inbound message (H5 → Server)
export type InboundMessage = {
  messageId: string;
  chatId: string;
  chatType: "direct" | "group";
  senderId: string;
  senderName?: string;
  messageType: "text" | "image" | "file";
  content: string;
  timestamp: number;
  parentId?: string;
};

// Outbound message (Server → H5)
export type OutboundMessage = {
  messageId: string;
  chatId: string;
  content: string;
  contentType: "text" | "markdown";
  replyTo?: string;
  timestamp: number;
};

export type GenericMessageContext = {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  chatType: "direct" | "group";
  content: string;
  contentType: string;
  parentId?: string;
};

export type GenericSendResult = {
  messageId: string;
  chatId: string;
};

export type GenericProbeResult = {
  ok: boolean;
  error?: string;
  mode?: GenericConnectionMode;
  port?: number;
};

// WebSocket event types
export type WSEventType =
  | "message.receive"
  | "message.send"
  | "connection.open"
  | "connection.close"
  | "typing";

export type WSEvent = {
  type: WSEventType;
  data: unknown;
};
