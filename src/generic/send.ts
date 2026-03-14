import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { GenericChannelConfig, GenericSendResult, OutboundMessage, WSEventType } from "./types.js";
import { getGenericWSManager } from "./client.js";
import { appendOutboundHistoryMessage } from "./history.js";
import { updateMessageStatus } from "./message-status.js";

export type SendGenericMessageParams = {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
  contentType?: "text" | "markdown" | "image" | "voice" | "audio";
  mediaUrl?: string;
  mimeType?: string;
};

function normalizeTarget(to: string): { chatId: string; type: "user" | "chat" } {
  // Parse target format: "user:xxx" or "chat:xxx" or just "xxx"
  if (to.startsWith("user:")) {
    return { chatId: to.substring(5), type: "user" };
  } else if (to.startsWith("chat:")) {
    return { chatId: to.substring(5), type: "chat" };
  } else {
    return { chatId: to, type: "user" };
  }
}

export async function sendMessageGeneric(params: SendGenericMessageParams): Promise<GenericSendResult> {
  const { cfg, to, text, replyToMessageId, contentType = "text", mediaUrl, mimeType } = params;
  const genericCfg = cfg.channels?.["generic-channel"] as GenericChannelConfig | undefined;

  if (!genericCfg) {
    throw new Error("Generic channel not configured");
  }

  const target = normalizeTarget(to);
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const outboundMessage: OutboundMessage = {
    messageId,
    chatId: target.chatId,
    content: text,
    contentType,
    mediaUrl,
    mimeType,
    replyTo: replyToMessageId,
    timestamp: Date.now(),
  };

  // Send via WebSocket if in websocket mode
  if (genericCfg.connectionMode === "websocket") {
    const wsManager = getGenericWSManager();
    if (wsManager) {
      const sent = wsManager.sendToClient(target.chatId, {
        type: "message.send",
        data: outboundMessage,
      });

      if (sent) {
        appendOutboundHistoryMessage(outboundMessage);
        // Mark as sent
        updateMessageStatus({
          cfg,
          messageId,
          chatId: target.chatId,
          status: "sent",
        });
      } else {
        // Mark as failed if client not connected
        console.warn(`[generic] Client ${target.chatId} not connected, message failed`);
        updateMessageStatus({
          cfg,
          messageId,
          chatId: target.chatId,
          status: "failed",
          error: "Client not connected",
        });
      }
    } else {
      // No WebSocket manager - mark as failed
      updateMessageStatus({
        cfg,
        messageId,
        chatId: target.chatId,
        status: "failed",
        error: "WebSocket manager not available",
      });
    }
  }

  if (genericCfg.connectionMode !== "websocket") {
    appendOutboundHistoryMessage(outboundMessage);
  }

  // In webhook mode, messages are sent synchronously as HTTP responses
  // The webhook handler will call this and send the response directly

  return {
    messageId,
    chatId: target.chatId,
  };
}

// Send thinking indicator to client
export async function sendThinkingIndicator(params: {
  cfg: OpenClawConfig;
  to: string;
  eventType: "thinking.start" | "thinking.update" | "thinking.end";
  content?: string;
}): Promise<void> {
  const { cfg, to, eventType, content = "" } = params;
  const genericCfg = cfg.channels?.["generic-channel"] as GenericChannelConfig | undefined;

  if (!genericCfg) {
    return;
  }

  const target = normalizeTarget(to);

  if (genericCfg.connectionMode === "websocket") {
    const wsManager = getGenericWSManager();
    if (wsManager) {
      wsManager.sendToClient(target.chatId, {
        type: eventType,
        data: {
          chatId: target.chatId,
          content,
          timestamp: Date.now(),
        },
      });
    }
  }
}

// Send media message (image/voice/audio)
export async function sendMediaGeneric(params: {
  cfg: OpenClawConfig;
  to: string;
  mediaUrl: string;
  mediaType: "image" | "voice" | "audio";
  mimeType?: string;
  caption?: string;
  replyToMessageId?: string;
}): Promise<GenericSendResult> {
  const { cfg, to, mediaUrl, mediaType, mimeType, caption = "", replyToMessageId } = params;

  return sendMessageGeneric({
    cfg,
    to,
    text: caption,
    contentType: mediaType,
    mediaUrl,
    mimeType,
    replyToMessageId,
  });
}
