# 设置器「生图与AI」拆分计划（11-10，仅本地，不推送）

## 目标

「生图与AI」一个分类拆成三个，侧栏新增「格式处理」组。**只动界面归属，存储路径一律不改、不迁移数据。**

## 新结构

| 侧栏组 | 分类 id | 分类名 | 子页 id | 子页名 | 内容来源 |
|---|---|---|---|---|---|
| 素材与生图 | `ai`（沿用） | API配置 | `source` | 生图API | 原「图像来源」页，去掉全局画师、外部 DNA、提示词组入口卡 |
| | | | `llm` | 备用模型 | 原「备用模型」页，只留连接卡（来源/上下文/地址/密钥/模型/模型预设/请求参数）+ 附加词 |
| 格式处理 | `prompt`（新） | 模型与提示词 | `kinds` | 画师与模型 | 原样 |
| | | | `img-prompt`（新） | 生图提示词 | 从备用模型页搬来：生图提示词组面板、世界书筛选；从图像来源页搬来：全局画师、外部生图前补齐 DNA |
| | `textfmt`（新） | 正文格式 | `rules` | 写法规则 | 原样 |
| | | | `parse` | 正文解析 | 原样 |

侧栏组键（`SETTINGS_NAV_GROUPS`，键为组内第一个分类 id）：`style: '阅读体验', chars: '素材与生图', prompt: '格式处理', stats: '玩法与数据'`。
分类顺序：… chars, scenes, ai, prompt, textfmt, stats …

`CATEGORY_DEFAULT_PAGE`：`ai: 'source', prompt: 'kinds', textfmt: 'rules'`。

## 出图参数位置（不单独成块）

立绘透明底（NAI/dbgen）、一致性重绘强度与模型、自动抠图与抠图底色：**留在「生图API」页各自来源区里，位置不动**。抠图两项仍走暗号隐藏（`isMatteUnlocked`），不要改。

## 搬家细节

1. `settings-tabs.js`
   - `IMAGE_SOURCE_TEMPLATE`：删 `{{globalArtistField}}`、`external-sprite-dna` 那个 sub 块、「提示词组」入口卡（`data-image-prompt-entry`）。
   - `IMAGE_LLM_TEMPLATE`：删 `{{imagePromptPanel}}`、`{{worldInfoFilterPanel}}`；附加词留下。
   - 新增 `IMAGE_PROMPT_TEMPLATE`（`data-image-pane="img-prompt"`）：依次放全局画师、外部 DNA（保留 `data-image-feature="external-sprite-dna"` 与 `{{sourceExternalHidden}}`）、`{{imagePromptPanel}}`、`{{worldInfoFilterPanel}}`。顶部放一行 `igs-source-filter-note` 说明写词走哪条连接（复用现有 `autoLlmWarn`/`autoLlmWarnHidden` 即可，不新写逻辑）。
   - 生图提示词组只在 NAI 来源显示的条件保持不变；非 NAI 时该页仍有全局画师/DNA/世界书筛选，不会空页。
   - 页表映射（约 648 行）加 `'img-prompt': IMAGE_PROMPT_TEMPLATE`。
2. `settings-pages.js`：分类表、页表、组表、默认页按上表改；`LEGACY_IMAGE_PAGES` 不变（`llm` 仍指 `llm`）。
3. `settings-host-render.js`：新页面要拿到原来那些占位符的值（它们现在在 source/llm 页的渲染分支里算，挪到能被新页用到的地方，不重复计算）。随身系统页「备用模型预设」说明文案里的「『备用模型』页」保持可用（页名没变）。
4. 跳转与文案（逐条改，别漏）：
   - `settings-search.js`：`image-prompt-presets`、`world-info-filter`、`creature-prompt-rule` → `page: 'img-prompt'`；`external-sprite-dna` → `img-prompt`；全局画师若有条目也改；`backup-model` 别名去掉「规划模型」以外不动。
   - `prompt-kit.js` 129 行「打开提示词组」→ `page: 'img-prompt'`, actionLabel「打开生图提示词」；125 行保持 `llm`。
   - `data-setting-go="image-prompt-presets"` 若被别处引用，指到新页。
   - 文案「生图与AI › 图像来源」→「API配置 › 生图API」；「生图与AI › 备用模型」→「API配置 › 备用模型」；「生图与AI › 画师与模型」→「模型与提示词 › 画师与模型」；「生图与AI › 写法规则」（注释）→「正文格式 › 写法规则」。涉及：`caption-writer.js`、`image-backend.js`、`reader-host.js`、`fx-settings-fields.js`、`settings-prompt-kinds.js`（「写词规则在『备用模型』页」→「在『生图提示词』页」）。用 grep `生图与AI` 与 `「备用模型」页` 全量核对。
   - `reader-host-constants.js` 约 314 行 `label: '生图与AI'`：看清用途后对应改名（若是分类标签，拆成三项或按 `ai` 改为「API配置」）。
   - 仪表盘按分类出状态（`settings-host-render.js` 约 1197 行）：新分类若无状态源，空着即可。
   - 新手引导 `onboarding-guide-steps.js` 用的是 `source` 页和 `[data-image-pane="source"]`，页 id 没变，确认 selector 仍能命中即可。
5. 中英文之间不加空格（「生图API」「API配置」）；不写内联 style，复用现有 class。

## 不做

- 不改任何存储路径、设置默认值、业务逻辑。
- 不新增「用途」页；随身系统路由留原处。
- 不碰与本计划无关的文件；工作区里别的未提交改动不要动、不要还原。

## 验收

- 侧栏出现四组，「格式处理」组含模型与提示词、正文格式两个分类。
- 每个原有字段都还在且只出现一次；设置搜索点「提示词组」「世界书筛选」「外部生图前补齐角色 DNA」能跳到「生图提示词」页并展开。
- 写词失败弹窗两个按钮分别打开备用模型页、生图提示词页。
- 旧页面 id（`llm`/`source`/`kinds`/`rules`/`parse`）都还能打开。
- 只跑与 settings-pages / settings-search / settings-tabs 相关的测试；改到的测试断言同步更新。`npm run build` 通过。
