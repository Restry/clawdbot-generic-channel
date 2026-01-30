import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { GenericChannelConfig, GenericSendResult, OutboundMessage } from "./types.js";
import { getGenericWSManager } from "./client.js";

export type SendGenericMessageParams = {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
  contentType?: "text" | "markdown";
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
  const { cfg, to, text, replyToMessageId, contentType = "text" } = params;
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

      if (!sent) {
        console.warn(`[generic] Client ${target.chatId} not connected, message queued`);
      }
    }
  }

  // In webhook mode, messages are sent synchronously as HTTP responses
  // The webhook handler will call this and send the response directly

  return {
    messageId,
    chatId: target.chatId,
  };
}
