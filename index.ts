import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { genericPlugin } from "./src/generic/channel.js";
import { setGenericRuntime } from "./src/generic/runtime.js";

// Generic channel exports
export { monitorGenericProvider } from "./src/generic/monitor.js";
export { sendMessageGeneric } from "./src/generic/send.js";
export { probeGeneric } from "./src/generic/probe.js";
export { genericPlugin } from "./src/generic/channel.js";

const plugin = {
  id: "generic-channel",
  name: "Generic Channel",
  description: "Generic WebSocket/Webhook channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setGenericRuntime(api.runtime);
    api.registerChannel({ plugin: genericPlugin });
  },
};

export default plugin;
