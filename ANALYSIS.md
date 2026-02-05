# Generic Channel vs Feishu Channel - Comparative Analysis

## Executive Summary

This document analyzes the differences between the Generic WebSocket/Webhook channel and the Feishu channel implementations for OpenClaw, identifying optimization opportunities to support comprehensive chat features including text, voice, images, and other media types.

## Key Differences

### 1. Connection Methods

**Generic Channel:**
- WebSocket server mode (default)
- Webhook mode (passive, requires external HTTP server)
- Simple client management with connection tracking

**Feishu Channel:**
- WebSocket mode for event streaming
- Webhook mode with Feishu API integration
- Uses `@larksuiteoapi/node-sdk` for official API access
- Multiple account support with per-account configuration

**Recommendation:** Generic channel's WebSocket approach is flexible and good for H5 pages, but lacks the robust API client that Feishu has.

---

### 2. Media Handling (CRITICAL DIFFERENCE)

#### Generic Channel - Current State:
**Message Types:**
```typescript
messageType: "text" | "image" | "voice" | "audio" | "file"
contentType: "text" | "markdown" | "image" | "voice" | "audio"
```

**Current Implementation:**
- ✅ Supports media URL passing in message
- ✅ Includes `mediaUrl` and `mimeType` fields in InboundMessage
- ❌ **NO media download capability** - relies on client to provide URLs
- ❌ **NO media upload capability** - cannot upload files to storage
- ❌ **NO local file handling** - messages only reference URLs
- ⚠️ Media info is included in message body as text for agent context
- ⚠️ Sends media URLs directly to client without processing

#### Feishu Channel - Full Media Support:
**Message Types:**
```typescript
message_type: "text" | "post" | "image" | "file" | "audio" | "video" | "sticker"
```

**Advanced Features:**
1. **Media Download** (`src/media.ts`):
   - `downloadImageFeishu()` - Download images using image_key
   - `downloadMessageResourceFeishu()` - Download files/audio/video
   - Handles multiple SDK response formats (Buffer, Stream, ArrayBuffer)
   - Content type detection with fallback
   - Temporary file handling for SDK compatibility

2. **Media Upload** (`src/media.ts`):
   - `uploadImageFeishu()` - Upload images (JPEG, PNG, WEBP, GIF, etc.)
   - `uploadFileFeishu()` - Upload files (max 30MB)
   - Automatic file type detection
   - Returns keys for sending messages

3. **Media Sending** (`src/media.ts`):
   - `sendImageFeishu()` - Send image messages with image_key
   - `sendFileFeishu()` - Send file messages with file_key
   - `sendMediaFeishu()` - Universal media sender (URL, path, or buffer)
   - Automatic file/URL detection and handling
   - Fallback to URL link on upload failure

4. **Media Processing in Messages** (`src/bot.ts`):
   - `resolveFeishuMediaList()` - Download and process media from messages
   - Saves media to local disk using `core.channel.media.saveMediaBuffer()`
   - Extracts embedded images from rich text (post) messages
   - Builds comprehensive media payload for agent context:
     ```typescript
     {
       MediaPath, MediaType, MediaUrl,     // Single media (first)
       MediaPaths, MediaUrls, MediaTypes   // Multiple media
     }
     ```
   - Size limits (configurable, default 30MB)
   - Proper MIME type detection

5. **Rich Text (Post) Support:**
   - Parses embedded images from post content
   - Extracts text, links, mentions from rich text
   - Downloads all embedded images separately

**Key Insight:** Feishu channel downloads media, saves it locally, and provides file paths to the agent. This enables:
- Agent vision capabilities (can analyze images)
- Audio transcription
- File content analysis
- Proper media context in conversations

---

### 3. Message Context & Parsing

#### Generic Channel:
```typescript
type GenericMessageContext = {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  chatType: "direct" | "group";
  content: string;
  contentType: string;
  mediaUrl?: string;
  mimeType?: string;
  parentId?: string;  // Reply support
}
```

**Current handling:**
- Simple content parsing
- Basic media URL inclusion in message body
- Quote/reply support via `parentId`
- No media download or local storage

#### Feishu Channel:
```typescript
type FeishuMessageContext = {
  chatId: string;
  messageId: string;
  senderId: string;
  senderOpenId: string;
  senderName?: string;          // Fetched from API with caching
  chatType: "p2p" | "group";
  mentionedBot: boolean;
  rootId?: string;              // Thread root
  parentId?: string;            // Reply parent
  content: string;
  contentType: string;
  mentionTargets?: MentionTarget[];      // @mention support
  mentionMessageBody?: string;           // Cleaned message body
}
```

**Advanced features:**
- Sender name resolution with caching (10min TTL)
- @mention detection and parsing
- Message threading (rootId + parentId)
- Quoted message fetching with `getMessageFeishu()`
- Rich text (post) parsing with embedded media
- Permission error handling with grant URL extraction

---

### 4. Configuration Richness

#### Generic Channel - Minimal Config:
```typescript
{
  enabled: boolean,
  connectionMode: "websocket" | "webhook",
  wsPort: number,
  wsPath: string,
  webhookPath: string,
  webhookPort: number,
  webhookSecret?: string,
  dmPolicy: "open" | "pairing" | "allowlist",
  allowFrom?: string[],
  historyLimit: number,
  textChunkLimit: number
}
```

#### Feishu Channel - Rich Config:
```typescript
{
  // Account management
  accounts: Record<string, AccountConfig>,  // Multi-account support

  // Connection
  appId, appSecret, encryptKey, verificationToken,
  domain: "feishu" | "lark" | custom_url,
  connectionMode, webhookPath, webhookPort,

  // Policies
  dmPolicy, allowFrom,
  groupPolicy: "open" | "allowlist" | "disabled",
  groupAllowFrom,
  requireMention: boolean,

  // Per-group config
  groups: {
    [groupId]: {
      requireMention, tools, skills,
      enabled, allowFrom, systemPrompt
    }
  },

  // Per-DM config
  dms: {
    [userId]: {
      enabled, systemPrompt
    }
  },

  // Message rendering
  markdown: { mode, tableMode },
  renderMode: "auto" | "raw" | "card",
  textChunkLimit, chunkMode,
  blockStreamingCoalesce,

  // Media
  mediaMaxMb: number,

  // Features
  tools: { doc, wiki, drive, perm, scopes },
  dynamicAgentCreation,
  heartbeat,
  configWrites
}
```

**Key additions needed for Generic:**
- `mediaMaxMb` - Media size limits
- `groupPolicy` - More granular group control
- `requireMention` - Bot mention requirement in groups
- Per-group/DM configurations
- Markdown rendering options
- Media download/upload settings

---

### 5. Outbound Adapters

#### Generic Channel:
```typescript
{
  deliveryMode: "direct",
  chunker: markdown chunker,
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: sendMessageGeneric,
  sendMedia: sendMediaGeneric  // Basic, sends URL or falls back to text
}
```

#### Feishu Channel:
```typescript
{
  deliveryMode: "direct",
  chunker: markdown chunker,
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: sendMessageFeishu,
  sendMedia: async ({ mediaUrl, text }) => {
    // Send text first
    if (text) await sendMessageFeishu({ text });

    // Upload and send media if URL provided
    if (mediaUrl) {
      try {
        await sendMediaFeishu({ mediaUrl });  // Downloads, uploads, sends
      } catch {
        // Fallback to URL link
        await sendMessageFeishu({ text: `📎 ${mediaUrl}` });
      }
    }
  }
}
```

**Key difference:** Feishu actively downloads media from URL, uploads to platform, and sends properly. Generic just passes URL as-is.

---

### 6. Bot Message Handler Complexity

#### Generic Channel (`bot.ts`) - ~196 lines:
- Simple message parsing
- Basic DM policy checking
- History management for groups
- Direct message dispatch
- Media URL included in text for context

#### Feishu Channel (`bot.ts`) - ~868 lines:
- Complex permission error handling
- Sender name resolution with caching
- Group policy with per-group configs
- Mention detection and forwarding
- **Media download and local storage**
- Quoted message fetching
- Permission grant URL extraction
- Dynamic agent creation
- Rich text (post) parsing
- Multi-account support

---

### 7. Additional Features in Feishu

**Features NOT in Generic:**
1. **Reactions** (`reactions.ts`):
   - Add/remove emoji reactions
   - List reactions on messages

2. **Message Editing** (`send.ts`):
   - Edit existing messages (24hr limit)
   - Update interactive cards

3. **Interactive Cards** (`send.ts`):
   - Rich markdown cards
   - Card updates
   - Interactive elements

4. **Typing Indicators** (`typing.ts`):
   - Show "typing..." status

5. **Tools Integration** (`docx.ts`, `wiki.ts`, `drive.ts`, `bitable.ts`, `perm.ts`):
   - Document operations
   - Wiki/knowledge base
   - Cloud storage
   - Tables/databases
   - Permission management

6. **User Directory** (`directory.ts`):
   - User lookup
   - Contact info

7. **Dynamic Agent Creation** (`dynamic-agent.ts`):
   - Auto-create agents for DM users
   - Workspace templates

---

## Critical Gaps in Generic Channel

### 1. **Media Download/Upload Pipeline (HIGHEST PRIORITY)**

The Generic channel currently only passes media URLs around but doesn't:
- Download media from URLs provided by clients
- Save media to local disk
- Provide file paths to agents
- Upload agent-generated media to any storage

**Impact:**
- Agents cannot analyze images (no vision)
- Cannot process audio files
- Cannot handle file attachments
- Media context is text-only

**Required Implementation:**
```typescript
// Need to add in src/generic/media.ts:
- downloadMediaFromUrl(url: string): Promise<Buffer>
- saveMediaToLocal(buffer: Buffer, mimeType?: string): Promise<{ path: string, contentType: string }>
- uploadMediaToStorage(buffer: Buffer, fileName: string): Promise<string>  // Optional

// Update bot.ts to:
- Download media from InboundMessage.mediaUrl
- Save to local file system
- Add MediaPath/MediaUrl/MediaType to context payload
- Enable agent vision and file processing
```

### 2. **Rich Message Type Support**

Current support is basic. Need:
- Video message handling
- Sticker/emoji support
- File attachments (not just links)
- Audio transcription support
- Multi-media messages (multiple images/files)

### 3. **Configuration Enhancements**

Need to add:
```typescript
{
  mediaMaxMb: number,              // Size limits for downloads
  groupPolicy: string,             // More control than just dmPolicy
  requireMention: boolean,         // Bot mention in groups
  groups: Record<string, GroupConfig>,  // Per-group settings
  markdown: { tableMode: string }, // Markdown rendering
  capabilities: string[],          // Feature flags
}
```

### 4. **Message Metadata**

Need to support:
- Message threading (rootId)
- Richer reply context (fetch quoted messages)
- Multiple mention targets
- Sender profile information

---

## Recommended Implementation Plan

### Phase 1: Core Media Support (CRITICAL)
1. **Create `src/generic/media.ts`:**
   ```typescript
   - downloadMediaGeneric(url: string, maxBytes: number)
   - saveMediaBuffer(buffer: Buffer, contentType?: string)
   - resolveMediaList(message: InboundMessage, maxBytes: number)
   - buildMediaPayload(mediaList: MediaInfo[])
   ```

2. **Update `bot.ts` to download and save media:**
   ```typescript
   // In handleGenericMessage():
   const mediaList = await resolveMediaList({
     message,
     maxBytes: (genericCfg.mediaMaxMb ?? 30) * 1024 * 1024
   });
   const mediaPayload = buildMediaPayload(mediaList);

   // Add to ctxPayload:
   ...mediaPayload  // MediaPath, MediaType, MediaUrl, MediaPaths, etc.
   ```

3. **Update `outbound.ts` for better media sending:**
   ```typescript
   sendMedia: async ({ mediaUrl, text }) => {
     // Send text if present
     if (text?.trim()) {
       await sendMessageGeneric({ text });
     }

     // Handle media URL
     if (mediaUrl) {
       // Check if it's a local file path
       if (isLocalPath(mediaUrl)) {
         // Read and send as media
         const buffer = fs.readFileSync(mediaUrl);
         const mimeType = await detectMime(buffer);
         const mediaType = inferMediaType(mimeType);
         await sendMediaGeneric({ buffer, mediaType, mimeType });
       } else {
         // Remote URL - send as-is for client to fetch
         await sendMediaGeneric({ mediaUrl, mediaType: 'image' });
       }
     }
   }
   ```

### Phase 2: Configuration Enhancement
1. Add to `config-schema.ts`:
   - `mediaMaxMb: number`
   - `groupPolicy: enum`
   - `requireMention: boolean`
   - `groups: Record<string, GroupConfig>`

2. Implement group-specific policies in `bot.ts`

### Phase 3: Advanced Message Support
1. **Message Threading:**
   - Fetch quoted/parent messages
   - Include in context

2. **Multiple Media:**
   - Support multiple attachments per message
   - Build MediaPaths/MediaUrls arrays

3. **Sender Profiles:**
   - Optional sender name/avatar fetching
   - Client can provide in message

### Phase 4: Additional Features (Optional)
1. Message reactions (if clients support)
2. Typing indicators
3. Message editing
4. Read receipts

---

## Code Examples

### Media Download Implementation

```typescript
// src/generic/media.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getGenericRuntime } from './runtime.js';

export type MediaInfo = {
  path: string;
  contentType?: string;
  placeholder: string;
};

export async function downloadMediaFromUrl(params: {
  url: string;
  maxBytes: number;
}): Promise<{ buffer: Buffer; contentType?: string }> {
  const { url, maxBytes } = params;

  // Fetch from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  // Check size
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxBytes) {
    throw new Error(`Media too large: ${contentLength} bytes > ${maxBytes}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > maxBytes) {
    throw new Error(`Media too large: ${buffer.length} bytes > ${maxBytes}`);
  }

  const contentType = response.headers.get('content-type') || undefined;

  return { buffer, contentType };
}

export async function resolveGenericMediaList(params: {
  message: InboundMessage;
  maxBytes: number;
}): Promise<MediaInfo[]> {
  const { message, maxBytes } = params;

  // Only process media messages
  if (!message.mediaUrl) {
    return [];
  }

  const mediaTypes = ['image', 'voice', 'audio', 'file'];
  if (!mediaTypes.includes(message.messageType)) {
    return [];
  }

  try {
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

    // Save to disk
    const saved = await core.channel.media.saveMediaBuffer(
      buffer,
      finalContentType,
      'inbound',
      maxBytes,
    );

    return [{
      path: saved.path,
      contentType: saved.contentType,
      placeholder: inferPlaceholder(message.messageType),
    }];
  } catch (err) {
    console.error(`Failed to download media: ${err}`);
    return [];
  }
}

function inferPlaceholder(messageType: string): string {
  switch (messageType) {
    case 'image': return '<media:image>';
    case 'voice': return '<media:voice>';
    case 'audio': return '<media:audio>';
    case 'file': return '<media:document>';
    default: return '<media:file>';
  }
}

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
  const mediaPaths = mediaList.map(m => m.path);
  const mediaTypes = mediaList.map(m => m.contentType).filter(Boolean) as string[];

  return {
    MediaPath: first.path,
    MediaType: first.contentType,
    MediaUrl: first.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}
```

### Updated Bot Handler

```typescript
// In src/generic/bot.ts - handleGenericMessage()

import { resolveGenericMediaList, buildMediaPayload } from './media.js';

// After parsing message...
const mediaMaxBytes = (genericCfg?.mediaMaxMb ?? 30) * 1024 * 1024;
const mediaList = await resolveGenericMediaList({
  message,
  maxBytes: mediaMaxBytes,
});
const mediaPayload = buildMediaPayload(mediaList);

// When building context payload...
const ctxPayload = core.channel.reply.finalizeInboundContext({
  Body: combinedBody,
  RawBody: ctx.content,
  CommandBody: ctx.content,
  From: genericFrom,
  To: genericTo,
  // ... other fields ...
  ...mediaPayload,  // Add MediaPath, MediaType, MediaUrl, etc.
});
```

---

## Summary

The Generic channel is well-architected but **lacks critical media handling capabilities** that Feishu has:

1. **No media download/upload** - Biggest gap
2. **No local media storage** - Prevents agent vision/analysis
3. **Limited configuration** - Less flexible than Feishu
4. **Basic message types** - No rich text, no multi-media

**Priority:**
1. ✅ Implement media download and local storage (enables agent vision)
2. ✅ Add `mediaMaxMb` configuration
3. ✅ Update message context to include MediaPath/MediaType
4. ⚠️ Consider adding group mention requirements
5. ⚠️ Consider per-group configurations

This analysis provides a clear roadmap for enhancing the Generic channel to support comprehensive chat features including text, voice, images, and files.
