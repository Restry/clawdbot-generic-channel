import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { feishuPlugin } from "./src/channel.js";
import { setFeishuRuntime } from "./src/runtime.js";
import { genericPlugin } from "./src/generic/channel.js";
import { setGenericRuntime } from "./src/generic/runtime.js";

// Feishu exports
export { monitorFeishuProvider } from "./src/monitor.js";
export {
  sendMessageFeishu,
  sendCardFeishu,
  updateCardFeishu,
  editMessageFeishu,
  getMessageFeishu,
} from "./src/send.js";
export {
  uploadImageFeishu,
  uploadFileFeishu,
  sendImageFeishu,
  sendFileFeishu,
  sendMediaFeishu,
} from "./src/media.js";
export { probeFeishu } from "./src/probe.js";
export {
  addReactionFeishu,
  removeReactionFeishu,
  listReactionsFeishu,
  FeishuEmoji,
} from "./src/reactions.js";
export { feishuPlugin } from "./src/channel.js";

// Generic channel exports
export { monitorGenericProvider } from "./src/generic/monitor.js";
export { sendMessageGeneric } from "./src/generic/send.js";
export { probeGeneric } from "./src/generic/probe.js";
export { genericPlugin } from "./src/generic/channel.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin with Generic channel support",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setFeishuRuntime(api.runtime);
    setGenericRuntime(api.runtime);
    api.registerChannel({ plugin: feishuPlugin });
    api.registerChannel({ plugin: genericPlugin });
  },
};

export default plugin;
