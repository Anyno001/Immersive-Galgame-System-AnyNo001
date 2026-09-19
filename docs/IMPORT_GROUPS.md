# 能力分组导入模型

项目不提供独立总 Mod 管理页。所有导入、导出、列表和设置都在对应能力页中完成。

## 统一 UI 模式

```text
[当前启用项下拉框] [编辑] [导入] [导出] [设置]

默认预设
├── 内置项
用户导入
├── 用户项
本地草稿
└── 未导出项
```

## 分发规则

合集文件允许包含多个 `items`。导入后按 `type` 自动分发：

| type | 入口 |
| --- | --- |
| `image-provider` | 生图插件页 |
| `image-provider-preset` | 生图插件页 |
| `image-request-builder` | 生图插件页 |
| `image-request-builder-preset` | 生图插件页 |
| `workflow-preset` | 生图插件页 |
| `ui-component` | 可选组件页 |
| `choice-component` | 选项浮窗页 |
| `ui-skin-preset` | UI 预设页 |
| `ui-layout-preset` | UI 预设页 |
| `theme-preset` | UI 预设页 |
| `css-preset` | UI 预设页 |
| `scene-regex-preset` | 正则与正文页 |
| `text-filter-preset` | 正则与正文页 |
| `text-format-preset` | 正则与正文页 |
| `choice-parser-preset` | 选项浮窗页 |
| `prompt-preset` | 生图插件页 |
| `background-pack` | 背景/立绘页 |
| `character-pack` | 背景/立绘页 |
| `background-rule-preset` | 背景/立绘页 |

## 导入后状态

- `scene-regex-preset`、`text-filter-preset`、`text-format-preset` 导入后进入同一套 `PresetRegistry`。
- 对外列表、当前启用项和导出结果都从注册表读取，不在能力页另存第二份状态。
- `setCurrent()` 只能指向已经通过校验并成功保存的预设。
- 坏预设保留在 rejected 结果中用于提示，但不得覆盖当前启用项。
- 文本预设整组导出继续使用 `igs-import-bundle`，方便和其它能力分组共用导入分发流程。

## 禁止

- 禁止新增全局 Mod 管理页。
- 禁止新增单独的导入单个 Mod 总入口。
- 快捷键页不参与预设导入导出。
- shujuku 表格页不参与 Mod 导入。
