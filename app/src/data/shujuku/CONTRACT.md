# data/shujuku 模块契约

## 职责

- 读取 shujuku、TavernHelper 和其它可用于场景解析的数据源。
- 为 `scene` 提供时间、天气、地点、角色状态和当前楼层数据。
- 包装 shujuku 表格读写结果，给 `shujuku-panel` 和 `scene` 使用。

## shujuku 边界

- 读写入口统一经过 `window.AutoCardUpdaterAPI`。
- `table-parser.js` 是共享表头/行解析入口；旧 `shujuku-panel/panel-model.js` 保留兼容转发。地图通过 `createShujukuClient().readTables()` 只读导出，再筛选名称含「地图」或「地点」的表；不写入、不调用世界书刷新。
- 地点名称不唯一时不推断角色归属；坐标缺失或错误仅影响地图定位诊断，不抹掉可唯一匹配的角色所在地点。
- `record-tables.js` 按表名包含关键词选择地图「地图／地点」、日记「日记」、物品「物品／装备／道具／背包」（物品名列另认「装备名称」；物品图描述列由 `item-catalog.js` 按 描述→物品描述→备注→说明→效果 自行查找，不进入 `FIELDS.inventory`、不触发字段不足诊断）；人物关系页优先读取「重要角色表」，未提供时兼容旧「关系／势力」人物表，不把「关系网络表」的组织当成人物。`record-model.js` 识别「角色类型／一句话介绍／人际关系」及旧字段；关系仅由显式关联生成。人物另产出 `profile`（年龄／外貌／打扮／过往经历／当下想法五栏，按「年龄」「外貌特征」「穿着打扮」「过往经历」「当下想法」等显式列名识别；当下想法在关系页作名下引语）与 `hasProfile`：表中有任一档案列时关系页只展示档案，没有时才回退为描述 + 原始字段。物品的「状态／物品状态／使用状态」列产出 `status`，不再进入 `detailCells`，由详情头以小标签呈现。状态区分 `read-error`、`no-tables`、`empty`、`insufficient-fields`、`ready`，缺字段保留原始单元格不补造数据。资料视图全部只读。
- 地图兼容旧列 `地点ID`、`上级地点ID`、`名称`、`x`、`y`、`说明`、`角色`、`排序`；「场景地点表」读取 `row_id`、`上级地点ID`、`地点名称`、`x`、`y`、`场景描述`，排序按行序，角色按「重要角色表」的 `姓名` 与 `所在地点` 精确关联（与「在场状态」无关），地点重名不猜位置；旧地图仍只读原「角色」列。每张地图表独立成根，同表内父级按地点 ID 查找；顶层父级留空，指针坐标均在 0–1，列表型楼层可留空。不推断主角位置。
- 模型保留命中表的 UID、原始表头和行，缺列、无效坐标、孤儿、循环和重复 ID 可诊断；读取失败与无地图表分开报告。真实导出列名不符时应只读核对并提示，不得改写用户表。
- 服装兜底线索（`outfit-clues.js` 的 `collectOutfitClues(readResult, [主名, ...别名])`，只读）：`profile` 取非物品表中「姓名／人物／角色／名称」列精确等于主名或别名的行的「穿着打扮／打扮／穿着／服装／着装」列（列名与资料页共用 `record-model.js` 的 `OUTFIT_CLUE_FIELDS`）；`worn` 按装备表方案 A 取物品页表（表名含「物品／装备／道具／背包」）中持有者列（`持有者`、`所属角色`、`拥有者`、`穿戴者`、`角色`）精确匹配、状态列含 `穿着／正在穿／已穿戴／已装备／装备中` 且不含 `收纳／脱下／未穿戴／未装备／损坏／遗失` 的行的名称与描述；无持有者列或无状态列的表不参与，不按物品名或描述猜归属。读取失败返回 `status: 'read-error'` 与原因，与 `empty`（有数据但无线索）区分。
- 表格编辑由 `shujuku-panel` 发起，`data/shujuku` 只提供安全包装和错误归一化。
- 战斗表（`combat-tables.js`）是第二个受控写入方，只能写「IGS战斗·档案」「IGS战斗·日志」两张表，只追加不覆盖，其他表仍然只读。建表只调用宿主的 `getTableTemplate` + `importTemplateFromData(当前模板副本 + 战斗表, { scope: 'chat', dataMode: 'seed' })`；不经用户确认，由 combat-services 在读表发现缺表时调用；必需表与可选表（属性表）都在时不导入。导出为空对象（数据库尚未载入当前聊天）时读取与建表都返回 `combat-table-not-ready`，不当作缺表、待写条目留在队列。宿主的聊天模板导入是整份快照（模板缺的当前表会被隐藏，模板多出的表会加进聊天），所以只在「模板 = 当前聊天的表 + 要补的战斗表」时导入，否则不导入并返回 `combat-table-template-diverged`（列出 `hidden / extra`）；导入成功但宿主报 `runtimeReady:false` 时返回 `combat-table-runtime-not-ready`，不报建表成功。战斗表固定 `updateConfig.updateFrequency = 0`、`exportConfig.enabled = false`、`exportConfig.injectIntoWorldbook = false`，导入时 `mate.updateConfigUiSentinel = -1`。宿主缺任一必需方法时返回 `combat-table-host-unsupported` 并列出缺项。写入走单写者 FIFO 队列：逐行 `insertRow(..., { skipNotify: true })` 后用 `exportTableAsJson` 读回核对，不一致返回 `combat-ledger-write-unverified` 并把该条及其后条目留在待写队列；读取失败返回 `combat-table-read-failed`，不当作空表；批次有写入时只调用一次 `refreshDataAndWorldbook`；写入期间 `isWriting()` 为真，供回调侧抑制自激。JSON 超过 `cellMax` 时按「分段」列 `序号/总数` 拆行，读回拼接还原；不完整或非法行只记诊断。
- 背包表（`inventory-tables.js`）是第三个受控写入方，只写当前聊天唯一的物品表（表名含「物品／背包／道具」且有物品名称列与数量列、不以 IGS 开头）与「IGS战斗·装配」。物品表是物品数量的唯一来源；装配表按物品名称关联物品表行，只记类别、稀有度、部位、六维加成、被动、效果、是否装备与定义JSON，不设数量。宿主缺 `exportTableAsJson / insertRow / updateRow / deleteRow / getTableTemplate / importTemplateFromData / refreshDataAndWorldbook` 任一时返回 `inventory-host-unsupported`；找不到物品表时按默认「背包物品表」结构新建，多张命中返回 `inventory-table-ambiguous`，不猜。宿主模板协调按表名与显式别名匹配、不按 UID，所以模板用物品表现名构造；`ensure` 在当前模板副本上补缺的「描述/效果」「类别」列（SQLite 模式同时向 DDL 追加 `sql TEXT -- 表头`，块注释、以表级约束收尾或物理列名冲突时返回 `inventory-ddl-unsupported`），并把物品表改为程序维护（`updateFrequency = 0`、增删改节点「禁止。」）；模板里物品表表头与当前聊天不同返回 `inventory-template-mismatch`，表名集合不一致返回 `inventory-template-diverged`，导入后读回核对。数量变化逐项 `insertRow / updateRow / deleteRow(..., { skipNotify: true })`：宿主数量列 `CHECK(quantity > 0)`，普通使用或卖出正好用完时删行；剧情 `lose` 全扣时改把类别写为 `INVENTORY_LOST_MARK`（「已丢失」），保留物理正数量和原装配定义，读取投影视为不持有、背包隐藏，再获得时恢复类别与本次新增数量，不累计保留的物理数量；不足返回 `inventory-quantity-insufficient`，缺物品返回 `inventory-item-missing`；每项写后读回，不符返回 `inventory-write-unverified` 并停在该项，已写入项在 `applied` 中报告、不回滚；批次有写入时只刷新一次世界书。行号每次写入前重新读取（宿主 `rowIndex` 为表内容下标，表头为 0）。
- `client.updateRow(tableName, rowIndex, patch, options?)` 与 `client.deleteRow(tableName, rowIndex, options?)`：补丁按列名；不传 options 时保持原位置参数调用，传入时用宿主对象参数形式（`{ ...options, tableName, rowIndex, data }`）。
- 剧情货币（规则 v6 G8）：复用 `inventory-tables.js`，以聊天配置中的名称识别物品表固定货币行，数量是权威余额，归零删行；配置存在且行缺失视为余额 0，不再发初始金额。`ensure({ shouldStart })` 与 `changeQuantities(changes, { shouldStart })` 在排队及写入开始前检查请求有效性；已发给宿主的操作不可撤回。变化可带 `expectedBefore`，当前数量不符返回 `inventory-quantity-conflict`，不覆盖其他来源改动。
- 数值日志 `chat:currency` 固化货币名、四档价格、比例、初始金额与 `seeded`；初始读取前经带租约的 `ensure` 补建物品表。初始写入和楼层结算先保存并确认写入意图 `{ before, after }`，再改物品表并追加确认标记。重算只写新旧 delta 差额，`before` 使用实余额；补差不足时保留原已入账的货币结算与流水，记录 `stats-currency-resettle-insufficient`，不生成待恢复意图、不阻塞后续楼，其他数值仍按当前正文结算。待确认写入在下一楼或手动重试前恢复，余额等于目标值时仅补确认，不重复入账。日志与物品表不具备跨表原子事务。每楼增量与 swipe／删楼回退沿用宿主数据库，不另做补偿或全量余额重算。
- `stats-push.js` 只更新已识别的目标格：积分列写旧合并积分，金钱／金币／货币列及当前动态货币名列写物品表余额；货币未就绪时跳过并诊断。积分列优先匹配，动态名称不会覆盖积分映射；映射描述与实际推送使用同一货币名。运行时在初始发放、楼层写入和失败恢复读回后补推最终余额，不在货币队列内等待推送；推送失败不改结算结果，`whenSaved()` 在写库完成后限时等待当前推送。


- `client.insertRow(tableName, rowData, options?)`：不传 options 时保持原位置参数调用；成功时宿主返回行号则带 `rowIndex`。`client.getTableTemplate()`、`client.importTemplate()` 统一返回 `{ ok, reason }`，缺方法时为 `missing-api`。
- 刷新世界书必须显式调用 `refreshDataAndWorldbook()`，不能隐式触发。

## 禁止

- 禁止重复实现 shujuku 自带的模板导入。
- 禁止把表格字段名写死在视觉层。
- 禁止把读写失败当作空数据静默吞掉。

## 阅读器准备快照（v0.36.62）

- `reader-table-data` 为当前楼层共用一次只读导出、解析表及 HUD 行索引；状态栏、换装线索与约定共用，不在每页重复导出。宿主更新、切楼、API 变化或手动重读后失效；失败按现有使用入口短期重试，不设轮询。
- 姓名首列与 row_id 之后的姓名列使用同样的显式标题列规则。索引保持列优先、行优先及旧格式标题兼容顺序，指标和关系共用命中的行。

## 卡组增强：技能素材只读适配

- `combat-skill-materials.js` 复用 `parseTables`，读取名称含技能/能力/法术/天赋/功法/异能及对应英文的非 IGS 表；有角色归属列时精确筛选当前角色及允许的主角别称，已标记未解锁/未学会等行不纳入。无归属列的候选默认不选，由用户确认。
- 只经 `createShujukuClient().readTables()` 导出，不刷新世界书、不改模板、不写原技能表；生成卡组原有受控写入保持不变。
