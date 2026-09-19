# core 模块契约

## 职责

- 启动 IGS 主程序。
- 创建事件总线、状态仓库、生命周期管理器。
- 管理桌面/移动端全局能力检测。
- 协调 `host`、`scene`、`visual`、`presets`、`registry` 等模块初始化顺序。

## 禁止

- 不直接读写 shujuku 表格。
- 不直接操作具体 UI 组件 DOM。
- 不直接解析楼层正文业务规则。

## 对外契约

- 提供 `bootstrapIGS(options)`。
- 提供 `destroyIGS()`。
- 触发 `igs:ready`、`igs:destroy`、`igs:error` 事件。
