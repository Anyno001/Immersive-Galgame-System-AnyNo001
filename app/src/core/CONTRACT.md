# core 模块契约

- 当前聊天存储装配：bootstrap 创建一个 `createIgsChatStore`，直接向 stats 注入 `statsAccess / attributeAccess / inventory`，向 Origin 注入所属 store、只读 readiness 与共享积分协调；战斗服务复用相同实例、缓存、同页面积分锁与队列。聊天事件重置句柄，销毁时释放公共存储；战斗 bundle 不单独 dispose 共享 client。未注入公共实例的既有嵌入入口保留原适配行为。
- 新旧布局由数据层依据当前聊天权威证据固定，不由业务开关或模型结果选择。v2 分表（`IGS·存储` / `IGS数值·属性` / `IGS随身·日志` / `IGS共享·积分`）与共享积分汇总均已接入：v2 只累计共享积分表确认流水，不叠加旧数值份额或剧情货币；legacy 保留原合成余额不搬历史。
- 统一主角初始化与 NPC 策略（P4–P5）：新增版本化 `heroInit/v1` 请求/解析协议与本地可恢复意图 `igs:hero-init:pending:v1:<chatId>`，一次请求补齐主角六维（`hero-base`）与货币 `{name, initial, prices, rate}`，按缺项请求并在回包前二次核对修订防覆盖手改；移除旧主角 `ask/manual/onboarding` 门禁与跨聊天 NPC 缓存（`igs-stats-sheets-v1` / `igs-stats-sheets.json` 停止运行读写、不删除存量文件）。主角基础确认后才展示技能/NPC 交互；NPC 自动/逐个策略与每角色首次决定写入当前聊天 DB，未建档角色输出带 `source:'relative'` 标记的相对值。提示词执行独立版本化一次性迁移（仅覆盖目标键 `heroInit / sheetGen / backfill / currency` 及其可恢复 stale 副本，不触碰 `heroSkills` 或无关提示词）。
- 战斗内容先行与三模式接管（P6）：`prepareProtagonist` 与 `session.runPrepare` 不再耦合 `profile-init` 或数值 `buildMode` 门禁，先独立生成并分阶段保存职业、卡组与初始装备（`igs:combat-content:pending:v1:<chatId>`），完成后接入权威六维；六维未就绪返回 `waiting-attributes / combat-attributes-waiting` 并在六维确认后零额外模型请求转 `ready`；开战 setup 附带本场冻结属性修订 `attributesFrozen`。`combat / daily / both` 三模式均接管物品表，`daily` 仍不放开普通战斗遭遇。
- 启动缓冲、自动开启与正文最终落地（P9）：`bootstrapIGS` 保持同步返回与 `openSettings / shutdown` 契约，接入一次性约 3 秒（`DEFAULT_STARTUP_DELAY_MS = 3000`，支持 `options.startupDelayMs`）可取消启动缓冲；缓冲期内合并设置与切聊天触发，到期读取最新聊天身份并按各子系统独立幂等启动（不设全系统完成屏障），销毁立即取消所有启动与切聊天定时器。冷启动装配与保存开启战斗均完整启用数值系统。`host/illustration-message-host.js` 的 `onImageFloorReady` 结合消息更新/渲染确认流式最终正文，按 `(chatId, messageId, swipeId, 内容修订)` 去重合并 `ENDED / RENDERED / UPDATED`，支持编辑与新 swipe 重算并跳过后台模型事件。

- 0.36.101：`story-outfit-runtime.js` 在主程序启动后订阅宿主楼层就绪事件，装配既有剧情衣装服务、当前卡素材视图和配置保存端口；阅读器复用同一实例，按显式楼层上下文展示和处理候选，关闭阅读器不销毁常驻任务。后台保存仅合并本次字段，成功后通知设置草稿合并，保留用户未保存编辑；主程序销毁解除订阅并取消所属任务。生成开关、候选去重与回复分支校验保持。

- 卡牌战斗扩展：`combat-services.js` 的 `createCombatServices(deps)` 按当前聊天装配 combat 会话、账本与 `data/shujuku/combat-tables` 适配器，返回 `getSession / getLedger / ensureTables / syncRegex / resetChat / settings / generateDeckProfile / refreshGrowth / getGrowth / onGrowthUpdated / retryGrowth / setAllyTier / autoPrepare / autoGrowth`。`autoGrowth(messageId)` 与 `autoPrepare` 同一时机由 bootstrap 调用（计划 P8）：本楼成长标签补扫入库后，只处理该楼（`anchor.messageId`）的待生成项，副 LLM 就绪时生成并落账，未就绪记诊断 `combat-growth-auto-skipped`、失败记 `combat-growth-auto-failed`，装备失败项仍留在成长缓存与既有诊断中，不显示手动整理入口；人物状态页「重试」（`retryGrowth`，只处理非装备待生成项，自动处理在途时先等它结束）；旧楼的失败项不随每次生成重发。单飞：进行中再触发时楼层并入下一轮补跑；`resetChat` 中止在途请求；取消与过期返回 `request-stale`、不落账。`autoPrepare(messageId)` 由 bootstrap 经 `onImageFloorReady`（主生成结束后的最新 AI 楼，沿用其 dry-run、quiet、中止与换聊天过滤）调用：楼层正文末尾有开战标签时直接 `session.prepare`，不等面板打开；会话正在准备、对局中、待结算或待回传时返回 `combat-busy`，同一场已到战前、阻断、已回传或已跳过时返回 `unchanged:true`、不重跑（阻断后的重试由面板手动触发）。`deps.chatRecord` 原样注入会话。`readerSettings.combatExpansion.enabled` 关闭时不创建对象、不注册正则；聊天、用户名、`sourceFilter`、副 LLM 配置都以 getter 注入，每次调用重读。core 不直接读写表；战斗表数据（档案 / 日志 / 属性）以 shujuku 为唯一合法的本地数据源，不另设存储后备（对局进度存档、待回传战报与演出速度偏好仍在注入的 storage，助手确认不纳入此范围）：账本读表发现缺表（档案 / 日志 / 属性）时经适配器 `ensure()` 直接补建后重读，不经界面确认。同一聊天、同一数据库实例同一时刻只导入一次；建表失败按聊天记住原因，之后的读取直接返回该原因、不反复导入，直到 `ensureTables()`（面板「重试」，清掉记忆再补建一次）、换聊天或数据库实例变化；数据库尚未载入当前聊天（`combat-table-not-ready`）或读表失败是暂时状态，不记成建表失败；没有聊天 ID 时不建表。`refreshGrowth` 在启动、设置变更、生成结束、换聊天时补扫成长标签入库（按记录 ID 幂等，单飞并合并补跑），缓存本聊天的成长事件与待生成项并通知订阅者；换聊天后缓存不再返回。`generateDeckProfile` 与 `retryGrowth` 取消或迟到返回 `request-stale`、不落表，写入后读回确认。`setAllyTier(id, tier)` 给技能角色追加同 ID 的新版本档案（档案表按 `档案ID|版本` 去重、读取取最高版本），档位非法返回 `combat-tier-invalid`，非技能角色返回 `combat-character-missing`，写后经账本读回确认，与当前档位相同返回 `unchanged:true` 不写表。

- 主角准备与生成重试：返回值另有 `prepareProtagonist({ manual }) / getProtagonist / onProtagonistUpdated / dispose`。前端启用且当前聊天有效时，`daily / combat / both` 均准备主角；正常遭遇与自动成长仍使用各自模式门禁。bootstrap 在启动、设置变更、换聊天、建档策略变更及正文完成的 `onImageFloorReady(messageId)` 中汇入同一准备入口；正文完成先检查主角，再转发同楼的 `autoPrepare / autoGrowth`，不要求正文含开战或立绘标签。缺表补建成功后也重新核验。每次准备重读当前账本，不以缓存 ready 跳过；快照或客户端版本变化时按暂未就绪处理，沿既有有界读重试核验。读取失败不视为缺档。属性 init 与卡组分别确认：都缺时合并生成，只缺属性时请求 `profile-init`，只缺卡组时不重建已有属性，都存在时不请求；已有手动分值不覆盖。accepted.init 经既有初始化解析与 `ledger.writeInit` 落账；属性和卡组均读回确认、life/成长缓存刷新后才发布 ready，并触发 stats 投影更新。状态按「聊天ID + 主角名」记录：`waiting / manual / generating / retrying（attempt）/ ready / failed / idle`，附 `reason / attributesReady / deckReady`；同键在途准备复用同一 Promise。已发出请求后失败（重试或修正耗尽、写入未核实）不再自动重发，只有 `manual:true` 重查并只补缺项；请求前失败下次触发时可重查。开战准备不另起并行请求，会话经注入的 `awaitProtagonist` 先等在途准备。同一档案已有未核实写入时先补写，不重新生成。`generateDeckProfile / retryGrowth / 主角准备` 经 `combat/generation-retry.js` 的 `generateWithRetry`；请求失败返回 `combat-llm-request-failed`，`deps.retryDelays` 可覆盖重试间隔（测试用）。
- 数值建档策略：`statsRuntime.buildPolicy()` 仅在聊天已加载、数值系统本聊天启用且 `auto / manual / relative` 模式明确合法时 ready；缺失或未知方式 fail-closed。打开建卡页不代表选择默认方式，战斗强制启用也不替代 `newChat:'ask'` 决策。手动策略缺 init 时发布 manual 等待提交。`challengeSnapshot()` 与选项骰子、正文检定、特质门槛共用已读回六维；冷重建沿相同数据源恢复。

- 主角档案恢复与生命周期：准备时订阅当前表客户端的更新通知，等待同键在途准备及已有写队列后复查；只在订阅、bundle、聊天主角键及前端启用仍有效时继续，通知合并且不解除失败后的自动请求限制。切聊天／重置解除订阅并使原任务失效；bootstrap 销毁调用幂等 `dispose()`，取消任务、释放表客户端及主角监听者，旧服务不再准备主角或补表。补表将 `shouldStart` 传至 `ensure()`，建档将 `signal / shouldStart` 传至 `append()`，由适配器在排队后和宿主写入前重新校验；过期返回 `request-stale`，不记为建表失败。已派发到宿主的写入没有撤销契约，不承诺回滚，也不自动迁移或清空存档。
- `combatServices.databaseReadiness()` 提供独立于战斗、数值及货币生成的当前聊天共享表只读就绪端口。读取携带聊天、generation、version；旧租约不发布新结果。主角暂时读错的快照变化与未变化分支均等待 `protagonistReadDelayMs`，最多重试 `protagonistReadRetries` 次（另含首次读取），通知不跳过等待或另起在途准备；关闭主角准备、重置或销毁取消等待。不增加全局轮询，业务失败仍由各自功能恢复。
- 生产战斗的模型阶段由 bootstrap 注入 `retryDelays: []`、`generationMaxRounds: 0`；读表等待不算模型重试。日常选敌无战斗数据库 API 时仍能运行；普通备战及其写入仍需当前数据库 owner。模型路由绑定实际生效配置；过期备战、奖励与主角任务不得继续写入或发布。对局进度、待回传战报和未完成提交意图不是战斗数据库的替代权威。



- 建档方式（P8c）：`createCombatServices` 可注入 `buildMode: () → { mode, choices } | null`（bootstrap 按需读 `statsRuntime.getBuildMode / getBuildChoices`，未启用数值系统时为 null，按自动处理），传给会话并用于 `captureCombatInit().write`：按 `wantsAutoInit` 不该自动建档的角色返回 `{ ok: true, unchanged: true, skipped: 'build-mode' }`，不写 init。新增 `writeManualInit(name, { className, role, scores }, { signal })`：不要求战斗开关，经 `ledger.writeInit(..., { manual: true })` 写属性表 init，换聊天或取消返回 `request-stale`；成功后刷新六维缓存（`refreshLife`），战斗开启时再刷新成长缓存。`stats-runtime.js` 新增 `getBuildMode / getBuildChoices / setBuildMode(mode) / setBuildChoice(name, 'auto' | 'skip' | null)` 与 `enableForChat({ initial, buildMode })`：存档不可读或本聊天未建卡时拒绝（`stats-chat-not-enabled`），非法值拒绝；`enableForChat` 只在本聊天尚未选过时采用传入的建档方式。

- 建档入口与逐角色询问（P8c）：`setBuildMode` 在本聊天尚未启用时不拒绝，暂存为开局待用方式（返回 `{ ok: true, pending: true }`，换聊天清空），`chatStatus()` 只在有值时追加 `buildMode` / `pendingMode`。bootstrap 的 `statsChatAction('mode', { mode })` 转发 `setBuildMode`；「按分配启用」在手动建档下按 `buildInitialState(build, { mode: 'manual' })` 校验，先以用户名（缺省「主角」）调用 `writeManualInit`，写成后再 `enableForChat({ initial, buildMode: 'manual' })`，init 写失败不启用，重试时 init 首写为准返回 `unchanged`。`combat-services.js` 新增只读的 `buildCandidates(names)`：不要求战斗开关，按卡组 / 技能角色、主角、传入的数值系统角色名去重，列出尚无 init 的 `{ name, protagonist, attributes }`，敌人档案不在其中，换聊天返回 `request-stale`；`lifeSource()` 另给 `names()`（已登记卡组 / 技能角色名）。`stats-runtime.js` 在本聊天为手动建档、六维来源就绪时设 `build-ask` 提示（一次一位：主角、卡组 / 技能角色、数值系统角色里第一位尚无 init 且未选过「自动 / 跳过」的），`noticeAction('build-ask', 'fill' | 'auto' | 'skip')`：`fill` 返回 `{ openPanel: 'build', name }` 且本次会话不再问这一位，`auto` / `skip` 经 `buildChoices` 按聊天保存；导出 `refreshBuildAsk`，bootstrap 在 `writeCombatManualInit` 成功后调用。bootstrap 另向界面注入 `statsBuildEntry()`（数值系统本聊天启用且为手动建档）与 `getCombatBuildCandidates()`。

- 剧情货币请求：`ensureCurrency / retryCurrency` 按当前聊天、epoch 与物品表客户端单飞；一次动作只调用一次模型，直接等待真实完成，不经通用 `ask` 的终止计时，也不因解析失败自动补发。bootstrap 的后台请求仅透传任务级 `signal / onSlow`，模型路由、默认/自定义提示词及其他后台任务的等待策略不变。慢通知保留同一 job，暂停、换聊天和销毁使旧结果失效；宿主不支持物理取消时，上游可能仍在运行。结果、通知、快照及可复制诊断保留 `stage / reason / status?`，不带 provider 正文或凭据；明确失败释放单飞后由用户显式重试。
- 货币恢复成功必须确认当前配置对应的权威物品余额：即使 `seeded=true` 且没有待写，也先确保物品表通道、失效缓存并读回；合法缺行是 0，表歧义、非法数量和读取失败保留 `stage:'read' / reason`，快照余额为 null。已有配置重试不请求模型、不再发初始金额。兑换恢复失败同样进入货币通知和诊断；业务已完成但钱包读回失败保留 `done:true / walletReady:false`，界面明确提示只重试读取，不重新提交兑换。失败通知只在原聊天和客户端租约仍有效时保留；成功读回才清通知并补推余额，推送失败不重做结算。
- `relationOp('money-config-read')` 先恢复待处理货币操作，再返回 `{ ok, config:{ name, table, rate }, base }`；`money-config` 仅接受完整 `name / table / rate / base`。`base` 绑定聊天及权威配置记录，过期提交拒绝；未知字段与 `initial / seeded / seed / balance` 均不可写。取消及无变化不追加编辑意图。
- 私有 `stats-currency-edit.js` 在既有货币队列内协调 `chat:currencyEdit` 原意图、guarded rename、新配置、完成标记，每阶段读回确认后才前进；编辑前先恢复旧兑换与楼层待写。本地意图经写后读回，仅用于补交原操作，不作为配置或余额后备。中断恢复不回滚名称、不重发初始金额、不重扣积分；冲突保留原因并停止写入。编辑进行中或待恢复时快照不报 ready、余额为 null，报价、兑换及后续货币写入串行恢复；已完成旧兑换仅确认结果，旧的未提交报价与新配置不符则拒绝。成功后补推当前动态货币映射；不提供跨表事务或跨页面锁。


- 0.36.90：人物参考补全传播 DNA 失败，固定角色资料保存显式续存；不在准备失败后假装就绪继续出图。恢复状态仅由视觉层呈现，core 不操作 DOM。

## 参考补图与恢复装配（0.36.88 本地草稿）

`character-reference-recovery.js` 为一致性任务补齐指定角色、指定衣装的人物参考；多人 DNA 先经现有 batch 入口一次准备，绘图仍由 generated-images 执行，保存按最新角色所属库合并。core 不向外部插件强加三景别协议。成功的配置提交通知等待中的原操作续接；关闭媒体所有者时中止挂起请求，下一次启动建立新所有者。


启动、设置恢复和成功保存时统一应用 `imageCache.maxCount` 与可选 `imageCache.compressDisplay`（默认 false），只装配 media 的缓存配置，不在 core 编码图片。开关清理仍通过既有 `igs:media-cache-cleared` 通知消费者，拒绝旧在途结果。

可选外部立绘建档由 `character-dna-store.js` 提供保存端口：按角色/卡的原归属捕获目标，基线不变才写单角色 DNA，经 `saveUnifiedSettings` 成功提交并回读后继续。合并视图只读；保存成功后由 UI 保存适配器同步该角色到已打开的草稿，避免关闭设置覆盖新 DNA，不提交用户其它未保存编辑。

自动立绘通过独立 `captureSpriteGenerationTarget` 直接捕获 core 目标；其有效性只依赖已生效资料及角色归属。DNA 保存端口的 UI 适配器 `withCharacterDnaDraftSync` 仅装饰 `save`，不改写 `isCurrent`。`matchesAssets` 复用同一目标快照验证保存时的草稿覆盖冲突；设置窗口的对象身份、开关和草稿输入不能决定普通生成任务是否有效。

0.36.88 迁移补全：启动、酒馆配置恢复和保存/导入统一调用 scene 的旧立绘迁移规划器，覆盖全局与全部卡库及全部阅读模式的标定。经 storage 的多键迁移日志与写后核验成功后才替换状态；失败保留旧状态并允许下次重试。图片结构迁移不启用生成，DNA 仍按角色显式升级；提示词文件确认后才清理迁移的临时持久副本。


0.36.88 本地草稿：装配生图预设运行时、剧情衣装和 CG 一致性服务，统一注入现有 host、store、mediaCache 与目标存活检查。core 只协调服务，不实现模板/画布/衣装业务；销毁仍等待媒体和各任务收尾，沿用 `shutdown()` 契约。

v0.36.57：core 将配置恢复与保存通知接到阅读器，阅读器合并刷新当前舞台；素材记录恢复仍由素材服务和媒体适配器负责。首楼读取不依赖设置器打开或回收任务的副作用。

v0.36.56：配置镜像实际提交或恢复后，core 通知媒体层进行一次引用复查；稳定运行不安排周期复查。具体备份差异与回收状态仍由 media 管理。

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

v0.36.43：保持 `IGS.destroy()` / `destroyIGS()` 的同步结果契约，调用即停用并解绑公共 API；新增 `IGS.shutdown()`，返回幂等 Promise，等待各清理步骤、媒体日志/回收和缓存连接关闭，成功为 `{ok:true}`，失败为 `{ok:false,reason,error}`。单个清理步骤失败不能跳过后续关闭步骤。重载必须等待 `shutdown()` 成功，不能在旧媒体所有者收尾期间启动新实例。

## 本地体验 2：数值钱包读取恢复

- `combat-services.statsTables()` 提供版本（宿主接口实例序号 + 共用表客户端版本），数值侧缓存可感知宿主替换及外部改表。
- `stats-runtime` 未能取得数据库接口时不缓存读取成功；聊天监听已建立也不跳过按版本读取。钱包读取通过既有 `ensureLoaded` 恢复当前聊天有效存档，在途写入时保持原保护，不写入或重结算原金额。

- v0.39.76：人物特性 `drawTrait({ signal, onPlan })` 先由宿主适配器保存并读取当前聊天独立种子，再按种子、角色 ID、已抽次数规划；保存失败不请求模型、不扣费。`onPlan({ rarity })` 只给揭晓展示规划结果。取消、切聊天、服务重置与宿主账本替换后拒收迟到结果。

- v0.39.84：`drawTrait` 对当前聊天及生命周期防重入，在途重复调用直接返回 `combat-trait-busy`；成功生成后将规划时的次数作为 `expectedDraws` 传入账本写前预检，次数过期则不入账、不扣费；该参数不进入历史载荷。换聊天或服务重置后不复用旧任务。
