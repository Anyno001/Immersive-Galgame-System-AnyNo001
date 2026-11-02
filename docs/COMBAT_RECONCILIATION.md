# 战斗增量整合对照

## 基线与交付范围

- 本地增量：`0e67338c..e75d5cb0`，涵盖 v0.39.0 之后的有效改动和合入的 v0.37.64 / v0.37.65。
- 远端重写基线：`5fb075de`（v0.39.5）。在其模块结构上适配增量，保留九套画布皮肤、按皮肤换样的演出、开场对撞与当前交互。
- PR 分支：`pr/reconcile-combat-current`，目标 `main`。本次版本保持 0.39.5；版本提升、正式导入件和标签由维护者合并后统一发布。

## 对照矩阵

| 本地有效改动 | 当前整合方式 | 主要落点 |
| --- | --- | --- |
| 技能助战两动、按设定给卡组角色初始装备、遭遇图集题材、立绘异步读回 | 复用远端等效实现 | `combat/session.js`、`core/combat-services.js`、`combat-enemy-atlas.js`、面板订阅 |
| 首轮先手不双动、敌人随机选目标、助战绝招取自身技能 | 复用远端 setup / 引擎与会话组装 | `openingCharged`、`randomTargets`、技能组装 |
| 多敌折算下限最终为 0.5 | 迁回最终参数，更新行为断言与契约 | `combat/rules.js` |
| 初始装备进背包、物品表接管、背包出售、开战标签兼容、专属卡 Lv5 / Lv10 | 复用远端对应链路 | 账本、库存写口、会话、正文解析 |
| 觉醒眼部定位校验、战利品未选定时隐藏发送按钮、战报 ID 认领 | 保留远端等效实现 | `combat-cutin.js`、`combat-panel-render.js`、`combat/session.js` |
| 补位退场 / 入场、补位敌人出手前完成入场 | 适配远端现有时间轴；所有皮肤共用补位状态，独立 translate 保留站位 transform | `combat-panel.js`、`combat-panel-style.js` |
| 发送战报 / 重发点击即收起 | 面板关闭不取消会话发送；失败重开可重发，升级奖励重开领取 | `combat-panel.js` |
| 数据库整体改写正文后的发送回执 | 派发后认领基线之后的新用户楼，保留聊天作用域与用户楼过滤 | `host/tavern-helper-adapter.js` |
| 剧情失去物品统一入账 | lose 解析、schema、账本、主角库存、背包过滤及再获得恢复一并迁回 | `scene/combat-directives.js`、`combat/*`、`data/shujuku/*` |
| 背包物品图框内裁切、装备详情加成与被动 | 按远端资料页结构适配 | `record-panel.js`、`record-panel-style.js`、`combat-deck-panel-model.js` |
| 每次正文完成后检查主角档案 | 在 onImageFloorReady 中先检查，再转发同楼准备与成长 | `core/bootstrap.js` |
| 杂兵 / 精英 / 首领盲翻卡牌率 30% / 40% / 50% | 本地确定性规划，仅从杂物份额补足；已落库 offer 沿用 | `combat/rewards.js` |
| 本地包指定静态资源版本 | 保留默认值，新增 --asset-ref vX.Y.Z | `scripts/build-local-package.js` |
| 上游 v0.37.64 窄屏修复、v0.37.65 chats API | 远端已包含，沿用重构后的实现 | 阅读器、资料页与 `api/*` |

全队覆灭、专属卡成长、首领与精英优先上场和补位等原有能力继续走远端领域模块。战斗内交互以远端 v0.39.5 为准。

## 数据与验证边界

- 物品表仍是主角数量唯一来源。剧情全部失去以类别「已丢失」标记，兼容数量列正数约束；不持有时背包隐藏，再获得沿用原定义、恢复本次数量。
- lose 与其他正文标签一样受楼层 / swipe 锚点约束；未注入物品表的角色由日志重放恢复。
- 定向行为验证涵盖失去与恢复、盲翻概率、正文完成触发、改写回执、全部面板皮肤的补位状态、先入场后出手、降级及发送立即收起。
- Node / jsdom / fake host 只证明对应替身契约；真实酒馆、SQLite 存量数据、手机和可见动效尚未验收，合并后需在实际宿主复核。
- 部分旧差分测试引用本机不存在的 G: 盘 v0.39.0 拆解基准，不将这类环境依赖算作行为验证通过；本次不下载外部基准。

## 本次验证结果

- `node --test tests/combat-panel-layout.test.js tests/combat-v0392-behavior.test.js tests/turn-navigation-user-floor.test.js`：44 项通过、0 失败、0 跳过，含背包装备加成、被动与描述文本转义。
- `npm run build`：成功生成当前源码产物。
- 显式调用 `scripts/bundle-startup-check.js` 的 `checkBundleStartup`：正式和调试 bundle 均通过自动 / 手动冷启动、销毁与重启。
- `git diff --check`：通过。