# app 主工程

`app/` 是 Immersive Galgame System 的主工程。后续发布到 GitHub 时，构建产物预计为 `app/dist/igs.bundle.js` 与 `app/dist/igs.bundle.css`。

## 工程目标

- 主程序按模块开发，不把所有逻辑塞进 JS-Slash-Runner JSON。
- 所有模块都有清晰契约，方便 AI 单独修改。
- fixtures 和模拟测试优先，当前不要求安装版实机验收。
- 移动端和桌面端同等优先，避免大图包、大表格和轮询导致卡顿。

## 建议构建命令

当前可执行：

```text
npm run gate
npm run test
npm run simulate
npm run build
npm run perf
```

后续安装 pnpm 后保持等价：

```text
pnpm gate
pnpm test
pnpm simulate
pnpm build
pnpm perf
```

## 模块边界

所有模块先读对应 `CONTRACT.md` 再改代码。AI 修改时必须把新增能力放到对应模块，不允许把跨域逻辑堆进入口文件。

## 当前模块

| 模块 | 职责摘要 |
| --- | --- |
| `core` | 启动、生命周期、事件总线、全局状态。 |
| `host` | TavernHelper / SillyTavern DOM / 输入框发送 / 魔法棒入口适配。 |
| `actions` | 动作注册、权限、按钮与快捷键统一调用。 |
| `components` | 可选 UI 组件、插槽、启用状态和排序。 |
| `registry` | Mod / Preset / Pack 的能力分组导入与持久化索引。 |
| `storage` | IndexedDB、localStorage、Blob URL、缓存迁移。 |
| `data/shujuku` | shujuku 读取、表格数据模型、写表包装、刷新世界书。 |
| `scene` | 正文解析后的场景状态、说话人、情绪、背景规则。 |
| `visual` | 背景、生图、立绘、头像、环境效果、对话和选项图层渲染。 |
| `media` | 图片池、本地/URL/生成图片缓存、Blob URL 生命周期。 |
| `backgrounds` | 背景资源、URL 列表、本地背景包和背景匹配规则。 |
| `characters` | 角色立绘、头像、说话人 + 情绪匹配。 |
| `generated-images` | 生图 provider、生成队列、轮询、外部插图扩展适配。 |
| `generated-images/request-builders` | NAI、ComfyUI、GPT 图像、banana 等模型专属请求构建。 |
| `prompts` | 生图提示词预设、变量替换、prompt context 和 provider 参数映射。 |
| `prompts/adapters` | 根据 provider 类型选择 request builder。 |
| `prompts/schemas` | 不同模型提示词、参数和工作流 schema。 |
| `schemas` | 跨模块共享的 SceneState、ImportManifest、权限和公开 API 结果 schema。 |
| `choices` | Immersive Galgame System 选项解析、浮窗、选择后输入框发送。 |
| `shujuku-panel` | 内置 shujuku 表格可编辑前端。 |
| `styles` | CSS 全量编辑、UI token、用户 CSS、主题预设。 |
| `hotkeys` | 手动快捷键绑定和冲突检测。 |
| `mods` | 面向 JS 作者的二创 Mod 加载、权限和隔离。 |
| `api` | `window.IGS` / `window.ImmersiveGalgameSystem` 公开 API。 |

## 关键文件入口

```text
src/index.js
src/core/bootstrap.js
src/api/public-api.js
src/host/tavern-helper-adapter.js
src/host/input-channel.js
src/scene/text-parser.js
src/scene/scene-state.js
src/scene/scene-resolver.js
src/scene/background-rules.js
src/scene/character-rules.js
src/visual/stage-renderer.js
src/visual/visual-mode.js
src/visual/layer-controller.js
src/visual/responsive-layout.js
src/generated-images/generation-queue.js
src/generated-images/providers/nai-provider.js
src/generated-images/request-builders/nai-builder.js
src/prompts/adapters/prompt-adapter.js
```
