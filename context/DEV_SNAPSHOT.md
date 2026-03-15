# 1. 当前状态

当前 `generic-channel` 已经完成从“单一 H5 直连演示”到“可真实接入、可多 agent 选择”的主链路收尾。

当前真实主路径：

- 服务端：OpenClaw `generic-channel`
- 连接方式：`websocket`
- 客户端参考实现：`examples/h5-client.html`
- 文档入口：
  - `README.md`
  - `docs/INTEGRATION_GUIDE.md`
  - `docs/CONFIG_EXAMPLES_ZH.md`
  - `docs/E2E_TEST_CASES.md`

当前重点能力：

- 文本消息、历史消息、思考状态
- 图片发送、预览、大图查看、图片内容进入 Agent 上下文
- 语音/音频发送、自动转写、接收播放
- 连接竞争保护、重连后历史回放
- 轻量频道状态查询：`channel.status.get` / `channel.status`
- 多 agent 显式选择：
  - `agent.list.get` / `agent.list`
  - `agent.select` / `agent.selected`
  - 连接 URL `agentId`
  - 单条消息 `data.agentId`

# 2. 当前代码真相

## 协议与路由

- 频道状态协议：
  - `src/generic/types.ts`
  - `src/generic/monitor.ts`
  - `src/generic/client.ts`
- 多 agent 协议：
  - `src/generic/types.ts`
  - `src/generic/agents.ts`
  - `src/generic/client.ts`
  - `src/generic/monitor.ts`
  - `src/generic/bot.ts`
- 当前入站消息路由规则：
  1. 如果连接级或消息级显式提供 `agentId`，优先走显式 agent
  2. 否则回退到 OpenClaw `bindings / default agent` 自动路由

## H5 页面

唯一保留页面：

- `examples/h5-client.html`

当前页面已实现：

- 连接 / 断开 / 自动重连
- 历史连接记录
- `history.sync`
- 图片选择、预览、发送、大图查看
- 音频文件选择、发送、播放
- 浏览器录音、发送、播放
- 多 agent 下拉选择
- 连接竞争保护，避免旧 socket 干扰当前连接

## 文档

当前应优先相信：

1. `README.md`
2. `docs/INTEGRATION_GUIDE.md`
3. `docs/CONFIG_EXAMPLES_ZH.md`
4. `docs/E2E_TEST_CASES.md`

辅助文档：

- `docs/PROACTIVE_DM.md`
- `docs/CONFIG_EXAMPLES.md`
- `docs/README.md`

# 3. 已确认完成

## 本地校验

- `npm run typecheck` 已通过
- `npm run pack:dist` 已通过
- 最新包：
  - `dist/restry-generic-channel-2.0.0.tgz`

## 已确认通过的真实能力

- `connection.open`
- `history.sync`
- 图片消息链路
- 语音 / 音频消息链路
- 图片理解链路
- gateway 重启后历史消息仍可回放
- 同一 `chatId` 多窗口同时连接
- 连接竞争保护
- `channel.status.get` / `channel.status`
- `agent.list.get` / `agent.list`
- `agent.select` / `agent.selected`

## 远端测试环境

- SSH:
  - `ssh -p 18822 restry@wolf-sg.southeastasia.cloudapp.azure.com`
- WS:
  - `ws://wolf-sg.southeastasia.cloudapp.azure.com:18080/ws`
- OpenClaw 配置：
  - `~/.openclaw/openclaw.json`
- 插件目录：
  - `~/.openclaw/extensions/generic-channel`

## 远端当前已确认状态

- 远端插件已加载成功
- `18080` 正在监听
- 远端测试机已配置 3 个 agent：
  - `main`
    - workspace: `~/.openclaw/workspace-main`
    - model: `azure-foundry/gpt-5.2`
  - `code`
    - workspace: `~/.openclaw/workspace-code`
    - model: `azure-foundry/gpt-5.3-codex`
  - `writer`
    - workspace: `~/.openclaw/workspace-writer`
    - model: `azure-foundry/Kimi-K2.5`
- 当前没有额外 `bindings`
  - 不显式选 agent 时，默认落到 `main`

# 4. 仍需注意的边界

- `webhook` 配置字段仍在 schema 中，但不是当前主文档推荐路径，也不在当前真实 E2E 覆盖范围内
- `thinking.update` 目前仍未完成真实实现，不应误标为通过
- 很多增强能力目前是“服务端 / 协议层已实现”，不是“H5 页面 UI 全部实现”
  - 例如 reaction、forward、presence、pin、search、group 管理
- 图片理解是否真的正确，仍依赖远端当前路由到的 provider/model 具备视觉输入能力

# 5. 后续同步规则

以后每次功能演进后，至少同步这几处：

1. `README.md`
2. `docs/INTEGRATION_GUIDE.md`
3. `docs/E2E_TEST_CASES.md`
4. `context/DEV_SNAPSHOT.md`

如果改到部署方式或配置方式，还要同步：

5. `docs/CONFIG_EXAMPLES_ZH.md`
6. `docs/CONFIG_EXAMPLES.md`
7. `docs/PROACTIVE_DM.md`
