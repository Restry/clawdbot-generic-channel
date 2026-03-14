import type { OpenClawConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk";
import type { GenericChannelConfig, InboundMessage } from "./types.js";
import {
  createGenericWSManager,
  destroyGenericWSManager,
  type FileProgressData,
  type FileTransferData,
} from "./client.js";
import { handleGenericMessage } from "./bot.js";
import { handleStatusUpdate } from "./status.js";
import { handleMessageEdit, handleMessageDelete } from "./message-management.js";
import { handleReactionEvent } from "./reactions.js";
import { handleForwardRequest } from "./forwarding.js";
import { handleUserStatusUpdate } from "./presence.js";
import {
  initFileTransfer,
  getFileTransfer,
  updateFileTransferProgress,
  completeFileTransfer,
  failFileTransfer,
  broadcastFileTransfer,
  broadcastFileProgress,
} from "./file-transfer.js";
import { handleGroupAction } from "./groups.js";
import { handlePinMessage, handleUnpinMessage } from "./pins-stars.js";
import { getRecentHistoryMessages } from "./history.js";

export type MonitorGenericOpts = {
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

let currentWSManager: ReturnType<typeof createGenericWSManager> | null = null;

export async function monitorGenericProvider(opts: MonitorGenericOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Generic monitor");
  }

  const genericCfg = cfg.channels?.["generic-channel"] as GenericChannelConfig | undefined;
  if (!genericCfg?.enabled) {
    throw new Error("Generic channel not enabled");
  }

  const log = opts.runtime?.log ?? console.log;
  const error = opts.runtime?.error ?? console.error;

  const connectionMode = genericCfg.connectionMode ?? "websocket";

  if (connectionMode === "websocket") {
    return monitorWebSocket({ cfg, genericCfg, runtime: opts.runtime, abortSignal: opts.abortSignal });
  }

  log("generic: webhook mode requires HTTP server setup externally");
}

async function monitorWebSocket(params: {
  cfg: OpenClawConfig;
  genericCfg: GenericChannelConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, genericCfg, runtime, abortSignal } = params;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  log("generic: starting WebSocket server...");

  const wsManager = createGenericWSManager(genericCfg);
  currentWSManager = wsManager;

  const chatHistories = new Map<string, HistoryEntry[]>();

  wsManager.onClientConnect = ({ chatId, ws }) => {
    const historyLimit = Math.max(0, genericCfg.historyLimit ?? 10);
    if (historyLimit === 0) {
      return;
    }

    wsManager.sendDirect(ws, {
      type: "history.sync",
      data: {
        chatId,
        messages: getRecentHistoryMessages({
          chatId,
          limit: historyLimit,
        }),
        timestamp: Date.now(),
      },
    });
  };

  // Set up message handler
  wsManager.onMessageReceive = async (message: InboundMessage) => {
    try {
      await handleGenericMessage({
        cfg,
        message,
        runtime,
        chatHistories,
      });
    } catch (err) {
      error(`generic: error handling message: ${String(err)}`);
    }
  };

  // Set up status update handler
  wsManager.onStatusUpdate = async (data) => {
    try {
      await handleStatusUpdate({
        cfg,
        statusUpdate: {
          messageId: data.messageId,
          chatId: data.chatId,
          senderId: data.senderId ?? "unknown",
          status: data.status,
          timestamp: data.timestamp ?? Date.now(),
        },
      });
    } catch (err) {
      error(`generic: error handling status update: ${String(err)}`);
    }
  };

  // Set up message edit handler
  wsManager.onMessageEdit = async (data) => {
    try {
      await handleMessageEdit({
        cfg,
        edit: {
          messageId: data.messageId,
          chatId: data.chatId,
          senderId: data.senderId,
          newContent: data.newContent,
          editedAt: Date.now(),
        },
      });
    } catch (err) {
      error(`generic: error handling message edit: ${String(err)}`);
    }
  };

  // Set up message delete handler
  wsManager.onMessageDelete = async (data) => {
    try {
      await handleMessageDelete({
        cfg,
        deletion: {
          messageId: data.messageId,
          chatId: data.chatId,
          senderId: data.senderId,
          deleteType: data.deleteType ?? "soft",
          deletedAt: Date.now(),
        },
      });
    } catch (err) {
      error(`generic: error handling message delete: ${String(err)}`);
    }
  };

  // Set up typing indicator handler
  wsManager.onTypingIndicator = async (data) => {
    log(`generic: ${data.senderId} is ${data.isTyping ? "typing" : "stopped typing"} in ${data.chatId}`);
    wsManager.sendToClient(data.chatId, {
      type: "typing",
      data,
    });
  };

  wsManager.onReactionEvent = async (event) => {
    try {
      await handleReactionEvent({
        cfg,
        event: event as any,
      });
    } catch (err) {
      error(`generic: error handling reaction event: ${String(err)}`);
    }
  };

  wsManager.onMessageForward = async (data) => {
    try {
      await handleForwardRequest({
        cfg,
        forward: data as any,
      });
    } catch (err) {
      error(`generic: error handling forward request: ${String(err)}`);
    }
  };

  wsManager.onUserStatusUpdate = async (data) => {
    try {
      await handleUserStatusUpdate({
        cfg,
        status: data as any,
      });
    } catch (err) {
      error(`generic: error handling user status: ${String(err)}`);
    }
  };

  wsManager.onFileTransfer = async (data: FileTransferData) => {
    try {
      let transfer = getFileTransfer(data.fileId);
      if (!transfer) {
        transfer = initFileTransfer({
          fileId: data.fileId,
          chatId: data.chatId,
          senderId: data.senderId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileType: data.fileType,
          mimeType: data.mimeType,
        });
      }

      if (data.status === "failed") {
        transfer = failFileTransfer({
          fileId: data.fileId,
          error: data.error ?? "File transfer failed",
        });
      } else if (data.status === "uploaded" || data.status === "completed") {
        transfer = completeFileTransfer({
          fileId: data.fileId,
          url: data.url ?? transfer.url ?? `https://example.com/files/${data.fileId}`,
        });
      } else {
        transfer = updateFileTransferProgress({
          fileId: data.fileId,
          progress: data.progress ?? transfer.progress,
          uploadedBytes: data.uploadedBytes,
          status: data.status === "pending" ? undefined : data.status,
          url: data.url,
          error: data.error,
        });
      }

      if (transfer) {
        broadcastFileTransfer({
          cfg,
          chatId: transfer.chatId,
          transfer,
        });
      }
    } catch (err) {
      error(`generic: error handling file transfer: ${String(err)}`);
    }
  };

  wsManager.onFileProgress = async (data: FileProgressData) => {
    try {
      const transfer = getFileTransfer(data.fileId);
      const totalBytes = data.totalBytes ?? transfer?.fileSize ?? 0;
      const uploadedBytes = data.uploadedBytes ?? Math.floor((totalBytes * (data.progress ?? 0)) / 100);

      const updated = updateFileTransferProgress({
        fileId: data.fileId,
        progress: data.progress ?? 0,
        uploadedBytes,
        status: data.status,
      });

      if (updated) {
        broadcastFileProgress({
          cfg,
          chatId: updated.chatId,
          progress: {
            fileId: updated.fileId,
            chatId: updated.chatId,
            progress: updated.progress,
            uploadedBytes,
            totalBytes,
            status: (data.status ?? "uploading") as "uploading" | "downloading",
            timestamp: data.timestamp ?? Date.now(),
          },
        });
      }
    } catch (err) {
      error(`generic: error handling file progress: ${String(err)}`);
    }
  };

  wsManager.onGroupAction = async (data) => {
    try {
      await handleGroupAction({
        cfg,
        action: data as any,
      });
    } catch (err) {
      error(`generic: error handling group action: ${String(err)}`);
    }
  };

  wsManager.onPinMessage = async (data) => {
    try {
      await handlePinMessage({
        cfg,
        messageId: data.messageId,
        chatId: data.chatId,
        pinnedBy: data.pinnedBy,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      error(`generic: error handling pin request: ${String(err)}`);
    }
  };

  wsManager.onUnpinMessage = async (data) => {
    try {
      await handleUnpinMessage({
        cfg,
        messageId: data.messageId,
        chatId: data.chatId,
      });
    } catch (err) {
      error(`generic: error handling unpin request: ${String(err)}`);
    }
  };

  // Start the WebSocket server
  wsManager.start();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (currentWSManager === wsManager) {
        destroyGenericWSManager();
        currentWSManager = null;
      }
    };

    const handleAbort = () => {
      log("generic: abort signal received, stopping WebSocket server");
      cleanup();
      resolve();
    };

    if (abortSignal?.aborted) {
      cleanup();
      resolve();
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    // The WebSocket server runs indefinitely until aborted
    log("generic: WebSocket server is running");
  });
}

export function stopGenericMonitor(): void {
  if (currentWSManager) {
    destroyGenericWSManager();
    currentWSManager = null;
  }
}
