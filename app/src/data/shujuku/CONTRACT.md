# data/shujuku 模块契约

## 职责

- 读取 shujuku、TavernHelper 和其它可用于场景解析的数据源。
- 为 `scene` 提供时间、天气、地点、角色状态和当前楼层数据。
- 包装 shujuku 表格读写结果，给 `shujuku-panel` 和 `scene` 使用。

## shujuku 边界

- 读写入口统一经过 `window.AutoCardUpdaterAPI`。
- 表格编辑由 `shujuku-panel` 发起，`data/shujuku` 只提供安全包装和错误归一化。
- 刷新世界书必须显式调用 `refreshDataAndWorldbook()`，不能隐式触发。

## 禁止

- 禁止重复实现 shujuku 自带的模板导入。
- 禁止把表格字段名写死在视觉层。
- 禁止把读写失败当作空数据静默吞掉。
