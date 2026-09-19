# registry 模块契约

## 职责

- 管理能力分组导入、导出、启用、禁用和持久化。
- 负责将合集文件按 `type` 拆分到对应能力页。
- 为每个能力页提供统一的下拉列表数据模型。
- 对预设类能力分组提供唯一的 current 来源；运行时当前启用项必须从 `PresetRegistry` / preset store 恢复，不能在 UI、config 和 API 中各自保存一份真值。

## 能力分组

- `image-provider`
- `image-provider-preset`
- `image-request-builder`
- `image-request-builder-preset`
- `workflow-preset`
- `ui-component`
- `choice-component`
- `ui-skin-preset`
- `ui-layout-preset`
- `theme-preset`
- `css-preset`
- `scene-regex-preset`
- `text-filter-preset`
- `text-format-preset`
- `choice-parser-preset`
- `background-pack`
- `character-pack`
- `background-rule-preset`
- `prompt-preset`

## 禁止

- 不提供全局 Mod 管理页。
- 不提供单独的总入口导入单个 Mod。
- 不把快捷键做成可导入导出的预设。
