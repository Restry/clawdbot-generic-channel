# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Generic WebSocket/Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw). It enables OpenClaw to send/receive messages through WebSocket or Webhook connections, allowing H5 pages to connect directly without depending on third-party platforms.

## Development

This is a TypeScript ESM project. No build step is required - the plugin is loaded directly as `.ts` files by OpenClaw.

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit
```

## Architecture

### Entry Point
- `index.ts` - Plugin registration, exports public API

### Core Modules (src/generic/)

**Configuration:**
- `config-schema.ts` - Zod schemas for channel config
- `types.ts` - TypeScript type definitions
- `runtime.ts` - Runtime state management

**Connection & Events:**
- `client.ts` - WebSocket server and client manager
- `monitor.ts` - WebSocket/Webhook event listener, dispatches incoming messages
- `bot.ts` - Message event handler, parses content, dispatches to agent
- `media.ts` - Media download, processing, and payload building

**Outbound:**
- `send.ts` - Text message sending
- `outbound.ts` - `ChannelOutboundAdapter` implementation
- `reply-dispatcher.ts` - Streaming reply handling

**Utilities:**
- `probe.ts` - Channel health check

### Message Flow

1. `monitor.ts` starts WebSocket server, registers event handlers
2. On `message.receive`, `bot.ts` parses the event
3. `bot.ts` detects slash commands (messages starting with `/`)
4. If message contains media URL, `media.ts` downloads and saves it locally
5. Message (with media file paths and command status) is dispatched to OpenClaw agent via `reply-dispatcher.ts`
6. Agent responses flow through `outbound.ts` → `send.ts`

### Slash Command Support

The Generic Channel supports OpenClaw slash commands. Messages starting with `/` are automatically detected and flagged as commands:

- **Detection**: `bot.ts` checks if message content starts with `/`
- **CommandBody**: Set to the trimmed message content
- **CommandAuthorized**: Set to `true` for slash commands, `false` otherwise

Examples:
- `/help` - Will be processed as a slash command
- `/status` - Will be processed as a slash command
- `hello world` - Will be processed as a regular message

### Key Configuration Options

| Option | Description |
|--------|-------------|
| `connectionMode` | `websocket` (default) or `webhook` |
| `wsPort` | WebSocket server port (default: 8080) |
| `wsPath` | WebSocket endpoint path (default: "/ws") |
| `dmPolicy` | `pairing` / `open` / `allowlist` |
| `historyLimit` | Number of history messages for group chats |
| `textChunkLimit` | Maximum characters per message chunk |
| `mediaMaxMb` | Maximum media file size in MB (default: 30) |
