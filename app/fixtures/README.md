# fixtures

本目录存放模拟测试数据，供 AI 和测试脚本使用。

## 计划数据

- 假 TavernHelper 聊天消息。
- 标准 IGS 正文。
- 普通文本、乱码文本、空聊天。
- 含时空栏正文。
- 含生图段正文。
- 假 shujuku 表格数据。
- 背景/立绘资源包样例。
- 生图 provider 响应样例。

fixtures 只放测试数据，不放真实用户隐私、真实 API key 或长篇业务正文。

## 当前分层

- `tavern/`：fake TavernHelper 消息。
- `shujuku/`：fake shujuku 场景数据和写表 patch。
- `media/`：资源包占位样例。
- `providers/`：fake provider 响应。
- `imports/`：导入契约样例。
- `presets/`：预设注册表快照、文本预设导入 bundle 和坏预设守卫样例。
- `styles/`：稳定槽位和 reader bridge 样例。
- `visual/`：reader settings、viewport 和 stage model 样例。
- `igs/`：Immersive Galgame System 兼容 API 和旧 `igs_*` 存储样例。
- `igs-ui/`：原版阅读器 UI / 统一设置面板的 selector、几何和 tab 闸门快照。
- `text/`：正文过滤、正文格式化、scene regex 和坏正则回退样例。
