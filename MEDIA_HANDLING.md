# Generic Channel Media Handling

This document describes the media handling capabilities of the Generic WebSocket/Webhook channel.

## Overview

The Generic channel now supports full media handling for images, voice messages, audio files, and documents. When clients send media URLs, the channel automatically downloads, processes, and provides the media files to agents for analysis.

## Features

### Supported Media Types

- **Images** (`image`) - JPEG, PNG, GIF, WebP, etc.
- **Voice Messages** (`voice`) - Short audio recordings
- **Audio Files** (`audio`) - Music, podcasts, longer audio
- **Files** (`file`) - Documents, PDFs, etc.

### Automatic Processing

1. **Download** - Media is fetched from client-provided URLs
2. **Validation** - Size limits enforced (configurable)
3. **Type Detection** - MIME type auto-detection with fallback
4. **Local Storage** - Files saved to disk for agent access
5. **Context Integration** - File paths included in agent context

## Configuration

### mediaMaxMb

Maximum size for downloaded media files in megabytes.

**Default:** 30 MB

**Example:**
```yaml
channels:
  generic-channel:
    enabled: true
    mediaMaxMb: 50  # Allow up to 50MB files
```

## Message Format

### Inbound Messages (Client → Server)

```typescript
{
  messageId: "msg-123",
  chatId: "chat-abc",
  chatType: "direct",  // or "group"
  senderId: "user-456",
  senderName: "John Doe",
  messageType: "image",  // or "voice", "audio", "file", "text"
  content: "Check out this photo!",
  mediaUrl: "https://example.com/photo.jpg",
  mimeType: "image/jpeg",  // optional, auto-detected if missing
  timestamp: 1234567890123
}
```

### Media Context for Agents

When media is successfully downloaded, the agent receives:

```typescript
{
  // ... other context fields ...
  MediaPath: "/path/to/downloaded/file.jpg",
  MediaType: "image/jpeg",
  MediaUrl: "/path/to/downloaded/file.jpg",  // Same as MediaPath
  MediaPaths: ["/path/to/file.jpg"],  // Array for multi-media (future)
  MediaUrls: ["/path/to/file.jpg"],
  MediaTypes: ["image/jpeg"]
}
```

**Agent Vision:** When `MediaPath` is provided and the media is an image, Claude agents with vision capabilities can analyze the image.

## Implementation Details

### Media Download Flow

1. Client sends message with `mediaUrl`
2. `bot.ts` detects media message type
3. `media.ts` downloads from URL with size validation
4. MIME type detected if not provided
5. File saved using `core.channel.media.saveMediaBuffer()`
6. File path added to agent context payload
7. Agent receives message with media context

### Error Handling

- **Size Limit Exceeded:** Download aborted, error logged, URL passed as text fallback
- **Network Error:** Download fails, error logged, URL passed as text fallback
- **Invalid URL:** Download skipped, media URL included in message text
- **Unsupported Type:** File still downloaded, type detection attempted

### Fallback Behavior

If media download fails for any reason:
- The media URL is included in the message body text
- The agent receives the URL but not a local file path
- The conversation continues without interruption

## Examples

### Example 1: Image Message

**Client sends:**
```json
{
  "messageId": "msg-001",
  "chatId": "user-123",
  "chatType": "direct",
  "senderId": "user-123",
  "senderName": "Alice",
  "messageType": "image",
  "content": "What's in this picture?",
  "mediaUrl": "https://example.com/image.jpg",
  "timestamp": 1234567890123
}
```

**Agent receives:**
```
Alice: [🖼️ Image] What's in this picture?
```

**Plus context:**
```typescript
{
  MediaPath: "/tmp/openclaw/media/inbound/image_abc123.jpg",
  MediaType: "image/jpeg",
  // ... agent can analyze the image
}
```

### Example 2: Voice Message

**Client sends:**
```json
{
  "messageId": "msg-002",
  "chatId": "group-xyz",
  "chatType": "group",
  "senderId": "user-456",
  "senderName": "Bob",
  "messageType": "voice",
  "content": "",
  "mediaUrl": "https://example.com/voice.ogg",
  "mimeType": "audio/ogg",
  "timestamp": 1234567890456
}
```

**Agent receives:**
```
Bob: [🎤 Voice] (no caption)
```

**Plus context:**
```typescript
{
  MediaPath: "/tmp/openclaw/media/inbound/audio_def456.ogg",
  MediaType: "audio/ogg",
  // ... agent can transcribe or analyze audio
}
```

### Example 3: File Attachment

**Client sends:**
```json
{
  "messageId": "msg-003",
  "chatId": "user-789",
  "chatType": "direct",
  "senderId": "user-789",
  "messageType": "file",
  "content": "Review this document",
  "mediaUrl": "https://example.com/report.pdf",
  "mimeType": "application/pdf",
  "timestamp": 1234567890789
}
```

**Agent receives:**
```
user-789: Review this document
```

**Plus context:**
```typescript
{
  MediaPath: "/tmp/openclaw/media/inbound/document_ghi789.pdf",
  MediaType: "application/pdf",
  // ... agent can extract and analyze PDF content
}
```

## Media Sending

Currently, the Generic channel supports sending media via URL references. The client is responsible for:

1. Hosting media files (if needed)
2. Providing accessible URLs in outbound messages
3. Rendering media in the UI

**Future Enhancement:** Direct media upload from agent-generated files could be added if needed.

## Best Practices

### For Client Developers

1. **Provide MIME Types:** Include `mimeType` when known to avoid detection overhead
2. **Use HTTPS:** Ensure media URLs use secure connections
3. **Size Limits:** Keep media under the configured size limit (default 30MB)
4. **Temporary URLs:** Consider using signed URLs with expiration for security
5. **Error Handling:** Handle cases where media may not be available

### For Bot Administrators

1. **Configure Size Limits:** Set `mediaMaxMb` appropriate for your use case
2. **Monitor Storage:** Media files accumulate, consider cleanup policies
3. **Network Access:** Ensure the server can access client media URLs
4. **Vision Models:** Use Claude models with vision for image analysis

## Troubleshooting

### Media Not Being Downloaded

Check logs for:
```
generic: downloading media from <url>
generic: detected content type: <type>, size: <bytes>
generic: saved media to <path>
```

If missing, possible causes:
- `mediaUrl` not provided in message
- `messageType` is `text` (media only processed for image/voice/audio/file)
- Download failed (network, size limit, etc.)

### Agent Not Analyzing Images

Verify:
- Agent model has vision capabilities (Claude 3+)
- `MediaPath` is present in context (check logs)
- Image file format is supported (JPEG, PNG, GIF, WebP)

### Size Limit Errors

```
generic: failed to download media: Media too large: X bytes exceeds limit of Y bytes
```

Solution:
- Increase `mediaMaxMb` in config
- Or ask client to provide smaller media files

## API Reference

### Media Functions

#### `downloadMediaFromUrl()`

Downloads media from a URL with size validation.

```typescript
import { downloadMediaFromUrl } from '@restry/generic-channel';

const { buffer, contentType } = await downloadMediaFromUrl({
  url: 'https://example.com/image.jpg',
  maxBytes: 30 * 1024 * 1024  // 30MB
});
```

#### `resolveGenericMediaList()`

Process media from an inbound message.

```typescript
import { resolveGenericMediaList } from '@restry/generic-channel';

const mediaList = await resolveGenericMediaList({
  message: inboundMessage,
  maxBytes: 30 * 1024 * 1024,
  log: (msg) => console.log(msg)
});
```

#### `buildMediaPayload()`

Build media context for agent dispatch.

```typescript
import { buildMediaPayload } from '@restry/generic-channel';

const mediaPayload = buildMediaPayload(mediaList);
// Returns: { MediaPath, MediaType, MediaUrl, MediaPaths, MediaUrls, MediaTypes }
```

#### `inferMediaTypeFromMime()`

Infer media category from MIME type.

```typescript
import { inferMediaTypeFromMime } from '@restry/generic-channel';

const type = inferMediaTypeFromMime('image/jpeg');  // Returns: "image"
const type = inferMediaTypeFromMime('audio/mpeg');  // Returns: "audio"
```

## Architecture

### Media Module (`src/generic/media.ts`)

Core functions for media handling:
- URL download with validation
- Media list resolution
- Payload building for context
- Type inference utilities

### Bot Handler (`src/generic/bot.ts`)

Integration point:
- Calls `resolveGenericMediaList()` for media messages
- Adds `mediaPayload` to context
- Provides fallback behavior on errors

### Configuration (`src/generic/config-schema.ts`)

Schema definition:
- `mediaMaxMb: number` - Size limit configuration

## Comparison with Feishu Channel

The Generic channel's media handling is inspired by the Feishu channel implementation but simplified:

| Feature | Generic Channel | Feishu Channel |
|---------|----------------|----------------|
| Media Download | ✅ URL-based | ✅ API key-based |
| Local Storage | ✅ Yes | ✅ Yes |
| Agent Context | ✅ MediaPath/Type | ✅ MediaPath/Type |
| Media Upload | ❌ Not yet | ✅ Yes |
| Rich Text | ❌ No | ✅ Post format |
| Multi-Media | ⚠️ Single per msg | ✅ Multiple |
| Video | ⚠️ Basic | ✅ Full support |

## Future Enhancements

Potential improvements:

1. **Multi-Media Messages:** Support multiple attachments per message
2. **Media Upload:** Upload agent-generated media to storage
3. **Video Support:** Enhanced video handling with thumbnails
4. **Rich Text:** Support for formatted messages with embedded media
5. **Streaming:** Stream large files instead of full download
6. **Caching:** Cache frequently accessed media
7. **Transcription:** Built-in audio transcription

## Summary

The Generic channel now provides comprehensive media handling that:

- ✅ Enables agent vision and analysis capabilities
- ✅ Supports images, voice, audio, and files
- ✅ Automatically downloads and processes media
- ✅ Provides local file paths to agents
- ✅ Includes size limits and error handling
- ✅ Maintains backward compatibility

This brings the Generic channel's media capabilities in line with platform-specific channels like Feishu, while maintaining its flexibility and simplicity.
