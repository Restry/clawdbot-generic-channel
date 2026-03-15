# 1. 当前状态

当前 `generic-channel` 已经完成从“单一 H5 直连演示”到“可真实接入、可多 agent 选择、单连接多会话”的主链路收尾。

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
- token 绑定用户身份，兼容旧的固定 `chatId` 模式
- `conversation.list.get` / `conversation.list`
- `history.get` 按指定 `chatId` 拉取历史
- 显式选中 `agentId` 时，`history.sync` / `history.get` 按 `chatId + agentId` 过滤
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
- 会话栏：打开会话 / 新建会话 / 刷新会话列表
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

- 当前最新提交：
  - `7f0999b Support multi-conversation sessions`
- 当前仓库状态：
  - 除本次 `DEV_SNAPSHOT` 同步外，无其他未提交改动
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
- token 仅绑定 `senderId` 建连
- 固定 `chatId` 旧兼容模式仍生效
- `conversation.list.get` / `conversation.list`
- `history.get`
- 单一 WebSocket 连接切换多个 `chatId`
- 固定 `chatId` 下按 `agentId` 隔离 `history.sync` / `history.get`

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
- 远端插件目录已切换为 Git 工作树：
  - `~/.openclaw/extensions/generic-channel`
  - remote: `https://github.com/Restry/clawdbot-generic-channel.git`
  - branch: `main`
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
- 2026-03-15 本轮二次联调已补确认：
  - `channel.status.get` / `channel.status`
  - `agent.list.get` / `agent.list`
  - `agent.select` / `agent.selected`
  - 连接 URL `agentId` 预选
  - 单条消息 `data.agentId` 显式覆盖
  - token 仅绑定 `senderId` 建连
  - 固定 `chatId` 旧兼容模式仍返回 403 拒绝
  - `conversation.list.get` / `conversation.list`
  - `history.get`
  - 单一 WebSocket 连接切换多个 `chatId`
- 本轮远端日志已确认：
  - 显式 `data.agentId=writer` 的消息落到 `session=agent:writer:...`
  - 同一连接上未显式覆盖、但连接级 `agentId=code` 的消息落到 `session=agent:code:...`
- 本轮远端真实会话隔离已确认：
  - 同一 token 用户在 `main` 下两个不同 `chatId` 可分别记住不同上下文，不会串会话
  - `writer` 会话只出现在 `agentId=writer` 的会话列表里，不会混入 `agentId=main`
  - 固定 `chatId` 账号 `test-full` 在显式 `agentId=main` / `agentId=writer` 下，`history.sync`、`history.get`、`conversation.list` 摘要都已按 `chatId + agentId` 隔离
- 本轮额外发现：
  - 远端 `code` agent 当前模型 `azure-foundry/gpt-5.3-codex` 能被选中并命中路由
  - 但实际回复返回 provider 400，属于远端模型/调用兼容性问题，不是 generic-channel 的 agent 路由失效

# 4. 仍需注意的边界

- `webhook` 配置字段仍在 schema 中，但不是当前主文档推荐路径，也不在当前真实 E2E 覆盖范围内
- `thinking.update` 目前仍未完成真实实现，不应误标为通过
- 很多增强能力目前是“服务端 / 协议层已实现”，不是“H5 页面 UI 全部实现”
  - 例如 reaction、forward、presence、pin、search、group 管理
- 图片理解是否真的正确，仍依赖远端当前路由到的 provider/model 具备视觉输入能力
- 远端 `code` agent 当前虽然能被正确选中，但回复链路受模型/provider 兼容性影响，不能把这个远端故障误判为 generic-channel 多 agent 协议失败

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
