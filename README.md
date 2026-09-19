# Immersive Galgame System

JS-Slash-Runner（酒馆助手）Immersive Galgame System 项目。

## 当前定位

- 显示名：沉浸式Galgame系统（Immersive Galgame System）
- 内部代号：IGS
- 全局对象：`window.IGS`
- 完整对象：`window.ImmersiveGalgameSystem`
- CSS 前缀：`.igs-`
- DOM 属性：`data-igs-*`
- 存储前缀：`igs:*`
- Mod 后缀：`.igs-mod.js`
- 预设后缀：`.igs-preset.json`
- 资源包后缀：`.igs-pack.json`

## 当前状态

- 阶段：最小闭环已接通
- 形态：独立 app 工程，已有 Node 原生测试与验收闸门
- 当前项目版本 `v0.23.35`：精简并修复「楼层内嵌」阅读区——移除“最新回复/页数”元数据行；全局隐藏 IGS 阅读器、设置页与数据库面板的原生滚动条但保留滚动能力；将内嵌对话框约束在容器内，正文内部滚动，发送框固定留在可视范围。
- `v0.23.34`：调整「楼层内嵌」工具按钮——收纳与关闭两枚浅色 SVG 独立悬浮在阅读器右上角，不再贴着对话框；移除工具条底色、描边、阴影与毛玻璃，其他阅读模式保持原样。
- `v0.23.33`：修复「楼层内嵌」真机流式生命周期——新 AI 楼层出现或 `.mes_text` 被宿主重绘时持续隐藏原文，只显示固定高度载入动画；改用酒馆生成起止事件收尾，生成完成后一次性换源并退出动画，后续普通 DOM 更新不再误触发载入态。
- `v0.23.32`：新增第五模式「楼层内嵌」——阅读器固定挂在最新 AI 楼层正文区，流式阶段只显示固定高度载入动画，完成后一次性解析；上下轮仅切换内部阅读源、不触发酒馆跳楼。正文解析加入 8 项有界缓存，普通翻页不再重复整楼解析；设置页在霜夜平面风基础上恢复 8/6/4px 轻圆角。
- `v0.23.31`：统一设置页改为「霜夜」配色的平面极简界面；移除毛玻璃、投影、渐变、发光与大圆角，使用深灰分层、四级灰文字、2px 克制圆角和背景/文字色交互反馈；DOM、设置字段、事件与存储行为保持不变。
- `v0.23.30`：修复酒馆助手脚本作用域中的词法全局 `eventOn/getButtonEvent` 未被 loader 发现的问题；QR「Gal模拟」现在优先解析脚本直接作用域，再回退到窗口与 `SillyTavern` API，保留加载中待打开、重复绑定防护与 fail-open。
- `v0.23.29`：新增酒馆助手 QR 按钮入口「Gal模拟」——`button.enabled=true` + `buttons:[{name:'Gal模拟',visible:true}]`，点击经 `eventOn(getButtonEvent('Gal模拟'))` 委托 `IGS.openLatestAvailable()` 打开最新阅读器；支持主程序未就绪时的一次待打开队列、重复启用时复用订阅不重复注册、QR API 缺失时降级不影响其余入口；按钮元数据由 `build-loader.js` 统一生成。
- `v0.23.27`：三组修复：①鉴定建议表骰子命令丢失——`extractOptionTexts` 返回 `{display,send}[]`，检定建议表有 `骰子命令` 列时 `send=展示文本+骰子命令`，气泡显示用 `display`、点击发送用 `send`；②监听器累积→点击对话框跳首/末页——`applyReaderSnapshotToDom` 为 `send/clickLayer/dialog` 加 `data-igs-bound` 守卫，DOM 复用后不再每次渲染重复绑定；③模式切换内联样式残留→切换全屏/网页全屏无效——`applyReaderModeRuntime` 在切换模式前调 `resetInlineModeStyles` 清除`applyInlineReaderRuntime` 写入的 width/height/transform 等残留值。
- `v0.23.28`：迁移到 `Anyno001/Immersive-Galgame-System-AnyNo001`，同步自动更新/调试 loader、公开仓库文档与发布入口；未改写历史版本记录，旧固定版 loader 仍按其原始 tag 保留。

- `v0.23.26`：修复四个问题：①背景图/立绘每轮重载——`hydrateReaderMount` 改为只在首次挂载时重建 DOM，后续渲染复用已有节点，浏览器不再对相同 URL 重新发起加载；②全屏模式吞掉 vertin-tips 提示音——`requestFullscreen()` 前在用户手势链仍有效时提前 resume 一个无声 AudioContext，保留浏览器音频自动播放许可；③网页/全屏模式下手机方向感知——新增 `syncOrientationClass` 及 `orientationchange`/`screen.orientation.change` 双监听，横屏时在 root 上挂 `igs-landscape`、竖屏时挂 `igs-portrait`；④Veridis 关键词残留——`rerenderActiveReader` 每次重建前先调 `readLiveVisibleText` 刷新最新 DOM 可见文本，解决生成结束后 Veridis 异步写回导致阅读器显示原词的问题。
- `v0.23.25`：修复阅读器漏读 Veridis 关键词替换的问题。根因是 `domClobbersDirectiveTags` 标志把 DOM 文本覆盖路径整体拦截——宿主会把 `[igs-*:]` 标签从渲染层清洗掉，导致该标志永远为 true，Veridis 改词对阅读器完全无效。修复：将 DOM 文本覆盖和场景指令提取来源解耦；覆盖照常执行（让 Veridis 替换词进阅读器），指令始终从数据层原文提取；同时引入 `buildDomCompareBase` 在 `domClobbersDirectiveTags` 时用格式化后去标签行的纯文本做长度比对基准，避免标签内容撑大数据层长度后被误判为不同内容。
- `v0.23.24`：修复场景素材模式下 `[igs-scene:]` 标签在阅读器正文中可见、以及背景图从错误页面才开始插入的问题。根因是 `buildReaderSnapshot` 从含标签的 `formattedText` 重新构建分段——标签行成为幽灵分段导致坐标系错位。改为构建分段前先用 `stripSceneDirectiveLines` 过滤 `[igs-scene:]` 行，两个 bug 同时消除。
- `v0.23.23`：再修移动端对话框左下角漏直角。根因是 floating 对话框 `transform:none` 不创建合成层，移动端在 `#igs-bg`（带 filter 的合成层）之上渲染时，对话框圆角缺口处把背后黑渐变渲染成直角硬边（桌面 pc 模式用 `translateX(-50%)` 本就是合成层故正常）。改 floating 对话框 `transform:translateZ(0)` 补合成层；移除上版无效的 `isolation:isolate`。
- `v0.23.22`：清理 loader 冗余，改为锁定 tag 的固定版 loader 机制。
- `v0.23.21`：①对话主题取消预设下拉、恒自定义；②分割线只留渐变线/无；③场景预设框统一样式；④修复对话框左下角漏直角。
- `v0.23.20`：修复顶部固定工具栏横向滚动用手指滑不动的问题，改为照搬数据库标签栏的 JS 指针拖拽滚动。
- `v0.23.19`：（真机滑动仍无效，被 v0.23.20 取代）顶部固定工具栏横向滚动尝试：放得下时 `space-evenly` 平均铺满，放不下时 JS 检测溢出切 `flex-start` + `touch-action:pan-x`。
- `v0.23.18`：修复三个 bug——①顶部固定工具栏下选项气泡向上生长被工具栏遮挡/截断（新增气泡 `top` 避让规则，超出走滚动）；②正文 `<content>` 带属性时 text-pipeline 正则匹配失败、兜底吐出含思考草稿的全文（正则统一为容忍属性 `<tag\b[^>]*>`）；③检定建议表的选项气泡把整行所有列都当选项（改为只取「展示文本」列，选项表宽表行为不变）。
- `v0.23.17`：修复「顶部固定」工具栏按钮过多时溢出、设置键和退出键被挤出屏幕点不到的问题。按钮区改为横向滚动（隐藏滚动条），设置 ⚙ 与退出 × 固定在右侧不随之滚动、始终可见可点。
- `v0.23.16`：设置 → 阅读器新增「图片亮度」百分比下拉（50%~100%，默认 88%）。背景图亮度此前由 CSS 硬编码 `brightness(.88)` 全局压暗，现改为按 `readerSettings.imgBrightness` 用 inline style 控制，想要原图亮度可调到 100%。
- `v0.23.15`：修复「顶部固定」工具栏没有铺满、按钮全挤在右侧的问题。顶部模式改为按钮区 `flex:1 + space-evenly` 平均铺开整条，退出（×）键独立靠最右角；并取消顶部模式下的工具栏缩放（缩放只用于悬浮小条，全宽栏缩放会从角落缩成异形）。
- `v0.23.14`：阅读器工具栏新增「顶部固定」位置（设置 → 阅读器 → 工具栏位置：悬浮 / 顶部固定）。选「顶部固定」时工具栏从悬浮气泡改为完全贴在页面顶部、横贯整条、方角无圆角阴影（沿用现有玻璃材质）；该模式下隐藏「收纳/展开」按钮、按钮区始终显示。默认仍为「悬浮」，老用户无感。
- `v0.23.13`：选项气泡宽度可配置。默认宽度跟随对话框实际渲染宽度（正上方居中=满宽，左/右上角=半宽），文字超宽才换行、不随文字长短抖动；新增「气泡宽度随文本变化」开关恢复旧的随文字行为；气泡位置新增「右上角」。同时修复 `getOptionBubbleConfig` 手动挑字段、把 `position=top-right` 与新开关静默丢弃的 bug。
- `v0.23.12`：阅读器选项气泡新增识别数据库表名「检定建议表」，作为「选项 / 选项表 / 行动选项」之外的又一别名（互斥出现，命中任一即作为选项来源）。改 `OPTION_TABLE_NAMES` 一处即生效，同步更新设置面板与 toast 文案、回归测试断言。
- `v0.23.11`：彻底修复场景素材模式下角色名/分割线不显示、`[igs-char:]` 与 `[igs-thought:]` 标签写的对白/心理话在阅读器丢失的问题。真机 CDP 探针定位真实根因：宿主 DOM `.mes_text` **保留**了原始 `[igs-*:]` 标签且与数据层有词级差异，触发 `dom-visible-override`，但 override 分支直接 `formattedText = domVisibleText` **未跑正文格式化**，标签没被转成 `[名]：…` / `*…*` 形态，导致阅读器把整段当旁白、角色名/分割线/标签心理话全部丢失（v0.23.10 的标签清洗守卫方向只覆盖了一半场景，未解决真机问题）。现 override 分支对 DOM 文本补跑 `applyImmersiveGalgameSystemBodyFormat`，并保留 v0.23.10 的「DOM 清洗标签时不覆盖」守卫；3 个回归测试覆盖：DOM 含标签 override 后正确格式化、DOM 清洗标签时不覆盖、两侧均含标签仍按词级覆盖。
- `v0.23.9`：修复阅读器设置保存回归。普通阅读器设置保存不再把当前 reader 强行切回 `bridge.openMode`，旧 readerSettings 缺 `_v` 时不再整包清空，心理页真正使用 `thoughtFont/thoughtColor/thoughtAlign`；新增回归测试覆盖打开后旧设置保留、显式 openMode 切换、角色名/分割线、心理页主题和 mode 不一致时的立绘布局。
- `v0.23.9`：修复阅读器设置保存回归。普通阅读器设置保存不再把当前 reader 强行切回 `bridge.openMode`，旧 readerSettings 缺 `_v` 时不再整包清空，心理页真正使用 `thoughtFont/thoughtColor/thoughtAlign`；新增回归测试覆盖打开后旧设置保留、显式 openMode 切换、角色名/分割线、心理页主题和 mode 不一致时的立绘布局。
- `v0.23.4`：修复手机版阅读器读不到关键词过滤插件（如 Veridis）改后正文的问题。根因有两处：①IGS 读正文时优先取数据层 `chat[n].mes`，而 Veridis 在移动端宿主下回写 `mes` 滞后甚至只改 `.mes_text` 渲染层不回写，导致读到改前旧词（PC 因 `saveChat` 同步回写而正常）；现 `buildIgsTextPayload` 增加「DOM 差异优先」：当 DOM 可见文本与数据层纯文本仅为词级差异（长度量级接近、编辑距离占比 ≤50%）时改用 DOM 文本，结构性不同则仍保留原文。②点「刷新」时只重扫图片和重解析配置，`visibleText` 仍是打开阅读器那一刻的旧 DOM 快照；现刷新会按消息 ID 重查 `.mes` 节点重抓最新渲染文本。新增 2 个单测覆盖词级覆盖与内容不同时不覆盖。
- `v0.23.3`：修复最后一页输入框点击会穿透触发选项浮窗、背景图点击会翻页的问题。根因是 `#igs-dialog-layer` 为 `pointer-events:none`，但 `.igs-dialog` 没有显式恢复 `pointer-events:auto`，输入区真实点击可能穿透到 `#igs-click-layer`；同时 click-layer 的空白点击逻辑在选项触发后仍兜底执行下一页。现改为背景 click-layer 只处理恢复隐藏、关闭设置和选项浮窗触发，不再翻页；对话框点击只负责左右翻页且排除输入区/工具栏/设置；选项浮窗触发排除对话框、工具栏和输入框。
- `v0.22.8`：修复数据库面板四个问题（Playwright 真机验证）。①标签栏溢出后电脑/手机都无法滚动、看不到后面的标签：加标签栏拖动滚动（pointer 事件，鼠标按住拖+手机触摸拖，拖动后抑制误触发切换），保持单行不折行、滚动条隐藏。②行数>8 时看不到后面的行、竖向滚不动：真因是 `#igs-db-inner`（body 的实际 flex 父级）无 flex 样式，table 把它撑破溢出面板、`flex:1+min-height:0` 失去高度约束；现给 inner 加 `flex:1;min-height:0;display:flex;flex-direction:column`，body 成为唯一纵向滚动容器、表头 sticky 钉住（背景调至不透明防透色），去掉多余 table-wrap 层、横向滚动条隐藏。③新增行后空格子无法编辑：真因是 `data-db-edit` 挂在内层 span 上，空 span `display:-webkit-box` 无内容时塌缩成 0×0 无点击区；现移到 `<td>`（有 padding/列宽，空格子也可点）。④对话框+数据库面板毛玻璃对齐工具栏质感：`backdrop-filter` 由 `blur(32px) saturate(180%)` 提升到 `blur(48px) saturate(220%)`，透明度仍由「毛玻璃浓度」可调。新增 DB 面板渲染回归单测。
- `v0.22.7`：修复 v0.22.6 矫枉过正——上一版 floating（pc/mobile）模式直接忽略「对话框高度」，导致 PC/手机端怎么调都无效。现 floating 模式下 dialogHeight 改用 `.igs-dialog` 的 `min-height`（把气泡撑到目标高度，内容更多时自然增长）+ `max-height` clamp 到浮窗可用高度（约 86%），不再写死 `height`（固定 height 比内容小时会把输入框挤出气泡）。Playwright 真机验证：dialogHeight 60→600 气泡高度跟随、输入框恒在气泡内不溢出、气泡始终在视口内。
- `v0.22.6`：修复 v0.21.4 删桶（全模式共用一套设置）+ v0.22.5 改挂载点后引入的两类 UI 回归，已用 Playwright 真机验证。①设置面板被阅读器盖住（PC 网页全屏/浏览器全屏、移动端全部模式）：根因是 overlay 挂 documentElement、设置面板仍挂 body，宿主 `body{position:fixed}` 形成独立层叠上下文把设置面板整体压在 overlay 之下（z-index 翻不出 body）；现设置面板与 overlay 一致挂 documentElement。②floating（pc/mobile）模式「对话框高度」≥130 把输入框挤出气泡（真机实测溢出 +43px）：根因是用内联 min-height 强撑 `.igs-text`；v0.22.6 改为忽略 dialogHeight（v0.22.7 修正为改气泡 min-height）。③「输入框高度」(inputScale) 从 `controls.style.zoom` 改为直接设 `#igs-input`/`#igs-send-btn` 高度，避免 zoom 改变占位高度干扰 flex 布局。
- `v0.22.5`：修复移动端阅读器被压成一小块（立绘/输入框看似溢出的真因）——宿主移动端 body 为 position:fixed 且尺寸受限，成为 `#igs-overlay` 的 fixed 包含块，`width/height:100%` 取到 body 尺寸而非视口；现 overlay 改挂 documentElement、尺寸用 `100vw/100vh`（保留 100dvh 兜底）。顺带清理 igs-compat / reader-state 两处老桶残留读取，统一回退 default 桶。
- `v0.22.4`：修复 v0.21.4 删分桶的总根源回归——`saveUnifiedSettings` 曾按 readerMode 分桶存、`getUnifiedSettingsSnapshot` 却固定读 default 桶，导致移动端保存的设置（含立绘 spriteLayouts）读不回（立绘保存后回初始位置、输入框/发送按钮被挤出的真因）；现统一存取 default 桶，老用户 default 空时回退旧桶。立绘预览图放大改挂 `#igs-unified-settings`（absolute 填满），修复移动端宿主 body 高度坍缩导致预览只占顶部一条、看不到关闭区的问题。新增 2 个回归单测。
- `v0.22.3`：修复4个问题——①场景/时间/天气背景查表改为「精确→组归约→默认」三级兜底（对齐情绪词逻辑，AI 写细分词可命中组名 URL）；新增 `{{scene_groups}}`/`{{time_groups}}`/`{{weather_groups}}` 占位符（默认模板已含，可 DIY 删除）；②立绘保存后回初始位置回归（空 mood 存 `mode::char` 与读取侧对齐）；③数据库表格色跟随 glassOpacity（CSS 变量驱动表头 sticky 背景）；④数据库面板默认右上角缩小。
- `v0.22.2`：新增数据库前端面板——阅读器工具栏增加数据库按钮，独立悬浮窗，Tab 多表切换，完整 CRUD（内联编辑/长文本弹层/增行/删行），实时回调监听外部更新，冲突检测；热修 dispose 中 dbController ReferenceError；面板约束到阅读器内、可拖动、透明度跟随设置。
- `v0.21.5`：热修复 v0.21.4——同步修正遗漏的6处旧3参数调用（normalizeReaderSettings）和 settingsState.readerMode 引用，恢复阅读器全部功能。
- `v0.21.4`：删除「应用到模式」——阅读器设置改为全模式共用一套，移除分桶存储逻辑，统一写入/读取 default 桶；移除 readerModeField UI 及相关设置面板切换逻辑。
- `v0.21.3`：背景场景各层行内加小标题 badge（场景/时间/天气），放在名称前方，去掉独立分隔 div。
- `v0.21.2`：背景场景词库架构重设计——时间/天气词库改为全局组（timeGroups/weatherGroups，对齐立绘 moodGroups）；新增时间/天气时 prompt 输入名称并自动建组；重命名时间/天气全局同步所有场景/时间层；词重复检测分层（bg/time/weather 各自池）；场景/时间/天气列表加层级小标题；天气 words 去除嵌入式，迁移到全局 weatherGroups；旧数据自动迁移。
- `v0.21.1`：修复3个bug——词库同名检测删词失效（findSceneWord 漏传 word 字段）；背景场景/角色立绘重命名后展开状态折叠（Set 未同步旧 key）；重命名后条目位置移到底部（改用 reorderKey 原位重建对象）。
- `v0.21.0`：背景场景词库+预览图——场景名/时间/天气三层均新增展开折叠（▼/▲）、词库 tag（带 × 删除/+ 添加/跨层全局重复词 confirm 迁移）、预览缩略图；三层组名同名改名阻止；天气条目从字符串升级为 object（向后兼容）；提示词注入新增场景/时间/天气三条约束（空间限定、笼统时段、天气类型词）。
- `v0.20.4`：修复 floating 模式下对话框高度≥160px 分割线消失（speaker/divider 加 `flex-shrink:0`）；「应用到模式」独立桶——「默认」现有专属存储桶 `igs-reader-settings-v9-default`，不再分发写入全部四个桶；切换「切换模式」不再联动「应用到模式」选项。
- `v0.20.3`：修复阅读器读不到第三方 DOM 过滤插件（如 Veridis 关键词过滤）写回 `mes` 的内容——`buildReaderSnapshot` 现在优先读 `payload.message.raw`（ST 活引用）而非 normalized wrapper 的缓存字段 `rawHtml`/`text`。
- `v0.20.2`：移除 QR 入口（脚本按钮在我们的加载方式下点击事件始终绑不上，方案不可行）。扩展设置面板抽屉保留「启用魔法棒入口」开关 + 「打开设置」「打开阅读器」快捷按钮；`bridge.entry` 简化为 `{ magic }`。
- `v0.20.1`：修复 QR 按钮点击不打开阅读器（已随 v0.20.2 移除 QR）。
- `v0.19.1`：修复启用 QR 未注册脚本按钮（多源解析，后被 v0.20.0 机制取代）；扩展面板按钮横排。
- `v0.19.0`：入口体系(扩展面板+QR+魔法棒开关)；修复工具栏顺序未生效。
- `v0.18.0`：刷新改造(正文+图片并行回第一页)；输入框仅末页；状态行居中末页隐藏；工具栏重排加首末页按钮。
- `v0.17.2`：删组词标题/建槽按钮；修复立绘槽改名无同名检查覆盖丢失。
- `v0.17.1`：修复立绘情绪槽展开按钮点击无反应（key 分隔符不一致）。
- `v0.17.0`：情绪词库与角色立绘 UI 合并；立绘缩略图点击放大；新建组自动首词；同名扫描。
- `v0.16.0`：取消情绪词长度限制；场景页子标签；对话主题按模式存搬到阅读器页；应用到模式加默认选项。
- `v0.15.0`：台词/旁白/心里话/角色名对齐下拉框；修复切模式立绘重置、切模式样式不刷新；切预设确认；间距收紧。
- `v0.14.0`：新增「按句号自动分页」开关（阅读器页）；修复发送消息报 `missing-send-api`（DOM 模拟发送兜底）；收紧场景素材模式角色名到气泡间距；删除「留在当前模式」开关。
- `v0.13.1`：修复立绘位置 key 的情绪粒度与图片不一致 bug——位置 key 的情绪维度改为「实际命中的图片槽名」（精确情绪/组名/默认），同一张立绘图无论被哪个细分情绪词触发，位置都统一。
- `v0.11.1`：修复情绪词分类系统的 UI 与立绘问题——情绪词库改为可折叠卡片（默认折叠，点内部按钮不再缩回），加组/一键导入（向上箭头，为所有角色按组名补槽）并排标题右，恢复默认词库移到卡片底部；修复时间/天气名含冒号（如 `19:45`）时 URL 因分隔符冲突写丢的 bug（所有 action 段 `encodeURIComponent` 编解码）；心里话气泡现在和台词一样显示角色名+分隔线。
- `v0.11.0`：新增情绪词分类系统——内置 8 组情绪词库（喜悦/愤怒/悲伤/紧张/平和/害羞/嫌弃/爱恋），通过 `{{mood_groups}}` 占位符注入约束 AI 只从池里选细分词；立绘差分查表升级为「精确槽 → 归约组名槽 → 默认」三级兜底（AI 写「欣喜」自动归到「喜悦」组取图）；场景 tab 角色立绘卡片内新增可折叠「情绪词库」编辑区（增删改组/词、恢复默认）+ 角色行「一键导入情绪组名」建槽按钮。同步修正注入深度：`setExtensionPrompt` 位置从 `IN_PROMPT(0)` 改为 `IN_CHAT(1)`、depth 0，让格式约束贴在对话末尾不被长上下文淹没；新增 `CHAT_CHANGED` 切聊天自动重注入。
- `v0.10.3`：修复台词气泡显示——按段落类型（台词/旁白/心里话）分类渲染；旁白不再误显示名字+分割线；台词去掉 `[名字]：` 前缀（名字独立显示在气泡顶部）；台词与旁白字体颜色可分开设置（新增「旁白」主题子卡片）；修复自定义模式下心里话字体含双引号打断 `style` 属性导致字体颜色不生效的真 bug。
- `v0.9.1`：修复扩展插图图片扫到却绑不进图位、正文格式化默认正则锚点漏匹配（自 v0.8.1 起存在，与品牌重命名无关）。
- `v0.9.0`：项目品牌从 Visual Novel / VN 重命名为 Immersive Galgame System / IGS，仓库、loader、API 全局名、CSS/DOM 前缀、存储键、事件名全部切到 IGS 体系，不保留向后兼容。
- `v0.8.1`：新增调试版 loader（IGS_DEBUG 开关 + [DEBUG-sprite] 探针），移除无效的「调试日志」开关。
- `v0.7.7` 修复全屏模式点击退出 + 立绘位置按角色独立存储。
- `v0.6.1` 修复混合模式下生图占据所有段落的问题，生图只绑定 `<image>` 标签前一段正文。
- `v0.6.0` 图片绑定精确化（移除激进兜底、chatu8 按 DOM 顺序绑定 slot）、混合模式生图与场景素材分区。
- `v0.5.4` 修复立绘保存后缩回、移除拖拽限制。
- `v0.3.19` 修复 `<image>` 图位绑定、图片进度、外部重绘按钮和阅读器常驻隐藏按钮。
- `v0.3.13` 已把“只扫当前楼层 + 占位绑定 + 楼层外图片隔离”固定为回归闸门；`v0.3.12` 已把 commit-first 自动更新固定为回归闸门；`v0.3.10` 已把 dist bundle 自包含固定为回归闸门。
- 当前不保留奶龙工具箱发布壳，不走奶龙工具箱流程校验。
- 保留独立 `loader/` 目录，用于后续 GitHub 远程 bundle 自动更新入口。
- 最终酒馆导入形态：`loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v0.10.3.json`；`loader/igs-loader.json` 保留为固定内部入口和自动化校验基准。
- 原版 Immersive Galgame System 脚本来源：`D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System 原版备份`。
- 策划书版本归档目录：`plan/`
- 项目级 AI 工作流入口：`AGENTS.md`
- 当前验收策略：`npm run gate`，fixtures 驱动的模拟测试，不要求安装版实机校验。
- GitHub 仓库：`https://github.com/Anyno001/Immersive-Galgame-System-AnyNo001`

## 项目目标

本项目目标是把原 Immersive Galgame System 脚本升级为一个可扩展的 Immersive Galgame System 运行时：

- 继续保留 Immersive Galgame System 已有的阅读器、魔法棒入口、正文解析、图像 API、外部插图扩展适配和移动/桌面阅读模式。
- 使用 GitHub 远程 bundle 发布主程序，酒馆内只导入小型自动更新 loader。
- 建立能力分组导入系统，不提供独立总 Mod 管理页；生图插件、选项组件、UI 预设、背景/立绘资源、正文正则预设都在各自页面管理。
- 建立 `Mod / Preset / Pack` 三层边界：Mod 扩展代码能力，Preset 切换配置，Pack 管理背景、立绘、头像和本地持久资源。
- 提供 shujuku 表格可编辑前端，但不重复 shujuku 自带的模板导入能力。
- 提供 AI 友好的模块契约、fixtures、模拟测试与工作流，方便后续由 AI 逐步实现。

## 目录约定

```text
projects/Immersive Galgame System/
├── README.md
├── AGENTS.md                        项目级 AI 协作流程
├── 功能总集表.md
├── plan/                           每个版本的策划书归档
├── loader/                         远程 bundle 自动更新 loader
├── app/
│   ├── src/
│   │   ├── index.js
│   │   ├── core/
│   │   ├── host/
│   │   ├── actions/
│   │   ├── components/
│   │   ├── registry/
│   │   ├── storage/
│   │   ├── data/
│   │   │   └── shujuku/
│   │   ├── scene/
│   │   ├── visual/
│   │   ├── media/
│   │   ├── backgrounds/
│   │   ├── characters/
│   │   ├── generated-images/
│   │   │   ├── providers/
│   │   │   └── request-builders/
│   │   ├── prompts/
│   │   │   ├── adapters/
│   │   │   └── schemas/
│   │   ├── schemas/
│   │   ├── presets/
│   │   ├── mods/
│   │   ├── shujuku-panel/
│   │   ├── styles/
│   │   ├── hotkeys/
│   │   ├── choices/
│   │   └── api/
│   ├── fixtures/
│   │   ├── tavern/
│   │   ├── shujuku/
│   │   ├── media/
│   │   ├── providers/
│   │   ├── imports/
│   │   └── styles/
│   ├── tests/
│   ├── scripts/
│   ├── package.json
│   └── dist/
└── docs/
    ├── AI_WORKFLOW.md
    ├── ARCHITECTURE.md
    ├── PACKAGING_WORKFLOW.md
    ├── SCHEMA_AND_FIXTURES.md
    ├── API_FOR_MOD_AUTHORS.md
    ├── IMAGE_GENERATION.md
    ├── MOD_FORMAT.md
    ├── PRESET_FORMAT.md
    ├── IMPORT_GROUPS.md
    ├── SCENE_RULES.md
    ├── STYLE_SYSTEM.md
    ├── SHUJUKU_PANEL.md
    └── RELEASE.md
```

## 修改流程

本项目当前绕过奶龙工具箱发布项目结构，只保留已确认的 Immersive Galgame System 架构：

1. 修改前先读 `AGENTS.md`、`docs/AI_WORKFLOW.md`、`功能总集表.md` 和目标模块的 `CONTRACT.md`。
2. 每次形成或更新版本策划书时，必须放入 `plan/`，文件名使用 `v版本号-主题.md`，例如 `plan/v0.1.5-验收闸门策划书.md`。
3. 功能代码只进入 `app/src/<能力模块>/`。
4. shujuku 数据读写进入 `app/src/data/shujuku/`，表格 UI 进入 `app/src/shujuku-panel/`。
5. 通用图片池进入 `app/src/media/`，背景、立绘、生图业务分别进入 `backgrounds/`、`characters/`、`generated-images/`。
6. 跨模块共享数据结构进入 `app/src/schemas/`；模型提示词和工作流 schema 继续放在 `app/src/prompts/schemas/`。
7. 架构、API、预设、场景规则、样式系统、发布说明和 AI 协作说明只进入 `docs/`。
8. 测试数据进入 `app/fixtures/`，模拟测试进入 `app/tests/`。
9. 当前本机可执行验收入口是 `npm run gate`，顺序为 `structure -> static -> test -> simulate -> perf -> build`。
10. 后续接入 pnpm 后，保持 `pnpm build`、`pnpm test`、`pnpm simulate`、`pnpm perf`、`pnpm gate` 与 npm 命令等价。
11. 本项目当前用模拟测试替代实机校验；不得把安装版实机验真作为默认交付要求。
12. 不要走奶龙工具箱流程校验：本项目不得运行奶龙工具箱 `pack-project`、`verify-project`、`validate`、`check-refs` 作为验收，除非用户明确要求重新接入工具箱流程。
13. 项目级变更只记录在本 README，不写入工具箱 `CHANGELOG.md`。
14. 涉及打包、发布、上传、loader、远程 bundle 或酒馆助手脚本 JSON 时，必须先读 `docs/PACKAGING_WORKFLOW.md` 与 `docs/RELEASE.md`。
15. `loader/` 只放自动更新入口；阅读器、设置面板、shujuku、Provider、Mod、Preset、Pack 等业务逻辑必须留在 `app/src/`。

## 更新日志

### v0.23.35 - 2026-09-19

- 楼层内嵌模式移除对话框顶部的“最新回复 / 前 N 轮 / 当前页数”元数据行；上下轮仍只切换内部阅读源，不跳楼。
- 全局隐藏 IGS 阅读器、设置页与数据库面板所有可滚动区域的原生滚动条；鼠标滚轮、触摸滑动、键盘滚动及横向拖动能力保持不变。
- 修复窄楼层或低高度容器中对话气泡和发送框被挤出/裁出可视范围：内嵌对话框宽高改为受容器约束，正文作为独立滚动区，角色名、分割线和发送区固定不收缩。
- 新增契约与模拟断言，覆盖元数据隐藏、三套 UI 的全局滚动条隐藏，以及内嵌气泡/正文/发送区的可视范围约束。

### v0.23.34 - 2026-09-19

- 楼层内嵌模式的收纳与关闭按钮从对话框上沿移到阅读器右上角，使用 14px 边距独立悬浮。
- 工具条容器移除背景、描边、圆角、阴影与毛玻璃；两枚按钮改为 32px 透明点击区，仅显示浅灰 SVG，悬停只提亮图标。
- 改动限定为 `embedded` 模式；`pc/mobile/web/fullscreen` 的工具栏布局、材质与交互保持不变，并新增样式与缩放原点回归断言。

### v0.23.33 - 2026-09-19

- 修复楼层内嵌流式时仍能看到宿主楼层逐字正文：观察器改为绑定阅读器实际挂载的酒馆文档，并在新 AI 楼层出现、`.mes_text` 替换或样式被宿主重置时重新迁移 host、持续隐藏原文。
- 修复生成完成后仍停留在「正在生成…」：接入酒馆 `GENERATION_STARTED / GENERATION_ENDED / GENERATION_STOPPED` 生命周期，结束事件后经过稳定窗口一次性换源并移除动画；结束后的插件/按钮 DOM 更新不会重新进入载入态。
- 保留无正式事件宿主的 800ms 静默窗口与 120s 硬超时兜底，不新增轮询；新增状态机单测与端到端模拟，覆盖新楼层原文隐藏、最终正文换源和结束后 DOM 噪声隔离。

### v0.23.32 - 2026-09-19

- 新增第五种阅读模式「楼层内嵌」：阅读器作为 `.mes_text` 的兄弟节点挂在最新 AI 楼层内，保留头像、名字和楼层操作；关闭或切换模式后恢复宿主原文。
- 内嵌流式阶段使用固定高度载入动画，不逐 token 渲染或解析；正文稳定后一次性刷新阅读器，并自动跟随新的最新 AI 楼层。
- 内嵌上一轮/下一轮只替换阅读器内部文字来源，复用同一 host 与 `#igs-overlay`，不调用 `chat-jump`、不滚动酒馆页面。
- 增加最多 8 项的阅读源解析缓存，同一消息翻页不再重复执行正文过滤、正则、标签解析、分页与图位映射；修复立绘重复渲染时 `style.cssText` 持续增长。
- 设置页沿用霜夜平面配色，圆角调整为外壳 8px、常规控件 6px、小控件 4px；仍保持无投影、无毛玻璃、无渐变和无发光。
- 自动化覆盖模式契约、挂载/恢复、载入态、解析缓存，以及内嵌上下轮不跳楼和复用同一阅读器根。

### v0.23.31 - 2026-09-19

- 重做 IGS 统一设置页视觉：参考「霜夜」的 `#16181A / #1F2225 / #282C2F` 深灰层级与四级灰文字，保持低饱和中性色。
- 设置页移除毛玻璃、投影、渐变、发光、胶囊控件和大圆角；卡片与表单改为平面色块、必要分隔线、2px 圆角和焦点底线。
- 保留原设置页 DOM、字段路径、事件委托、保存链、视口变量和 54/40/38px 几何契约；不修改阅读器外观、配置 schema 或用户数据。
- 新增平面视觉契约，锁定核心配色、无模糊/渐变、阴影仅允许 `none`、圆角不得超过 2px。

### v0.23.23 - 2026-06-27

- 再修移动端对话框左下角漏直角（v0.23.21 加 `isolation:isolate` 无效，本版换方案）。
- 定位：桌面 pc 模式对话框用 `transform:translateX(-50%)` 本身就是 GPU 合成层，圆角裁剪正常；移动端 floating 模式用 `transform:none`，对话框是非合成层。v0.23.16 给 `#igs-bg` 加 `filter:brightness` 后，`#igs-bg` 成为合成层，移动端在它之上渲染非合成的圆角对话框时，圆角缺口处把背后 `#igs-bg::after` 的矩形黑渐变渲染成直角硬边（开 backdrop-filter 毛玻璃时被模糊掩盖、桌面合成精度高也看不出，故只在「移动端 + 关毛玻璃」复现）。
- 修复：floating 对话框 `transform:none` → `transform:translateZ(0)`，强制创建合成层，使其圆角裁剪行为与桌面 pc 模式一致；移除基础 `.igs-dialog` 上版无效的 `isolation:isolate`。

### v0.23.22 - 2026-06-27

- **清理 loader 冗余**：删掉 `loader/` 下 58 个「酒馆助手脚本-沉浸式Galgame系统（自动更新） vX.Y.Z.json」副本——它们内容完全相同、都写死 `@main`，文件名带版本号却不锁版本，对自动更新 loader 毫无作用，纯属每次升号攒下的冗余。
- **改为两类 loader**：
  - 自动更新版 `igs-loader.json`（脚本名「沉浸式Galgame系统（自动更新）」）：拉 `@main` 最新，开发/日常用。
  - 固定版 `沉浸式Galgame系统 vX.Y.Z.json`：在 loader 源前注入 `IGS_LOADER_REF='vX.Y.Z'`，真正锁定加载该 tag 的 bundle、不自动更新；脚本名去掉「自动更新」。
- `build-loader.js` 改为按需生成固定版：`node scripts/build-loader.js --pin v0.23.21 v0.23.15`，不传 `--pin` 只更新自动更新版 + debug 版（不再每次升号堆 pinned 文件）。
- 本轮产出 `沉浸式Galgame系统 v0.23.21.json` 和 `沉浸式Galgame系统 v0.23.15.json`。注意：固定版要真正可用需对应 tag 已推送；`v0.23.15` tag 此前未打，需补打后该固定版才能从 jsDelivr 加载。

### v0.23.21 - 2026-06-27

- **对话主题取消预设**：删掉「对话主题」预设下拉（原神风/崩铁风/极简/自定义），主题恒为自定义——角色名/台词/旁白/心里话/分隔线各项始终可编辑（仅受场景素材开关控制）。`normalizeVnTheme` 强制 `preset:'custom'`，VN_THEME_PRESETS 保留作字段初值来源。
- **分割线精简**：分割线样式只保留「渐变线(gradient)」和「无(none)」，删掉 `───◇───`、`──✦──`、`══` 三种符号；归一化把旧符号值一律归到渐变线。
- **场景预设框样式统一**：`场景 → 场景素材` 的「选择预设」下拉此前只有 inline `flex` 样式、字体用浏览器默认、外观与其它设置框不一致。新增 `.igs-scene-preset-select` 类，套用统一 `font:inherit` + 圆角 + padding + 38px 高度。
- **修复对话框左下角漏直角**：v0.23.16 给 `#igs-bg` 加 `filter:brightness()` 后，背景变成合成层、改变层叠上下文，导致无背景滤镜时对话框圆角与背景合成层边界出现渲染缝隙、左下角露出直角（v0.23.15 正常）。给 `.igs-dialog` 加 `isolation:isolate` 独立合成，圆角裁剪不再受背景层影响。

### v0.23.20 - 2026-06-26

- 修复顶部固定工具栏按钮区用手指横向滑动无效的问题（接 v0.23.19，真机实测仍滑不动）。
- 根因：移动端 IGS overlay 区域吞掉了原生触摸滚动手势，纯 CSS `overflow-x:auto` 即使内容溢出也无法用手指滑动；数据库标签栏（`.igs-shujuku-tabs`）能滑是因为它有 JS 指针拖拽滚动实现。
- 修复：新增 `installToolbarDragScroll`，照搬 `panel-controller` 标签栏的拖拽滚动逻辑——委托监听 `#igs-bar-btns` 的 pointerdown（仅 `scrollWidth>clientWidth` 溢出时启动）、pointermove 改 `scrollLeft`、4px 移动阈值后 setPointerCapture、pointerup/cancel 结束并在 capture 阶段抑制紧随的 click（避免拖动误触按钮）。
- 配套 CSS：溢出态 `#igs-bar-btns.igs-bar-overflow` 加 `cursor:grab`、拖动态 `.igs-bar-dragging` 加 `cursor:grabbing`、容器加 `overscroll-behavior:contain`。

### v0.23.19 - 2026-06-26

- 修复「顶部固定」工具栏横向滚动在真机（移动端）滑不动的问题。
- 根因：v0.23.17 给 `#igs-bar-btns` 设 `justify-content:space-evenly` 实现按钮平均铺满，但 flex 容器内容溢出时 `space-evenly`（及 center/space-around）会在两端也分配间距、使滚动起点不可达、首尾按钮被推出可视区且滚不回来。
- 修复：CSS 默认仍 `space-evenly`（放得下时平均铺满，保留 v0.23.15 的设计），新增 `#igs-bar-btns.igs-bar-overflow{justify-content:flex-start}`；`applyToolbarState` 在 rAF 后测 `scrollWidth>clientWidth`，溢出则加 `igs-bar-overflow` class 切左对齐可滚。
- 补 `touch-action:pan-x` + `-webkit-overflow-scrolling:touch`，保证移动端横向滑动不被纵向手势吞掉。
- 补 simulate 静态断言：overflow-x:auto / touch-action:pan-x / 溢出态 flex-start 规则存在。

### v0.23.18 - 2026-06-26

- 修复三个 bug：
- **选项气泡与顶部工具栏重叠/截断**：顶部固定模式下工具栏在屏幕顶端，但气泡只有 `bottom` 锚、向上无界生长（`z-index:6` < 工具栏 `z-index:7`），多选项时顶到工具栏被遮挡/被视口截断。新增 `#igs-overlay.igs-toolbar-top #igs-option-bubbles[data-igs-pos]` 覆盖：加 `top:calc(var(--igs-toolbar-h)+12px)` 避让 + 去掉底部多余的 toolbar-h，超出由现有 `overflow-y:auto` 滚动接管。
- **正文标签解析对带属性 content 失效**：`text-pipeline.js` 的 `extractTagBlocks`/`removeTagBlocks` 正则是 `<tag>`（不容忍属性），AI 输出 `<content data-igs-formatted="1">` 时匹配数为 0 → 兜底 `rawTextSource` 吐出整段全文（含 Subtext_think 思考草稿、`</thinking>`、`### 正文`、now_plot 标签）。正则统一改为 `<tag\b[^>]*>`，与 `message-source.js` 对齐。补真机回归测试。
- **检定建议表选项气泡误取所有列**：`extractOptionTexts` 把所有非 row_id 列都当选项，对多业务字段的检定建议表（展示文本/对抗/角色/属性…）会把整行每列都弹成气泡。改为优先按列名「展示文本」（去空格精确匹配）只取该列；未命中回退原「所有非 row_id 列」逻辑，选项表/行动选项宽表行为不变。补多列回归测试。

### v0.23.17 - 2026-06-26

- 修复「顶部固定」工具栏按钮过多时的溢出问题：上一版按钮全部固定 36px 不收缩、单行不换行，按钮多时排在右侧的设置 ⚙ 和退出 × 被挤出屏幕点不到。
- 顶部模式下按钮区 `#igs-bar-btns` 改为横向滚动（`overflow-x:auto` + `min-width:0`），并隐藏滚动条（Firefox `scrollbar-width:none`、WebKit `::-webkit-scrollbar{display:none}`、IE `-ms-overflow-style:none`）。
- 设置 ⚙ 在顶部模式下由 `applyToolbarState` 移入固定区 `#igs-bar-pinned`，与退出 × 并列；二者 `flex:0 0 auto` 不参与收缩、始终固定在右侧可见可点（切回悬浮模式自动还原回按钮区）。

### v0.23.16 - 2026-06-26

- 设置 → 阅读器新增「图片亮度」百分比下拉（50%~100%，默认 88%），可调背景图整体亮度。
- 背景图 `#igs-bg` 的亮度此前由 CSS 硬编码 `brightness(.88)` 全局压暗；现改为按 `readerSettings.imgBrightness` 通过 inline style 控制，想要原图亮度可调到 100%。
- 新增 `readerSettings.imgBrightness` 配置（默认 88，归一化 clamp 到 10~100），同步进 `READER_REQUIRED_SETTINGS_PATHS` 与数值归一化白名单。

### v0.23.15 - 2026-06-21

- 修复「顶部固定」工具栏的布局问题：上一版按钮全挤在右侧、没有铺满整条。
- 顶部模式 `.igs-ctrl-bar` 改为 `justify-content:space-between`，按钮区 `#igs-bar-btns` 设 `flex:1 1 auto + justify-content:space-evenly` 平均铺开导航/功能键，退出（×）键被推到最右角独立放置（不易误点）。
- 取消顶部模式下的工具栏缩放（`toolbarScale` 仅作用于悬浮小条，全宽顶部栏缩放会从右角缩成异形）：`toolbarDock==='top'` 时清空 `transform`/`transformOrigin`，悬浮模式仍按 `toolbarScale` 缩放。
- 版本同步到 `v0.23.15`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.14 - 2026-06-21

- 阅读器工具栏新增「顶部固定」位置，与现有「悬浮」并列（设置 → 阅读器 → 工具栏位置）。
- 新增设置项 `readerSettings.toolbarDock`（`float` / `top`，默认 `float`）。选 `top` 时给 `#igs-overlay` 加 `.igs-toolbar-top`：工具栏层覆盖为贴顶横贯（`inset:0 0 auto 0`），`.igs-ctrl-bar` 改 `position:static`、满宽、方角、去 box-shadow、按钮区靠右；沿用现有 `--igs-toolbar-*` 玻璃材质变量，外观大体不变。
- 顶部固定模式隐藏「收纳/展开」按钮（`[data-act="toggle-bar"]`），并在 `applyToolbarState` 中强制按钮区始终 `flex`，避免折叠后整条工具栏（含折叠按钮自身）消失而无法唤回。
- `transformOrigin` 随位置切换：顶部模式 `right top`、悬浮模式仍 `right bottom`，配合工具栏缩放。
- 测试：新增 `gate:simulation:igs-ui-toolbar-dock-top-fixes-bar-and-keeps-buttons-visible`（断言 overlay class、`data-igs-toolbar-dock` 属性、折叠态下按钮区仍显示）与 `gate:simulation:igs-ui-toolbar-dock-invalid-falls-back-to-float`（非法值回落）。验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku、不调用真实 provider。
- 版本同步到 `v0.23.14`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.13 - 2026-06-20

- 选项气泡宽度可配置，并新增「右上角」位置。
- 默认（新行为）气泡宽度跟随对话框实际渲染宽度，不随选项文字长短抖动：`syncOptionBubblesAfterRender` 把对话框 `getBoundingClientRect().width` 写入 CSS 变量 `--igs-dialog-w`；容器与对话框同宽居中，按位置取气泡宽度——正上方居中=满宽（100%），左上角 / 右上角=半宽（50%），文字超过该宽度才 `word-break` 换行。
- 新增设置开关「气泡宽度随文本变化」（`bridge.optionBubble.widthFollowsText`，默认关闭）。开启后恢复旧的随文字宽度行为（`max-width:min(70%,420px)`，按位置贴左/居中/贴右）。
- 气泡位置 `bridge.optionBubble.position` 新增 `top-right`（右上角），设置面板分段控件加「右上角」选项。
- 修复 `getOptionBubbleConfig` 手动挑字段重组 cfg，导致 `position=top-right` 与新开关被静默丢弃的 bug（这也是为何必须为该路径补模拟测试）。
- 测试：`gate:simulation:igs-ui-option-bubble-trigger-…` 补默认 `data-igs-width=dialog` 断言；新增 `gate:simulation:igs-ui-option-bubble-width-follows-text-and-top-right-position` 覆盖开关开启=`text` 模式与 `top-right` 位置。验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.13`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.12 - 2026-06-20

- 阅读器选项气泡新增识别数据库表名「检定建议表」。它是「选项 / 选项表 / 行动选项」之外的又一别名，与选项表互斥出现（用户表里命中任一即作为选项来源）。
- 实现：在 `app/src/choices/option-table.js` 的 `OPTION_TABLE_NAMES` 末尾加入 `'检定建议表'`，沿用现有「命中任一表名即用」逻辑，无需合并或优先级处理。同步更新设置面板提示、未找到表 toast 文案、`README` 与回归测试断言（`gate:choices:option-table accepts 选项/行动选项 aliases` 增加 `检定建议表` 命中用例）。
- 验证边界：Node gate / fake shujuku，不写入真实 shujuku，不调用真实 provider；本轮未新增抽象，未留下技术债。
- 版本同步到 `v0.23.12`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.11 - 2026-06-20

- 彻底修复 v0.23.10 未解决的真机问题：场景素材模式下用 `[igs-char:]` / `[igs-thought:]` 标签写的对白和心理话在阅读器整段丢失、角色名与分割线不显示。
- 真机 CDP 探针修正了 v0.23.10 的根因判断：宿主 SillyTavern 的 DOM `.mes_text` **并未清洗** `[igs-*:]` 标签（标签原样保留在渲染文本里），与数据层只是词级差异，因此 `dom-visible-override` 正常触发。真正的缺陷是 override 分支直接 `formattedText = domVisibleText`，**跳过了正文格式化** `applyImmersiveGalgameSystemBodyFormat`，导致 `[igs-thought:名|情|内容]` 没被转成 `*内容*`、`[igs-char:名|情|对白]` 没被转成 `[名]：对白`，阅读器的 `classifySegment` 按形态识别失败，把整段当旁白渲染（且残留原始标签文本）。
- 修复：`buildIgsTextPayload` 的 DOM override 分支对 `domVisibleText` 补跑 `applyImmersiveGalgameSystemBodyFormat(domVisibleText, virtualRegex)` 再赋给 `formattedText`，标签转成气泡/心理话形态。保留 v0.23.10 的 `domClobbersDirectiveTags` 守卫（数据层有标签、DOM 无标签时不覆盖）作为另一半场景的兜底。
- 用真机导出的真实 `mes`（2313 字，13 char + 4 thought）与 DOM 文本（2122 字，含标签）本地复跑修复后代码确认：`usedDomOverride=true`、所有 thought 转 `*…*`、所有 char 转 `[名]：…`、无残留原始标签、directives 解析齐全（13 char + 4 thought）。
- 回归测试增至 3 个：`dom-override-formats-igs-tags-into-bubbles`（DOM 含标签 override 后正确格式化、不残留原始标签）、`keeps-data-directives-when-dom-strips-igs-tags`（DOM 清洗标签时不覆盖）、`still-overrides-dom-when-both-sides-have-igs-tags`（两侧均含标签仍按词级覆盖并格式化）。验证边界：Node gate / fake DOM / 真机 CDP 探针只读验证，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.11`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.10 - 2026-06-20

- 修复场景素材模式下角色名、分割线不显示，以及用 `[igs-char:]` / `[igs-thought:]` 标签写的对白和心理话在阅读器整段丢失的问题。真机 CDP 探针确认：数据层 `chat[n].mes` 含完整 13 个 char / 4 个 thought 标签，但阅读器 `sourceKind` 为 `dom-visible-override`，最终文本里所有标签段消失，只有 AI 直接用 `*…*` 写的星号心理话幸存。
- 根因在 v0.23.4 引入的「DOM 差异优先」逻辑：宿主前端用正则把 `[igs-*:]` 标签从渲染层 `.mes_text` 隐藏（标签是给 AI 看的格式标记），DOM 可见文本因此不含标签；但 `localizedTextDiffers` 比较的是清洗后文本（两侧都没标签），将其误判为关键词插件改词，于是用 DOM 文本覆盖数据层，丢弃了正确的标签解析结果。
- 修复：`buildIgsTextPayload` 在 DOM override 判定前增加守卫 `hasIgsDirectiveTags(raw) && !hasIgsDirectiveTags(domVisibleText)`——数据层含 `[igs-scene/char/thought:]` 标签而 DOM 不含时，判定为渲染层清洗而非改词，放弃覆盖、继续走数据层 strict 解析。不破坏 v0.23.4 原意：关键词插件改词场景两侧均无 igs 标签，守卫不触发。
- 新增 2 个回归测试：`keeps-data-directives-when-dom-strips-igs-tags`（DOM 清洗标签时不覆盖、对白/心理话与 directives 解析齐全）、`still-overrides-dom-when-both-sides-have-igs-tags`（两侧均含标签时仍按词级覆盖）。验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.10`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.9 - 2026-06-20

- 修复普通阅读器设置保存会把当前打开模式强行切回 `bridge.openMode` 的回归：`rerenderActiveReader()` 默认保留 `state.activeReader.mode`，只有用户明确修改 `bridge.openMode` 时才同步切换当前 reader。
- 修复旧 readerSettings 兼容：不再因为内部 `_v` 缺失或不匹配整包清空，改为字段级 normalize，并保留 `fontSize`、`dialogHeight`、`spriteLayouts`、`vnTheme` 等合法旧字段后写回当前 schema 版本。
- 修复心理页主题：`textType === "thought"` 时使用 `thoughtFont`、`thoughtColor` 和 `thoughtAlign`；台词页和旁白页保持各自主题字段不变。
- 新增 5 个阅读器回归模拟测试，覆盖普通设置保存保留当前 mode、显式 openMode 设置仍切换 reader、旧桶打开后保留高度/字号/立绘布局、心理页样式与角色名/分割线显示、mode 不一致时立绘布局仍按当前 reader mode 应用。
- 验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider。本轮未新增抽象，未留下技术债。

### v0.23.8 - 2026-06-20

- 正式固化视觉探针结论：前台 UI 的“磨砂层”来自 `backdrop-filter`，不是背景图、立绘或 `glassOpacity` 浓度本身。默认材质改为透明玻璃底，不再默认叠加背景滤镜。
- `设置 -> 阅读器` 新增「启用背景滤镜」开关，默认关闭；旧用户不重置阅读器设置，缺失字段会自动归一化为 `false`。打开后写入旧版 `blur(32px) saturate(180%)`，关闭时写入 `none`。
- 扩展 `applyTransparentGlassMaterial()`，统一写入对话框、工具栏、选项气泡、数据库面板与数据库表头的背景色和滤镜变量，避免数据库再出现和对话框/工具栏色调不一致。
- 更新契约与模拟测试，锁定默认 `backdrop-filter:none`、开启开关时回到旧滤镜、阅读器设置可保存该开关。验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider。本轮未留下技术债。
- 版本同步到 `v0.23.8`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.7 - 2026-06-20

- 修复 v0.23.6 玻璃材质判断错误：问题不是背景图资源，而是默认材质被改成单层 `rgba(20,20,22,.12)`，使下方画面颜色过量参与混色；在与旧版相同的背景和立绘下也会出现红棕/灰棕底色。
- 重新对照最初原版备份：`v7.0` 对话框为 `rgba(20,20,22,.62)` + `blur(32px) saturate(180%)`，默认 `glassOpacity=0.62`；后续 `v7.6.12` 仍把 `glassOpacity` 动态写入对话框背景。现 `applyTransparentGlassMaterial()` 恢复用 `glassOpacity` 生成中性玻璃底，并同步到 `--igs-dialog-bg`、`--igs-toolbar-bg`、`--igs-choice-bg`、`--igs-db-bg`。
- 默认阅读器 `glassOpacity` 恢复为 `0.62`；对话框和数据库面板恢复旧版大面积玻璃范围的 `blur(32px) saturate(180%)`、`rgba(255,255,255,.14)` 边框与较深阴影，避免 `blur(48px) saturate(220%)` 在大面积面板上形成磨砂糊底。选项气泡继续保留较轻阴影以避免残影。
- 更新契约测试，锁定前台玻璃变量必须随 `glassOpacity` 生成 `rgba(20,20,22,0.62)`，并覆盖对话框、工具栏、选项和数据库；验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider。本轮未留下技术债。
- 版本同步到 `v0.23.7`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.6 - 2026-06-20

- 修复阅读器前台 UI 从“透明玻璃”退化为“暗磨砂板”的根因：旧设置里的 `readerSettings.glassOpacity=0.62` 被运行时直接写入 `--igs-glass-bg`，而 `--igs-dialog-bg`、`--igs-toolbar-bg`、`--igs-choice-bg`、`--igs-db-bg` 又全部继承该变量，导致对话框、工具栏、选项气泡和数据库面板都覆盖一层 62% 不透明的深色底。
- 新增 `app/src/styles/glass-material.js`，把透明玻璃填充 alpha 固定为 `0.12`，同时把旧的 `glassOpacity` 保留为 `--igs-glass-density` / `--igs-glass-opacity` 兼容变量。默认皮肤继续使用 `blur(48px) saturate(220%)` 的玻璃滤镜，但不再用高 alpha 深色底制造“浓度”。
- `reader-dom-render` 与 `shujuku-panel` 改为共用 `applyTransparentGlassMaterial()`，数据库面板不再在打开时把 `glassOpacity` 写回 `--igs-glass-bg`。默认 CSS 也补充 `--igs-transparent-glass-bg`、`--igs-glass-fill-alpha` 和 `--igs-glass-density`，方便后续皮肤区分“透明底色”和“玻璃密度”。
- 新增契约断言锁定：即使输入 `0.62`，`--igs-glass-bg` 仍应为 `rgba(20,20,22,0.12)`；reader 与数据库控制器不得重新把 `glassOpacity` 写成前台组件背景。验证边界：Node gate / fake DOM / fake shujuku，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.6`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.5 - 2026-06-20

- 让 IGS 阅读器输入框不再被关键词过滤插件（如 [Veridis-Keyword-filtering](https://github.com/The-Veridis-Lion/Veridis-Keyword-filtering)）替换。该插件在 `document` 上用捕获阶段全局监听 `input` 事件，对所有未豁免的 `<input>/<textarea>` 实时替换屏蔽词，因此在 `#igs-input` 打字会被改写——这是插件主动伸手到全局输入框，与 IGS 自身无穿透行为。
- 利用其 `isProtectedNode` 的豁免规则 `node.closest('[id*="shujuku_v120-"]')`：给 `#igs-input` 的直接父容器 `.igs-controls` 加 `id="igs-controls-shujuku_v120-guard"`，命中豁免后输入框文字不再被替换。主路径模板（`original-reader-source.js`）与降级路径动态 DOM（`reader-dom-render.js`）双改；id 带 `igs-` 前缀避免与真实数据库插件节点相撞，不新增 DOM 层、不动 flex 布局（现有 CSS/JS 仍查 `.igs-controls`/`#igs-input`/`#igs-send-btn`）。
- 新增契约断言锁定 `id="igs-controls-shujuku_v120-guard"`，防止后续清理误删使豁免失效。
- 已知局限：此为依赖 Veridis 内部实现细节的豁免，对方若改名或收紧规则即失效；移动端中文输入法下插件替换 + 光标重置导致的「重复两次」属插件自身 IME bug，IGS 无法介入。验证边界：Node gate，不调用真实宿主与插件；本轮未留下技术债。
- 版本同步到 `v0.23.5`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.4 - 2026-06-20

- 修复手机版阅读器读不到关键词过滤插件（如 [Veridis-Keyword-filtering](https://github.com/The-Veridis-Lion/Veridis-Keyword-filtering)）改后正文的问题。两处根因：①IGS 经 `getMessagePrimaryText` 优先读数据层 `chat[n].mes`，DOM 渲染层（`.mes_text`）仅作兜底；Veridis 在移动端宿主（TauriTavern/柏宝箱）下回写 `mes` 滞后、或只改渲染层不回写，导致 IGS 读到改前旧词，PC 因 `saveChat` 同步回写而表现正常。②点「刷新」（`rescanCurrentImages`）只重扫图片和重解析筛选/格式化配置，`visibleText` 仍是打开阅读器那一刻抓的旧 DOM 快照。
- `buildIgsTextPayload` 新增「DOM 差异优先」：当 DOM 可见文本与数据层纯文本仅为词级差异（去空白后长度量级接近 ≥60%、且编辑距离占比 ≤50%）时改用 DOM 文本并置 `usedDomOverride`，结构性不同（不同消息/截断/宿主 UI 噪声）则保留原文。编辑距离用带上界的 Levenshtein，超界即判定为不同内容。
- 刷新路径新增 `readLiveVisibleText`：按消息 ID 重查 `#chat .mes[mesid]` 节点、回退到 payload 缓存的 element，重抓最新渲染文本写回 `payload.visibleText`，使刷新能拿到插件改后的文字而非旧快照。
- 新增回归测试 `gate:scene:igs-message-source:prefers-dom-text-when-keyword-filter-rewrites-word`（词级改写时覆盖生效）与 `gate:scene:igs-message-source:keeps-data-text-when-dom-is-different-content`（内容不同时不覆盖）。验证边界：fake message / Node gate，不调用真实宿主与 provider；本轮未留下技术债。
- 版本同步到 `v0.23.4`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.3 - 2026-06-20

- 修复最后一页输入框点击弹出选项浮窗、导致无法进入输入模式的问题：`.igs-dialog` 现在在 `#igs-dialog-layer{pointer-events:none}` 下显式设置 `pointer-events:auto`，输入框、发送区和对话框本体不再把真实点击穿透给 `#igs-click-layer`。
- 收窄点击职责：`#igs-click-layer` 只处理恢复隐藏状态、关闭设置面板和背景空白触发选项浮窗，不再兜底执行下一页；`#igs-dialog` 只处理左右翻页，并继续排除 `.igs-controls`、`#igs-ctrl-bar`、`#igs-settings`。
- 新增回归测试 `gate:simulation:igs-ui-background-click-does-not-page-dialog-click-still-pages` 与 `gate:simulation:igs-ui-option-bubble-trigger-excludes-dialog-toolbar-and-input`，并在契约测试中固定 `.igs-dialog{pointer-events:auto}`。验证边界：fake DOM / fake shujuku / Node gate，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.3`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.2 - 2026-06-20

- 修复数据库标签栏在关闭 F12 后真实点击无法切换的问题：用户持久探针显示 `pointerdown/mousedown` 命中 `BUTTON.igs-shujuku-tab`，但 `pointerup/mouseup/click` 的 `target` 被提前 pointer capture 重定向成 `.igs-shujuku-tabs` 容器，导致 `event.target.closest('[data-db-tab]')` 为空。
- `app/src/shujuku-panel/panel-controller.js` 将标签栏拖动滚动的 `setPointerCapture` 从 `pointerdown` 延后到 `pointermove` 越过 4px 阈值后执行；普通点击不再改变最终 click target，真正拖动后仍保留 `createDbTabClickGuard()` 对释放 click 的短暂抑制。
- 新增 `gate:simulation:db-tab-drag-scroll-captures-only-after-move-threshold` 回归检查，固定“按下不 capture、拖动越阈值才 capture”的交互边界。验证边界：使用 fake DOM / fake shujuku / Node gate，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。
- 版本同步到 `v0.23.2`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。

### v0.23.1 - 2026-06-20

- 修复数据库标签页非 F12 状态点击不切换：用户探针显示真实 `click.target` 已经是 `BUTTON.igs-shujuku-tab`，且程序化 `.click()` 能切换 activeUid，因此不是 z-index、pointer-events、数据渲染或标签绑定问题。根因是标签栏拖动滚动后使用全局 `suppressTabClick` 吃掉“下一次 click”，在实际浏览器里会误吞后续正常标签点击。
- `shujuku-panel` 新增 `createDbTabClickGuard()`：只在发生实际拖动后，短时间内拦截与拖拽释放点同坐标的合成 click；过期、远离释放点、无坐标的程序化 click 或后续真实点击都不会被拦截。新增模拟回归测试锁定“拖拽释放 click 可抑制，但后续标签点击不再被吞”。
- 修复选项浮窗残影：用户探针显示 `optionCount: 4` 且四个按钮均命中自身，排除旧节点残留；残影来自每个 `.igs-option-bubble` 叠加 `0 4px 24px rgba(0,0,0,.20)` 与玻璃滤镜。现新增 `--igs-choice-soft-shadow`，默认 `--igs-choice-shadow` 改为 `0 2px 10px rgba(0,0,0,.14)`，保留背景、边框、blur 与皮肤 token 覆盖能力。
- 版本同步到 `v0.23.1`，重新生成 dist、loader 和版本化酒馆助手脚本 JSON。验证边界：使用 fake DOM / fake shujuku / Node gate，不写入真实 shujuku，不调用真实 provider；本轮未留下技术债。

### v0.23.0 - 2026-06-20

- 新增 UI 多皮肤底座：阅读器运行态保留老 ID，同时补齐 `.igs-stage`、背景层、角色层、对话层、HUD 层、选项层、系统层等稳定 DOM 槽位；`#igs-dialog`、`#igs-ctrl-bar`、`#igs-option-bubbles`、`#igs-db-panel` 不改名，保证旧调用和用户探针可继续定位。
- 修复玻璃质感不一致的根因：工具栏不再作为 `#igs-dialog` 子元素参与对话框的 backdrop/filter 叠加，而是挂到 `#igs-toolbar-layer.igs-hud-layer`；对话框、工具栏、选项气泡、数据库面板统一读取 `--igs-glass-*` 和各自语义 token。
- 选项气泡补齐稳定层与语义 class，定位计算加入工具栏高度，避免选项浮窗遮住工具栏；选项表提取从“首个非 row_id 列”扩展为“所有非 row_id 列”，兼容一行四个选项的宽表。
- 数据库面板挂到 `#igs-db-layer.igs-system-layer`，面板保留 `pointer-events:auto`，标签栏补 `width/max-width/overflow-x/touch-action`，降低非 F12 状态下点击/滚动命中被外层布局影响的风险。
- 删除行与单元格编辑继续使用 `toShujukuApiRowIndex(rowIndex)`，把渲染行号转换为 shujuku API 的行索引（0 为表头、1 为第一行数据），覆盖用户后台报错 `Row index out of bounds` 的定位结论。
- 验证边界：本轮运行 Node gate、模拟测试、构建、loader 生成与 JSON 一致性校验；未写入真实 shujuku，也未调用真实 provider。真实酒馆中的视觉效果仍建议用用户浏览器探针复核 CSS 计算值和点击命中。

### v0.22.10 - 2026-06-20

- 修复玻璃材质只同步 alpha/blur 但质感仍不一致的问题：`.igs-dialog`、`#igs-db-panel`、`.igs-option-bubble` 统一到工具栏同款轻边框、18px 圆角与 `0 4px 24px rgba(0,0,0,.20)` 阴影；选项气泡背景改为 `--igs-glass-bg`，跟随「毛玻璃浓度」运行时变量。
- 数据库面板 sticky 表头取消 `Math.max(0.92, opacity)` 强制厚底，改跟随 `--igs-db-bg` / `glassOpacity`，避免表头区域破坏通透感。
- 修复数据库标签切换后横向滚动位置回到初始位置：`shujuku-panel` 在重渲染前记录 `.igs-shujuku-tabs.scrollLeft`，重建标签条后恢复原滚动位置。
- 修复删除行无效：删除按钮保留显示用 `row_id`，实际调用 `AutoCardUpdaterAPI.deleteRow(tableName, rowIndex)`；同源修正 `updateCell(tableName, rowIndex, colName, value)`，避免 row_id 不连续时编辑写错行。
- 修复选项气泡启用状态读取错误：点击/自动弹出路径改读统一 settings snapshot 的 `bridge.optionBubble`；最后一页渲染后会静默自动尝试显示选项气泡，对话框空白点击也会先切换选项气泡再考虑翻页。
- 验证边界：本轮使用 fake shujuku / fake DOM / dist build 做回归验证，不写入真实 shujuku，不调用真实 provider；用户已提供真实后台错误 `deleteRow: Row index 3 out of bounds` 作为定位证据。

### v0.22.9 - 2026-06-20

- 毛玻璃真正对齐工具栏：v0.22.8 仅统一了 `backdrop-filter` 的 blur，但通透感由背景层 alpha 决定——工具栏 0.12、对话框/数据库被 glassOpacity 覆盖成 0.62，所以仍显厚重。现对话框 `.igs-dialog`、数据库 `#igs-db-panel`、工具栏 `.igs-ctrl-bar`、选项气泡统一用 glassOpacity 驱动背景，默认值 0.62→0.12（去掉工具栏原 `-0.07` 偏移）；「毛玻璃浓度」滑块保留，想调厚仍可调。`.igs-text`/`.igs-speaker` 加重文字阴影，补偿通透背景下的正文可读性。
- 新增「选项气泡」功能：
  - 设置：阅读器 tab 新增「选项气泡」卡片——启用开关、气泡位置（滑块：左上角 / 正上方居中）、点击行为（滑块：自动发送 / 填入输入框）。配置存于 bridge config（全模式共用）。
  - 数据源：`app/src/choices/option-table.js` 从数据库读名为「选项 / 选项表 / 行动选项 / 检定建议表」的同名表，取首个非 row_id 列的文本（去空去重）作为选项。参考骰子系统的同名表机制，复用 `createShujukuClient` + `parseTables`。
  - 交互：仅在最后一页点击对话框空白处显示气泡，再点空白隐藏（不加工具栏按钮）；翻页离开最后一页 / 新回复重渲染时自动收起。点击选项按设置「自动发送」（经 `submitReaderInput` 走输入框→发送，不绕过，保 shujuku 剧情推进）或「填入输入框」（写 `#igs-input` 不发送）。数据库不可用 / 无同名表时静默不弹并提示。
  - 气泡毛玻璃与工具栏一致（`rgba(20,20,22,.12)` + `blur(48px) saturate(220%)`），位置浮于对话框正上方（CSS 变量 `--igs-dialog-h` 跟随对话框实际高度）。
- Playwright 真机验证：气泡左上/居中定位、浮于对话框上方且不溢出视口、毛玻璃参数与工具栏一致。新增选项表数据提取与别名/空表兜底单测。

### v0.22.8 - 2026-06-20

- 修复数据库面板四个问题，全部 Playwright 真机验证。
- ①标签栏溢出无法滚动（电脑+手机都点不到后面的标签）：加标签栏拖动滚动（pointer 事件统一处理鼠标拖+触摸拖），保持单行、滚动条隐藏；拖动超阈值后抑制本次 click 避免误切标签。
- ②行数>8 看不到后面的行、竖向滚不动：真因是 `#igs-db-inner`（`.igs-shujuku-body` 的真实 flex 父级）无任何 flex 样式，table 把它撑到内容高度并溢出面板，`body{flex:1;min-height:0}` 因父级无高度约束而失效。现给 `#igs-db-inner` 加 `flex:1;min-height:0;display:flex;flex-direction:column`，body 成为唯一纵向滚动容器；表头 `position:sticky` 背景调到不透明（`--igs-db-head-bg`）防止滚动透色；移除多余的 `.igs-shujuku-table-wrap` 嵌套层，横向滚动条隐藏。
- ③新增行后空格子无法编辑（增行有效果但点不动）：真因是 `data-db-edit`/`data-db-expand` 挂在内层 `<span>`，空 span 为 `display:-webkit-box` 无内容时塌缩成 0×0、无点击区域，`closest('[data-db-edit]')` 命不中。现把属性移到 `<td>`（有 padding 与列宽，空格子也有可点区），编辑时只替换 td 内的 span 保留列结构。
- ④对话框与数据库面板毛玻璃对齐工具栏质感：`backdrop-filter` 从 `blur(32px) saturate(180%)` 提升到 `blur(48px) saturate(220%)`（对齐 `.igs-ctrl-bar`），背景透明度仍由「毛玻璃浓度」实时控制；补 `-webkit-backdrop-filter` 前缀。
- 新增 `gate:simulation:db-panel` 回归单测，锁定空格子 `data-db-edit` 在 `<td>` 上、inner flex 列布局、body 滚动容器、blur(48px) 毛玻璃。此前 DB 面板无任何测试覆盖，是这些 bug 漏过验收的原因。

### v0.22.7 - 2026-06-20

- 修复 v0.22.6 矫枉过正导致的回归：上一版为根治「对话框高度撑破输入框」，直接让 floating（pc/mobile）模式忽略 `dialogHeight`，结果 PC/手机端「对话框高度」怎么调都无效。
- 正确方案：floating 模式下 `dialogHeight` 改用 `.igs-dialog` 的 `min-height` 把气泡撑到目标高度（内容更多时自然增长），并用 `max-height` clamp 到浮窗可用高度（约 86%）。不再写死 `height`——固定 `height` 比固定行内容还小时会把底部输入框挤出气泡（即 v0.22.6 之前的溢出 bug）。`.igs-text` 仍保持 `min-height:0` 交给 flex 填充滚动。
- Playwright 真机验证：pc(900×540)/mobile(480×680) 下 `dialogHeight` 60→600 全程气泡高度跟随（300→300px、600→clamp 464/584px），短/长正文下输入框恒在气泡内（inBelow=-15/-13）、气泡始终在视口内。
- `dialogHeight=null`（自适应）与 web/fullscreen 模式行为不变。

### v0.22.6 - 2026-06-20

- 修复删桶（v0.21.4 全模式共用一套设置）+ 改挂载点（v0.22.5）后引入的两类 UI 回归，全部用 Playwright 真机验证（非模拟测试）。
- 问题1（设置面板层级被阅读器盖住，复现于 PC 网页全屏/浏览器全屏、移动端全部模式）：根因是 v0.22.5 把 `#igs-overlay` 改挂 `documentElement`，但 `#igs-unified-settings` 仍挂 `body`；宿主 web/fullscreen 运行时把 `body` 设为 `position:fixed`（移动端宿主同样如此），使 body 成为独立层叠上下文，设置面板的 `z-index:2147483200` 翻不出 body、整体被压在 overlay（`2147483000`）之下。真机验证：旧版点击设置中心命中 overlay，修复后命中 settings。现 `mountSettingsDom` 与 overlay 一致挂 `documentElement`。
- 问题2（floating 即 pc/mobile 模式「对话框高度」≥130 时输入框被挤出气泡，真机实测溢出 +43px）：根因是 `applyReaderSettingsToDom` 用内联 `min-height` 强撑 `.igs-text`，覆盖了 CSS 为 floating 设计的 `flex:1 1 auto + min-height:0`；固定行 + 撑高的正文超过气泡 `max-height:220px` 后把底部 `.igs-controls`（输入框/发送按钮）挤出。原有 `overlayHeight*0.24` 的 clamp 不可靠（真机环境下未拦住）。现 floating 模式忽略 `dialogHeight`、`min-height` 归 0 交给 flex 自适应滚动；`dialogHeight` 仅在 web/fullscreen 生效（这两个模式对话框从底部向上生长、不挤压输入框，真机验证至 600px 不溢出）。
- 问题3（「输入框高度」inputScale 联动）：从 `controls.style.zoom` 改为直接设 `#igs-input`/`#igs-send-btn` 的 `height`（基准 32px 按比例），避免 zoom 改变 controls 实际占位高度、干扰 floating 气泡的 flex 计算。
- 顺带清理因此失效的 `overlayHeight` 死变量与 `readElementHeight` 孤儿 import；`.gitignore` 新增 `.playwright-mcp/` 并移除此前误提交的临时产物。

### v0.13.1 - 2026-06-18

- 修复 v0.13.0 引入的回归：立绘图片按情绪组归约取图（多个细分情绪共用一张图），但位置 key 用的是原始情绪词，导致同一张图在不同页位置不统一、调一个不影响另一个。现 `lookupSceneAssetUrls` 额外返回命中的图片槽名（精确情绪 / 组名 / 默认），位置 key 的情绪维度改用该槽名，使位置粒度与图片粒度对齐。旧的 `mode::角色::原始情绪词` 位置数据不兼容（按需重新调整）。

### v0.13.0 - 2026-06-18

- 立绘位置 key 由 `mode::角色` 升级为 `mode::角色::情绪`，每个情绪立绘可独立调整位置（修复改一个情绪位置会带动其他情绪的 bug）。`resolveSpriteLayout` 三级回退：`mode::角色::情绪` → `mode::角色`（旧数据兼容）→ `mode`。
- 新增「统一角色立绘位置」开关（`bridge.sceneAssets.unifiedSpriteLayout`，默认关）：开启后保存立绘位置会写入该角色所有情绪槽，各情绪共用一套位置，且保持 key 格式不变。
- 立绘位置（`spriteLayouts`）纳入场景预设：保存/导出/导入/切换预设时一并读写，预设 JSON 新增 `spriteLayouts` 字段（旧预设缺该字段按空对象处理）。
- 修复旁白页立绘 bug：旁白页无自身 char/thought 标签，原先走错位的 positional 兜底导致随机选到不相干情绪图、且因 key 不一致无法移动保存。现旁白页向前回溯继承最近一个 char/thought 标记的角色+情绪，立绘稳定且可正常编辑。

### v0.12.1 - 2026-06-18

- 补充预设保存按钮（存储图标），支持将当前 scenes/characters/moodGroups 直接保存为预设；选中预设时覆盖，未选中时弹框输入名称。修复无法导出手动配置的问题。

### v0.12.0 - 2026-06-18

- 场景素材新增预设管理栏（位于场景素材区块顶部）：下拉框切换/应用预设，重命名、导入（↑ 从 JSON 文件）、导出（↓ 下载 JSON）、删除按钮；预设包含 `scenes`/`characters`/`moodGroups`，独立存储于 `igs:scene-presets:v1`，同名覆盖。

### v0.11.2 - 2026-06-18

- 修复场景素材立绘按情绪组名取图不显示的真 bug，根因两层：
  1. `scene-directives.js` 的 `SCENE_RE`/`CHAR_RE`/`THOUGHT_RE` 用了行尾锚点 `\]$`，要求标签独占整行。但 AI 实际输出常带翻译尾巴（`[igs-char:小林海斗|淡然|まさか…]*（怎么可能）*`），整行不匹配 → 这些 directive 全部漏提取，mood 永远拿不到。去掉 `$` 锚点，改为匹配到 directive 闭合括号（字段内已禁 `]`，边界精确）。
  2. 立绘 mood 来源原先按「气泡段出现顺序」配 directive（`charThoughtDirectives[bubbleOrdinal]`），但正文里的 `<image>`/`image###` 块、斜体旁白、被合并或前缀剥离的段都会让气泡序号与 directive 序号错位，取到相邻情绪词。改为用 speaker + 台词/心里话文本指纹（剥离 `*（…）*` 翻译尾巴、方括号、空白后做子串比对）直接定位 directive，不再依赖序号。
- 新增回归：带翻译尾巴的 `[igs-char]`/`[igs-thought]` 必须被正确提取。
- 验证：`npm run gate` 全绿（unit 69 + simulate 39）。

### v0.11.1 - 2026-06-18

- 情绪词库 UI 重做：从 `<details>` 改为标准卡片（`igs-source-filter`），与「背景场景」「角色立绘」一致；展开态存入 `asyncState.moodGroupsExpanded`，点卡片内任意按钮（增删改组/词）后重建 DOM 不再缩回；默认折叠。
- 「添加组（+）」与「一键导入情绪组名」并排放在情绪词库卡片标题右侧；导入图标换成向上箭头，语义改为「为所有已配置角色按组名补建立绘空槽」（原先在每个角色行、★ 图标，已移除）。
- 「恢复默认词库」按钮移到情绪词库卡片底部，边距沿用「格式规则注入」的 `igs-settings-row`。
- 修复时间/天气/角色/情绪名含冒号（如时间名 `19:45`）时，URL 因 action 分隔符 `:` 冲突被解析错位、写入失败的 bug：`settings-fields.js` 拼 action 的每个 name 段改用 `encodeURIComponent`，`settings-actions.js` 与 `reader-host.js` input 处理端对应 `decodeURIComponent`（覆盖 scene/time/weather/char/mood 全部增删改名与 set-url，URL 段保持末段整体切取不编码）。
- 修复场景素材立绘不显示：根因是 `[igs-char:]`/`[igs-thought:]` 经默认正则变换成可见气泡行（`[名字]：…` / `*…*`）后进入阅读器分页，而 `extractSceneDirectives` 的行计数 `segmentIndex` 仍按变换前原文计算，两套分段错位，导致当前段解析不出角色、立绘永不显示。改为按「气泡段出现顺序」匹配 `char/thought` directive 取角色名与情绪，立绘 character/mood 来源从 `resolveSceneStateAtIndex(segmentIndex)` 切换为当前气泡的 speaker；背景图仍走 directive 状态累积。保留单段前缀被 `parseSpeakerPrefix` 剥离时的 directive 兜底，以及未变换/裸文本路径回退到 `sceneStateForBg` 的兜底。
- 心里话气泡现在与台词一致显示角色名 + 分隔线（thought 段从文本内嵌名字或顺序匹配 directive 取 speaker 填入）。

### v0.11.0 - 2026-06-18

- 新增情绪词分类系统（`app/src/scene/mood-groups.js`）：内置 8 组情绪词库 `DEFAULT_MOOD_GROUPS`（喜悦/愤怒/悲伤/紧张/平和/害羞/嫌弃/爱恋，共 108 词），参考 `_inbox/酒馆助手脚本-对话渲染系统 v7.1`。`resolveMoodGroup` 把细分词归约到组名，`buildMoodGroupsText` 渲染成注入文本。
- 注入提示词占位符：`DEFAULT_SCENE_PROMPT_RULE` 新增 `[情绪词约束]` 段 + `{{mood_groups}}` 占位符；注入前用当前词库文本替换（用户删除占位符则不替换不报错），约束 AI 情绪字段只从池里选词。
- 立绘差分查表三级兜底（`lookupAssetValue`）：精确槽（兼容旧自由命名）→ `resolveMoodGroup` 归约组名槽 → `默认`。AI 写「欣喜」自动归到「喜悦」组取图，立绘按 8 组配置即可覆盖全部细分词。
- 存储：`bridge.sceneAssets.moodGroups` 新增字段，`normalizeSceneAssets` 默认填入 8 组。
- 设置面板：场景 tab 角色立绘卡片内新增可折叠「情绪词库（全局）」编辑区（默认折叠），支持增删改组、增删改词（2-3 汉字校验、跨组去重、每组至少留 1 词）、恢复默认词库；每个角色行新增「一键导入情绪组名」（★）按钮，按当前组名在该角色下批量建立绘槽。
- 注入深度修正（`prompt-injector.js`）：`setExtensionPrompt` 位置从 `IN_PROMPT(0)` 改为 `IN_CHAT(1)`、depth 0，让格式约束贴在对话末尾，不再被长上下文（用户预设+角色卡）淹没导致 AI 忽视。复盘 git 历史确认：v0.4.0 起注入失效的真因是 IGS 作为远程 bundle 拿不到 JS-Slash-Runner 注入到脚本作用域的裸 `injectPrompts`，而非参数错误；`setExtensionPrompt` 走 `SillyTavern.getContext()` 才是 IGS 的可靠路径，本版只改其 position 语义对齐对话渲染系统的 in_chat 效果。
- 新增 `CHAT_CHANGED` 事件监听，切聊天后自动重注入（in_chat 注入只对当前聊天有效），`destroy` 时解绑。
- 测试：新增情绪归约/词库渲染/归一化兜底/立绘三级兜底/占位符替换端到端覆盖；注入 position 断言同步改为 `IN_CHAT(1)`。

### v0.10.3 - 2026-06-17

- 阅读器按段落类型分类渲染：台词 `[名字]：...`、旁白（无标记）、心里话 `*...*` 各自独立判定。
- 修复旁白段误显示角色名+分割线的问题——名字/分割线仅在台词段出现，判定基于段落文本本身而非持续的角色状态。
- 台词气泡去掉 `[名字]：` 前缀，名字独立显示在气泡顶部；单段落消息经 directive 兜底判定，避免前缀被提前剥离后误判为旁白。
- 台词与旁白字体/颜色可分开设置：主题新增「旁白」子卡片（`narrationFont`/`narrationColor`），默认沿用台词值。
- 修复自定义主题下心里话字体含双引号（如 `"KaiTi",serif`）打断内联 `style` 属性、导致字体颜色不生效的真 bug——字体值内双引号统一转单引号。
- `[igs-thought:]` 变换由 `*[$1]：$2*` 改为 `*$2*`（心里话气泡不显示角色名，角色信息仍用于立绘匹配）。

### v0.10.2 - 2026-06-17

- 背景场景配置升级为三层结构：场景 → 时间 → 天气，子层优先级最高（天气 > 时间 > 场景 > 默认）。UI 内联显示嵌套子项，各层独立增删改名。
- 移除单条目自动兜底逻辑：只有真正命名「默认」的条目才会在无精确匹配时兜底，不再对唯一条目自动回退。
- 正文格式化默认正则更新为仅匹配 `[igs-char:]`（`[$1]：$2`）；`[igs-thought:]` 由新增固定变换自动转为心里话 `*...*`，触发已有 `.igs-thought` CSS（心里话字体/颜色），无需用户修改任何设置。
- 默认排除标签新增 `image`，防止 `<image>` 内容渗入正文。
- 提示文字从场景设置底部移入「背景场景」卡片内。
- `resolveSceneStateAtIndex` 返回值新增 `lastDirectiveType` 字段（`'scene'|'char'|'thought'|''`）。

### v0.10.0 - 2026-06-17

- 重构场景素材指令格式：废弃旧的 `@igs-scene:角色|情绪|场景|[对白]` 四字段单标签，改用三种独立方括号标签：`[igs-scene:场景名|时间|天气]`（场景切换）、`[igs-char:角色名|情绪|对白]`（角色对白）、`[igs-thought:角色名|情绪|心里话]`（心理描写，可选）。方括号边界彻底消除跨行误捕，场景与角色/心理描写完全解耦，可独立出现。`resolveSceneStateAtIndex` 返回值扩展为 `{ scene, time, weather, character, mood, dialogue, thought }`，`lookupAssetValue` 默认兜底逻辑不变。不保留旧格式兼容。

### v0.9.2 - 2026-06-17

- 重写 chami 插图扫描逻辑（`chami-provider.js`）：扫描时收集楼层内所有 `.tsp-generated-image` 的 `data-image-id`，按 id 升序调用 `window.TavernScenePlugin.db.getImageDataBatch(ids)` 从 chami 的 IndexedDB 批量取出真图 Blob（`URL.createObjectURL` 转 url）。彻底摆脱 chami「滚出可视区即卸载回占位 gif」的懒加载限制——不论图当前在不在可视区都能取到，且按生成顺序（= 正文图位顺序）正确绑定，修复「DOM 乱序导致第3张图绑到图位1」的错位。DB 不可用时回退到原 DOM 扫描。
- 各插图扩展扫描逻辑解耦：chami 走 DB 专属取图，chatu8 保留自身 DOM 扫描，「图像扩展」设置真正决定走哪条路径。
- `provider-runtime.js` 的 `extractImages` 调用改为 `await`，支持异步 provider。
- 阅读器背景图位的转圈动画仅在真正轮询加载（`imageLoading`）时显示；轮询结束仍未取到图时显示「图片未生成」占位（`.igs-image-empty`），不再永久转圈误导用户。

### v0.9.1 - 2026-06-17

- 修复扩展插图模式（chami / chatu8）下，阅读器已扫描到生成图、却因图片不带 `slotIndex / locationHash / imageId` 匹配键而绑不进图位，导致背景层永久转圈（`已绑定 0/N`）的问题。`assignCandidatesToSlots` 现接入 `applyOrderedSlotFill`：当 provider 候选图 ≥ 2 张且精确匹配全落空时，按 DOM 出现顺序把图依次填入仍为空的图位。仅对 provider 候选启用，cached / scene 路径不变；单张图（`< 2`）仍保持不兜底，避免误绑。
- 修复正文格式化默认正则 `DEFAULT_VIRTUAL_REGEX`：移除行首 `^` 与行尾 `$` 锚点，使带翻译尾巴 `*（…）*`（含跨行）或非行首的 `@igs-scene` 行也能被正确替换。升级后如沿用旧的本地预设，请在设置中点一次「恢复默认正文替换」获取新正则。
- 以上两个问题自 `v0.8.1` 起即存在，经锁版本对比测试确认与 `v0.9.0` 的品牌重命名无关。

### v0.9.0 - 2026-06-17

- 项目品牌从 `Visual Novel` / `VN` 重命名为 `Immersive Galgame System` / `IGS`，不保留向后兼容。
- 仓库从 `xiagaogaozi/Visual-Novel` 迁移到 `xiagaogaozi/Immersive-Galgame-System`；loader CDN/jsDelivr 路径同步更新。
- 公开 API 全局名 `window.VN` / `window.VisualNovel` → `window.IGS` / `window.ImmersiveGalgameSystem`；老二创 mod 不再可用。
- 用户存储键迁移：`vn_visual_novel_bridge_config` → `igs_bridge_config`，`vn-reader-settings-v9-*` → `igs-reader-settings-v9-*`，`vn-display-mode` → `igs-display-mode`；首次升级会清空旧设置。
- CSS 类、DOM id、`data-*` 属性、CSS 变量、事件名（`vn:ready` 等）、bundle 内部辅助函数（`__vn*`）全部前缀 `vn`/`VN`/`__vn` → `igs`/`IGS`/`__igs`。
- 场景指令 `@vn-scene` → `@igs-scene`，`vn-scene-assets-format-rule` → `igs-scene-assets-format-rule`；旧聊天里残留的 `@vn-scene` 标签不再被解析。
- 导入/导出格式 `vn-import-bundle` → `igs-import-bundle`；旧导出包不能直接导入。
- 文件产物 `vn.bundle.js/.css` → `igs.bundle.js/.css`，loader 文件改名为 `igs-loader.{js,json}` 与 `igs-loader-debug.{js,json}`。
- 目录改名：`app/src/visual/visual-novel-ui/` → `igs-ui/`，`app/fixtures/visual-novel{,-ui}/` → `igs{,-ui}/`，`app/src/storage/legacy-visual-novel.js` → `legacy-igs.js`，`app/src/api/visual-novel-compat.js` → `igs-compat.js`。

### v0.8.1 - 2026-06-17

- 新增调试版 loader（`igs-loader-debug.js` / `.json`）：由 `build:loader` 自动从正式版派生，导入酒馆后设置 `window.IGS_DEBUG=true`，输出 `[DEBUG-*]` 控制台日志；正式版完全不受影响。
- 新增 `igsDebug()` 工具（`reader-value-utils.js`）：仅当 `IGS_DEBUG` 为真时输出，正式版零开销。
- 在立绘编辑（`sprite-edit.js`）和立绘布局应用（`reader-dom-render.js`）加入 `[DEBUG-sprite]` 探针，用于诊断切换模式 layout 滞后与拖动手感问题。
- 移除基础设置页中无效的「调试日志」开关（`bridge.debug` 自始未接任何逻辑，是遗留死开关）。
- 修复 `gate-contract` 中硬编码的过期发布文件名，改为按当前版本动态解析。

### v0.8.0 - 2026-06-16

- 修复全屏模式下点上/下一轮在全屏↔网页全屏来回切换：`closeReader` 新增 `keepFullscreen` 参数，`openReader` 内部切层时不退出全屏，仅用户点关闭按钮才退出。
- 修复编辑立绘位置时拖动方向相反（四个模式）：`sprite-edit.js` 拖动公式从 `-` 改为 `+`，立绘跟随光标移动。
- 修复全屏模式隐藏对话框后点击无法恢复：移除全屏 runtime 对 `#igs-click-layer` 的 `pointer-events:none`（该 workaround 在 v0.7.9 根治退出问题后已多余）。
- 修复显示状态行开关无效：`.igs-status-line` 显示时用 `display:block` 覆盖 CSS 默认 `display:none`。
- 修复点击上一轮落在上一轮最后一页：`moveReaderTurn` 的 `startAtEnd` 改为恒 `false`，上/下一轮都从第一页开始。

### v0.7.9 - 2026-06-16

- 立绘缩放范围从 50%~300% 放宽至 -500%~500%（滚轮和双指缩放两处 clamp 同步修改），支持大尺寸立绘缩小及镜像翻转。
- 修复全屏模式点击即退出：根因是每次翻页 `hydrateReaderMount` 重建 `#igs-overlay`，导致 runtime cleanup 调用 `exitFullscreen()` 进而触发自动关闭。现移除 runtime cleanup 的自动退出和 `fullscreenchange` 的自动关闭逻辑，浏览器全屏状态不再联动阅读器。
- 退出浏览器全屏的时机改为：仅「点击关闭按钮」（`closeReader`）或「切换到非全屏模式」时调用 `exitDocumentFullscreen`。

### v0.7.8 - 2026-06-16

- 重构：拆分 `app/src/visual/igs-ui/reader-host.js` 巨型模块，从 3619 行降到 1486 行，行为零改变。
- 新增 10 个子模块：`reader-host-constants.js`（常量 + 提示词模板）、`reader-value-utils.js`（纯值工具）、`settings-fields.js`（表单控件 HTML）、`reader-image-state.js`（图片状态归一化）、`reader-dom-utils.js`（DOM 工具）、`settings-normalize.js`（归一化/主题）、`settings-actions.js`（场景素材增删改查）、`sprite-edit.js`（立绘编辑）、`reader-runtime.js`（模式运行时）、`reader-dom-render.js`（快照渲染）。
- 有状态子模块改为「传入上下文」形式，不再依赖闭包；删除死代码 `escapeRegExp`。全部 58 单测 + 38 模拟测试保持通过。

### v0.7.7 - 2026-06-16

- 修复全屏模式点击即退出：`#igs-click-layer` 在全屏模式下设为 `pointer-events:none`，不再拦截工具栏和 dialog 的点击事件。
- 修复编辑立绘位置影响其他角色：`spriteLayouts` 从单纯按模式存储改为 `mode::character` 复合 key，每个角色在每个模式下独立存储位置。查找时优先匹配角色专属 key，回退到模式通用 key（兼容旧数据）。

### v0.7.6 - 2026-06-16

- 修复角色名到气泡顶部边距未生效：根因是 `.igs-dialog` 的 `padding-top: 22px` 和 `.igs-progress` 的 `margin-bottom: 10px` 叠加。场景模式有 speaker 时动态将 dialog padding-top 缩为 10px；progress margin-bottom 清零。
- 修复自定义模式分隔线颜色默认黑色：切换到自定义模式时，用上一个预设的全部字段值填充自定义字段，避免残留旧值（如 minimal 的暗色）。

### v0.7.5 - 2026-06-16

- 修复调色盘点击即消失：对 `type="color"` 输入改为只监听 `change` 事件（关闭调色盘时才更新），跳过 `input` 实时事件避免 DOM 重建导致弹窗销毁。
- 修复自定义模式分隔线消失：`resolveActiveTheme` 的 custom 分支对 `dividerSymbol` 用 `!= null` 判断而非 `||`，保留用户选择的 'none' 或任意值。
- 间距进一步收紧：角色名 `margin-top:1px; margin-bottom:1px`，分隔线 `margin-bottom:2px`。
- 设置面板分组卡片布局：角色名/台词/心里话/分隔线各成一组，字体和颜色并排显示。
- 调色盘色块预览：`input[type="color"]` 添加 42×36px 独立样式，直接展示当前选中颜色。

### v0.7.4 - 2026-06-16

- 默认预设改为原神风（之前默认极简模式分隔线为 'none' 导致不显示）。
- 缩小角色名与分隔线之间间距（2px）、分隔线与台词之间间距（4px），贴近原神对话 UI 效果。
- 修复 `normalizeVnTheme` 中 `nameAlign` 的 fallback 逻辑。

### v0.7.3 - 2026-06-16

- 修复角色名和分隔线不显示：CSS 默认 `display:none`，需要用 `display:block` 覆盖而非空字符串。
- 颜色选项改为浏览器原生调色盘（`<input type="color">`），不再需要手动输入色值。
- 新增角色名字体、台词字体、心里话字体三个下拉选择框（楷体/黑体/仿宋/微软雅黑）。
- 主题预设颜色统一改为 hex 格式以兼容调色盘。

### v0.7.2 - 2026-06-16

- 修复角色名未从 `@igs-scene` directive 提取：`resolvedSpeaker` 现在从 `resolveSceneStateAtIndex().character` 获取，不再依赖外部 payload 的 `scene.speaker` 字段。
- 修复 `displayText` 计算顺序错误导致 `ReferenceError`：将 `displayText` 构建移至 scene directive 解析之后。
- 设置面板中非自定义预设时，字段值现在反映所选预设的实际配置。

### v0.7.1 - 2026-06-16

- 修复场景模式下角色名未展示：virtualRegex 格式化后的 `[speaker]: text` 前缀现在会被正确剥离，角色名移至独立 `.igs-speaker` 元素显示。
- 修复设置面板预设值显示错误：选择非自定义预设时，下方字段现在正确反映所选预设的值而非存储的旧值。

### v0.7.0 - 2026-06-16

- 新增角色姓名展示：场景模式下在气泡顶部显示角色名，支持左对齐/居中。
- 新增分隔线：角色名与台词之间可选装饰分隔线（◇/✦/══/渐变/无）。
- 新增心里话样式：`*...*` 包裹的文本以独立颜色/字体渲染。
- 新增对话主题系统：预设（原神风/崩铁风/极简）+ 自定义模式，可调角色名/台词/心里话/分隔线的字体与颜色。
- 状态行改为可选：阅读器设置中新增开关（默认关），开启后在气泡外顶部左对齐显示段落进度。

### v0.6.2 - 2026-06-16

- 修复混合模式数据源：从 `extracted.segmentImageSlots` 读取段落映射而非 `payload.segmentImageSlots`（payload 在实际运行时可能为空）。
- 场景素材启用时非生图段落主动清空背景：不再继承 `displayImageState.displayUrl` 的生图 URL，确保非生图段落不显示生成图。

### v0.6.1 - 2026-06-16

- 修复混合模式分区：重写 `buildSceneAssetsMapping`，只把紧挨 `<image>` 标签前方的段落标记为生图段落，其余段落正确返回 null 走场景素材查表。
- 修复 `Number(null)=0` 误判：snapshot 构建时用 `!= null` 严格区分 null 段落和 slot 0 段落。

### v0.6.0 - 2026-06-16

- 图片绑定精确化：移除 `orderedSlotFill` 和 `preferredSlotFallback` 兜底逻辑，只保留精确匹配（slotIndex / locationHash / imageId），无身份标识的图片进入 unboundImages 而非猜测绑定。
- chatu8 按 DOM 顺序绑定 slot：利用 chatu8 原地替换 `<image>` 标签的特性，按 DOM 文档顺序赋 slotIndex，修复图片顺序错乱问题。
- 混合模式生图与场景素材分区：生图（已绑定 slot 的图片）独占对应段落背景且不叠立绘，其余段落走场景素材查表显示背景+立绘。

### v0.5.1 - 2026-06-15

- 立绘编辑框占满阅读器：进入编辑模式时 `#igs-sprite` 临时扩展为全屏，拖动区域更大、虚线框覆盖整个阅读区。
- 各模式立绘位置独立：新增 `spriteLayouts` 字段按 `pc / mobile / web / fullscreen` 分别存储焦点与缩放，切换模式互不影响。
- 设置按钮禁止隐藏：`normalizeHiddenButtons` 强制过滤 `settings`，按钮管理 UI 中设置行的眼睛按钮置灰不可点。
- 版本升级自动重置阅读器配置：`readerSettings` 新增 `_v` 版本戳，加载时若存储版本不匹配当前版本则丢弃旧配置回到默认值，防止旧配置（含隐藏按钮）污染新版本。
- 取消默认常驻隐藏对话框按钮：`DEFAULT_PINNED_TOOLBAR_BUTTONS` 改为空数组。

### v0.5.0 - 2026-06-15

- 立绘直接编辑模式：工具栏新增"调整立绘位置/大小"按钮，点击后进入原地编辑；单指/鼠标拖动平移焦点，滚轮/双指捏合调整缩放（50%–300%），操作栏提供「还原」「取消」「保存」三键。
- 修复竖向立绘过小：`#igs-sprite` 的 `background-size` 从 `contain` 改为 `100%`，竖图不再被高度约束压缩，默认显示底部（`background-position: 50% 100%`）。
- 新增 `spritePosX / spritePosY / spriteScale` 三个 `readerSettings` 字段，持久化保存调整结果。

### v0.4.9 - 2026-06-15

- 修复立绘层实际不可见：当 `snapshot.content.spriteImage` 存在时，阅读器宿主现在明确把 `#igs-sprite` 的 `display` 设为 `block`，不再回落到原版 CSS 的 `display:none`。
- 新增回归验证：场景素材背景和立绘同时存在时，不只断言 `spriteImage` 字段，还断言阅读器 HTML 中 `#igs-sprite` 已切换为可见显示状态。
- 验证边界：本轮继续使用 fake TavernHelper / fake DOM / fixtures 与 Playwright 运行态证据定位，不写入真实 shujuku，不调用真实图像 provider。

### v0.4.8 - 2026-06-15

- 修复场景素材立绘不显示：`@igs-scene` 现在记录对应的阅读器段落索引，场景状态只继承当前段落之前的角色/情绪/场景，不再被后文角色标签污染。
- 修复阅读器立绘层缺失：原版阅读器模板补回 `#igs-sprite` 节点，并保留背景图与角色立绘同时渲染；已有背景图不再强制清空 `spriteImage`。
- 新增回归验证：覆盖当前段落场景状态继承、已有背景图时仍保留立绘、阅读器模板必须包含 `#igs-sprite`。
- 验证边界：本轮仍使用 fake TavernHelper / fake DOM / fixtures 做模拟验证，不写入真实 shujuku，不调用真实图像 provider。

### v0.4.7 - 2026-06-15

- 修复场景注入提示词不生效：`prompt-injector.js` 现在优先走 SillyTavern `setExtensionPrompt`，明确写入 `IN_PROMPT = 0`，并在写入后校验 `extensionPrompts` 中的内容和 position。
- `bootstrap.js` 为场景素材注入增加失败重试，避免启动时 SillyTavern context / TavernHelper 尚未完全就绪时静默失败。
- 修复场景素材不显示的配置容错：背景和情绪资源优先精确匹配，其次 `默认`，最后在只有一个非空素材时作为兜底使用，兼容用户只配置 `场景1` 或单个情绪图的情况。
- 新增回归测试覆盖 prompt 注入 position、清理注入 key、单素材兜底匹配，以及从 legacy storage 启动后渲染场景素材的模拟闭环。
- skipped：本轮不生成新版酒馆导入 JSON、不做真实 provider/shujuku 写入；按项目规则以 Node 模拟测试和 dist build 作为验收。

### v0.4.6 - 2026-06-15

- 修复提示词注入不生效：`syncSceneAssetsInjection` 延迟 3 秒执行，等待 TavernHelper 初始化完成后再调用注入 API。
- 修复 `prompt-injector.js` 查找路径：增加 `globalThis` 和 `window` 查找 TavernHelper/SillyTavern，不再只依赖传入的 `globalObject`。
- 注入 position 改为 `in_prompt`（系统提示区域），避免被过长的聊天上下文截断。
- 版本号同步 bootstrap.js / package.json / tests。

### v0.4.3 - 2026-06-15

- 修复场景素材不显示：DEFAULT_VIRTUAL_REGEX 改为贪婪匹配 `[台词]` 方括号内容，兼容 `@igs-scene` 四段和 `@bubble` 三段。
- `resolveSceneStateAtIndex` 不再用 lineIndex 裁剪，整楼层累积所有 directives 得到最终场景状态。
- 场景素材显示逻辑（仅 `sceneAssets.enabled` 时生效）：有扫描图的段显示扫描图不叠立绘，无扫描图的段显示素材背景+立绘。未启用时完全不影响正常图片轮询。

### v0.4.1 - 2026-06-15

- `@igs-scene` 格式改为四段式：`@igs-scene:角色名|情绪|场景名|[台词]`。
- `scene-directives.js` 改为只读提取（不删除行，交给 regex 处理显示）。
- DEFAULT_VIRTUAL_REGEX 改为同时匹配 `@igs-scene`（四段）和 `@bubble`（三段）。
- DEFAULT_SCENE_PROMPT_RULE 重写为 v7.1 风格硬措辞（18 条规则 + 完整示例）。
- 设置面板背景名/角色名/情绪名旁加 SVG 铅笔重命名按钮（prompt 弹窗）+ SVG 垃圾桶删除按钮。

### v0.4.0 - 2026-06-15

- 新增「场景素材」模式：通过 `@igs-scene:` 标签驱动背景图和立绘切换。
- 新增 `scene-directives.js`：提取/解析 @igs-scene 标签，查表返回背景/立绘 URL。
- 新增 `prompt-injector.js`：向 AI 注入场景标注格式规范（TavernHelper.injectPrompts → setExtensionPrompt 降级）。
- `message-source.js`：在 virtualRegex 前提取 sceneDirectives，附带到 payload。
- `image-slots.js`：sceneAssetsMode 下每张扫描图只绑前一段正文。
- `reader-host.js`：#igs-sprite 层 + 背景/立绘 fallback + 场景 tab UI + action handlers（增删改条目）。
- `original-reader-source.js`：#igs-sprite CSS（居中底部 40%×85%）。
- `settings-tabs.js`：新增 scene tab 模板。
- `bootstrap.js`：promptInjector 生命周期（启动/保存/销毁）。

### v0.3.23 - 2026-06-15

- 新增 rescan 操作加载转圈动画（collect 前显示 spinner，完成后移除）。
- rescan 使用 skipCache 跳过过期 blob URL 缓存。
- 新增 hiddenBtns 设置，支持隐藏工具栏按钮。
- 替换常驻按钮简单切换为完整按钮管理器 UI（☰ 排序 / 眼睛显隐 / 星常驻）。
- 新增 btnOrder 设置字段，toolbar-move-up 实际交换排序。
- 隐藏的按钮自动解除常驻，applyToolbarState 尊重 hiddenBtns 和 btnOrder。
- 移除 normalizePinnedButtons 的空值强制回退。
- 设置面板按钮管理操作后保持滚动位置。

### v0.3.22 - 2026-06-14

- 过滤 chami 未加载占位图：`dom-image-candidates.js` 新增 `isUnloadedPlaceholderImage`，跳过 `data-is-loaded="false"` 或 URL 为已知 1x1 透明 gif 的 IMG 节点，避免占位图污染候选池并触发 `uniqueImages` 错误去重。
- 新增"刷新图位"工具栏按钮（`rescan`）：手动触发重新扫描当前楼层图片，用于 chami 异步加载完成后刷新绑定。图标为圆形箭头（↻），与"重新生成背景图"的画笔图标区分。
- 调整"重新生成背景图"按钮图标为画笔/魔法棒样式，更符合"AI 重绘"语义。
- 增大轮询窗口：默认轮询次数从 8 次增加到 20 次，间隔从 250ms 增加到 500ms（总窗口从 2 秒增加到 10 秒），给 chami 更多异步加载时间。

### v0.3.21 - 2026-06-14

- 修复 chami 图片绑定错位：所有图位显示同一张图（第 6 张），正文前 5 张图全部丢失。
- 根因：`dom-image-candidates.js` 的 `nodePathKey` 使用 `Array.isArray(parent.children)` 判断子节点列表，但 DOM 的 `parent.children` 是 `HTMLCollection` 而非 Array，该检查永远为 false，导致 `index` 始终为 0。
- 所有 `.tsp-image-slot` SPAN 各自在独立 `<P>` 中且都是第 0 个子元素 → `nodePathKey` 返回完全相同的路径 → `imageCandidateGroupKey` 产生相同的 `slot:` key → `grouped` Map 后入覆盖前入，只保留最后一张。
- 修复：将 `Array.isArray(parent.children)` 替换为 `parent.children && parent.children.length != null`，并使用 `Array.prototype.indexOf.call` 正确查找元素在兄弟节点中的位置。

### v0.3.20 - 2026-06-14

- 修复 chami 等外部 provider 图片始终显示"当前图位未生成"的问题：根因是轮询时 `message.element` 指向被酒馆重建后脱离 DOM 的旧节点，导致 provider 扫描范围为空、收集不到任何图片。
- `reader-image-service.js` 新增 `isDetachedElement` 检测和 `refreshMessageElement` 自动刷新：当 `requireMessageScope` 为 true 且初始 scope 失败或 element 已脱离文档时，自动通过 `hostAdapter.getMessageById` 重新获取最新 DOM 引用后重试 scope 解析。
- `reader-host.js` 轮询时显式传入 `messageId`，确保 service 层在 message 引用失效时仍可通过 id 重查 DOM。
- 保留 v0.3.19 的"单张无标记图片不得绑定第一图位"设计（`applyOrderedSlotFill` 仍要求 >= 2 张有序候选才执行顺序填充）。

### v0.3.19 - 2026-06-13

- 修复 `<image>` 图位绑定：存在正文图位时，单张无编号外部图片不再自动冒充当前图位，避免最后一张图显示成第一张；只有明确图位、位置标记、图片数量完全对齐，或用户点击当前页重绘后出现的新图，才会绑定到对应图位。
- 修复阅读器图片进度：有 `<image>` 图位时进度改为显示“当前图位/已绑定数量/未匹配数量”，不再用 `[1/6 图]` 表示并不存在的已绑定图片。
- 修复“重新生成背景图”对普通外部按钮无响应的问题：当前楼层内带“生成图片、重新生成、重绘、regen”等文字或属性的按钮会被识别，并在重绘后把新图绑定回当前图位。
- 修复阅读器常驻按钮体验：隐藏按钮默认常驻，常驻按钮点亮样式增强；“图像显示模式”现在会实际切换背景 `cover / contain` 显示。
- 新增回归验证：单张无标记图片不得绑定第一图位、普通“生成图片”按钮可重绘当前图位、每个 `<image>` 注入独立占位、常驻隐藏按钮默认可见。

### v0.3.18 - 2026-06-13

- 修复魔法棒入口扫描的自删自建循环：入口扫描现在只清理版本不匹配、位置不正确或形状异常的 `data-igs-*` 菜单项，不再把当前正式入口当作旧入口无条件删除。
- 新增回归验证：重复执行 `ensureMagicWandEntry()` 时必须复用同一个菜单节点，避免 DOM 监听器在酒馆初始化期被反复触发。
- 发布产物同步提升到 `v0.3.18`，自动更新 loader 仍按 GitHub `main` 最新提交拉取远程 bundle。

### v0.3.17 - 2026-06-13

- 统一内部命名空间：内部代号、公开全局对象、CSS 前缀、DOM 属性、存储前缀、Mod/Preset/Pack 后缀均切换为 `IGS` / `vn` 体系。
- 发布链路同步切换为 `app/dist/igs.bundle.js`、`app/dist/igs.bundle.css`、`loader/igs-loader.js` 与 `loader/igs-loader.json`。
- 最终导入件固定为 `loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v0.3.17.json`，loader 继续从 GitHub `main` 最新提交加载远程 bundle。

### v0.3.14 - 2026-06-13

- 同步原版参考路径：活文档、AI 工作流、发布说明和 Immersive Galgame System UI 契约中的原版来源目录已改为 `projects/Immersive Galgame System 原版备份`。
- 统一 Immersive Galgame System 对外形态：项目目录、魔法棒入口、运行时公开名、dist manifest 和用户可见导入文件均使用 `Immersive Galgame System`。
- 最终导入件固定为 `loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json`；`loader/igs-loader.json` 继续作为固定内部入口和自动化校验基准。

### v0.3.13 - 2026-06-13

- 按 `plan/v0.3.13-原版VN安全楼层取图与image占位绑定施工图.md` 收紧原版 VN 兼容取图范围：`reader-image-service.js` 现已在存在 `<image>` 图位时强制要求当前楼层作用域，找不到当前楼层根时直接返回空图位，不再退回整页扫描。
- `dom-image-candidates.js` 修复了隐藏的整页漏扫入口：即使已经拿到当前消息根，provider 也不会再偷偷把 `document` 加回扫描列表；普通 `img[src]` 只有在当前 `.mes_text` 内时才允许参与图位绑定。
- `tavern-helper-adapter.js` 新增当前楼层 `<image>` 占位注入与复用逻辑，`message-source.js` 同步忽略这些隐藏占位文本，确保正文分页不被占位节点污染。
- 扩展 Node 模拟酒馆测试：新增“楼层外角色卡图不得混入当前 `<image>` 图位”“当前楼层第三图位重绘仍锁定第三图位”“占位节点只注入当前 `.mes_text`”等回归场景。

### v0.3.12 - 2026-06-13

- 强化自动更新链路：`loader/igs-loader.js` 默认读取 GitHub API `branches/main`，拿到当前 `main` 提交哈希后加载 `https://cdn.jsdelivr.net/gh/...@<commit>/app/dist/igs.bundle.*`，避免 raw manifest 缓存仍停在旧版本、jsDelivr 新标签短时 404 或 `@main` 分支文件继续吐旧入口。
- 保留兜底：GitHub API 不可用时仍回退 `@main`，手动指定 `window.IGS_LOADER_REF` 或自定义 base 的行为不变。
- 更新 loader VM 回归测试：默认加载必须使用 GitHub API 返回的 40 位提交哈希，确保酒馆端实际拿到的就是当前提交里的自包含 bundle。

### v0.3.11 - 2026-06-13

- 修复 jsDelivr `@main` 分支缓存继续返回旧 267 字节入口的问题：`loader/igs-loader.js` 现在默认先读取 `raw.githubusercontent.com/.../main/app/dist/manifest.json`，从最新 manifest 得到 `vX.Y.Z` 后优先加载 `https://cdn.jsdelivr.net/gh/...@vX.Y.Z/app/dist/igs.bundle.*`。
- 保留自动更新：以后发布新版本只需要更新仓库 `main` 的 manifest 和打版本标签，loader 不需要再手改内置版本号；manifest 或版本标签不可用时才回退 `@main`。
- 更新 loader VM 回归测试：默认加载必须先走 manifest 指向的版本标签，坏固定 ref 仍能 fallback，避免酒馆端继续吃 `@main` 旧缓存导致 `<image>` 绑定修复不生效。

### v0.3.10 - 2026-06-13

- 修复自动更新链路的实机错位风险：`app/scripts/build.js` 现在会把 `app/src` 模块打成自包含的 `app/dist/igs.bundle.js`，不再发布只有 267 字节、继续 `import ../src/index.js` 的转发入口。
- 这个问题会导致 loader 入口虽然带 cache bust，但浏览器/酒馆仍可能复用未带刷新参数的旧子模块；表现就是本地源码已绑定 `<image>`，酒馆里第 1 页仍显示后段图片，翻正文页时图片页码不跟随。
- 新增 `gate:dist-bundle:is-self-contained-for-loader-cache-bust` 回归闸门：发布产物不得包含运行时 `import`，必须包含当前版本号与 `resolveSegmentImageIndex` 绑定逻辑。
- 当前远程发布文件会直接携带 v0.3.9 的 `<image>` 图位修复，避免旧模块缓存继续把正文第 1 页错绑到最后一张图。

### v0.3.9 - 2026-06-13

- 修复阅读器翻正文时图片页码不变的问题：`reader-host.js` 现在优先使用当前正文段落对应的 `<image>` 图位索引，而不是复用打开阅读器时的旧 `imageState.currentIndex`。
- 修复“第 1 页显示正文最后一张图”的错绑：阅读器不再从当前图位向后偷拿第一张有 URL 的图，当前正文页只显示它绑定的当前图位；未绑定兜底只在数量能和图位一一对应时按同序号使用。
- 修复普通 DOM 图片空索引误判：`dom-image-candidates.js` 不再把缺失的 `data-slot-index / data-image-index` 当成数字 `0`，避免多张普通 `img[src]` 全部写进第 1 个图位。
- `reader-image-service.js` 对 generic DOM 图片收紧首选图位兜底：普通无元数据图片只有数量与 `<image>` 图位相等时才按顺序填槽；单张无元数据普通图不会再冒充第 1 个图位。
- 新增回归测试：只绑定第 6 图位时第 1 页不得显示第 6 图；6 张普通 DOM 图必须按 `<image>` 顺序填槽，点下一段后背景从第 1 图切到第 2 图。
- 本轮已通过 `npm run test`、`npm run simulate`、`npm run gate`、`npm run build:loader` 与 loader JSON 反解校验。

### v0.3.8 - 2026-06-13

- 优化自动更新 loader 的入口体感速度：`loader/igs-loader.js` 现在会在远程 `igs.bundle.js` 下载完成前先向酒馆魔法棒菜单注入临时入口；正式 IGS 运行时加载完成后，`createMagicWandEntry()` 会清理该临时入口并替换为正式入口。
- 默认 `@main` 加载路径不再额外做一次 HEAD 探测，减少一次远程请求；手动指定旧 tag、测试分支或自定义 base 时仍保留探测和 `@main` fallback，避免坏 ref 直接弹失败框。
- 修复截图同类图片黑屏问题：`dom-image-candidates.js` 现在会在楼层范围内识别普通 `img[src] / img[data-src]`，并过滤明显的头像/宿主装饰图；`reader-host.js` 在当前 `<image>` 图位暂未绑定 URL 时，会用已扫到的未绑定插图或 `currentUrl` 兜底显示，不再只显示黑底。
- 新增回归测试：loader 在远程 bundle 未完成前必须先显示临时魔法棒入口；含 `<image>` 图位且楼层只有普通图片节点时，阅读器必须显示该图片为背景。
- 本轮已通过 `npm run test`、`npm run simulate`、`npm run gate`、`npm run build:loader` 与 loader JSON 反解校验。

### v0.3.7 - 2026-06-13

- 修复自动更新 loader 的发布逻辑：`loader/igs-loader.js` 默认 ref 改为 `main`，直接加载 `https://cdn.jsdelivr.net/gh/xiagaogaozi/Immersive-Galgame-System@main/app/dist/igs.bundle.*` 并加 cache bust，不再通过 manifest 推导 `v<version>`。
- 保留手动锁版本能力：用户仍可通过 `window.IGS_LOADER_REF` 或 `window.IGS_LOADER_CONFIG.ref` 指向旧 tag、`main` 或测试分支；非 `main` ref 探测失败时会继续 fallback 到 `@main`。
- 更新 `app/tests/gate-contract.test.js`，新增默认不读 manifest、默认加载 `@main`、固定 ref 404 后回退 `@main` 的 VM 回归测试，并防止 `DEFAULT_REF` 再被写回 `vX.Y.Z`。
- `docs/PACKAGING_WORKFLOW.md`、`docs/RELEASE.md` 与 `loader/README.md` 已同步改写发布说明；`app/package.json`、运行时版本、阅读器版本显示与构建产物同步提升到 `v0.3.7`。
- 本轮已通过 `npm run test`、`npm run simulate`、`npm run gate`、`npm run build:loader` 与 loader JSON 反解校验。

### v0.3.6 - 2026-06-13

- 按 `plan/v0.3.6-image标签图位绑定与图片轮询修复施工图.md` 新增 `app/src/scene/image-slots.js`，把 `<image>` 与 `image###...###` 解析成稳定图位，并为阅读器正文段落补齐“段落对应图位”的映射数据。
- `app/src/scene/message-source.js`、`app/src/api/igs-compat.js` 与 `app/src/visual/igs-ui/reader-host.js` 现已统一使用清理后的阅读正文分页，不再把 `[角色: ...]` 或图片占位行当成独立页面，同时保留原版“一行多句同页、单换行分段”的阅读节奏。
- `app/src/generated-images/reader-image-service.js`、`provider-runtime.js`、`message-image-cache.js`、`dom-image-candidates.js` 与宿主/Provider 适配层现已在收图、轮询、重绘和缓存时保留 `slotIndex / locationHash / imageId` 元数据，修复“第三张图跑到第一张位置”“点重绘后又退回扫描顺序”的问题。
- `app/tests/unit.test.js` 与 `app/tests/simulate.test.js` 新增 `<image>` 图位顺序、段落到图位映射、第三段绑定第三张图、重绘后仍停留原图位，以及关闭图位绑定时回退旧扫描顺序的回归闸门；本轮已同步通过 `npm run test`、`npm run simulate`、`npm run gate` 与 `npm run build:loader`。

### v0.3.5 - 2026-06-13

- 按 `plan/v0.3.5-原版VN剩余重构审计与补全策划书.md` 补齐原版 VN 剩余重构缺口：新增 `app/src/generated-images/image-api-client.js`、`dom-image-candidates.js` 与 `providers/dom-generic-provider.js`，把原版的模型读取、真实 NAI 生图、DOM 插图探测和通用外部适配收口到 `generated-images` 运行时。
- `app/src/generated-images/providers/nai-provider.js`、`provider-runtime.js`、`reader-image-service.js` 与 `app/src/core/bootstrap.js` 现已打通真实 `fetchImageModels` / `testImageApi` / `generateImage` / `regenerate` / `save` 链路，不再用占位结果伪装原版 IGS 的图像设置页。
- `app/src/host/tavern-helper-adapter.js` 与 `app/src/visual/igs-ui/reader-host.js` 补回隐藏楼层 `hide_state` 兜底、`SillyTavern.getContext()` fallback、iframe `data-src` 图片源扫描、重绘按钮定位和版本同步，确保原版阅读器在更多宿主环境下仍可打开最新楼层并读取插图。
- `app/tests/unit.test.js`、`app/tests/simulate.test.js` 与 `app/tests/gate-contract.test.js` 扩展了 NAI zip/base64 返回、图像设置页真实调用、外部适配过滤、iframe 探测、隐藏楼层跳转与 SillyTavern context fallback 的回归闸门；本轮已同步重建 `app/dist/manifest.json` 与 `loader/igs-loader.json`，并通过 `npm run test`、`npm run simulate`、`npm run gate` 与 `npm run build:loader`。

### v0.3.4 - 2026-06-13

- 按 `plan/v0.3.3-原版VN分页拖拽与AI楼层修复施工图.md` 完成运行时代码修复：`buildTextSegments()` 现已对齐原版 IGS 的按 `\n+` 分段语义，一行多句保持单页，单换行多段拆成多页。
- `app/src/visual/igs-ui/reader-host.js` 补回 PC/手机浮窗拖拽、`6px` 阈值、`8px` viewport clamp、拖后 `120ms` click 抑制，并在重渲染与 resize/orientation 后保留用户拖动位置。
- `app/src/host/tavern-helper-adapter.js` 与 `app/src/core/bootstrap.js` 现已统一跳过用户层、系统层和隐藏层；`prev-turn` / `next-turn` 在 fallback `listMessages()` 链路下也会继续按 AI-only 语义移动。
- `app/src/visual/igs-ui/original-reader-source.js`、`settings-style.js` 与相关 fixtures/tests 已补齐浮窗滚动、拖拽态、controls 固定和四模式按钮省略显示契约；本轮已通过 `npm run test`、`npm run simulate`、`npm run gate` 和 `npm run build:loader`。

### v0.3.3 - 2026-06-13

- 新增 `plan/v0.3.3-原版VN分页拖拽与AI楼层修复施工图.md`，将当前发现的 VN parity 差异固化为可执行施工图。
- 施工图明确下一轮需要修复：一段一页分页、PC/手机浮窗拖拽、上一轮/下一轮跳过用户层、浮窗长文本滚动、四模式选择器文字溢出。
- 本版本是计划归档回退点，不包含运行时代码修复；实现轮需要重新核对施工图列出的源码位置并运行 `npm run gate` 与 `npm run build:loader`。

### v0.3.2 - 2026-06-13

- 修复自动更新 loader 在 jsDelivr `@v<version>` 标签资源短时返回 404 时直接弹出“远程脚本加载失败”的问题；本轮实际探测到 GitHub raw 的 `v0.3.1` bundle 可访问，但 jsDelivr `@v0.3.1/app/dist/igs.bundle.js` 返回 404。
- `loader/igs-loader.js` 现在会用 raw GitHub manifest 解析版本后，先探测 jsDelivr tag bundle；如果 tag bundle 不可用，会自动 fallback 到 jsDelivr `@main` 并加 cache bust，避免刚发布标签时测试入口打不开。
- 扩展 `app/tests/gate-contract.test.js`：新增 VM 回归测试，模拟 manifest 返回 `0.3.2`、版本 tag 探测 404，要求 loader 不弹窗并改用 `@main/app/dist/igs.bundle.js`。
- `app/package.json`、`app/src/core/bootstrap.js`、阅读器默认版本、`app/dist/manifest.json` 与 `loader/igs-loader.json` 同步提升到 `v0.3.2`。

### v0.3.1 - 2026-06-13

- 修复 `web` 网页全屏与 `fullscreen` 浏览器全屏模式下打开设置页时设置面板只剩顶部空壳、tabs/body 不显示或落在可视区外的问题。
- `app/src/visual/igs-ui/settings-style.js` 恢复原版 Immersive Galgame System 的 `#igs-unified-settings` viewport 盒模型：使用 `--igs-settings-vleft / --igs-settings-vtop / --igs-settings-vw / --igs-settings-vh` 控制 `left / top / width / height`，并保留原版设置页按钮、tabs 和毛玻璃面板样式。
- `app/src/visual/igs-ui/reader-host.js` 为设置面板补回 `visualViewport.resize / visualViewport.scroll / resize / orientationchange` 监听，关闭设置页时会清理事件和 RAF；Node 模拟环境增加设置页 fallback DOM，用于稳定断言 shell/head/tabs/body。
- 扩展 `app/tests/gate-contract.test.js` 与 `app/tests/simulate.test.js`：新增设置 CSS viewport 变量契约，以及 `web/fullscreen` 打开设置后完整渲染并随 visualViewport 偏移更新的回归测试。
- `app/package.json`、`app/src/core/bootstrap.js`、阅读器源码默认版本与 `loader/igs-loader.js` 默认标签同步提升到 `v0.3.1`；本轮发布需重新生成 `app/dist/manifest.json` 与 `loader/igs-loader.json`。

### v0.3.0 - 2026-06-13

- 重构 `app/src/visual/igs-ui/reader-host.js` 的运行时层，补齐原版 IGS 的四模式行为：`pc` 固定 `900x540` 浮窗、`mobile` 固定 `480x680` 浮窗、`web` 模式锁定 `body/html` 滚动并跟随 `visualViewport` 高度、`fullscreen` 模式主动调用浏览器 `requestFullscreen` 并在退出全屏时关闭阅读器。
- 修复正文 fallback：当 `scene.text` 为空字符串时，阅读器现在会继续回退到 `formattedText / visibleText / cleanedRaw`，不再出现只剩黑底和工具栏、正文为空的假死状态。
- 恢复原版可见交互：点击背景层可翻页，隐藏后可再次点击背景层恢复，`Escape / ArrowLeft / ArrowRight / Space / H` 键与原版一致；`#igs-toast` 现在会显示段落边界、楼层切换缺宿主、保存/重绘结果等提示。
- `app/src/visual/igs-ui/original-reader-source.js` 补回 `#igs-send-status` 与 spinner 结构，保持原版工具栏 SVG、选择器和单入口契约；`app/fixtures/igs-ui/original-reader-snapshot.json` 同步扩展契约快照。
- 扩展 `app/tests/unit.test.js`、`app/tests/simulate.test.js`：新增空正文 fallback、`pc/mobile` 浮窗几何、`web` 滚动锁定、`fullscreen` 全屏请求、隐藏恢复和 toast 边界反馈的模拟闸门，确保这轮修复不会再悄悄退化。
- `app/package.json`、`app/src/core/bootstrap.js`、`loader/igs-loader.js` 默认版本已同步提升到 `v0.3.0`；本轮发布后需要重新生成 `app/dist/manifest.json` 与 `loader/igs-loader.json`。

### v0.2.14 - 2026-06-13

- 新增 `app/src/generated-images/reader-image-service.js`、`app/src/generated-images/provider-runtime.js` 与 `app/src/media/message-image-cache.js`，把原版 IGS 的楼层图片收集、缓存、外部 provider 重绘轮询和保存下载链路拆成独立运行时模块。
- `app/src/host/tavern-helper-adapter.js` 新增 `listMessages()`、`getAdjacentMessage()`、`jumpToMessage()`、`findRegenerateButton()`，并按原版 VN 语义补齐可读楼层筛选、消息归一化和重绘按钮定位。
- `app/src/api/igs-compat.js` 与 `app/src/core/bootstrap.js` 现已接通 `openViewerFromMessage()` 的 `startAtEnd`/`message` 透传、跨楼层跳转、内置 image provider 注册，以及阅读器级 `collectMessageImages()` / `generateImage()` / `saveImage()`。
- `app/src/visual/igs-ui/reader-host.js` 现已恢复原版 IGS 的 `prev-turn` / `next-turn`、图片重绘、图片保存和按图片数量刷新的进度文本；跨楼层返回上一轮时会从末段打开，保持原版阅读节奏。
- `loader/igs-loader.js`、`app/package.json`、`app/dist/manifest.json` 与阅读器源码默认版本同步提升到 `v0.2.14`；`loader/igs-loader.json` 需由 `npm run build:loader` 重新生成并与源码保持完全一致。
- 扩展 `app/tests/simulate.test.js`、`app/tests/gate-contract.test.js`、`app/tests/unit.test.js`，新增跨楼层切换、provider 图片提取、保存返回可下载 URL、外部重绘轮询更新背景等模拟验收闸门。

### v0.2.13 - 2026-06-12

- 修复阅读器控制器与 DOM 挂载参数错位导致的工具栏全失效问题：`settings`、`hide`、`toggle-bar`、`close` 现在会走真实 controller 行为，关闭会同时卸载阅读器和设置面板。
- 魔法棒入口显示名固定为 `Immersive Galgame System`，继续保留原版 `data-igs-magic-entry="1"`、`igs-magic-entry`、`fa-book-open` 单入口契约，并清理旧 `[data-igs-magic-entry]` 残留。
- 阅读器工具栏恢复原版 SVG 图标、`#igs-bar-btns` 收纳区、`#igs-bar-pinned` 常驻区、`toggle-bar` 与 `close` 常驻按钮；默认状态与原版一致为收纳。
- 设置面板基础页的 `bridge.openMode` 四模式切换现在会即时同步 active reader mode；阅读器页补回常驻按钮配置并持久化到 `igs-reader-settings-v9-<mode>`。
- `prev` / `next` 不再是空占位，已能在当前楼层正文段落之间切换并刷新进度；`prev-turn` / `next-turn` 在模拟环境返回明确宿主消息列表需求，不再静默无响应。
- 扩展 `app/tests/simulate.test.js` 与合约测试，覆盖入口名、SVG 图标、默认收纳、设置打开、四模式切换、隐藏、关闭卸载、段落切换和宿主 UI HTML 泄漏防护。
- 本轮仍不修改原版 `projects/Immersive Galgame System 原版备份/**`；上一轮/下一轮跨楼层真实 DOM 图片缓存与真实 provider 重画/保存仍需后续在 host/generated-images 层继续补齐。

### v0.2.12 - 2026-06-12

- 新增 `app/src/scene/message-source.js`，迁移原版 Immersive Galgame System 的 `DEFAULT_SOURCE_FILTER`、`DEFAULT_VIRTUAL_REGEX`、`getVisibleMessageText()`、`cleanNarrativeSource()`、`buildFormattedTextPipeline()` 和强制 fallback 语义，统一正文提取、正文格式化和宿主 HTML 泄漏防护。
- `app/src/api/igs-compat.js` 现在在 `openLatestAvailable()` / `openViewerFromMessage()` 前先构建 IGS 正文 payload，再把清洗后的 `textScene` 送入 `refresh()`，避免 reader 继续直接拿宿主原始 HTML 当正文。
- `app/src/host/magic-wand-entry.js` 恢复原版单一入口契约：`igs-magic-entry`、`data-igs-magic-entry="1"`、`fa-book-open`，并在重扫/销毁时主动清理旧 `[data-igs-magic-entry]` 残留；入口显示名保持 `Immersive Galgame System`。
- `app/src/host/tavern-helper-adapter.js` 增加消息筛选和 DOM 可见正文回填，优先打开最近一条可读的非用户消息，并把 `.mes_text` 提取结果作为 `visibleText` 参与 fallback。
- 新增 `app/fixtures/tavern/host-ui-leak-message.json`，扩展 `app/tests/unit.test.js`、`app/tests/simulate.test.js`、`app/tests/gate-contract.test.js`，固定“只有一个魔法棒入口”“图标必须是 `fa-book-open`”“宿主 UI HTML 不得进入 `.igs-text`”的回归闸门。
- runtime、manifest、loader 默认版本同步提升到 `v0.2.12`，本轮已通过 `npm run gate` 和 `npm run build:loader`。

### v0.2.12-plan - 2026-06-12

- 归档 `plan/v0.2.12-原版VN可用性修复施工图.md`，当时目标是恢复原版 `fa-book-open` 魔法棒入口并修复阅读器把酒馆宿主 HTML 当正文显示的问题；入口文案保持 `Immersive Galgame System`。
- 施工图要求迁移原版 `getVisibleMessageText()`、`cleanNarrativeSource()`、`buildFormattedTextPipeline()` 的正文抽取和清洗语义，并补截图同款 host UI HTML 泄漏回归 fixture。
- 本条为已执行归档；对应实现已在同日发布为 `v0.2.12`。

### v0.2.11 - 2026-06-12

- 修复重复启用自动更新脚本时只弹出“已加载”而不注册魔法棒入口的问题：loader 现在检测到新版 VN 已存在时会调用 `ensureMagicWandEntry()` 重扫入口。
- 如果页面残留旧版 `window.IGS`、旧 script/link 或旧 `__IGS_AUTO_UPDATE_LOADER__`，loader 会清理残留并重新加载当前版本，避免旧实例阻断新入口注册。
- loader 加载 bundle 后会短时重试 `ensureMagicWandEntry()`，对齐原版 Immersive Galgame System 的“菜单重建后继续重扫入口”行为。

### v0.2.10 - 2026-06-12

- 修复 JS-Slash-Runner 导入报错：`loader/igs-loader.json` 恢复为 `button.enabled=false`、`button.buttons=[]`，不再生成缺少 `visible` 字段的按钮项。
- 删除 `启动 VN`、`重扫入口` 两个酒馆助手按钮；正式用户入口只保留酒馆魔法棒菜单里的 `Immersive Galgame System`。
- 更新 loader 合约测试，强制要求自动更新脚本不提供额外按钮入口，防止后续偏离原版 Immersive Galgame System 的入口形态。

### v0.2.9 - 2026-06-12

- 修复自动更新链路的 CDN 缓存风险：loader 默认先读取 `raw.githubusercontent.com/.../main/app/dist/manifest.json` 获取最新版本号，再加载 jsDelivr 的 `@v<version>` 不可变标签资源。
- `loader/igs-loader.js` 的内置兜底版本升为 `v0.2.9`；仍可通过 `window.IGS_LOADER_REF` 或 `window.IGS_LOADER_CONFIG.ref` 手动指定 `main`、旧标签或测试分支。
- 发布回查新增远程 CDN 内容确认：本轮已确认 `loader/igs-loader.json` 按钮可从 CDN 拉取；发现 `@main/app/dist/manifest.json` 可能返回旧缓存，因此默认链路不再依赖 jsDelivr 的 `@main` dist。

### v0.2.8 - 2026-06-12

- 新增 `app/src/host/magic-wand-entry.js`，启动后自动向酒馆魔法棒菜单 `#extensionsMenu`、`#extensions_menu`、`.extensions_block .list-group` 注入 `Immersive Galgame System` 入口。
- `bootstrapIGS()` 现在会自动挂载魔法棒入口，点击入口会调用 `openLatestAvailable()` 打开最新可用楼层阅读器，并在 `destroy()` 时清理菜单项、委托点击和观察器。
- 公开 API 新增 `ensureMagicWandEntry()` 与 `getMagicWandEntryState()`，用于控制台手动重扫入口、诊断入口状态。
- 新增模拟测试覆盖“魔法棒菜单存在 -> VN 注入入口 -> 点击入口 -> 阅读器打开”的最小闭环；本轮仍不执行真实酒馆实机校验。

### v0.2.7 - 2026-06-12

- 将“每轮结束必须上传 GitHub 并发布版本标签”写入 `AGENTS.md`、`docs/AI_WORKFLOW.md`、`docs/RELEASE.md` 与 `docs/PACKAGING_WORKFLOW.md`。
- 固定回退点规则：每轮有文件改动时必须 `git commit`、`git push origin main`、`git tag -a v<当前版本>`、`git push origin v<当前版本>`，并回查远程分支和标签。
- 标签已存在时禁止覆盖，必须提升 patch 版本后重新发布；只有用户明确要求不上传或不打标签时才允许跳过。

### v0.2.6 - 2026-06-12

- 新增 `app/src/visual/igs-ui/*`，把原版 Immersive Galgame System 的阅读器 overlay、统一设置面板、四个 tab、reader mode 图标和 `.igs-*` selector 抽成独立等价层；浏览器环境挂真实 DOM，Node 模拟测试返回 snapshot/controller。
- 更新 `app/src/core/bootstrap.js`、`app/src/api/igs-compat.js` 与 `app/src/storage/legacy-igs.js`，让 `openSettings()` 不再返回 `settings-ui-not-mounted`，并接通 `openLatestAvailable()` / `openViewerFromMessage()` -> 原版阅读器 UI -> `typeAndSend()` 的最小闭环，同时支持旧 `igs_*` 配置读写回写。
- 新增 `app/fixtures/igs-ui/*`，并扩展 `app/tests/gate-contract.test.js`、`app/tests/simulate.test.js`，覆盖原版 selector/几何契约、四个 tab、设置保存回写，以及 `Enter` 发送 / `Shift+Enter` 不发送的模拟验收。
- 当前仍不做真实酒馆实机验真、不接真实 NAI/provider 网络请求、不把 `window.ImmersiveGalgameSystemBridge` 旧全局别名重新挂回；本轮验收继续以 `npm run gate` 的模拟闸门为准。

### v0.2.5 - 2026-06-12

- 新增 `app/src/presets/preset-types.js`、`app/src/presets/preset-registry.js` 与 `app/src/storage/preset-store.js`，把三类文本预设接成可持久化的 `PresetRegistry`，固定 `current/items/drafts` 快照结构。
- 更新 `app/src/api/public-api.js`、`app/src/core/bootstrap.js` 与 `app/src/index.js`，让 `sceneRegexPresets`、`textFilterPresets`、`textFormatPresets` 支持 `setCurrent/getCurrent/export/exportAll`，并让 `refresh()` 在无显式 context 时读取注册表当前预设。
- 新增 `app/fixtures/presets/*`，补齐预设注册表快照、文本预设导入 bundle 和坏预设不能覆盖 current 的样例。
- 更新 `app/tests/unit.test.js`、`app/tests/gate-contract.test.js`、`app/tests/simulate.test.js`，覆盖注册表持久化重载、坏预设守卫、导出 bundle 形状和 fake storage 驱动的 refresh 闭环。
- 当前仍不实现正则与正文页 UI、不接真实 IndexedDB 异步启动、不做真实酒馆或真 provider 实机验真；验收继续以 `npm run gate` 的模拟测试为准。

### v0.2.4 - 2026-06-12

- 新增 `app/src/presets/text-presets.js` 与 `app/src/scene/text-pipeline.js`，把 `text-filter-preset`、`text-format-preset`、`scene-regex-preset` 接成可测试的正文预处理管线。
- 更新 `app/src/scene/text-parser.js`、`app/src/core/bootstrap.js` 与 `app/src/api/public-api.js`，让 `refresh()` 可接收三类文本预设，并把 `textSource`、`formattedText`、`sourceKind`、`formatSourceKind`、`textPipelineErrors` 暴露到 scene 和公开 API 分组。
- 新增 `app/fixtures/text/*`、`app/fixtures/imports/text-presets-bundle.json`，固定 `<content>` 过滤、Bubble 对话格式化、scene regex 字段提取和坏正则回退样例。
- 更新 `app/tests/unit.test.js`、`app/tests/gate-contract.test.js`、`app/tests/simulate.test.js`，补齐正文预设管线 gate、导入契约和 fake host refresh 模拟闭环。
- 当前仍不实现正则与正文页 UI、不做 preset 持久化切换、不迁移原版 Immersive Galgame System DOM 图片探测，也不做真实酒馆实机验真。

### v0.2.3 - 2026-06-12

- 新增 `app/src/visual/reader-state.js` 与 `app/src/visual/stage-model.js`，把 reader settings、legacy reader mode、viewport 和稳定槽位归一化为可测试的 visual stage model。
- 更新 `app/src/visual/stage-renderer.js`、`app/src/visual/layer-controller.js` 与 `app/src/core/bootstrap.js`，让 `refresh()` 的渲染结果包含 `stage`、`renderedLayers` 和 reader bridge attributes。
- 新增 `app/fixtures/visual/*`，补齐 pc/mobile/web/fullscreen 的 reader settings 样例，以及普通场景/生图场景的 stage model 预期。
- 更新 `app/tests/unit.test.js`、`app/tests/gate-contract.test.js`、`app/tests/simulate.test.js`，把 `S4 visual` 验收到 reader state、responsive layout、stable slots、dialogue layer 和 generated layer。
- 当前仍不迁移完整 Immersive Galgame System 阅读器 DOM，不实现真实设置面板，不接真实 provider，也不做真实酒馆实机验真。

### v0.2.2 - 2026-06-12

- 新增 `app/src/storage/legacy-igs.js`，只读读取 `igs_bridge_config`、`igs-reader-settings-v9-*` 和 `igs-display-mode`。
- 新增 `app/src/api/igs-compat.js`，把 `openSettings()`、`getConfig()`、`getUnifiedSettings()`、`openViewerFromMessage()`、`openLatestAvailable()`、`generateImage()` 收敛到 IGS 兼容层。
- 更新 `bootstrapIGS()` 与 `tavern-helper-adapter`，让 fake host 可按 message id 读取消息，并将旧 bridge 配置并入初始 config。
- 新增 `app/fixtures/igs/*`、`docs/VISUAL_NOVEL_MIGRATION.md` 与 gate 测试，固定第一阶段兼容基线。
- 当前仍不迁移完整阅读器 DOM、不实现真实 provider 请求、不挂载 `window.ImmersiveGalgameSystemBridge` 旧全局别名。

### v0.2.1 - 2026-06-12

- 归档 `plan/v0.2.1-酒馆助手脚本发布打包策划书.md`，明确最终按酒馆助手脚本 JSON 形态发布，参考 `_inbox/酒馆助手脚本-玉子手机.json`。
- 新增 `docs/PACKAGING_WORKFLOW.md`，固定原版 Immersive Galgame System 源路径、IGS 源码路径、`app/dist` bundle、`loader/igs-loader.json` 和发布前验收命令。
- 更新 README、AGENTS、AI_WORKFLOW、RELEASE 与 loader README，要求后续涉及打包发布时先读发布工作流文档。
- 明确当前仍不默认接回奶龙工具箱 `project.json / latest / tavern helper` 发布壳；发布导入件采用独立 loader JSON。
- 新增 `loader/igs-loader.js` 与 `app/scripts/build-loader.js`，可通过 `npm run build:loader` 生成项目内 `loader/igs-loader.json` 供酒馆导入测试。
- `npm run gate` 新增 loader JSON 反解校验，确保 `loader/igs-loader.json.content` 与 `loader/igs-loader.js` 原文一致。

### v0.2.0 - 2026-06-12

- 接通最小运行闭环：`bootstrapIGS()` 负责 host -> scene -> visual -> public API 的基础装配，并挂载 `window.IGS` / `window.ImmersiveGalgameSystem`。
- 新增 `app/src/index.js`、`core/bootstrap.js`、`api/public-api.js`、`host/tavern-helper-adapter.js`、`scene/text-parser.js`，让 fake TavernHelper 消息可以解析为 scene 并渲染到 layer。
- 新增 shujuku 安全包装、资源缓存、导入分发和样式契约检查的最小实现，覆盖 v0.1.5 验收闸门的 P0 模拟链路。
- 新增 `app/package.json` 和 `app/scripts/*`，提供 `npm run structure/static/test/simulate/perf/build/gate`。
- 新增 `app/fixtures/` 分层样例和 `app/tests/` 原生 Node 测试，覆盖输入发送、场景解析、视觉模式、生图请求构建、导入契约、样式契约、fake shujuku 刷新和资源缓存。
- `npm run gate` 已通过：structure、static、test、simulate、perf、build 全部成功；未执行真实酒馆、真实 provider 或安装版实机校验。
- 新增独立 GitHub 上传流程，仓库目标为 `xiagaogaozi/Immersive-Galgame-System`，上传命令写入 `docs/RELEASE.md` 与 `docs/AI_WORKFLOW.md`。

### v0.1.6 - 2026-06-12

- 新增项目级 `AGENTS.md`，移植 NailongHub 的风险级别、执行清单、防结构腐化、技术债记录和交付说明流程。
- 将 NailongHub 的安装版实机验真要求改写为 Immersive Galgame System 的 fixtures 驱动模拟测试策略。
- 新增 `docs/ARCHITECTURE.md`，用模块图和职责表补充 AI 读代码入口。
- 新增 `docs/SCHEMA_AND_FIXTURES.md` 与 `app/src/schemas/CONTRACT.md`，明确跨模块 schema、fixtures 和 `S0-S10` 模拟测试矩阵。
- 更新 README 与 AI 工作流索引，明确本项目仍不走奶龙工具箱发布壳和校验流程。

### v0.1.5 - 2026-06-12

- 新增根目录 `plan/`，用于归档每个版本的策划书 Markdown。
- 归档 `plan/v0.1.5-验收闸门策划书.md`，记录验收闸门建设方案。
- 在修改流程中明确：后续 AI 每次更新版本策划书都必须放入 `plan/`。
- 在 README 中明确本项目不要走奶龙工具箱流程校验。

### v0.1.4 - 2026-06-10

- 新增 NAI provider / request builder 预留骨架。
- 新增 `generated-images/request-builders/`、`prompts/adapters/`、`prompts/schemas/`，为 ComfyUI、GPT 图像、banana 等不同提示词框架保留位置。
- 新增 `docs/IMAGE_GENERATION.md`，明确 Provider、Request Builder、Prompt Adapter、Preset 的边界。
- 补充 `image-request-builder`、`image-request-builder-preset`、`workflow-preset` 导入类型和二创 API 扩展点。

### v0.1.3 - 2026-06-10

- 将 st-chatu8 和 chami 明确为可拆卸内置 `image-provider`，新增默认 provider 骨架。
- 补充 `image-provider-preset`，用于保存 provider 选择器、优先级、轮询和按钮匹配配置。
- 补充 `ui-skin-preset` / `ui-layout-preset`，用于支持全屏字幕式、左上工具栏等完全不同 UI。
- 增加稳定 DOM 槽位、CSS 变量和 `data-igs-*` 设置桥接要求，保证换皮后 `设置 -> 阅读器` 仍能控制关键 UI 配置。

### v0.1.2 - 2026-06-10

- 调整目录为功能总集表反推结构：新增 `loader/`、`app/dist/`、`app/src/media/`、`app/src/data/shujuku/`、`app/src/generated-images/providers/`。
- 将 shujuku 数据层契约从 `app/src/data/CONTRACT.md` 收敛到 `app/src/data/shujuku/CONTRACT.md`。
- 新增 `host/input-channel.js`、`scene/*`、`visual/*` 轻量骨架入口。
- 新增 `docs/MOD_FORMAT.md`、`docs/STYLE_SYSTEM.md`、`docs/RELEASE.md`。
- 明确本结构不走奶龙工具箱发布壳和校验流程。

### v0.1.1 - 2026-06-10

- 对照 `codex resume 019eac50-4ce8-7a93-a80e-8550e4c7666d` 补齐功能总集表中的 Immersive Galgame System 既有细项与旧规划底座。
- 补充 `host`、`actions`、`components`、`data`、`storage`、`prompts` 模块契约。
- 补齐可选组件、动作系统、输入框发送契约、视觉模式、环境效果层、生图提示词引擎、手动重生/轮询/缓存和 Immersive Galgame System 兼容公开 API。
- 补充手机端网页全屏/全屏横屏横版布局、工具栏横排/竖排设置，以及工具栏、对话气泡、名字牌、头像、选项等组件级 CSS 覆盖要求。
- 同步更新能力分组导入、二创 API、预设格式和场景规则文档。

### v0.1.0 - 2026-06-10

- 新建 Immersive Galgame System 架构目录。
- 建立 `app/` 主工程模块契约、fixtures 与测试目录说明。
- 建立 `docs/` 下的 AI 工作流、Mod API、预设格式、能力分组导入、场景规则与 shujuku 表格页说明。
- 建立根目录 `功能总集表.md`，汇总 Immersive Galgame System 既有能力、已确认新增目标与 UI 结构。
- 按用户要求移除奶龙工具箱发布壳，只保留已确认的独立架构。
