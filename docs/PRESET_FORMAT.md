# 预设格式草案

预设用于可切换配置，不用于扩展 JS 能力，也不用于存放大图资源。

## 通用格式

```json
{
  "format": "igs_preset_v1",
  "type": "scene-regex-preset",
  "id": "example.scene-regex",
  "name": "示例时空栏解析",
  "version": 1,
  "data": {}
}
```

## 预设类型

- `theme-preset`
- `css-preset`
- `ui-skin-preset`
- `ui-layout-preset`
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

## UI Skin 预设要求

- 必须声明稳定槽位依赖。
- 必须提供 `settingsSchema`，让 `设置 -> 阅读器` 知道哪些参数可调。
- CSS 应读取 `data-igs-*` 和 `--igs-*` 变量。
- 不得破坏 `.igs-stage`、`.igs-toolbar`、`.igs-dialogue-layer` 等核心槽位。

## Image Provider 预设要求

- 用于保存 provider 配置，不保存 JS 代码。
- 可配置选择器、优先级、轮询间隔、超时、按钮匹配规则。
- st-chatu8 / chami 的默认配置也应按该格式保存和导出。

## Image Request Builder / Workflow 预设要求

- `image-request-builder-preset` 用于保存模型请求构建器的配置，不保存 JS 代码。
- `workflow-preset` 用于保存 ComfyUI 等工作流型 provider 的工作流配置。
- NAI、ComfyUI、GPT 图像、banana 等模型必须允许拥有不同 schema。
- 真实 API Key 不得写入任何 preset。

## 存储要求

- 导入后写入 IndexedDB。
- 可设为当前启用项。
- 可复制为本地草稿。
- 可导出单项或当前分组。
- 错误预设不得覆盖当前启用项。

## 运行时注册表快照

v0.2.5 起，文本预设运行时统一落到 `PresetRegistry` 快照；Node gate 先用 localStorage-compatible / memory storage 固定契约，后续再替换成真实 IndexedDB adapter。

```json
{
  "version": 1,
  "current": {
    "text-filter-preset": "preset.text-filter.content-only",
    "text-format-preset": "preset.text-format.bubble-line",
    "scene-regex-preset": "preset.scene-regex.stage-fields"
  },
  "items": {
    "text-filter-preset": {
      "preset.text-filter.content-only": {
        "format": "igs_preset_v1",
        "type": "text-filter-preset",
        "id": "preset.text-filter.content-only",
        "name": "Content Only",
        "version": 1,
        "data": {}
      }
    }
  },
  "drafts": {},
  "updatedAt": "2026-06-12T00:00:00.000Z"
}
```

运行时要求：

- `current` 只指向已通过校验并成功保存的预设。
- `items` 按 `type -> id -> preset` 存储，导入时先归一化再落盘。
- 坏预设可以出现在 rejected 结果里，但不能污染 `items` 和 `current`。
