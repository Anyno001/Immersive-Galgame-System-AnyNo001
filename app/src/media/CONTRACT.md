# media 模块契约

## 静态页缓存收敛（test-v0.36.65）

- 非活跃资源继续按 LRU 淘汰；当前页租约资源优先于预热。活跃图片本身的总量超过硬字节预算时，先拒绝后来读入的活跃图，保住已驻留图片，避免同一静态页图片互相挤出后不停重读。硬字节预算保持不变，租约释放后后续正常读取可重新接纳图片。
- `load()` 非空结果不代表中央缓存已经接纳资源；显示层就绪通知必须核实 `peek/get` 的可显示地址，不能用完成通知自行驱动无进展的重试。

## 图片读取失败分类（v0.36.59）

- 文件 `read/hydrate` 的内部 `strictRead` 模式保留网络、状态码和读取不完整错误：404/410 记为确认缺图，其它 HTTP、网络或超时错误为暂不可读取。默认读取接口仍保留空串与来源引用的兼容行为。
- 素材读取失败元数据登记在中央辅助预算内，最多 128 条 / 64 KiB；临时失败冷却 1500ms，确认缺图保留 30000ms，均在访问时过期，不安排定时重试或轮询。图片身份 token 变化或有效原图到达立即作废旧失败状态。

## 首次显示的恢复顺序（v0.36.57）

- 素材文件适配器暴露 `restore` 和 `hydrateImage`：前者复用 journal 的元数据恢复，后者只 hydrate 已取得的记录，不再次发起记录恢复。原有 `getImage/getImageRecord` 和本机读取后备保持兼容。`peekImageRecord` 只读本机记录、不等恢复，阅读器显示先用它，恢复在后台完成。
- 调用方先完成记录恢复及原始记录读取，再开始以图片身份为键的缓存任务，避免恢复中的引用失效取消首楼正在读取的图片。未知读取失败不在此处更改原路径或冒充像素可用。

## 变更驱动的备份与回收（v0.36.56）

- 四类记录只有本机版本、值或删除记录未被远程备份确认时才上传；已同步的记录不更新 `savedAt`，相同内容写入不增加版本。显式 `flush` 仍读取、合并并修复丢失的备份；回收使用 `onlyPending`，干净的记录直接跳过。
- 共享引用的回收候选持久保留为等待状态，不启动周期定时器。旧引用实际解除后重新入队；配置提交、恢复或脚本启动时可一次复查。写入租约与正式引用分开，暂被写入保护的候选在租约释放后唤醒；崩溃遗留的过期租约在下一次启动或手动重试时复查。
- 备份/像素搬家的自动尝试共用三次预算，真正的新记录变更或手动重试重置预算。回收的删除、备份阻塞或引用读取失败最多三次后暂停，错误和候选保留，重载不重置已暂停的回收状态。稳定状态下无媒体备份或回收定时器；写入中的租约续期不属于缓存扫描。
- `diagnostics` 补充备份 `retryPaused`、回收 `pausedDeletes`；设置可手动重试两类任务。删除前仍在提交锁中检查所有引用及写入租约，引用检查失败不能删除文件。

## 活跃资源优先（v0.36.51）

- 数量或字节压力下先按 LRU 淘汰无租约资源，全部非活跃资源淘汰后仍超过硬字节预算才处理活跃资源；数量上限仍允许当前页的租约资源超过软限制，字节预算不放宽。
- `createImageResourceCache.keyOf(url)` 暴露既有规范资源键，供当前页在异步加载及整楼预热前取得租约，不引入第二份像素缓存。

## 职责

- 提供通用图片池和媒体缓存。
- 管理本地文件、URL 图片、生成图片、Blob URL 和资源生命周期。
- 为 `backgrounds`、`characters`、`generated-images` 提供统一资源句柄。
- 自动插图的 tag 与图片持久化（`illustration-store.js`，IndexedDB，键 `chatId|messageId|swipeId[|slot]`）。
- 素材补全的图片与临时素材持久化（`generated-asset-store.js`，IndexedDB `igs-generated-assets`：`images` 存图片本体、`assets` 存本聊天临时素材、`floors` 记录楼层是否已处理）。
- 立绘抠图（`alpha-matte.js`）：从四边洪泛抠除与边缘连通的浅灰纯色底，边缘羽化 + 去溢色，并裁掉透明留白；无 canvas 时原样返回。调用方传的 `alreadyTransparent` 只是预期：没传时先用 `hasTransparentBorder` 看四边，过半像素已透明（智绘姬 / 柏宝绘接 NAI V5 等直接回透明底）就只裁边、不洪泛，`diagnostics.detectedTransparent` 为 true；否则透明像素的 RGB（多为黑色）会被当成底色，把深色描线和黑发一起抠掉。「从原图重新自动抠图」同样走这条判断。
- CG 库（`cg-library.js`）三层数据分开：目录（`cg-index-store.js`，IndexedDB `igs-cg-index` 的 `entries`，每张 CG / 照片一条轻记录，不含图片）、缩略图（统一 `igs-image-cache`，键 `thumb:cg:<key>:<stamp>`，320 宽 JPEG；`stamp` 由 `cgEntryStamp` 使用 `updatedAt` 与可选 `revisionToken` 生成，旧记录沿用时间戳；`igs-cg-index` v2移除旧 `thumbs`）、原图（`igs-illustrations` / `igs-photo-album` + 酒馆文件，只在看大图或生成缩略图时读）。打开 CG 库只读目录；对账只比主键（`getAllKeys`），只读缺失 / 未就绪及本实例已提交但目录同步失败的槽位，每批 20 条。`withCgIndexSync` 让 `putSlot` / `updateSlot` / `deleteSlot` 同步目录；目录失败不撤销已提交图片。每一步都有期限（`CG_LIBRARY_TIMEOUTS`），失败带原因码，`cgReasonText` 转中文。`idb-connection.js` 统一 IndexedDB 连接：打开超时 8 秒、被挡住直接报错、`versionchange` 时关闭让路、事务 20 秒超时。`parseFloorKey` / `parseCgSlotKey` 从右取两段解析（chatId 可含 `|`）。`cg-gallery-store.js` 只存隐藏 / 收藏标记；删除调用 `clearIllustration`，成功后才清标记和目录。

  - `createAlphaMatte()(dataUrl, { detailed: true })` 返回 `{ dataUrl, alphaMaskDataUrl, diagnostics: { crop, sourceWidth, sourceHeight } }`；不传 `detailed` 时仍只返回字符串（旧契约）。遮罩为 RGB=alpha 的不透明 PNG，与透明结果同尺寸。
- 生成图片记录 schema v2（`generated-asset-store.js`）：立绘额外保存不可变 `originalDataUrl`、最近接受的 AI 重建 `workingDataUrl`、当前遮罩 `alphaMaskDataUrl`、自动抠图裁边 `matteCrop` 与 `revision`；`dataUrl` 始终是当前透明结果，供旧消费者读取。只有 `dataUrl` 的旧记录按 legacy 读取，不伪造原图、不可编辑。`updateImage(id, expectedRevision, patch)` 在同一 readwrite 事务内校验 revision 后写入，`originalDataUrl`/`id` 永不改写；失败原因为 `not-found` / `source-unavailable` / `stale-revision` / `empty-result`。写入完整记录遇存储额度错误时降级为只存透明结果，并在素材记录上标 `sourceUnavailable: 'quota'`。
- 遮罩编辑（`matte-brush.js` 纯函数、`matte-edit-session.js` 会话）：保留 / 删除 / 软边画笔、坐标映射回原像素、有界撤销重做（默认 20 步，只在内存中）；会话不写存储，由调用方保存。

## 子能力

- `image-pool`
- `local-pack-store`
- `url-pack-store`
- `generated-image-store`

## 边界

- URL 图片只在当前渲染页实际需要时加载；同一地址共享加载任务与会话缓存，缓存必须有界，并在销毁或淘汰时释放 Blob URL。
- `media` 不决定哪张背景或立绘应当显示，只提供资源读写与缓存。
- 背景匹配属于 `backgrounds` / `scene`。
- 角色匹配属于 `characters` / `scene`。
- 生图请求、轮询和 provider 适配属于 `generated-images`。
- `png-validation.js` 对重绘原图／蒙版采用完整容器 16 MiB 应用输入上限，在 base64 切片、解码和 CRC 遍历前核验编码长度与 padding 推导字节数；超限返回 `png-input-limit`。校验签名、chunk 边界／顺序／CRC、IHDR 格式、请求尺寸与像素上限；支持合法 Adam7 和连续分块 IDAT。解压输出受 IHDR 各 pass 推导的精确扫描行长度约束，并检查 zlib、过滤器与调色板索引。输入上限不是 PNG 理论极限，冗余 chunk／元数据编码仍可能被拒绝；不假设压缩输入必然小于原始扫描行，不记录图像载荷。
- 用户上传字体（`custom-fonts.js`）：文件存酒馆 `user/files/igs-font-*`，清单存 localStorage `igs-custom-fonts-v1`（随全局配置同步）；用 FontFace 注册到宿主 document，渲染只读 font-family 栈。
- 酒馆图片搬家（`tavern-image-files.js`）只在整条记录未被改写时落盘，避免用旧记录覆盖期间保存的提示词等字段。
- 一致性工作画布（`cg-reference-canvas.js`）以冻结 plan 保留原图 `rect` 支持区、`crop`、统一 `scale`、工作/参考布局及独立 `uploadMask`。上下文仍为原图短边 10%，工作/参考分配仍为 75/25，参考使用完整人物图的非透明像素边界等比 contain，仅修剪完全透明外沿；旧头像标定不用于衣装参考，`referenceContent`、图像摆放与 caption 中心取同一 plan；请求尺寸保持 64 步长及 1024² 像素上限。RGB、人物中心和回贴沿同一比例映射；工作内容及蒙版下保留原 CG 像素，边缘延续 crop 样本，参考只绘入辅助区。上传蒙版在最终工作尺寸覆盖必要完整 8 像素网格，RGB 仅黑白、alpha 恒 255；参考区及网格范围外为黑色，保护留白不开放。网格的小幅扩张不扩大原图回贴范围。回贴保留原圆角支持区，采用 `max(1,min(12,side*0.02))` 原图像素内侧 smoothstep 窄带，同时约束原坐标与采样点，内区完整采用结果、原 alpha 和支持区外 RGBA 保持，不按生成强度再次整体混合。最小窄带经栅格采样可能直接过渡；缩放往返存在取整误差。粗区域不是分割，离线几何验证不保证模型保姿、真实接缝或身份效果，候选仍需用户复验。
- 一致性接受经 `updateSlot` 的 revision/token 与提交门禁写入：保留原 CG 提示词、caption、recipe、DNA／衣装快照与手改标记，各局部模板及实际 `infill` 来源单独存于 `consistencyPrompt.version: 1` 的 `rounds`。`clearSentPrompt: true` 清除合成图上的旧整图 wire，保存的 `prompt` 同样不沿用旧 wire。首次基线保留原图及实际存在的提示词、来源和尺寸字段，不写可选 undefined 字段。文件 offload／备份恢复保留嵌套轮次与基线；无该字段的旧记录继续原形读取。文件上传与 IndexedDB 不共有事务，拒绝提交时只清理新文件，不宣称跨系统原子性。
- `updateSlot` 可接收事务外的异步 `beforeCommit` 与事务内的同步 `shouldCommit`。文件适配器在 offload 后执行一次 `beforeCommit`，再将剩余选项交给原存储；直连内存／IndexedDB 存储在启动提交前执行复核。复核失败或最后同步守卫拒绝时保留原记录，只清理本次新文件；守卫及租约令牌不持久化。
- 一致性接受替换同一 CG 槽位，复用现有图库与删除入口。`withCgIndexSync` 的目录写失败待修集合仅在当前实例内存中；对账按完整槽位 key 定向补登记，不是持久任务队列。`refreshEntry(key)` 从权威槽位存储重读并保留隐藏／收藏状态，只有确认记录不存在才移除目录，读取失败不伪装删除。图库通过 `ILLUSTRATION_UPDATED_EVENT` 按 `chatId/messageId/swipeId/slot` 刷新同槽目录、缩略图及已打开大图；版本变化清内存缩略图，迟到旧版本结果不得覆盖新版本，视图销毁解除订阅。
- 生成图片删除由素材服务统一核对当前素材、原始全局／角色卡衣柜、待确认衣装、旧预设及已保存 CG 的嵌套来源引用，复用 `collectGeneratedImageIds`。`protectedAssetImageIds` 分批读取原始槽位记录，不 hydrate 图片；目录变化、读取失败或酒馆备份未可靠读全时返回 `image-reference-unavailable`，不把未知当无引用。
- `deleteImage(id, { beforeDelete })` 在文件层异步读图后、底层删除前复核；守卫拒绝返回 `{ retained: true }`，被引用的图片不清缓存或文件。丢弃候选仍保留其被引用的图片 ID。`listSlotKeys({ requireComplete: true })` 要求备份恢复完整，普通阅读入口保持原语义。批量清理不承诺整批回滚，跨配置／CG 库／图片库及标签页不存在共同事务；复核降低迟到引用风险，不提供跨系统原子保证。

## 统一生命周期（v0.36.39）

- 图片像素、派生缩略图、对象 URL、下载和预载任务由 `tavern-image-cache.js` 管理。默认 320 个内容条目，设置允许 1–2000；内存编码字节预算 64 MiB，磁盘 192 MiB。当前页面通过 `media-lease-scope.js` 持有资源键，活跃资源可超过条目数软限制，字节预算仍为硬限制。浏览器解码/GPU/HTTP 缓存由浏览器管理，不包含在该字节统计里。
- 磁盘 schema v3：`files` 按内容身份存一份 Blob，`meta` 存路径别名与 LRU 信息；两者同事务。v1/v2 升级只清可再生缓存。旧素材缩略图库删除，CG 目录保留。业务层不得另建原图 Map、对象 URL 或无限预载缓存。
- 新文件使用像素字节 SHA-256，统一到 `user/images/igs-media/<sha256>.<ext>`。非安全 HTTP 环境用分片 SHA-256 后备实现。持久记录只存文件路径；上传失败时原始像素留在业务数据库并标记待上传，重试成功后才能宣称备份完成。
- 四类文件适配器共用 `media-record-journal.js`：先准备 WAL，提交业务事务，再标记日志完成；备份 v2 保存版本、删除标记和前一版文件引用。未提交的离线像素可临时保留在 WAL，提交后移除，不能当可再生缓存清空。
- 元数据查询用原始记录；显示只 hydrate `dataUrl`，编辑/导出才显式 hydrate 所需字段。读图失败返回空显示结果，不改原始路径；缺少原图/遮罩的记录不得冒充可编辑完整记录。
- 新引用持久化成功后才释放旧引用。物理删除统一进 `media-file-gc.js`：备份成功后，在同一提交锁里检查全部媒体/配置引用和持久写租约再删除；网络错误保留队列，共享引用保护与真正删除失败分别统计。恢复备份会根据前一版引用重建删除任务。
- 同源提交与磁盘预算用 Web Locks；缺失时用 IndexedDB lease 锁。BroadcastChannel 通知缓存清除/单键失效。清理增加世代、取消旧请求和 FileReader、撤销对象 URL；下载最多 4 路。销毁关闭通道和缓存连接，旧任务不得回填。
- `IGS.media` 提供 `clearCache/stats/auditImages/auditFiles/collectImages/flush/retryDeletes/destroy`；孤儿图片先审计，删除仍复查引用。旧文件名恢复只接受可验证归属，不猜 Unicode/截断名称；旧哈希按真实键与内容校验。目录 listing 短期共享，不永久缓存缺图结果。
- 酒馆文件接口不提供 CAS：版本合并、写后校验与重试依赖本机日志仍存在，不能保证多设备同时写入无丢失或提供跨设备强删除隔离。完整库存、兼容条件和验收边界见 `docs/MEDIA_REFACTOR.md`。

## 文件适配器依赖方向（v0.36.40）

`tavern-image-files.js` 只提供底层文件读写，禁止反向导入或导出 `tavern-generated-assets.js`、`tavern-illustrations.js`、`tavern-photos.js`。业务适配器由 core 直接装配。按用户 2026-10-15 指令，构建只生成发布文件，不自动执行启动检查或全量门禁。排查启动时直接下载并执行实际产物，分别记录下载内容、执行环境与 API 是否创建；仅导入源码、HTTP 200 或构建成功不构成启动验收。

## 缓存所有权（v0.36.41）

- 每个中央图片缓存持有一个 `media-cache-registry.js`。所有可再生辅助缓存经 `auxiliary.createMap/register` 登记；容量、TTL、负缓存规则集中在 `MEDIA_CACHE_POLICIES`，统计返回用途、条目数、容量或作用范围、过期规则和在途数量。新缓存必须加入此处，不能再自行维护不可见图片 Map。

v0.36.43 补充：业务工厂必须显式接收中央 `mediaCache`，或使用所注入的 index/thumb 适配器持有的同一实例；缺失、不同所有者或已销毁时立即报错，不私建缓存。辅助元数据共享 16 MiB 估算预算，并有每个所有者的字节预算；这不是浏览器真实堆上限，也不计浏览器像素、GPU 或临时加载/编辑工作区。普通可再生索引按条数和字节淘汰；素材/物品记录各 4 MiB，按需逐条读取和淘汰，缓存拒绝接纳不影响本次查询返回值。CG 视图目录最多 8 MiB，整份接纳或明确失败。素材/物品补图必须直接查询权威数据库，禁止把缓存未命中或读库失败当作无记录；过期查询拒绝等待者，重新读取可恢复实际读取失败。`stats().auxiliary` 暴露总估算、总预算、拒绝次数，以及每项估算、预算和读取错误。

中央 `destroy()` 同步失效并返回幂等 Promise；`disposeLocalImageCache` 等待全部日志、回收和缓存收尾后才释放宿主实例，即使某项失败也不能提前放行新实例。销毁解绑 document，后续查询不能继续使用旧所有者。
- 消息关联只保存资源键和外部地址。读取时重新调用中央 `peek`；中央句柄失效则返回未命中，重新读取消息/provider，不能缓存或返回已撤销 Blob URL。元数据不复制图片字节。
- 临时素材与物品由 `asset-record-cache.js` 共用按需读取器，最多一个当前聊天范围；单条显示记录和仅含键的分页索引共用同一个登记预算（各 4 MiB / 512 条）。缓存 miss 不等于数据库无记录；生图和修改直接 fresh 查询权威库。`getAsset` 返回完整记录，`queryAssets` 必须限定聊天或楼层，游标最多保留 100 条（默认 24）；总数逐条计数，不装载全部记录。切聊天、清理、销毁与本机写入使旧查询失效，迟到结果不得覆盖新记录。UI 未展示的 tags、description 等字段不得被投影写回截断。
- 中央 `clear/destroy` 先失效图片任务，再统一清理辅助所有者。UI 的 `onClear` 只通知重读和重绘，不负责逐模块兜底清缓存。地图释放资源与租约；立绘和目录取消旧读取；CG 视图重读目录，旧缩略图不回填。脚本窗口与宿主 document 用 `bindImageCacheDocument` 共享同一个媒体所有者。
- 立绘失败与 CG 库缩略图失败 30 秒过期，CG 缺图 1 秒；地图失败 30 秒；旧目录查询完成后保留 2 秒。过期在访问与统计时清除，条目还有独立容量上限；在途目录查询受 HTTP 期限和清理取消约束。CG 库仍支持即时手动重试。
- 无 IndexedDB 时仅有中央编码字节内存层，诊断 `backend: memory-only`、磁盘预算/占用为 0。IndexedDB 访问失败报告 `unavailable` 和错误，不分配另一个内存库。显式注入的内存测试适配器保留，但标记 `memory-adapter` / `persistent: false`，禁止当作生产磁盘后备。64 MiB 只指图片编码字节，不包含元数据、当前编辑会话或浏览器解码/GPU/HTTP 缓存。
- 清缓存不删除原图文件、业务数据库（包括目录中保留的收藏/隐藏字段）、用户设置、备份、WAL、删除日志或撤销记录。


## 按需记录与恢复（v0.36.44）

- `getAssetsByChat/getAssetsByFloor` 保留存储兼容能力，生产补图和显示不再依赖这些全量读取；新增 `getAsset/queryAssets` 也必须先完成 journal 恢复。数据库版本和持久记录格式不变。
- 注册表总预算有压力时按所有者使用时间淘汰其他可再生 Map 的旧条目，持久数据库/WAL/图片文件不参与淘汰。单条拒绝缓存仍由异步读取返回，不能抛业务容量错误。
- 待确认列表每页 24 项，前后翻页和准确总数；读取失败显示重新读取入口，恢复后允许重试当前聊天暂停的补图。失败抑制 1 秒后允许重新查询，缺记录缓存 2 秒，显式重新读取绕过两者。
- 手动物品列表 `listItems(options)` 返回异步分页结果 `{ records, hasNext, hasPrevious, firstKey, lastKey }`，不是全部聊天快照。
