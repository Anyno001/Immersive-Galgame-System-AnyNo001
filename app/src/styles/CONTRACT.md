# styles 模块契约

## 职责

- 管理 CSS 变量、主题 token、用户 CSS、UI 预设。
- 让阅读器、设置面板、选项浮窗、背景/立绘页、生图插件页、shujuku 表格页都能被 UI/CSS 预设覆盖。

## 必须覆盖的命名空间

- `.igs-stage-*`
- `.igs-toolbar-*`
- `.igs-dialogue-*`
- `.igs-bubble-*`
- `.igs-nameplate-*`
- `.igs-avatar-*`
- `.igs-hud-*`
- `.igs-choice-*`
- `.igs-system-*`
- `.igs-settings-*`
- `.igs-shujuku-*`
- `.igs-resource-*`
- `.igs-provider-*`

## 稳定槽位

换皮 CSS 必须保留这些核心 DOM 槽位，不允许用 `display:none` 或重建 DOM 的方式破坏设置联动：

- `.igs-stage`
- `.igs-background-layer`
- `.igs-generated-layer`
- `.igs-character-layer`
- `.igs-dialogue-layer`
- `.igs-hud-layer`
- `.igs-toolbar`
- `.igs-choice-layer`
- `.igs-system-layer`

## 覆盖范围

- 工具栏：位置、方向、按钮尺寸、间距、透明度、图标颜色、收纳状态。
- 对话气泡：背景、边框、圆角、阴影、毛玻璃、文字、内边距。
- 名字牌：字体、颜色、背景、边框、位置。
- 头像：尺寸、圆角、边框、阴影、显示/隐藏。
- 选项浮窗：列表、按钮、 hover / active / disabled 状态。
- 系统层：toast、错误提示、加载状态、进度提示。
- 移动端横屏：允许通过 UI/CSS 预设覆盖横版布局的尺寸和间距。

## 设置桥接

`设置 -> 阅读器` 写入语义配置，样式系统负责同步为 CSS 变量和属性：

- `data-igs-toolbar-layout`
- `data-igs-toolbar-placement`
- `data-igs-dialogue-style`
- `data-igs-nameplate-visible`
- `data-igs-avatar-visible`
- `--igs-dialogue-font-size`
- `--igs-dialogue-width`
- `--igs-dialogue-height`
- `--igs-dialogue-opacity`
- `--igs-toolbar-placement-x`
- `--igs-toolbar-placement-y`

Skin CSS 应优先读取这些变量和属性，而不是写死尺寸。

## UI Skin 预设

`ui-skin-preset` 可以包含：

- `css`：皮肤 CSS。
- `layout`：工具栏、对话区、名字牌、头像等槽位布局。
- `settingsSchema`：皮肤暴露给 `设置 -> 阅读器` 的可调项。
- `tokens`：字号、间距、颜色、透明度等变量默认值。

## 禁止

- 不直接覆盖 `body`、`html`、`.mes` 等全局选择器，除非用户 CSS 明确启用高级模式。
- 高级用户 CSS 可以完全改变 UI 外观，但不得破坏核心槽位和设置桥接。
