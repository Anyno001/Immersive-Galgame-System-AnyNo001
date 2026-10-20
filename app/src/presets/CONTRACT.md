# presets 模块契约

## 本地自动保存衔接（0.36.88）

保存和导入基于最新修订提交，保留当前编辑内容。激活当前编辑时先完成保存；删除当前项自动接续有效保存项，必要时沿默认初始化入口重建，保留其它预设与草稿。异步确认只绑定实际编辑预设，不因普通字段修订而丢弃动作。


存储快照推进时以实际字段编辑合并最新条目、草稿和选择；原快照没有分组时，新建条目仍保留其它入口已写入的同组条目。存储读取暂时失败后重新 hydrate；保存写后核对，静默未落盘按原值补偿。

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

- `prompt-preset` 的 imagegen 数据通过 `prompt-preset.js` 校验，任务/输出格式必须显式映射；未知执行字段或无法映射的协议不能静默丢弃后激活。召回类旧资料仅归档或报告，不作为 imagegen 执行。
- 共享块、任务模块、草稿、导入预览/提交、保存/激活和默认升级统一经过同一 PresetRegistry。草稿不影响 current；revision 冲突、存储读取或提交失败不能覆盖生效项。
- 内置生图框架默认版本 35；升级先备份，只更新可证明未手调的默认内容，保留用户文本、角色、顺序和开关，并支持基于最新快照按块恢复；重复恢复相同内容不推进修订或重写存储。默认安装/升级不填写凭据、不启用生成或自动发送。
- 活动生图预设变化维护 epoch，并通知任务层。正在执行的请求保持原快照；因输出格式失败而等待的任务可据实际活动预设变化重新装配原输入。普通编辑和草稿保存不伪装为活动版本变化。
- `scene-regex-preset`、`text-filter-preset`、`text-format-preset` 需要走 type-specific validator。
- 文本预设导入失败时，可以进入 rejected 结果，但不能覆盖已生效的 current。
- 导出单项时保持 `igs_preset_v1`，导出整组时保持 `igs-import-bundle`。
- 后续能力页 UI 必须复用同一份注册表数据，不能自行拼第二套下拉列表。

## 禁止

- 不把 Mod 当作 Preset。
- 不把背景/立绘资源包当作 Preset。
- 不提供快捷键预设导入导出。
