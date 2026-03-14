# H5 接入摘要

当前仓库里真正可直接对接 `generic-channel` 的 H5 参考实现是:

- `examples/h5-client.html`

最重要的接入文档是:

- `examples/INTEGRATION_GUIDE.md`

## 一句话说明

你的 H5 / 聊天 App / 微信小程序，只要能:

1. 连接 `ws://host:port/ws?chatId=会话ID`
2. 发送 `type: "message.receive"` 的 JSON
3. 处理 `message.send` / `history.sync` / `thinking.*`

就能直接接入 OpenClaw 的 `generic-channel`。

## 当前协议重点

- 真实配置键是 `channels.generic-channel`
- 文本消息用 `messageType: "text"`
- 图片消息用 `messageType: "image"`
- 语音消息用 `messageType: "voice"`，推荐 `audio/webm`
- 音频文件用 `messageType: "audio"`
- 图片 / 音频 / 语音都通过 `mediaUrl` 传入
- `mediaUrl` 可以是 Data URL，也可以是插件可访问的 HTTPS URL
- 开启 `transcription.enabled` 后，`voice` / `audio` 会自动转写

## 该看哪几个文件

- `examples/h5-client.html`: 真实前端参考实现
- `examples/INTEGRATION_GUIDE.md`: H5 / App / 微信小程序接入说明
- `examples/config-examples.md`: 英文配置示例
- `examples/config-examples-zh.md`: 中文配置示例

如果你只是要接自己的业务前端，不需要再看旧的 WhatsApp 风格增强演示，直接按 `examples/INTEGRATION_GUIDE.md` 做即可。
