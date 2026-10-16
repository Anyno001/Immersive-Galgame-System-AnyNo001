# presets 模块契约

## 职责

- 管理可导入、导出、存储、切换的预设。
- 给各能力页提供统一预设列表模型。
- 通过 runtime `PresetRegistry` 维护 `register/list/get/setCurrent/getCurrent/export` 一致行为，并把当前启用项持久化到 preset store。

## 预设类型

- `theme-preset`
- `css-preset`
- `scene-regex-preset`
- `text-filter-preset`
- `text-format-preset`
- `prompt-preset`
- `image-provider-preset`
- `image-request-builder-preset`
- `workflow-preset`
- `background-rule-preset`
- `choice-parser-preset`
- `visual-mode-preset`

## 运行时要求

- `scene-regex-preset`、`text-filter-preset`、`text-format-preset` 需要走 type-specific validator。
- `prompt-preset` 的 `data.usage: imagegen` 由 `prompt-preset.js` 分别校验存档结构与运行激活。共享提示块保留 role/order；任务模块通过显式 taskMap 引用，任务／资料槽使用稳定 identifier。
- `prompt-preset-renderer.js` 是预览与发送共用的纯装配入口：先校验激活，以 taskMap 选择具体任务模块，再以 `outputs.format` 选择该块的 `contentByFormat` 并接在 `content` 后。声明格式映射的块遇到缺失或未映射格式时返回 `unsupported-prompt-format`，不回退其他任务；没有映射的旧自定义块继续使用原正文。任务／资料槽按稳定 ID 在声明位置替换；资料仅取模块 dataFields，缺 requiredFields 拒绝；注入资料中的占位符不递归求值，不压平角色或追加另一套框架。
- `contextMode: 'provided'` 进一步限制为 `PROVIDED_PROMPT_DATA_FIELDS`：description、promptTask、characterContext、userPrompts、writingRequirements、originalPrompt、layout、outputs。复制前筛选，不触发禁止资料的 getter；自定义模块将禁止字段设为必需时明确返回缺资料错误，不回退正文、历史或外部资料。未知模式返回 `PROMPT_CONTEXT_MODE`；缺省模式保留旧调用行为。
- `{{世界书}}` 是可声明的动态参考变量，仅替换预设正文中的一次占位，不递归求值任务资料或参考文本。纯渲染使用显式 `worldInfo`，实际发送由 `createImagePromptLlm` 异步解析宿主参考；关闭块／顺序项不扫描，`provided` 整块省略且不读取世界书 getter。预览不调用宿主。默认 v21 首次新增 `igs-image-world` 时在已知基线下补块及变量、备份并保留原有相对顺序和配置；v23 将该块置于本轮任务资料 `igs-image-data` 之前。以后不恢复用户删除的块，独立自定义 current 不自动补块。

- 固定框架与任务槽在 IGS 内置写词路径使用；选择可选 DBG 时沿插件自己的当前预设，不同步或改写它的预设、凭据与配置。导入不自动激活，不隐式执行召回；未映射执行字段不能靠静默丢弃变成可运行预设。
- `ensureImagePromptDefault` 在无 current 时以单快照初始化内置预设，已有自定义 current 不覆盖。默认基线与备份保存在同一预设的 defaultState；升级仅在块的 `content` 与 `contentByFormat` 都和已知基线精确相等时，按 ID 整体迁移两项，手改任一项均保留整块，并保留角色、开关及自定义顺序。仅当块 ID 顺序与已知旧基线完全一致且新版仍声明全部存量顺序项时，按新版重排并复用原顺序项，保留其开关和配置；手调顺序、增删块或移出顺序的项不强制重排。`upgradeImagePromptDefault`、`restoreImagePromptBlock` 校验 revision，恢复显式选择块 ID 和备份 revision，正文及格式映射一并恢复。映射只能包含允许格式和非空正文，沿用宏校验，禁止在映射内引入任务／资料槽；编辑器以 JSON 编辑映射，留空移除，非法原文仅留在草稿。写失败保持磁盘与内存原状态，来源不明不猜测升级。
- 提示词导入走 `previewPromptImport` → `commitPromptImport`：旧 `prompts/prompt_order` 保真存档，召回项只报告；重复 JSON 字段拒收，未知宏／未映射槽阻止激活。预览不写存储，导入不自动激活或生成图片。
- 同 ID 替换必须显式选择 replace 并核对预览 revision；`savePromptPreset` 需要 expectedRevision。当前生图项不能被通用 register 或不可激活的数据绕过校验覆盖。
- `savePromptDraft/getPromptDraft/removePromptDraft` 共用注册表 drafts，草稿版本与来源版本分离；草稿允许未完成编辑，刷新恢复但不参与运行。
- 提示词批量导入一次提交整个快照，持久化成功后才替换内存。读失败阻止写入，写失败保持原 current/items/drafts；提交前核对存储版本只提供本地乐观冲突检测，不承诺跨标签页事务。通用 importBundle 仍为逐项提交。
- 文本预设导入失败时，可以进入 rejected 结果，但不能覆盖已生效的 current。
- 导出单项时保持 `igs_preset_v1`，导出整组时保持 `igs-import-bundle`。
- 后续能力页 UI 必须复用同一份注册表数据，不能自行拼第二套下拉列表。
- 生图 UI 使用 `activateImagePromptPreset(id, expectedRevision)` 明确激活保存版本；`removeImagePromptPreset` 同时核对保存及草稿 revision，禁止删除 current，须先显式切换。`savePromptPreset` 提供 `expectedDraftRevision` 时，在同一快照保存版本并清理对应草稿；未提供时保持旧调用行为。草稿可附 `editorFields` 保存尚未解析成功的 JSON 原文，不进入运行消息或保存版本。


## 禁止

- 不把 Mod 当作 Preset。
- 不把背景/立绘资源包当作 Preset。
- 不提供快捷键预设导入导出。
