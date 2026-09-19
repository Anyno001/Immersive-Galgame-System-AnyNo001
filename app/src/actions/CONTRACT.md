# actions 模块契约

## 职责

- 提供 `ActionRegistry`，统一管理按钮、快捷键、组件和 Mod 可调用动作。
- 为动作声明 id、名称、参数 schema、权限和执行函数。
- 处理动作冲突、禁用状态、危险权限提示和错误回传。

## 典型动作

- `reader.open`
- `reader.close`
- `reader.nextTurn`
- `reader.prevTurn`
- `message.typeAndSend`
- `image.regenerate`
- `shujuku.refreshWorldbook`
- `choice.select`
- `settings.open`

## 禁止

- 禁止快捷键直接绑定 DOM 逻辑；快捷键只能绑定 action id。
- 禁止 Mod 绕过权限声明注册危险动作。
- 禁止动作执行失败时静默失败。
