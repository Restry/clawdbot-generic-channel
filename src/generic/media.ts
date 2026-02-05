import type { InboundMessage } from "./types.js";
import { getGenericRuntime } from "./runtime.js";

export type MediaInfo = {
  path: string;
  contentType?: string;
  placeholder: string;
};

/**
 * Download media from a URL with size limits
 */
export async function downloadMediaFromUrl(params: {
  url: string;
  maxBytes: number;
}): Promise<{ buffer: Buffer; contentType?: string }> {
  const { url, maxBytes } = params;

  // Fetch from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }

  // Check content length header
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxBytes) {
      throw new Error(`Media too large: ${size} bytes exceeds limit of ${maxBytes} bytes`);
    }
  }

  // Download content
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Check actual size
  if (buffer.length > maxBytes) {
    throw new Error(`Media too large: ${buffer.length} bytes exceeds limit of ${maxBytes} bytes`);
  }

  const contentType = response.headers.get("content-type") || undefined;

  return { buffer, contentType };
}

/**
 * Resolve and download media from an InboundMessage
 */
export async function resolveGenericMediaList(params: {
  message: InboundMessage;
  maxBytes: number;
  log?: (msg: string) => void;
}): Promise<MediaInfo[]> {
  const { message, maxBytes, log } = params;

  // Only process media messages with mediaUrl
  if (!message.mediaUrl) {
    return [];
  }

  const mediaTypes = ["image", "voice", "audio", "file"];
  if (!mediaTypes.includes(message.messageType)) {
    return [];
  }

  try {
    log?.(`generic: downloading media from ${message.mediaUrl}`);

    const { buffer, contentType } = await downloadMediaFromUrl({
      url: message.mediaUrl,
      maxBytes,
    });

    const core = getGenericRuntime();

    // Detect MIME type if not provided
    let finalContentType = contentType || message.mimeType;
    if (!finalContentType) {
      finalContentType = await core.media.detectMime({ buffer });
    }

    log?.(`generic: detected content type: ${finalContentType}, size: ${buffer.length} bytes`);

    // Save to disk using OpenClaw's media buffer handler
    const saved = await core.channel.media.saveMediaBuffer(buffer, finalContentType, "inbound", maxBytes);

    log?.(`generic: saved media to ${saved.path}`);

    return [
      {
        path: saved.path,
        contentType: saved.contentType,
        placeholder: inferPlaceholder(message.messageType),
      },
    ];
  } catch (err) {
    log?.(`generic: failed to download media: ${String(err)}`);
    return [];
  }
}

/**
 * Infer placeholder text based on message type
 */
function inferPlaceholder(messageType: string): string {
  switch (messageType) {
    case "image":
      return "<media:image>";
    case "voice":
      return "<media:voice>";
    case "audio":
      return "<media:audio>";
    case "file":
      return "<media:document>";
    default:
      return "<media:file>";
  }
}

/**
 * Build media payload for inbound context
 */
export function buildMediaPayload(mediaList: MediaInfo[]): {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
} {
  if (mediaList.length === 0) {
    return {};
  }

  const first = mediaList[0];
  const mediaPaths = mediaList.map((m) => m.path);
  const mediaTypes = mediaList.map((m) => m.contentType).filter(Boolean) as string[];

  return {
    MediaPath: first.path,
    MediaType: first.contentType,
    MediaUrl: first.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}

/**
 * Infer media type category from MIME type
 */
export function inferMediaTypeFromMime(mimeType: string): "image" | "voice" | "audio" | "file" {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    // Distinguish voice (short recordings) from audio (music/long files)
    // For now, default to audio - clients can specify via messageType
    return "audio";
  }
  return "file";
}
