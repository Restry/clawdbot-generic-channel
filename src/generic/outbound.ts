import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import { getGenericRuntime } from "./runtime.js";
import { sendMessageGeneric } from "./send.js";

export const genericOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getGenericRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ cfg, to, text }) => {
    const result = await sendMessageGeneric({ cfg, to, text });
    return { channel: "generic-channel", ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl }) => {
    // For now, just send media URL as text since we don't have media upload implemented
    let fullText = text ?? "";
    if (mediaUrl) {
      fullText = fullText ? `${fullText}\n\n📎 ${mediaUrl}` : `📎 ${mediaUrl}`;
    }

    const result = await sendMessageGeneric({ cfg, to, text: fullText });
    return { channel: "generic-channel", ...result };
  },
};
