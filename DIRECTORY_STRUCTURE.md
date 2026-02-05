# 项目目录结构 (Project Directory Structure)

## 📁 整体结构

```
clawdbot-generic-channel/
├── index.ts                    # 插件入口文件
├── package.json                # 项目配置和依赖
├── tsconfig.json               # TypeScript 配置
├── openclaw.plugin.json        # OpenClaw 插件配置
│
├── src/                        # 源代码目录
│   └── generic/                # Generic Channel 核心代码
│       ├── types.ts            # 类型定义
│       ├── config-schema.ts    # 配置 Schema
│       ├── runtime.ts          # 运行时管理
│       ├── channel.ts          # 频道定义
│       ├── monitor.ts          # 消息监听器
│       ├── client.ts           # WebSocket 客户端管理
│       ├── bot.ts              # 消息处理器
│       ├── media.ts            # 媒体文件处理
│       ├── send.ts             # 消息发送
│       ├── outbound.ts         # 出站适配器
│       ├── reply-dispatcher.ts # 回复分发器
│       └── probe.ts            # 健康检查
│
├── public/                     # 前端资源目录（新）
│   ├── h5-chat.html            # 增强版 H5 聊天界面
│   ├── README.md               # 前端文档
│   ├── css/                    # CSS 样式文件（预留）
│   ├── js/                     # JavaScript 文件（预留）
│   └── assets/                 # 静态资源（预留）
│
├── examples/                   # 示例文件
│   ├── h5-client.html          # 原始 H5 客户端
│   ├── config-examples.md      # 配置示例（英文）
│   ├── config-examples-zh.md   # 配置示例（中文）
│   └── H5_CLIENT_ENHANCEMENTS.md # H5 客户端增强说明
│
└── docs/                       # 文档目录
    ├── README.md               # 主文档
    ├── CLAUDE.md               # Claude Code 指南
    ├── GENERIC_CHANNEL.md      # Generic Channel 文档
    ├── MEDIA_HANDLING.md       # 媒体处理文档
    ├── ANALYSIS.md             # 代码分析
    └── 实现总结.md             # 实现总结（中文）
```

## 📂 目录说明

### `/src/generic/` - 核心代码

这是 Generic Channel 的核心实现目录，包含所有服务器端逻辑。

| 文件 | 功能 | 说明 |
|------|------|------|
| `types.ts` | 类型定义 | 定义所有 TypeScript 类型和接口 |
| `config-schema.ts` | 配置 Schema | Zod schema 用于配置验证 |
| `runtime.ts` | 运行时管理 | 管理运行时状态和 API |
| `channel.ts` | 频道定义 | 频道注册和初始化 |
| `monitor.ts` | 消息监听 | WebSocket/Webhook 事件监听 |
| `client.ts` | 客户端管理 | WebSocket 服务器和连接管理 |
| `bot.ts` | 消息处理 | 解析和处理入站消息 |
| `media.ts` | 媒体处理 | 下载、处理媒体文件 |
| `send.ts` | 消息发送 | 发送文本和媒体消息 |
| `outbound.ts` | 出站适配器 | 实现 ChannelOutboundAdapter |
| `reply-dispatcher.ts` | 回复分发 | 处理流式回复 |
| `probe.ts` | 健康检查 | 频道健康状态检测 |

### `/public/` - 前端资源（新增）

全新的前端资源目录，包含现代化的 H5 聊天界面。

| 文件/目录 | 功能 | 说明 |
|-----------|------|------|
| `h5-chat.html` | 增强版聊天界面 | 支持 Markdown、深色模式、群聊 |
| `README.md` | 前端文档 | 详细的前端使用说明 |
| `css/` | 样式文件 | 预留目录，未来可分离 CSS |
| `js/` | JavaScript | 预留目录，未来可分离 JS |
| `assets/` | 静态资源 | 图片、图标等 |

**特点：**
- ✅ 完整的 Markdown 支持
- ✅ 代码语法高亮
- ✅ 深色模式
- ✅ 群组聊天
- ✅ 响应式设计
- ✅ 现代化 UI

### `/examples/` - 示例文件

包含各种示例和配置模板。

| 文件 | 说明 |
|------|------|
| `h5-client.html` | 原始版本的 H5 客户端（向后兼容） |
| `config-examples.md` | 英文配置示例 |
| `config-examples-zh.md` | 中文配置示例 |
| `H5_CLIENT_ENHANCEMENTS.md` | H5 客户端增强功能说明 |

### 根目录文件

| 文件 | 说明 |
|------|------|
| `index.ts` | 插件主入口，注册频道 |
| `package.json` | NPM 包配置，依赖管理 |
| `tsconfig.json` | TypeScript 编译配置 |
| `openclaw.plugin.json` | OpenClaw 插件元数据 |
| `README.md` | 项目主文档 |
| `CLAUDE.md` | Claude Code 开发指南 |
| `LICENSE` | MIT 许可证 |

## 🔄 消息流程

```
H5 Client (public/h5-chat.html)
    ↓ WebSocket
monitor.ts (监听)
    ↓
client.ts (连接管理)
    ↓
bot.ts (解析消息)
    ↓
media.ts (处理媒体)
    ↓
reply-dispatcher.ts (分发给 Agent)
    ↓ Agent 处理
outbound.ts (出站适配)
    ↓
send.ts (发送响应)
    ↓ WebSocket
H5 Client (显示消息)
```

## 📦 构建和部署

### 开发模式

```bash
# 安装依赖
npm install

# 类型检查
npx tsc --noEmit
```

### 生产部署

无需构建步骤，直接作为 ESM 模块加载。

```bash
# 通过 OpenClaw 安装
openclaw plugins install @restry/generic-channel

# 或通过 NPM
npm install @restry/generic-channel
```

## 🎯 未来规划

### 短期目标
- [ ] 将 CSS 分离到 `public/css/` 目录
- [ ] 将 JavaScript 分离到 `public/js/` 目录
- [ ] 添加单元测试到 `tests/` 目录
- [ ] 创建更多配置示例

### 长期目标
- [ ] 添加 Webhook 客户端示例
- [ ] 创建 TypeScript SDK
- [ ] 提供更多语言的 SDK（Python、Go 等）
- [ ] 添加 E2E 测试

## 📝 代码组织原则

1. **单一职责**：每个文件专注于一个功能领域
2. **清晰命名**：文件名清楚表明其用途
3. **模块化**：易于理解和维护
4. **类型安全**：充分利用 TypeScript
5. **文档完善**：每个模块都有清晰的文档

## 🔧 维护指南

### 添加新功能
1. 确定功能属于哪个模块
2. 在相应的 `.ts` 文件中添加代码
3. 更新 `types.ts` 中的类型定义
4. 更新相关文档

### 修改前端
1. 编辑 `public/h5-chat.html` 或创建新文件
2. 考虑是否需要分离 CSS/JS
3. 更新 `public/README.md`
4. 测试响应式设计

### 更新文档
1. 主文档：`README.md`
2. API 文档：`GENERIC_CHANNEL.md`
3. 前端文档：`public/README.md`
4. 开发指南：`CLAUDE.md`
