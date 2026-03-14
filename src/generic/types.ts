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
  messageType: "text" | "image" | "voice" | "audio" | "file";
  content: string;
  // Media URL for image/voice/audio messages
  mediaUrl?: string;
  // MIME type for media content
  mimeType?: string;
  timestamp: number;
  parentId?: string;
};

// Outbound message (Server → H5)
export type OutboundMessage = {
  messageId: string;
  chatId: string;
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio";
  // Media URL for image/voice/audio messages
  mediaUrl?: string;
  // MIME type for media content
  mimeType?: string;
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
  contentType: InboundMessage["messageType"];
  // Media URL for image/voice/audio messages
  mediaUrl?: string;
  // MIME type for media content
  mimeType?: string;
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
  | "history.sync"
  | "message.edit"
  | "message.delete"
  | "message.forward"
  | "message.pin"
  | "message.unpin"
  | "connection.open"
  | "connection.close"
  | "typing"
  | "thinking.start"
  | "thinking.update"
  | "thinking.end"
  | "reaction.add"
  | "reaction.remove"
  | "status.sent"
  | "status.read"
  | "status.delivered"
  | "status.failed"
  | "user.status"
  | "file.progress"
  | "file.transfer"
  | "group.action";

export type WSEvent = {
  type: WSEventType;
  data: unknown;
};
