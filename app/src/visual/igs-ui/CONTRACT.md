# igs-ui

本目录是 IGS 的 `Immersive Galgame System` 原版 UI 等价层。

## 边界

- 保留原版 `.igs-*` selector、`#igs-overlay`、`#igs-unified-settings`、旧 `igs_*` 存储键语义。
- 浏览器环境挂载真实 DOM；Node 模拟测试返回可断言的 snapshot/controller。
- 不在这里实现 scene 解析、preset registry 或 shujuku 业务逻辑；这里只负责阅读器和设置面板视图宿主。
- `embedded` 模式把唯一阅读器根挂到最新 AI 楼层 `.mes_text` 的兄弟容器，禁止把内部 DOM 插入 `.mes_text`。
- 内嵌上下轮只更换阅读源，挂载楼层保持最新 AI 消息；不得调用宿主跳楼。
- 流式观察只在内嵌阅读器打开时启用；生成期间必须持续隐藏最新 AI 楼层原文并只显示载入态，宿主结束事件后一次性解析，结束后的普通 DOM 更新不得重新点亮动画。

## 硬约束

- 不得用新的 `.igs-*` DOM 替换原版 `.igs-*` DOM。
- `openSettings()` 不得再返回 `settings-ui-not-mounted`。
- `openLatestAvailable()` / `openViewerFromMessage()` 必须能得到 `#igs-overlay` 等价结构。
- 同一时刻最多存在一个 `[data-igs-embedded-host="1"]` 和一个 `#igs-overlay`；关闭、切模式和销毁必须恢复宿主原文。
- 普通翻页必须复用已准备的正文解析结果，不得无条件重跑整楼正文管线。
- 修改模板、样式和字段路径前，先对照 `projects/Immersive Galgame System 原版备份/tavern helper/bridge/src/ui/**` 与 `app/fixtures/igs-ui/*`。
