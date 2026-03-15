import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

function normalizeNonEmpty(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function loadChannelsConfig() {
  const raw = process.env.RELAY_CHANNELS_JSON;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch (error) {
    console.error("[relay] failed to parse RELAY_CHANNELS_JSON:", error);
    return {};
  }
}

const host = process.env.RELAY_HOST || "0.0.0.0";
const port = Number(process.env.RELAY_PORT || 19080);
const channelsConfig = loadChannelsConfig();
const server = createServer();
const backendWss = new WebSocketServer({ noServer: true });
const clientWss = new WebSocketServer({ noServer: true });

const backends = new Map();
const clientConnections = new Map();

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseRequestUrl(requestUrl) {
  try {
    return new URL(requestUrl, "http://relay.local");
  } catch {
    return new URL("http://relay.local/");
  }
}

function closeSocket(ws, code, reason) {
  try {
    ws.close(code, reason);
  } catch {
    ws.terminate();
  }
}

function closeClientConnection(connectionId, code = 1000, reason = "closed") {
  const entry = clientConnections.get(connectionId);
  if (!entry) {
    return;
  }

  clientConnections.delete(connectionId);
  closeSocket(entry.ws, code, reason);
}

function closeBackendChannel(channelId, code = 1012, reason = "backend replaced") {
  const existing = backends.get(channelId);
  if (!existing) {
    return;
  }

  backends.delete(channelId);
  for (const [connectionId, client] of clientConnections.entries()) {
    if (client.channelId !== channelId) {
      continue;
    }
    clientConnections.delete(connectionId);
    closeSocket(client.ws, code, reason);
  }
  closeSocket(existing.ws, code, reason);
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

backendWss.on("connection", (ws) => {
  let boundChannelId;
  let helloTimeout = setTimeout(() => {
    closeSocket(ws, 1008, "missing relay.backend.hello");
  }, 5000);

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      closeSocket(ws, 1003, "invalid json");
      return;
    }

    if (!boundChannelId) {
      if (frame?.type !== "relay.backend.hello") {
        closeSocket(ws, 1008, "expected relay.backend.hello");
        return;
      }

      const channelId = normalizeNonEmpty(frame.channelId);
      const secret = normalizeNonEmpty(frame.secret);
      const channelConfig = channelId ? channelsConfig[channelId] : undefined;
      const expectedSecret = normalizeNonEmpty(channelConfig?.secret);

      if (!channelId || !expectedSecret || !secret || secret !== expectedSecret) {
        sendJson(ws, {
          type: "relay.backend.error",
          message: "backend auth failed",
          timestamp: Date.now(),
        });
        closeSocket(ws, 1008, "backend auth failed");
        return;
      }

      clearTimeout(helloTimeout);
      helloTimeout = null;
      boundChannelId = channelId;

      closeBackendChannel(channelId, 1012, "backend replaced");
      backends.set(channelId, {
        ws,
        channelId,
        instanceId: normalizeNonEmpty(frame.instanceId),
      });

      sendJson(ws, {
        type: "relay.backend.ack",
        channelId,
        timestamp: Date.now(),
      });
      console.log(`[relay] backend connected: ${channelId}`);
      return;
    }

    if (frame?.type === "relay.server.event") {
      const client = clientConnections.get(frame.connectionId);
      if (!client || client.channelId !== boundChannelId) {
        return;
      }
      sendJson(client.ws, frame.event);
      return;
    }

    if (frame?.type === "relay.server.reject") {
      const client = clientConnections.get(frame.connectionId);
      if (!client || client.channelId !== boundChannelId) {
        return;
      }
      clientConnections.delete(frame.connectionId);
      closeSocket(client.ws, frame.code || 1008, frame.message || "rejected");
      return;
    }

    if (frame?.type === "relay.server.close") {
      const client = clientConnections.get(frame.connectionId);
      if (!client || client.channelId !== boundChannelId) {
        return;
      }
      clientConnections.delete(frame.connectionId);
      closeSocket(client.ws, frame.code || 1000, frame.reason || "closed");
    }
  });

  ws.on("close", () => {
    if (helloTimeout) {
      clearTimeout(helloTimeout);
    }
    if (!boundChannelId) {
      return;
    }
    if (backends.get(boundChannelId)?.ws === ws) {
      backends.delete(boundChannelId);
    }
    for (const [connectionId, client] of clientConnections.entries()) {
      if (client.channelId !== boundChannelId) {
        continue;
      }
      clientConnections.delete(connectionId);
      closeSocket(client.ws, 1012, "backend disconnected");
    }
    console.log(`[relay] backend disconnected: ${boundChannelId}`);
  });

  ws.on("error", (error) => {
    console.error("[relay] backend socket error:", error);
  });
});

clientWss.on("connection", (ws, request) => {
  const url = parseRequestUrl(request.url || "/");
  const channelId = normalizeNonEmpty(url.searchParams.get("channelId"));
  if (!channelId) {
    closeSocket(ws, 1008, "missing channelId");
    return;
  }

  const backend = backends.get(channelId);
  if (!backend || backend.ws.readyState !== WebSocket.OPEN) {
    closeSocket(ws, 1013, "backend unavailable");
    return;
  }

  const connectionId = randomUUID();
  const query = {
    rawQuery: url.search,
    channelId,
    chatId: normalizeNonEmpty(url.searchParams.get("chatId")),
    agentId: normalizeNonEmpty(url.searchParams.get("agentId")),
    token: normalizeNonEmpty(url.searchParams.get("token")),
  };

  clientConnections.set(connectionId, {
    ws,
    channelId,
  });

  sendJson(backend.ws, {
    type: "relay.client.open",
    connectionId,
    query,
    timestamp: Date.now(),
  });

  ws.on("message", (raw) => {
    const currentBackend = backends.get(channelId);
    if (!currentBackend || currentBackend.ws.readyState !== WebSocket.OPEN) {
      closeClientConnection(connectionId, 1012, "backend unavailable");
      return;
    }

    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      closeClientConnection(connectionId, 1003, "invalid json");
      return;
    }

    sendJson(currentBackend.ws, {
      type: "relay.client.event",
      connectionId,
      event,
      timestamp: Date.now(),
    });
  });

  ws.on("close", (code, reason) => {
    clientConnections.delete(connectionId);
    const currentBackend = backends.get(channelId);
    if (!currentBackend || currentBackend.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    sendJson(currentBackend.ws, {
      type: "relay.client.close",
      connectionId,
      code,
      reason: reason.toString(),
      timestamp: Date.now(),
    });
  });

  ws.on("error", (error) => {
    console.error("[relay] client socket error:", error);
  });
});

server.on("request", (request, response) => {
  const url = parseRequestUrl(request.url || "/");

  if (url.pathname === "/healthz") {
    writeJson(response, 200, {
      ok: true,
      backendCount: backends.size,
      clientCount: clientConnections.size,
      channels: Array.from(backends.keys()),
      timestamp: Date.now(),
    });
    return;
  }

  writeJson(response, 404, {
    ok: false,
    error: "not found",
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = parseRequestUrl(request.url || "/");
  if (url.pathname === "/backend") {
    backendWss.handleUpgrade(request, socket, head, (ws) => {
      backendWss.emit("connection", ws, request);
    });
    return;
  }

  if (url.pathname === "/client") {
    clientWss.handleUpgrade(request, socket, head, (ws) => {
      clientWss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

server.listen(port, host, () => {
  console.log(`[relay] listening on ${host}:${port}`);
});
