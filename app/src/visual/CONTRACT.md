# visual 模块契约

## 职责

- 渲染 Immersive Galgame System 舞台。
- 管理背景层、生图层、环境效果层、角色立绘层、头像层、对话层、选项层、系统层。
- 支持桌面、手机、网页全屏、全屏模式。
- 手机端网页全屏和全屏模式必须支持竖屏/横屏布局切换。
- 工具栏必须支持横向排列和竖向排列，手机端默认竖向。

## 图层结构

```text
.igs-stage
├── .igs-background-layer
├── .igs-generated-layer
├── .igs-effect-layer
├── .igs-character-layer
├── .igs-avatar-layer
├── .igs-dialogue-layer
├── .igs-hud-layer
│   ├── .igs-toolbar[data-placement="top-left"]
│   └── .igs-toolbar[data-placement="top-right"]
├── .igs-choice-layer
└── .igs-system-layer
```

## 稳定槽位

换皮 CSS 可以改变视觉表现和布局，但必须保留以下核心槽位：

- `.igs-stage`
- `.igs-background-layer`
- `.igs-generated-layer`
- `.igs-character-layer`
- `.igs-dialogue-layer`
- `.igs-hud-layer`
- `.igs-toolbar`
- `.igs-choice-layer`
- `.igs-system-layer`

`设置 -> 阅读器` 修改的是语义配置，`visual` 必须将配置同步为 `data-igs-*` 属性和 CSS 变量，供皮肤 CSS 使用。

## 显示策略

- `off`
- `text-only`
- `default-background`
- `background-character`
- `generated-only`
- `generated-first`
- `generated-with-avatar`
- `mixed-overlay`

## 响应式布局

- `pc`、`mobile`、`web`、`fullscreen` 四种模式都必须有明确布局规则。
- 手机端 `web` / `fullscreen` 在横屏时使用横版布局，不裁切对话框、工具栏、输入区和选项层。
- 横屏检测可使用 `visualViewport`、`orientationchange` 和 `matchMedia('(orientation: landscape)')`，实现时需要兼容浏览器不允许强制锁定方向的情况。
- 竖屏恢复时必须重新钳制舞台尺寸，避免留在横屏坐标。

## 工具栏

- 工具栏状态属于 `visual` 配置，动作执行仍走 `actions`。
- `horizontal`：按钮横向排列。
- `vertical`：按钮竖向排列。
- `auto`：桌面默认横向，手机默认竖向。
- `data-placement` 支持 `top-left`、`top-right`、`top`、`bottom`、`bottom-right`、`custom`。
- 工具栏 CSS 必须使用 `.igs-toolbar-*` 命名空间。

## 设置桥接

`readerSettings` 和 `layoutSettings` 至少应映射为：

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

## 环境效果

- 环境效果由 `scene` 解析出的时间、天气、地点驱动。
- `rain`、`snow`、`fog`、`night-tint` 等效果只能进入 `.igs-effect-layer`。
- 效果层不得改变原始聊天楼层 DOM。

## 性能约束

- 大图延迟加载。
- 当前场景外资源不进入 DOM。
- 移动端避免持续布局抖动和无限轮询。
