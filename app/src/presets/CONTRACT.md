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
- 文本预设导入失败时，可以进入 rejected 结果，但不能覆盖已生效的 current。
- 导出单项时保持 `igs_preset_v1`，导出整组时保持 `igs-import-bundle`。
- 后续能力页 UI 必须复用同一份注册表数据，不能自行拼第二套下拉列表。

## 禁止

- 不把 Mod 当作 Preset。
- 不把背景/立绘资源包当作 Preset。
- 不提供快捷键预设导入导出。
