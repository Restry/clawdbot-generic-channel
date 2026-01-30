import type { GenericChannelConfig, GenericProbeResult } from "./types.js";
import { getGenericWSManager } from "./client.js";

export async function probeGeneric(cfg?: GenericChannelConfig): Promise<GenericProbeResult> {
  if (!cfg) {
    return {
      ok: false,
      error: "Generic channel not configured",
    };
  }

  if (!cfg.enabled) {
    return {
      ok: false,
      error: "Generic channel not enabled",
    };
  }

  const mode = cfg.connectionMode ?? "websocket";

  if (mode === "websocket") {
    const wsManager = getGenericWSManager();
    const port = cfg.wsPort ?? 8080;

    return {
      ok: true,
      mode,
      port,
    };
  } else {
    const port = cfg.webhookPort ?? 3000;
    return {
      ok: true,
      mode,
      port,
    };
  }
}
