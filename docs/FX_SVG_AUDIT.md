# 演出 SVG / CSS 形状审查（2026-10-24）

范围：`app/src/visual/igs-ui/` 下会出现在舞台画面上的演出元素。只读审查，未改源码。撑伞演出（fx-range-style.js / fx-style.js 的 umbrella 部分）另有子任务重做，本报告不涉及。

截图（含真实立绘，仅存仓库外）：`G:\奶龙Code\gal\演出版面审查截图\svg-audit\`。其中 camera/ 三张由 `scripts/fx-shot.mjs` 生成；crowd-*、amb-*、pl* 七张由临时页面（`app/.tmp/*-shot.mjs`，不受 git 跟踪）直接拼装真实样式与真实背景、立绘后截取，未经过完整阅读器，仅反映单层外观。

## 总结论

- 问题集中在三类：一是自动随地点、情绪触发的常驻层画了实体物件（人群剪影、警戒胶带、监护仪、灯笼、车窗 A 柱）；二是镜头类前景用 `#10151a` 纯黑剪影代替虚化前景；三是部分转场沿用纸面、胶片孔等扁平造型。
- 原则：立绘上只允许一眼能看出是漫画风格的记号，不贴模拟真实汗滴、痕迹的图形。去卡通针对的是盖在厚涂画面上、冒充实物或场景的扁平图形；角色头顶的情绪符号（心心、汗滴、怒筋等）属于 galgame 惯用的漫画表达，按用户意见保留，不在本轮范围内。
- 天气（雨为细斜线，雪为分层半透明粒）、场景调色、地图光层、水墨笔触、`fx-glyphs` 细线字形、COC 包、`fx-state-style` 边缘光已符合规则，无需改动。
- emoji 基本清理完毕，仅直播弹幕保留（模拟真实平台，可接受）。

## 点名问题：切换地点时的黑色剪影

**定位结论：人群剪影 `crowd-fx.js`。**

- 位置：`app/src/visual/igs-ui/crowd-fx.js:61-208`（`figure()` 拼身形，`buildCrowdSvg()` 铺三排），挂载在 `applyCrowdFx()`（:212），由 `reader-dom-render.js:2040` 每页调用。
- 触发：`readerSettings.crowdFx.enabled` 为真（默认关；演出档位「全开」tier 3 会打开），且当前地点名命中 `BUSY_WORDS` / `CALM_WORDS` / 酒馆词（:8-9、:23）。`CALM_WORDS` 含单字「街」「市」，再加「教室」「食堂」「餐厅」「咖啡」「大厅」等，覆盖面很宽；地点一换到这类地点，剪影层随 0.8 秒淡入出现，正是「切换地点时」出现。夜间降一档，NSFW 与挂 CG 时不出。下雨时还会给一半人加扁平伞（:168-173）。
- 画法：头、颈、躯干、四肢用 `poly` / `limb` / `circle` 平涂拼成，三排灰度分别为 `#8e96a4`（远，.5 不透明）、`#5a6170`（中，.72）、`#2a2f39`（近，.9，大而深，被底边裁切）。拥挤档近排 9 人、总数 43 人。
- 难看的原因：
  1. 典型「剪影小人」，轮廓是几何拼件（圆头、梯形躯干、圆头肢体），与厚涂背景的透视、光照、笔触完全脱节，见 `crowd-busy.png`。
  2. 近排接近纯黑且不透明度 .9，压在背景下半部大片区域，立绘站在其中像被一排纸人包围。
  3. 剪影铺在背景与时段叠色之间，只随叠色变色，不受背景本身光源影响，白天街景里出现一排黑人形尤其突兀。
  4. 雨天伞形为扁平半圆，与撑伞演出的问题同源，见 `crowd-calm.png`。
- 建议：删除实体剪影，用「人多」的感受替代「画人」：
  1. 声音为主：人群底噪（scene-audio 已有 CROWD_WORDS 环境音），反应（鼓掌、欢呼、哗然）只用音效与镜头轻震表达。
  2. 画面只做极轻的景深与动感：背景下半部加一道很淡的暖灰地面雾或轻微模糊（不超过 1-2px），可选少量大尺寸、低不透明度的虚化光斑横向缓慢流动，暗示行人经过而不画人形。
  3. 设置项「人群剪影」改名为「人群氛围」，保留 `react` 开关，改为驱动音效与镜头。
  4. 若用户仍要见人影，唯一可接受的方案是复刻背景：从背景图下半部裁一条，做模糊与位移的视差残影，而不是画剪影。

**同类的次要嫌疑（若用户指的不是人群，可能是以下两处）：**

- 车窗氛围层 `fx-daily-amb-style.js:15-17`：地点切到「车内」时常驻，左侧一根斜切的 `#101319` A 柱、顶部一块后视镜色块，外加窗外景竖条从立绘前横扫（:25-27），见 `amb-car.png`、`amb-train.png`。开关为 `dailyFx.vehicleLight`。
- 镜头包前景 `fx-camera-parts.js:1-22`：`walk`（散步、穿过树林）与 `fg`（擦肩）会让三团 `#10151a` 黑色叶簇或一个圆头梯形「路人」从立绘前划过，仅 6px 模糊，见 `camera/walk-1280x720.png`、`camera/fg-1280x720.png`。由 AI 写标签触发，在「走去某处」的过渡页里常见。

建议向用户确认具体是哪一个；三者在第一批中一并处理。

## 清单（按严重度排序）

路径均相对 `app/src/visual/igs-ui/`。频率：常驻＝开启后每页都在；常见＝自动触发或常用标签；少见＝特定题材标签。

### 高

| # | 位置 | 演出 / 触发 | 画的是什么 | 问题 | 频率 | 改进方向 |
|---|---|---|---|---|---|---|
| H1 | crowd-fx.js:61-208 | 人群剪影，地点命中人多词自动出 | 三排平涂人形、雨天扁平伞 | 剪影小人；近排近黑 .9 不透明；遮背景下半部 | 常见（开启后） | 删除剪影；音效＋淡雾＋虚化光斑；或背景视差残影 |
| H3 | fx-camera-parts.js:1-22，fx-camera-style.js:48-58 | `fg` 擦肩、`walk` 散步、`peek` 树叶 | 黑叶簇、圆头梯形路人、栏杆、电线杆 | 纯黑实心剪影，仅 6px 模糊，盖在立绘上 | 常见（AI 标签） | 删除路人；叶簇、栏杆改为大半径模糊暗斑（blur 24px 以上、不透明度 .25 以下）或直接用暗角扫过＋音效 |
| H4 | stage-direction-runtime.js:238-250 | CG 入场 `tear`（愤怒、紧张自动选） | 米色点纹纸面撕开 | 整屏纸色块盖住 CG，绘本质感与厚涂冲突；点纹为密集纹样 | 常见（入场样式默认全开） | 纸面改为当前 CG / 背景的复刻两半，裂口只加一道细光；或移出默认样式 |
| H5 | stage-direction-runtime.js:194-205 | CG 入场 `film`（悲伤、回忆、平静自动选） | 上下 28px #111 黑条＋白色片孔 | 道具式胶片孔、密集重复纹样 | 常见 | 去片孔，保留颗粒、暗角、轻微抖帧与褪色调色 |
| H6 | fx-places-style.js:8,20-25 | 地点氛围 `plpolice`（警局、案发现场自动常驻） | 两条黄黑警戒胶带＋警灯 | 20px 高饱和硬条纹＋3px 8px 投影，像贴纸横贯画面顶部（`plpolice.png`） | 常见 | 删胶带，只留红蓝警灯光与暗角、警笛环境音 |
| H7 | fx-places-style.js:9,31-33 | 地点氛围 `plhospital`（医院、病房自动常驻） | 右上角心电监护黑盒＋荧光绿折线 | UI 小部件贴在画面角落；#4dff9a 饱和过高 | 常见 | 删监护盒，保留冷色调与灯管光，心电滴声交给音效 |
| H8 | fx-places-style.js:52-57 | 地点氛围 `plshrine`（祭典、神社、庙会自动常驻） | 顶部 4 个红色圆角块灯笼 | 实色红块，不像灯笼，且与背景自带灯笼重复（`plshrine.png`） | 常见 | 改为暖色径向光斑轻微摇曳，不画实体 |
| H9 | manga-back.js:121-139 | 漫画背景 flowers / sparkle | 粉色五瓣花、白色四芒星密铺＋粉色底 | 整屏色块替换背景；密集纹样 | 少见 | 删平铺图；背景本体柔焦＋bloom＋少量大光斑 |
| H10 | fx-daily-style.js:800-808，fx-daily.js:722-726 | `dance` 跳舞 | 粉、蓝两个色块小人旋转 | 剪影小人、糖果色 | 少见 | 删除；音乐＋镜头缓摇＋光斑 |
| H11 | fx-daily.js:187，fx-daily-style.js:356-363 | `cat` 撸猫 | 实色猫剪影＋黄眼点＋爪印 | 剪影小动物，挡立绘 | 少见 | 删除；猫叫音效＋立绘轻动作 |
| H12 | fx-nsfw-style.js:48-65，fx-nsfw-build.js:87,168 | NSFW `bed` / `drape` / `candle` / `lamp` | 床单波浪、酒红帘、蜡烛与灯色块 | 实色块重复并遮挡背景 | 少见 | 不画物件；暗角、暖色温、烛光闪烁 |
| H13 | fx-transform.js:326-329，fx-transform-style.js:92-97 | 立绘贴片 `mark`（吻痕、咬痕、汗滴） | 唇印、虚线咬痕、带描边汗滴 | 扁平符号贴在立绘皮肤上，想模拟真实痕迹又不像 | 少见 | 立绘上只允许一眼可辨的漫画记号；模拟皮肤上真实汗滴的贴片删除；唇印、咬痕同理，要么改成明确的漫画记号，要么删除 |
| H14 | fx-idol-style.js:31-34,62-69 | `onstage` 荧光棒、应援灯海 | 三排高饱和实色小棍 | 密集色条，饱和过高 | 少见 | 虚化光点海，径向渐变＋模糊，降饱和 |

### 中

| # | 位置 | 演出 / 触发 | 问题 | 频率 | 改进方向 |
|---|---|---|---|---|---|
| M1 | fx-daily-amb-style.js:10-23 | 车窗氛围（车、电车、飞机、飞艇常驻） | 车内 #101319 斜 A 柱与后视镜色块；电车黑窗框；飞机舷窗 5px+8px 双描边 | 常见（开启后） | 窗框只留上下极窄的暗边与暗角，A 柱、后视镜删除；舷窗描边降到 1px 或删除 |
| M2 | fx-daily-amb-style.js:25-27 | 车窗氛围窗外景 | 深色竖条从立绘前横扫 | 常见 | 改为背景横向轻微运动模糊或明暗带，不画杆子 |
| M3 | fx-daily-amb-style.js:43-46,58,79 | 地点氛围 云海仙山 peaks、洞府 cavecrown、夜景 skyline | 蓝灰锯齿 clip-path 山形、天际线色块盖在背景上 | 常见（对应地点） | 删除实体形状，只留云雾流动、光晕与暗角 |
| M4 | fx-places-style.js:36 | `plkonbini` 便利店 | 顶部 7px 三色品牌条 | 常见 | 删除，只留顶光 |
| M5 | stage-direction-runtime.js:211-220 | CG 入场 `panels`（开心自动选） | 白底＋3px #111 分格框 | 常见 | 去白底与黑框，格缝 1px 淡边 |
| M6 | stage-direction-runtime.js:186-188 | CG 入场 `photo` | 14px 白边＋0 18px 40px 重投影 | 常见 | 白边 4-6px，投影减半 |
| M7 | fx-camera-style.js:62-76 | `peek` 窗框、门缝；`sneak` | 9px 纯黑窗框十字、全高黑门板（`camera/peek-1280x720.png`） | 少见 | 改为边缘暗角＋模糊，不画框 |
| M8 | fx-camera.js:182，fx-camera-style.js:131-143 | `montage` 无背景时、`split` | #3a3f4a 灰块占位、#0d1018 面板、米色底板 | 少见 | 无背景时不播或用当前画面复刻；面板内放背景副本 |
| M9 | fx-camera-style.js:99-114 | `backdrop` 纯色 / 花瓣 / 星 | 整屏粉或紫黑渐变底，圆形花瓣 | 少见 | 降为叠加色调；花瓣改不规则小片或删除 |
| M10 | fx-places-style.js:80-93 | `elevator` 电梯 | 全高暗色门板开合 | 少见 | 缩短为黑幕＋门缝光 |
| M11 | fx-battle.js:28,200 | 战斗 `guard` 格挡 | 4px 描边六边形盾 | 常见（战斗中） | 冲击环光＋火花，不画盾 |
| M12 | fx-result.js:206-226 | 检定骰子、大成功放射线 | 实色多面体＋粗边；#ffd66b 放射条 | 少见 | 骰子描边 1px、配色压暗；放射线改柔光 |
| M13 | fx-daily-campus-style.js:104-108,158-160,174,205,233 | 抽屉礼物、考试章、彩旗、毕业帽、纽扣 | 糖果粉＋3-4px 粗边、菱形色块 | 少见 | 礼物、彩旗、毕业帽删除或改光影；印章保留，线宽 1-1.5px |
| M14 | fx-daily-style.js:393-439，fx-daily.js:252-253 | 魔法题材 猫头鹰、扫帚、咆哮信、沙漏、魔药 | Q 版小鸟、高饱和红信封 | 少见 | 信件保留造型，降饱和、细线；猫头鹰、扫帚改影子掠过＋音效 |
| M15 | fx-daily-style.js 钓鱼 :822-824、绘画 :828-835、摩天轮 :854-859、购物 :878-881 | 对应日常演出 | 实色鱼剪影、6px 木框、彩色舱、粉纸袋 | 少见 | 只保留 flat 覆盖层（fx-daily-flat-style.js）的线框版，鱼剪影删除 |
| M16 | fx-abo-build.js:87-88 | ABO `warn` / `patch` | 交通标志式红三角（描边 3）、肉色贴片 | 少见 | 改文字卡或删除 |
| M17 | fx-harem.js:138-149 | 后宫 `probe` 人偶 | 圆头梯形身人偶 | 少见 | 删人偶，留文字与音效 |
| M18 | fx-festival-style.js:21-23,68,102-109 | 节日 蛋糕、婚戒、圣诞雪 | 粉色分层蛋糕色块、3px 金环、白圆点 | 少见 | 蛋糕、婚戒属物品道具，保留造型，降饱和、去粗边与硬投影；雪改不等大模糊颗粒 |
| M19 | fx-transform-style.js:81 | `eyepatch` | #050508 实色椭圆盖眼 | 少见 | 改为眼部暗化遮罩 |
| M20 | fx-idol-style.js:26 | 歌名条 | 3px 粉色左描边条 | 少见 | 去左描边，淡底细线 |
| M21 | fx-daily-style.js:257,480 | 滚动条、到站通知 | 3-4px 左描边条、高饱和黄红牌 | 常见 | 去左描边条，统一为深色底细边 |
| M22 | click-wait-mark.js:50-111 | 句末等待符（各皮肤一枚） | 草莓、爱心、蝴蝶结、警示三角等高饱和图标 | 常驻（开启后） | 统一低饱和或皮肤墨色；卡通物件换成菱形、折角等中性符号 |
| M23 | manga-back.js:142-148 | 漫画背景 burst / swirl / tone / speed | 整屏色块替换背景，漩涡配色土 | 少见 | 改为低不透明度叠加在原背景上 |

### 低（保留或微调）

| 位置 | 说明 |
|---|---|
| fx-daily-xianxia.js 御剑、点穴 | 细线剑形与经络线，保留，取色微调 |
| fx-selected-svg.js | 1.5-1.7 细线物品，保留；灯笼、丝、酒、匕首的填色核对饱和度 |
| fx-glyphs.js、fx-daily.js:113-116 | 细线单色字形，保留 |
| fx-links.js | 2px 牵线＋光雾，cyan、pink 略降饱和 |
| fx-myth*.js | 碎片、闪电、锁链为光效与线描，冥界百合排布可删 |
| fx-battle.js:566-575、fx-result.js:68 | 斩线、火花、裂纹为光效，保留 |
| comic-bubble.js | 漫画泡属 UI 模拟；bold 档与 shout 线宽偏粗，可收上限 |
| manga-back.js:150-152 | 气场光晕，fire 档降饱和 |
| 手机、弹幕、聊天、通知相关文件 | 线宽 1.2-1.8px 的 UI 模拟，保留 |

### 皮肤类（常驻，但属用户自选外观，单列）

| 位置 | 说明 |
|---|---|
| dialog-theme-fairytale.js:33-77，fx-title-themes.js:70 | 童话小镇：草莓、野餐篮、蝴蝶、花瓣、11px 格子布边、硬投影 |
| dialog-theme-horror.js:136-143,317-334 | 心理恐怖 psych 档：粉色 3px 边、硬投影、爱心与眼睛小标（刻意反差） |
| dialog-theme-hud.js:48-82，dialog-theme-skins.js:96，fx-battle-themes.js:221-233 | cute-pink、黑白漫画：2.5px 黑边、4px 4px 0 硬投影、♥ 圆章 |
| dialog-theme-css-skins.js:50-55，dialog-theme-choices.js:97 | 温暖绘本：0 3px 0 硬投影 |

UI 图标（不属演出）：icons.js、reader-icons.js、record-icons.js、item-cg-icons.js、settings-*.js、asset-folder-view.js、map-panel.js、record-panel.js、turn-index-panel.js。

## 分批修复计划

逐项细化改法见 `docs/FX_SVG_REFINE_PLAN.md`，以该文件为准。

### 第一批：自动触发、最显眼（H1、H3、H6-H8、M1-M4）

- 文件：crowd-fx.js；fx-camera-parts.js、fx-camera-style.js、fx-camera.js（fg / walk / peek 叶簇）；fx-places-style.js（police、hospital、shrine、konbini）；fx-daily-amb-style.js（车窗框、窗外景、peaks、cavecrown、skyline）。
- 方向：实体物件一律删除，改为光影（暗角、色温、光斑、轻雾）、模糊暗斑与环境音；人群按「点名问题」一节处理；不新增写死数值，复用现有主题变量与 class。
- 验收：fx-shot 与临时拼装页重拍同一组截图（同背景、同立绘）逐张对比，画面中不再出现可辨认的剪影或实色物件；相关单测（crowd-fx、fx-places、fx-camera、fx-daily 氛围）与 build 通过；low 画质与 reduced 下画面完整。

### 第二批：情绪自动触发的转场（H4、H5、M5、M6）

- 文件：stage-direction-runtime.js:186-250（photo、panels、tear、film）。
- 方向：tear 改为 CG 复刻撕开、film 去片孔、panels 去白底黑框、photo 减白边与投影。
- 验收：fx-shot 拍六种入场样式的停留帧。

### 第三批：标签触发的物件型演出（H9-H14、M7-M23）

- 文件：manga-back.js、fx-daily-style.js、fx-daily.js、fx-daily-campus-style.js、fx-nsfw-style.js、fx-nsfw-build.js、fx-transform*.js、fx-idol-style.js、fx-battle.js、fx-result.js、fx-abo-build.js、fx-harem.js、fx-festival-style.js、fx-camera-style.js（backdrop、montage、split）、fx-places-style.js（elevator）、click-wait-mark.js。
- 方向：剪影小人、小动物、色块场景物件删除并以音效或镜头替代；需要保留造型的道具（信件、印章、骰子、戒指）精修取色，线宽 1-1.5px，去硬投影；左描边条全部移除。
- 验收：fx-shot 按包拍 `--pack daily,campus,nsfw,transform,idol,festival,abo,harem,camera,places`，逐包缩略总览（`--sheet`）对照；相关测试与 build 通过。

### 第四批：皮肤（待用户拍板后再定）

- 童话小镇、psych、cute-pink、黑白漫画、温暖绘本的硬投影与粗边框，以及标题卡格子边。

## 待用户拍板

1. 「切换地点时的黑色剪影」是否即人群剪影；若是车窗 A 柱或散步时的黑叶簇，第一批照样处理，但优先级需调整。
2. 人群剪影是彻底删除改为「人群氛围」（音效＋淡雾＋光斑），还是保留开关但改为背景视差残影。
3. CG 入场 `tear`、`film`、`panels` 是重做，还是先从默认开启的样式中移除。
4. 地点氛围（警局、医院、神社、便利店）删除实体后，是否需要补对应环境音。
5. 童话小镇等皮肤属用户自选外观，且此前确认「装饰用实色不用半透明」，是否纳入本轮去卡通范围。

## 不纳入范围（用户 10-24 确认保留）

| 原 H2 | fx-symbols.js:4-147，fx-style.js:133-153 | 情绪符号（mangaFx，按情绪词自动出；进食演出复用） | 心、汗滴、灯泡、火苗、怒筋、幽灵等 | 白外描边比线宽多 11、墨线多 5，三层贴纸；固有色高饱和（#ff3b55、#43b4ff、#ffbf1f 等）；冲击短线；高光椭圆 | 常见 | 保持现状 |

情绪符号是角色头顶的漫画表达，不属于卡通化问题，保持现状。
