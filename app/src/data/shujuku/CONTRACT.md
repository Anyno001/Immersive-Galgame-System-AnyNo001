# data/shujuku 模块契约

## 职责

- 读取 shujuku、TavernHelper 和其它可用于场景解析的数据源。
- 为 `scene` 提供时间、天气、地点、角色状态和当前楼层数据。
- 包装 shujuku 表格读写结果，给 `shujuku-panel` 和 `scene` 使用。

## shujuku 边界

- 读写入口统一经过 `window.AutoCardUpdaterAPI`。
- `table-parser.js` 是共享表头/行解析入口；旧 `shujuku-panel/panel-model.js` 保留兼容转发。地图通过 `createShujukuClient().readTables()` 只读导出，再筛选名称含「地图」或「地点」的表；不写入、不调用世界书刷新。
- `record-tables.js` 按表名包含关键词选择资料表：地图「地图／地点」、日记「日记」、物品「物品」、人际关系「关系／势力」；`record-model.js` 在数据层做字段识别与降级，状态区分 `read-error`、`no-tables`、`empty`、`insufficient-fields`、`ready`，缺字段保留实际单元格不补造数据。资料视图全部只读，禁止调用写接口。
- 首版建议地图列为 `地点ID`、`上级地点ID`、`名称`、`x`、`y`、`说明`、`角色`、`排序`，并非既有用户表的已验证 schema。每张地图表独立成根，同表内父级按地点 ID 查找；顶层父级留空。指针坐标均在 0–1（左上 0,0；右下 1,1），列表型楼层可留空；角色仅取显式填写值，不推断实时在场。
- 模型保留命中表的 UID、原始表头和行，缺列、无效坐标、孤儿、循环和重复 ID 可诊断；读取失败与无地图表分开报告。真实导出列名不符时应只读核对并提示，不得改写用户表。
- 表格编辑由 `shujuku-panel` 发起，`data/shujuku` 只提供安全包装和错误归一化。
- 刷新世界书必须显式调用 `refreshDataAndWorldbook()`，不能隐式触发。

## 禁止

- 禁止重复实现 shujuku 自带的模板导入。
- 禁止把表格字段名写死在视觉层。
- 禁止把读写失败当作空数据静默吞掉。
