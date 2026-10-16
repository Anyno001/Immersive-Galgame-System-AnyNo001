# media 模块契约

## 职责

- 提供通用图片池和媒体缓存。
- 管理本地文件、URL 图片、生成图片、Blob URL 和资源生命周期。
- 为 `backgrounds`、`characters`、`generated-images` 提供统一资源句柄。
- 自动插图的 tag 与图片持久化（`illustration-store.js`，IndexedDB，键 `chatId|messageId|swipeId[|slot]`）。
- 素材补全的图片与临时素材持久化（`generated-asset-store.js`，IndexedDB `igs-generated-assets`：`images` 存图片本体、`assets` 存本聊天临时素材、`floors` 记录楼层是否已处理）。
- 立绘抠图（`alpha-matte.js`）：从四边洪泛抠除与边缘连通的浅灰纯色底，边缘羽化 + 去溢色，并裁掉透明留白；无 canvas 时原样返回。
- CG 库（`cg-library.js`）三层数据分开：目录（`cg-index-store.js`，IndexedDB `igs-cg-index` 的 `entries`，每张 CG / 照片一条轻记录，不含图片）、缩略图（同库 `thumbs`，320 宽 JPEG，`stamp` 使用条目 `updatedAt` 与可选 `revisionToken`，旧条目沿用时间戳，CG 同槽替换后自动作废）、原图（`igs-illustrations` / `igs-photo-album` + 酒馆文件，只在看大图或生成缩略图时读）。打开 CG 库只读目录；对账只比主键（`getAllKeys`），只读缺失 / 未就绪及本实例已提交但目录同步失败的槽位，每批 20 条。`withCgIndexSync` 让 `putSlot` / `updateSlot` / `deleteSlot` 同步目录；写入按实际保存结果登记，目录失败不撤销已提交图片。每一步都有期限（`CG_LIBRARY_TIMEOUTS`），失败带原因码，`cgReasonText` 转中文。`idb-connection.js` 统一 IndexedDB 连接：打开超时 8 秒、被挡住直接报错、`versionchange` 时关闭让路、事务 20 秒超时。`parseFloorKey` / `parseCgSlotKey` 从右取两段解析（chatId 可含 `|`）。`cg-gallery-store.js`（`igs-cg-gallery`）只存隐藏 / 收藏标记；「删除」调用 `clearIllustration`（楼层 CG 同时消失），成功后才清标记和目录。

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