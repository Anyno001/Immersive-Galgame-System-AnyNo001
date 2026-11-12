# 修罗场演出判定修正计划

2026-11-07 用户定。本地文档，不推送。

## 背景

修罗场（`romance-runtime.js` 的 `resolveRival`）：恋爱演出 1、2 档里，另一位「情敌」出场时立绘转冷色并弹心碎符号。用户反馈「老是弄错」。现行情敌来源两种，都只增不减：

- `romanceTargets`：阅读器里当过任一 romance 演出第 3 栏对象的角色，存内存，整个会话不清。
- `statsRivals`：数值系统里吃醋扣过好感的角色，`bootstrap.js` 在 `igs:stats-fx` 时登记，只在换聊天时清。

已知错例：

1. 哥哥嫉妒妹夫，后来接纳、欣赏妹夫；此后哥哥出现在妹妹与妹夫的恋爱场景仍判为情敌。
2. 家人、朋友吃过醋就永久算情敌。
3. 分手放下的前任、恋爱线早已结束的角色仍永久算情敌。
4. 只吃过「低路」醋（不扣好感）的角色不算情敌，而真正正在吃醋的人可能因此漏判。
5. 重新打开阅读器或刷新后 `romanceTargets` 清空，判定前后不一致。

## 新规则

一个角色在当前页算情敌，须同时满足：

- 不是本区间的恋爱对象，不是主角（现有规则不变）；
- 满足下列任一条「当下仍有情敌立场」：
  - **A. 正在吃醋**：数值系统里该角色最近 7 个游戏日内有吃醋记录（任一路，扣不扣好感都算）；
  - **B. 心结未解**：该角色芥蒂 ≥26；
  - **C. 仍是恋爱对象**：数值档案 `character.romance === true`（第二轮计划 4.2 / 4.2.5，`[igs-stat:romance|角色名|结束]` 会置回 false）。

数值系统未启用或本聊天未启用时，退回现行规则（`romanceTargets`），保证不开数值系统的用户行为不变。

「哥哥接纳妹夫」：吃醋停了 7 天、芥蒂自然消退或化解到 25 以下、本来就不是恋爱对象 → 自动不再判为情敌。

## 实现

1. 新建 `app/src/scene/stats/stat-rivals.js`：纯函数 `statsRivalSet(ledger, { windowDays = 7 })` → `Set<角色名>`。按账本里有效楼层的变动记录（`note === '吃醋'`，取该楼结算后的 `clock.day`）与当前状态（芥蒂、`romance`）计算。不改结算，不新增存档字段。
2. `romance-runtime.js`：把 `statsRivals` 从「累积集合」改为「外部提供的当前集合」：`setStatsRivalProvider(fn)`，`fn()` 返回 `Set` 或 `null`；返回 `null` 时走旧规则（`romanceTargets`），返回 `Set` 时**只**认这个集合，`romanceTargets` 不参与。保留 `registerStatsRivals` / `clearStatsRivals` 导出以免外部调用报错，但改为空操作或兼容实现，注释写明。
3. `bootstrap.js`：去掉 `igs:stats-fx` 里的 `registerStatsRivals` 登记，改为注册 provider（由 `statsRuntime` 暴露 `rivalSet()`，未启用返回 `null`）。
4. `stats-runtime.js` 增加 `rivalSet: ev(() => active() ? statsRivalSet(ledger) : null)`——**该文件正被另一子代理修改，本项由主窗口在其交付后接线**；实施方把需要加的代码写进汇报。
5. 提示词：tags 段芥蒂下降的举例补「释怀、接纳」——**同样由主窗口并入第二轮提示词整理**，实施方不改 `stat-prompt.js`。
6. 更新 `visual/igs-ui/CONTRACT.md` 修罗场一节的描述。

## 测试

只补针对性用例，`node --test` 跑相关文件，不跑全量、不跑 gate：

- 7 天内吃醋（低路、高路各一）算情敌，第 8 天不算；
- 芥蒂 26 算、25 不算；
- `romance` 为真算，`romance` 结束后不算；
- provider 返回 `null` 时沿用 `romanceTargets` 旧行为；返回空 `Set` 时 `romanceTargets` 里的角色也不算；
- 主角、本区间对象永远不算。
