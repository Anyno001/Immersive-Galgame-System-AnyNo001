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
- IGS 日志表由 `combat-tables.js` 提供受控追加写口，默认规格仍为旧档案、战斗日志、属性与数值日志四表；可注入 `specs / serial`，`ensure({ kinds })` 只补指定表，旧调用默认行为不变。建表只调用宿主的 `getTableTemplate` + `importTemplateFromData(当前模板副本 + 所需表, { scope: 'chat', dataMode: 'seed' })`。空对象导出返回 `combat-table-not-ready`，不当缺表。整份模板导入前核对当前表集合，差异返回 `combat-table-template-diverged`（`hidden / extra`），保护用户其他表；导入后检查 `runtimeReady` 及实际读回。受管表禁止 AI 自动填写，不注入世界书。追加经同页面 FIFO、稳定键判重、逐段插入及批末读回；同键不同载荷拒绝，不覆盖历史。读取失败返回错误，残段及非法行保留诊断；业务消费者不能把诊断记录当作空档。需要世界书刷新的有效批次只刷新一次，租约失效后不发后续刷新；已派发的宿主操作不可撤回。
- 背包表（`inventory-tables.js`）是第三个受控写入方，只写当前聊天唯一的物品表（表名含「物品／背包／道具」且有物品名称列与数量列、不以 IGS 开头）与「IGS战斗·装配」。物品表是物品数量的唯一来源；装配表按物品名称关联物品表行，只记类别、稀有度、部位、六维加成、被动、效果、是否装备与定义JSON，不设数量。宿主缺 `exportTableAsJson / insertRow / updateRow / deleteRow / getTableTemplate / importTemplateFromData / refreshDataAndWorldbook` 任一时返回 `inventory-host-unsupported`；找不到物品表时按默认「背包物品表」结构新建，多张命中返回 `inventory-table-ambiguous`，不猜。宿主模板协调按表名与显式别名匹配、不按 UID，所以模板用物品表现名构造；`ensure` 在当前模板副本上补缺的「描述/效果」「类别」列（SQLite 模式同时向 DDL 追加 `sql TEXT -- 表头`，块注释、以表级约束收尾或物理列名冲突时返回 `inventory-ddl-unsupported`），并把物品表改为程序维护（`updateFrequency = 0`、增删改节点「禁止。」）；模板里物品表表头与当前聊天不同返回 `inventory-template-mismatch`，表名集合不一致返回 `inventory-template-diverged`，导入后读回核对。数量变化逐项 `insertRow / updateRow / deleteRow(..., BATCH_WRITE_OPTIONS)`：宿主数量列 `CHECK(quantity > 0)`，普通使用或卖出正好用完时删行；剧情 `lose` 全扣时改把类别写为 `INVENTORY_LOST_MARK`（「已丢失」），保留物理正数量和原装配定义，读取投影视为不持有、背包隐藏，再获得时恢复类别与本次新增数量，不累计保留的物理数量；不足返回 `inventory-quantity-insufficient`，缺物品返回 `inventory-item-missing`；每项写后读回，不符返回 `inventory-write-unverified` 并停在该项，已写入项在 `applied` 中报告、不回滚；批次有写入时只刷新一次世界书。行号每次写入前重新读取（宿主 `rowIndex` 为表内容下标，表头为 0）。
- `client.updateRow(tableName, rowIndex, patch, options?)` 与 `client.deleteRow(tableName, rowIndex, options?)`：补丁按列名；不传 options 时保持原位置参数调用，传入时用宿主对象参数形式（`{ ...options, tableName, rowIndex, data }`）。
- `client.updateCell(tableName, rowIndex, column, value, options?)`：不传 options 时保持位置参数调用，传入时用宿主对象参数形式（`{ ...options, tableName, rowIndex, colIdentifier, value }`）。批量写的单条写入统一传 `client.js` 导出的 `BATCH_WRITE_OPTIONS`（`{ skipNotify: true, skipRefresh: true }`）：宿主跳过逐条通知与写后合并刷新、世界书重写，调用方在批次有写入时于批末调用一次 `client.refresh()`；旧版数据库插件忽略 `skipRefresh`，仍逐条刷新。适用方：`stats-push.js`、`inventory-tables.js`、`combat-tables.js`、`table-migrate.js`。
- 剧情货币（规则 v6 G8）：复用 `inventory-tables.js`，以聊天配置中的名称识别物品表固定货币行，数量是权威余额，归零删行；配置存在且行缺失视为余额 0，不再发初始金额。`ensure({ shouldStart })` 与 `changeQuantities(changes, { shouldStart })` 在排队及写入开始前检查请求有效性；已发给宿主的操作不可撤回。变化可带 `expectedBefore`，当前数量不符返回 `inventory-quantity-conflict`，不覆盖其他来源改动。
- 数值日志 `chat:currency` 固化货币名、四档价格、比例、初始金额与 `seeded`；初始读取前经带租约的 `ensure` 补建物品表。初始写入和楼层结算先保存并确认写入意图 `{ before, after }`，再改物品表并追加确认标记。重算只写新旧 delta 差额，`before` 使用实余额；补差不足时保留原已入账的货币结算与流水，记录 `stats-currency-resettle-insufficient`，不生成待恢复意图、不阻塞后续楼，其他数值仍按当前正文结算。待确认写入在下一楼或手动重试前恢复，余额等于目标值时仅补确认，不重复入账。日志与物品表不具备跨表原子事务。每楼增量与 swipe／删楼回退沿用宿主数据库，不另做补偿或全量余额重算。
- `stats-push.js` 只更新已识别的目标格：积分列写旧合并积分，金钱／金币／货币列及当前动态货币名列写物品表余额；货币未就绪时跳过并诊断。积分列优先匹配，动态名称不会覆盖积分映射；映射描述与实际推送使用同一货币名。运行时在初始发放、楼层写入和失败恢复读回后补推最终余额，不在货币队列内等待推送；推送失败不改结算结果，`whenSaved()` 在写库完成后限时等待当前推送。

- 共享表就绪 `table-readiness.js` 由当前聊天、API 与 bundle generation 租约限定，`read()` 返回 `waiting / ready / failed` 和原因。空或非对象导出仅等待，实际导出异常为读取失败，不补空表；ready 只表示有效共享快照可读，不代表任何业务或模型已完成。`subscribe` 先订阅再立即检查现状，通知只触发串行队列安定后的重查，突发通知合并；无回调能力以 `notifications:false` 保留手动重查。退订幂等，重置、API 更换与销毁释放订阅及等待器。


- `origin-store.js`、`points-store.js` 接受逻辑 `kind`；legacy 的 `or| / pt|` 仍写「IGS战斗·日志」，v2 分别写所属独立表。Origin 将操作账本编码为带父 revision 的 `set/drop` 差分，ID 为载荷哈希；重复提交只确认原记录，经读回后才对业务发布。断链、冲突、无效或残缺记录不得当空账本或零余额。
- `origin-store.subscribe(listener)` 通过现有表更新回调让缓存失效并通知引擎，返回幂等退订函数；没有回调能力时保留手动重试，不轮询。`load({ shouldStart })` 将聊天租约传给 `tables.ensure({ shouldStart })`，排队执行及模板导入前后均检查；已发给宿主的导入不可撤回。
- `append(kind, records, { retainOnFailure: false, shouldStart })` 仅让当前调用持有的失败请求退出待写队列，默认战斗请求仍保留；Origin 由引擎持有原意图显式重试，其他写入不得补交它。`matchesIncomplete(kind, record)` 逐项核对已有片段与同一意图的编码，只允许补齐自己的缺段，普通读取仍拒绝残缺记录。Origin 恢复读取先校验原意图，再读取排除 Origin 的外部积分份额；共享消费与恢复使用同一进程内积分锁，旧钱包和战斗净流水不做余额覆盖。
- 共享积分兑换由 `points-exchange.js` 协调，`points-exchange-log.js` 校验；复用 `points-store.js` 的增减日志与 `points-intents.js` 的写后读回意图存储。`exchange` 记录固定 `sourceId = exchangeId`、聊天／来源、负积分增量、核准时共享余额、`chat:currency` 配置及物品表 `{ before, after }`；`exchange-done` 以扣款记录为父且积分增量为 0。折叠时已确认扣款按聊天计一次，不随来源回退；收益 grants 和 Origin 收入额度不变。意图完全未写且来源失效时丢弃，残缺分段只补原记录。
- 锁顺序固定为货币队列 → 共享积分锁 → 既有表写队列。货币写前校验固定配置，只接受写前／目标余额，写后回读确认；完成标记失败只补标记。未完成兑换阻止新共享消费，重入、手动重试与下一楼先恢复兑换。普通小游戏待写记录不被货币恢复补交；确认无未完成兑换时不阻断独立剧情货币结算。此协议不提供跨表原子性或跨页面分布式锁。
- 货币恢复即使没有待写记录，也须重新确认权威物品余额；合法缺行的 0 与表读取失败、歧义及非法数量严格分开。兑换业务写入后积分钱包读回失败返回 `ok:false / stage:'read' / walletReady:false`，保留原 `done / exchangeId` 等业务事实；已完成记录不因读回失败再次扣分或入账，重试只补未完成阶段并重新确认余额。
- `inventory.prepareRename({ from, to, balance }, { shouldStart })` 新鲜读表生成版本化行指纹；`rename(guard, { shouldStart })` 复用既有串行队列，仅原位 `updateRow` 名称并读回，保留数量、描述、类别及其他列。目标被持有或失去物品占用、列结构变化、原行消失或数量／指纹不符均拒绝；同规范键可改显示名，合法零余额无行时不创建零数量行。已派发宿主写入不可撤回，恢复依据原指纹辨认已改名行，不先删后建。
- `chat:currencyEdit` 记录固定编辑 ID、聊天、旧／新配置、余额、名称规范键及 rename guard。写序为原意图 → 物品改名读回 → 新配置读回 → 完成标记，配置和余额分别来自日志与物品表。`recoverSegments:true` 只允许持有完整原记录的恢复流程补齐匹配的缺段；布局标记、Origin、积分、货币编辑、数值生成和战斗奖励均不得覆盖冲突记录或重建结果。`read/ensure` 的 `recoveryRecords:[{kind,record}]` 按表规格生成记录键（档案为 `档案ID|版本`），仅让原编码匹配的残段通过布局校验，业务仍须检查诊断。数值冷启动可用本聊天已校验的货币编辑意图读取，不自动补交。


- `client.insertRow(tableName, rowData, options?)`：不传 options 时保持原位置参数调用；成功时宿主返回行号则带 `rowIndex`。`client.getTableTemplate()`、`client.importTemplate()` 统一返回 `{ ok, reason }`，缺方法时为 `missing-api`。
- 刷新世界书必须显式调用 `refreshDataAndWorldbook()`，不能隐式触发。`client.refresh()` 与缓存客户端的 `refresh()` 传 `{ awaitFrontendReadback: false }`，宿主照常通知前端但不等待回读窗口；旧版插件忽略该参数。
## 当前聊天存储

- `igs-chat-store.js` 由 bootstrap 装配共享实例，按 `chatId + API identity + generation` 绑定句柄，统一缓存、FIFO 与表就绪；数值、库存、Origin、积分不必先创建战斗账本。切聊天、API 替换、reset、dispose 使旧句柄失效并释放订阅与等待器，排队任务重新核验租约。队列不是跨页面锁，也不是跨表事务。
- `igs-chat-layout.js` 先读布局标记，再查旧表与 `igs-chat-evidence.js` 的本聊天 metadata、备份、楼层及 pending；未知身份、空导出未就绪、读取错误和冲突不创建空档。旧表纯表头不代表业务存档。存在旧记录沿用 legacy，不迁移或复制历史；有效空档才创建 v2。
- v2 标记为「IGS·存储」/`sheet_igsstorev2`，固定记录 `igs-layout`、`payload:{version:1,layout:'igs-chat-v2'}`。先追加并读回标记，再补功能表；保存状态不明先回读，完全匹配的标记残段可续写。未来版本、损坏、歧义或未标记业务记录拒绝写入。
- v2 新表：「IGS数值·属性」/`sheet_igsstatattrv2`、「IGS随身·日志」/`sheet_igsoriginv2`、「IGS共享·积分」/`sheet_igspointsv2`，复用日志列与分段协议；数值日志、战斗档案/日志、用户物品与装配表沿用原表。各功能只 ensure 所需 kinds。
- 所有库存公开写口在队内、写前及 await 后检查租约。迟到回执返回 `request-stale`，不继续批次或刷新新聊天；不能据此声称已撤回宿主写入。
- 战斗奖励恢复读回只读当前 owner 的账本，不触发补表；显式重试补原记录，不保留失败写队列供其他动作补交。账本、装配、物品数量是分步提交；账本条目已存在不能证明库存发放完成，禁止把未确认状态当作成功或盲目补发。
- v2 共享积分表（`IGS共享·积分` / `sheet_igspointsv2`）已完整接入全来源收支（战斗战报积分、战斗面板消费/卖出、Origin 核准收入/商店/抽取、小游戏与麻将结算、积分单向兑换货币）；`igs-chat-store.js` 提供不依赖战斗开关的同页面共用积分锁 `withPointsLock`。v2 只读共享积分确认流水（绝不叠加旧 `walletMoney` / 旧战斗分量 / 旧 Origin 分量 / 剧情货币），消费走可恢复 `debit -> 目标业务写回 -> debit-done` 分阶段提交，未完成项或损坏记录拒绝新消费且不假定为零；legacy 保持原合成余额，不搬历史。
- 兼容与回退边界：P3 引入 `drop:<name>` 属性撤销记录、P4 引入无职业耦合的 `hero-base` 记录、v2 布局引入独立表结构；降级到旧版应用无法识别 v2 新表数据，回退须保留原始新表与恢复意图，不可靠删表或清档“修复”。跨页面并发无原子事务保证，外部冲突停写并保留恢复资料。


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
