import {
  createReplyPrefixContext,
  createTypingCallbacks,
  logTypingFailure,
  type ClawdbotConfig,
  type RuntimeEnv,
  type ReplyPayload,
} from "openclaw/plugin-sdk";
import { getGenericRuntime } from "./runtime.js";
import { sendMessageGeneric } from "./send.js";
import type { GenericChannelConfig } from "./types.js";

export type CreateGenericReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  chatId: string;
  replyToMessageId?: string;
};

export function createGenericReplyDispatcher(params: CreateGenericReplyDispatcherParams) {
  const core = getGenericRuntime();
  const { cfg, agentId, chatId, replyToMessageId } = params;

  const prefixContext = createReplyPrefixContext({
    cfg,
    agentId,
  });

  // Generic channel typing indicator (optional)
  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      params.runtime.log?.(`generic: typing started`);
      // Could send typing indicator via WebSocket if needed
    },
    stop: async () => {
      params.runtime.log?.(`generic: typing stopped`);
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (message) => params.runtime.log?.(message),
        channel: "generic",
        action: "start",
        error: err,
      });
    },
    onStopError: (err) => {
      logTypingFailure({
        log: (message) => params.runtime.log?.(message),
        channel: "generic",
        action: "stop",
        error: err,
      });
    },
  });

  const textChunkLimit = core.channel.text.resolveTextChunkLimit({
    cfg,
    channel: "generic",
    defaultLimit: 4000,
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      onReplyStart: typingCallbacks.onReplyStart,
      deliver: async (payload: ReplyPayload) => {
        params.runtime.log?.(`generic deliver called: text=${payload.text?.slice(0, 100)}`);
        const text = payload.text ?? "";

        if (!text.trim()) {
          params.runtime.log?.(`generic: empty text, skipping delivery`);
          return;
        }

        // Chunk text if needed
        const chunks = core.channel.text.chunkMarkdownText(text, textChunkLimit);

        for (const chunk of chunks) {
          await sendMessageGeneric({
            cfg,
            to: `chat:${chatId}`,
            text: chunk,
            replyToMessageId,
            contentType: "text",
          });
        }

        params.runtime.log?.(`generic: sent ${chunks.length} message chunk(s)`);
      },
      onReplyEnd: typingCallbacks.onReplyEnd,
    });

  return {
    dispatcher,
    replyOptions,
    markDispatchIdle,
  };
}
