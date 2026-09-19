# tests

本目录存放 app 主工程的模拟测试与回归测试。

## 计划测试

- loader 加载地址拼接。
- 正文时空栏正则解析。
- 标签解析与正文格式化预设切换。
- 背景规则命中。
- 说话人 + 情绪立绘匹配。
- 生图段出现/消失时的视觉层切换。
- 选项点击写入输入框并发送。
- shujuku 表格增删改与刷新世界书调用。
- IndexedDB 本地资源刷新后保留。
- 移动端和桌面端基础布局 smoke。

测试优先使用模拟环境。当前项目不要求安装版实机验收；如需真实酒馆或真实 provider 验证，必须由用户单独确认。

模拟测试矩阵见 `../../docs/SCHEMA_AND_FIXTURES.md`。

## 当前测试入口

```text
npm run test
npm run simulate
npm run gate
```

当前已落地：

- `unit.test.js`：host 输入、scene 解析、visual mode、prompt adapter、公开 API。
- `gate-contract.test.js`：导入契约、样式槽位和 reader bridge。
- `simulate.test.js`：fake TavernHelper 最小闭环、fake shujuku 刷新、资源缓存和生图模式切换。
