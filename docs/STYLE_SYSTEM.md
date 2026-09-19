# 样式系统草案

样式系统负责 CSS 全量编辑、UI 预设、组件级覆盖和移动端横屏布局覆盖。

## 命名空间

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

## 必须可覆盖

- 工具栏方向、位置、按钮尺寸和间距。
- 对话气泡背景、边框、圆角、阴影、文字和内边距。
- 名字牌、头像、选项浮窗、toast、加载状态。
- 手机端网页全屏 / 全屏横屏布局尺寸。

## 稳定槽位

UI Skin 可以让界面变成全屏字幕式、左上工具栏、右上工具栏、底部对话栏等完全不同形态，但必须保留：

- `.igs-stage`
- `.igs-background-layer`
- `.igs-generated-layer`
- `.igs-character-layer`
- `.igs-dialogue-layer`
- `.igs-hud-layer`
- `.igs-toolbar`
- `.igs-choice-layer`
- `.igs-system-layer`

## 设置桥接

`设置 -> 阅读器` 修改语义配置，再同步为 `data-igs-*` 和 CSS 变量：

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

皮肤 CSS 应读取这些变量，确保换皮后仍能被设置页控制。

## UI Skin 预设

```json
{
  "type": "ui-skin-preset",
  "name": "左上角工具栏字幕式 UI",
  "data": {
    "layout": {
      "toolbarPlacement": "top-left",
      "dialogueStyle": "subtitle"
    },
    "settingsSchema": {
      "toolbarPlacement": ["top-left", "top-right", "top", "bottom"],
      "dialogueStyle": ["subtitle", "bubble", "panel"],
      "nameplateVisible": true,
      "avatarVisible": true
    },
    "css": ".igs-stage { --igs-dialogue-font-size: 22px; }"
  }
}
```

## 约束

- 默认 CSS 必须带 `.igs-` 前缀。
- 默认不覆盖 `html`、`body`、`.mes` 等全局选择器。
- 高级用户 CSS 可以提供全局覆盖开关。
- 高级用户 CSS 也必须保留核心槽位，否则设置页无法保证继续控制换皮 UI。
