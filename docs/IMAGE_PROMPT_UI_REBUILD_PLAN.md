# 生图提示词组 UI 重建计划（2026-10-27）

> 本地计划，不推云端。

## 目标

让人只面对中文提示词正文去改表达，不和格式打交道。能用中文的地方一律中文（JSON、TAG 这类专有名词除外）。

## 硬约束（不可违反）

1. **发送内容逐字不变**：不改 `presets/prompt-preset-renderer.js`、`presets/prompt-preset.js` 的校验/装配语义，不改 `generated-images/prompt-tasks/*`、`image-prompt-defaults.js` 的提示词内容，不改存储格式（`data` 对象结构、字段名）。
2. **往返不变**：用新界面打开任一预设、不做修改，数据必须与原来深相等；被隐藏的字段（`metadata`、`variables`、`literalVariables`、`workbenchOnly`、`injection_*`、`kind`、未知字段）原样保留。
3. `{{变量}}` 在正文中原样显示、原样保存，不做替换。
4. 正文里的 `slotid:`、`outfit_name:`、英文 TAG 示例属于提示词内容，不动。
5. 不新增深拷贝；不在输入/失焦时整页重绘（见「性能」）。
6. 样式不内联、不写死数值，复用现有 class 与主题变量（参照「角色」「情绪」页的行菜单、`igs-settings-field`、`igs-row-menu`）。设置器文案书面化、简短。

## 中文名对照

任务（`IMAGE_PROMPT_TASKS`）：

| 内部名 | 显示名 |
|---|---|
| sprite | 默认立绘 |
| dna | 外貌资料 |
| expression | 表情差分 |
| avatar | Q 版头像 |
| wardrobe | 衣柜服装 |
| outfit | 换装差分 |
| background | 背景 |
| item | 物品图标 |
| cg | 剧情 CG |
| consistency | CG 局部重绘 |
| creature | 非人角色立绘 |

输出格式（`contentByFormat` 的键）：

| 内部名 | 显示名 |
|---|---|
| sprite-data | 建档资料 |
| expression-fragments | 表情片段 |
| dna-template | 模板画面 |
| caption-slots | 直出画面词 |
| asset-plan | 素材规划 |
| cg-plan | CG 规划 |

资料字段（`PROMPT_DATA_FIELDS`）：description 任务说明、promptTask 任务参数、characterContext 角色资料、outfitCatalog 衣柜清单、userPrompts 用户补充词、writingRequirements 写作要求、numberedText 编号正文、previousText 前文、lore 世界设定、characters 角色名单、scenes 场景列表、originalPrompt 原提示词、layout 构图、outputs 输出要求。

消息角色：system 系统、user 用户、assistant 助手。

对照表集中放在一个模块里（如 `settings-image-prompt-labels.js`），界面、状态、错误提示都从这里取。未知键回退显示为「其他（内部名）」。

## 新版面

```
生图提示词组
[ IGS 内置生图框架（使用中）▾ ]  [使用]  ⋯（新建 / 复制 / 重命名 / 导入文件 / 从剪贴板导入 / 导出文件 / 删除）
状态：已自动保存 · 14:32   |  有内容未填完整，暂未生效：……

▸ 通用规则              （按发送顺序排列，每段一张折叠卡）
   卡标题：段名 · 启用开关
   卡内：正文大文本框
        ⋯：上移 / 下移 / 恢复默认 / 删除；「更多设置」里放发送身份（系统/用户/助手）
   「任务规则插入位置」「本轮资料插入位置」：不可编辑的一行标记，只能上下移动
   [新增一段通用规则]
▸ 各任务规则            （11 张卡，中文任务名）
   卡内：主规则正文
        各格式追加规则：每种格式一个独立文本框，标题用中文格式名；[添加格式规则 ▾] 只列尚未存在的格式
        「资料范围」折叠：中文勾选框（允许 / 必填）
        ⋯：恢复默认 /（同任务多版本时）使用哪一版
▸ 预览发送内容
   任务 ▾  格式 ▾  [生成预览]
   结果按消息分段：【系统】正文…【用户】正文…；本轮资料段折叠，注明「程序自动生成的示例资料」
```

## 各现有项的去向

| 现有 | 处理 |
|---|---|
| 当前生效 + 编辑预设两处 | 合成一个下拉，生效项标「（使用中）」；选中即进入编辑；「使用」按钮切换生效 |
| 名称输入框 | 去掉，改为 ⋯ → 重命名（弹窗，和素材预设一致） |
| 新建时输入 ID | 只问名称，ID 自动生成且不显示 |
| 存档草稿 / 保存版本 / 启用 / 放弃草稿、r/d 版本号 | 去掉，改自动保存（见下） |
| 稳定 ID、块用途、工作台标记、注入位置/深度/顺序、元数据 | 不显示，原值保留 |
| 块启用 + 顺序项启用（两个开关） | 合成一个「启用」：显示值 = 两者都不为 false；打开时两者都设 true，关闭时只设顺序项 false |
| 未在顺序中的块 | 放在通用规则末尾「未发送」区，带「加入」按钮 |
| 任务模块 + 显式任务映射 | 合成「各任务规则」；同一任务只有一个模块时不显示映射；有多个时卡内出现「使用哪一版」 |
| 新增任务模块 | 改为任务卡 ⋯ →「复制为新版本」 |
| 分格式规则 JSON | 拆成多个文本框（见上）；清空某格式的文本框 = 删除该键；全部删除后删除 `contentByFormat` 字段；未改动时对象保持原样 |
| 允许/必填资料字段 JSON 数组 | 中文勾选框；未改动时数组保持原样（包括顺序）；改动时按 `PROMPT_DATA_FIELDS` 顺序重排 |
| 声明变量 / 保留字面变量 | 不显示 |
| 本地预览任务 / 资料 JSON | 改为任务 + 格式下拉，示例资料由程序按该模块必填字段生成 |
| 预览结果 JSON | 按消息分段显示 |
| 导入 JSON / 粘贴 JSON | 「导入文件」「从剪贴板导入」；冲突处理文案中文化 |
| 校验错误码（slot-count 等） | 全部翻成中文句子，带中文定位（任务名 / 段名） |

## 自动保存

- 预设的生效是按 ID 绑定的（`current[TYPE] = id`），保存新版本后立即生效，不需要再点「启用」。
- 输入停顿约 1.2 秒后，或失焦、折叠、切换预设、关闭设置时，保存一次。
- 能通过 `validatePromptActivation` → 调 `savePromptPreset` 写正式版本。
- 不能通过（比如必填段被清空）→ 调 `savePromptDraft` 写草稿；状态行用中文说明问题，正在使用的版本保持不变，发送不会坏。
- 保存后只就地更新状态行，不整页重绘。
- 「恢复默认」改为先冲刷保存，再恢复，再重绘。

## 性能（现状已有的卡点，一并修）

1. `editor.view()` 每次整页渲染都会调用 `registry.snapshot()`（整库深拷贝）、`list()`（逐项深拷贝）、`get()`，再加一次 `validatePromptActivation`（内部 JSON 往返拷贝）。只要设置页切到 NAI 来源就会执行，即使编辑器是折叠的。
   - 改为：给注册表加只读的轻量查询（只返回 id/name/是否草稿，不拷贝），由调用方保证不修改。
   - 激活校验按 `editRevision` 缓存。
   - 编辑器折叠时只渲染下拉和状态行，不渲染卡片。
2. 文本框失焦（change）走 `setImagePromptField(..., render=true)`，会整页重绘。改为不重绘，只有结构性操作（增删段、移动、切预设、恢复默认）才重绘。
3. `settings-host-render.js` 的快照里带着 `imagePrompt.preview`，又被 `cloneData` 一遍。去掉 preview，或只带布尔值。
4. 自动保存路径中 `stagePromptSave` 会整库 JSON 往返，这是现状；靠防抖控制频率，不新增拷贝。

## 测试

- 往返：内置默认预设，以及一个带多版本模块、`metadata`、`workbenchOnly`、`injection_*`、未排序块的自定义预设，经过「渲染 → 不改 → 保存」后深相等。
- 发送一致：对每个任务 × 它的每种格式，保存前后 `renderImagePromptPreset` 的 `messages` 逐字相同。
- 字段映射：改某个格式文本框只改对应键；勾选框写回顺序正确；清空最后一个格式会删除字段；合并后的启用开关读写正确。
- 界面无英文：渲染出的 HTML 去掉 `{{…}}` 和用户正文后，不出现任务/格式/字段的内部英文名、`system`/`user`、`JSON 数组`、`injection_`、错误码。
- 只跑相关测试：`tests/image-prompt-presets.test.js`、`tests/creature-settings-page.test.js`，加上新增的测试文件，再跑 `npm run build`。

## 不做

- 不改任何提示词正文。
- 不改装配器、校验器、存储格式。
- 不碰其他设置页。
