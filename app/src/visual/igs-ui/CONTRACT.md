# igs-ui

本目录是 IGS 的 `Immersive Galgame System` 原版 UI 等价层。

## 边界

- 保留原版 `.igs-*` selector、`#igs-overlay`、`#igs-unified-settings`、旧 `igs_*` 存储键语义。
- 浏览器环境挂载真实 DOM；Node 模拟测试返回可断言的 snapshot/controller。
- 不在这里实现 scene 解析、preset registry 或 shujuku 业务逻辑；这里只负责阅读器和设置面板视图宿主。

## 硬约束

- 不得用新的 `.igs-*` DOM 替换原版 `.igs-*` DOM。
- `openSettings()` 不得再返回 `settings-ui-not-mounted`。
- `openLatestAvailable()` / `openViewerFromMessage()` 必须能得到 `#igs-overlay` 等价结构。
- 修改模板、样式和字段路径前，先对照 `projects/Immersive Galgame System 原版备份/tavern helper/bridge/src/ui/**` 与 `app/fixtures/igs-ui/*`。
