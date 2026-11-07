// 角色特质登记表与存取接口（计划 docs/STATS_TRAITS_PLAN.md 第三、四、八节与「接口约定」）。
// 一张登记表（TRAIT_DEFS）、一种存法（catalog.traits）、三个读取接口（hasTrait / traitScale / traitFlag）与一个写入接口（applyTraitChange）。
// 本文件不依赖其他数值模块，被 stat-state / stat-persist / 结算各处单向引用。
// 约束：全部特质只改数值（好感、信任、了解、芥蒂、欲望、压力、体力、金钱、伤势、检定骰），不改战斗与亲密对决的牌组、主导权、回合与牌效。
// 存档：catalog.traits = { 名: { 键: { on: true, src: 'auto'|'manual'|'story'|'achieve', parts?: [键] } } }；
//   键 combo:合成名 为合成占位（parts 为组成项键），合成整体占 1 格，组成项仍各自存在、各自生效。
// 只对 strengthRev ≥ 2 的楼生效：调用方在 rev ≥ 2 的分支里才调用这里的读取接口。

export const TRAIT_SRC = Object.freeze(['auto', 'manual', 'story', 'achieve']);
// 数量上限：自动评定 3、同挂 5（自动 + 剧情 + 手动，合成按 1 格）、成就另计 2。
export const TRAIT_LIMITS = Object.freeze({ auto: 3, total: 5, achieve: 2 });
// 倍率叠加范围。
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;
// 好感阶段关口：「喜欢」＝明确喜欢（26 起），「心动」＝强烈在意（51 起）。
export const LIKE_FROM = 26;
export const HEARTBEAT_FROM = 51;

export const TRAIT_GROUPS = Object.freeze(['存在', '心性', '体质', '天资', '剧情', '性格', '生存', '养成', '极端性格', '罪犯', '资源互换', '床上专属', '恋爱人设', '动物系', '题材设定', '恩情', '仇怨']);

// 旧存档键（随身、无实体、亲人、脆弱）与豁免亲密门槛沿用英文键；其余特质以显示名为键。
const LEGACY_ID = Object.freeze({ 随身: 'companion', 无实体: 'bodiless', 亲人: 'kin', 脆弱: 'fragile', 豁免亲密门槛: 'forced' });
// 角色档案里的旧标记字段（起始关系标签写在角色上），与聊天级勾选任一为真即生效。
const CHARACTER_FLAG = Object.freeze({ companion: 'companion', bodiless: 'bodiless', kin: 'kin' });
export const LEGACY_TRAIT_KEYS = Object.freeze(['companion', 'bodiless', 'kin', 'fragile']);
export const PROTAGONIST_NAME = '主角';

// 不进正文提示词的特质一律 inject 为 null；唯一例外的五项各写一句客观事实（不含性格）。
const INJECT = Object.freeze({
    无实体: '没有实体，无法触碰',
    已故: '已经去世，只在回忆中出现',
    失忆: '失去了与主角有关的记忆',
    不眠: '不需要睡眠',
    附身: '附在某人身上',
});

const DESC_FIX = Object.freeze({
    乐天派: '每天压力额外小降',
    抖M: '压力上升时欲望同步小升',
    诅咒: '每天压力上升；失去即解咒',
    伪装身份: '了解设有上限；失去（被揭穿）后上限解除',
    忘恩负义: '救命之恩过七天自动淡化为「欠你人情」',
    豁免亲密门槛: '亲密门槛未达时不再要求拒绝，用于剧情需要',
    亲人: '非恋爱的亲情关系；亲密门槛按亲情计',
});

const JUDGE = Object.freeze({
    脆弱: '人设写明心理脆弱、有创伤、易崩溃',
    坚韧: '人设写明意志坚定、历经磨难而不屈',
    随身: '人设写明一直跟在主角身边',
    无实体: '人设写明是残魂、器灵、系统等没有实体的存在',
    亲人: '人设写明与主角是家人或亲戚',
    已故: '人设或剧情写明已经去世',
    失忆: '人设或剧情写明失去了与主角有关的记忆',
    不眠: '人设写明不需要睡眠',
    附身: '人设写明附在他人身上',
});

const SRC_RANK = Object.freeze({ auto: 0, achieve: 1, story: 2, manual: 3 });

// 行：[显示名, 分组, 题材子类, 互斥（逗号分隔显示名）, 主角可用, 仅 NSFW, 双向, 效果说明]
const TRAIT_ROWS = [
    ["随身", "存在", "", "已故", 0, 0, 0, "不做好感冷却；在场名单默认在场"],
    ["无实体", "存在", "", "附身", 0, 0, 0, "不结算体力、亲密、伤势；相关标签丢弃"],
    ["已故", "存在", "", "随身", 0, 0, 0, "冻结全部冷却与消退；正文点名不算在场；不再接收关系标签（丢弃并记诊断）"],
    ["长生", "存在", "", "", 1, 0, 0, "时间跳跃期间好感不冷却"],
    ["失忆", "存在", "", "", 1, 0, 0, "获得时了解暂存后清零、好感保留；失去时了解恢复为暂存值与当前值中较高者"],
    ["伪装身份", "存在", "", "", 1, 0, 0, "了解上限 50；失去（被揭穿）后上限解除"],
    ["附身", "存在", "", "无实体", 0, 0, 0, "体力、伤势记在宿主身上；角色卡指定宿主"],
    ["脆弱", "心性", "", "坚韧", 1, 0, 0, "压力上升加倍"],
    ["坚韧", "心性", "", "脆弱", 1, 0, 0, "压力上升减半"],
    ["记仇", "心性", "", "宽容,一笑泯恩仇", 0, 0, 0, "芥蒂不自然消退"],
    ["宽容", "心性", "", "记仇", 0, 0, 0, "芥蒂消退加倍"],
    ["慢热", "心性", "", "恋爱脑,冰山", 0, 0, 0, "好感上升减半，冷却减半"],
    ["恋爱脑", "心性", "", "慢热,人间清醒", 0, 0, 0, "好感上升略快，下降略快"],
    ["病娇", "心性", "", "", 0, 0, 0, "吃醋所加芥蒂加倍；欲望不消退"],
    ["多疑", "心性", "", "傻白甜", 0, 0, 0, "信任上升减半"],
    ["傻白甜", "心性", "", "多疑,绿茶", 0, 0, 0, "信任上升加倍"],
    ["乐天派", "心性", "", "", 1, 0, 0, "每天压力额外 −5"],
    ["抖M", "心性", "", "", 0, 0, 0, "压力上升时欲望同步 +小"],
    ["抖S", "心性", "", "", 0, 0, 0, "主角压力上升或在亲密对决中处于下风的那一楼，其欲望小升；亲密那一楼其欲望额外小升"],
    ["病秧子", "体质", "", "强健", 1, 0, 0, "体力消耗略快"],
    ["强健", "体质", "", "病秧子", 1, 0, 0, "体力消耗减半"],
    ["魅魔体质", "体质", "", "", 1, 0, 0, "亲密时回复体力而非消耗"],
    ["不眠", "体质", "", "", 1, 0, 0, "不需要入睡；兜底不补入睡"],
    ["过目不忘", "天资", "", "", 1, 0, 0, "了解不下降（失忆除外）"],
    ["幸运儿", "天资", "", "倒霉蛋", 1, 0, 0, "检定多一个奖励骰"],
    ["倒霉蛋", "天资", "", "幸运儿", 1, 0, 0, "检定多一个惩罚骰"],
    ["豁免亲密门槛", "剧情", "", "", 0, 0, 0, "见现有 intimacyForced"],
    ["诅咒", "剧情", "", "", 1, 0, 0, "每天压力 +5；失去即解咒"],
    ["命定之人", "剧情", "", "", 0, 0, 0, "好感上升略快；冷却不低于「明确喜欢」下限"],
    ["外向", "性格", "", "内向", 1, 0, 0, "与人相处（约会、闲聊、聚会）压力下降加倍；独处多日压力缓升"],
    ["内向", "性格", "", "外向", 1, 0, 0, "独处、休息压力下降加倍；连续社交压力缓升"],
    ["敏感", "性格", "", "迟钝", 1, 0, 0, "好感、信任的下降略快"],
    ["迟钝", "性格", "", "敏感", 1, 0, 0, "好感、信任的下降减半"],
    ["好胜", "性格", "", "淡泊", 1, 0, 0, "检定或对决失败时压力额外上升；胜利时压力额外下降"],
    ["淡泊", "性格", "", "好胜", 1, 0, 0, "失败不加压力，胜利也不减"],
    ["醋坛子", "性格", "", "心大", 0, 0, 0, "吃醋所加芥蒂略快（与病娇叠加，受总上限约束）"],
    ["心大", "性格", "", "醋坛子", 0, 0, 0, "吃醋不加芥蒂，只扣少量好感"],
    ["讲义气", "性格", "", "薄情", 0, 0, 0, "共患难、守护类事件好感与信任上升略快"],
    ["薄情", "性格", "", "讲义气", 0, 0, 0, "好感冷却加倍；共患难加成减半"],
    ["完美主义者", "性格", "", "", 1, 0, 0, "检定大成功压力下降、普通成功无变化、失败压力上升加倍"],
    ["浪漫", "性格", "", "务实", 0, 0, 0, "约会、告白类事件好感上升略快"],
    ["害羞", "性格", "", "", 1, 0, 0, "其欲望上升时压力同步小升；亲密那一楼其好感额外小升"],
    ["慕强", "性格", "", "", 0, 0, 0, "主角检定成功或战斗胜利的那一楼，其对主角好感上升加倍"],
    ["自卑", "性格", "", "自恋", 1, 0, 0, "被夸奖、肯定类事件好感上升加倍；被批评时压力上升加倍"],
    ["专一", "性格", "", "花心,海王", 0, 0, 0, "成为恋人后好感不冷却；其他角色对其好感上升减半"],
    ["花心", "性格", "", "专一", 0, 0, 0, "同时对两人及以上有好感（「心动」起）时，对他们的好感上升略快、冷却加倍"],
    ["正义使者", "性格", "", "", 1, 0, 0, "主角背叛、欺骗、伤害他人的那一楼，其芥蒂上升加倍"],
    ["好奇宝宝", "性格", "", "", 1, 0, 0, "双方了解上升略快"],
    ["工作狂", "性格", "", "懒虫", 1, 0, 0, "打工收入高一档；每天压力缓升"],
    ["冒失鬼", "性格", "", "", 1, 0, 0, "敏捷、手工类检定多一个惩罚骰"],
    ["老好人", "性格", "", "", 1, 0, 0, "求助类事件必然答应，容易结下或欠下人情；芥蒂上升减半"],
    ["务实", "性格", "", "浪漫", 0, 0, 0, "送礼、帮忙类好感上升略快；约会类略慢"],
    ["耐饿", "生存", "", "易饿", 1, 0, 0, "漏餐不扣体力"],
    ["易饿", "生存", "", "耐饿", 1, 0, 0, "漏餐体力加倍下降；兜底进食提醒提前"],
    ["浅眠", "生存", "", "瞌睡虫", 1, 0, 0, "入睡回复体力减半；夜间被打扰压力上升"],
    ["瞌睡虫", "生存", "", "浅眠", 1, 0, 0, "入睡回复体力加倍；体力低于一半时更容易被判昏睡"],
    ["自愈", "生存", "", "伤口难愈", 1, 0, 0, "伤势恢复天数减半"],
    ["伤口难愈", "生存", "", "自愈", 1, 0, 0, "伤势恢复天数加倍"],
    ["耐痛", "生存", "", "怕痛", 1, 0, 0, "受伤时压力不上升；重伤体力扣减减半"],
    ["怕痛", "生存", "", "耐痛", 1, 0, 0, "受伤时压力额外上升"],
    ["百毒不侵", "生存", "", "", 1, 0, 0, "中毒、醉酒类体力扣减无效（若有对应标签）"],
    ["耐寒", "生存", "", "", 1, 0, 0, "寒冷天气、环境类体力扣减减半（读天气与地点标签，读不到则不生效）"],
    ["耐热", "生存", "", "", 1, 0, 0, "炎热天气、环境类体力扣减减半（读天气与地点标签，读不到则不生效）"],
    ["恐高", "生存", "", "", 1, 0, 0, "高处地点压力缓升（读地点关键词，读不到则不生效）"],
    ["怕黑", "生存", "", "", 1, 0, 0, "夜晚、黑暗地点压力缓升（读地点关键词，读不到则不生效）"],
    ["幽闭", "生存", "", "", 1, 0, 0, "狭窄密闭地点压力缓升（读地点关键词，读不到则不生效）"],
    ["野外生存", "生存", "", "", 1, 0, 0, "野外地点进食、入睡兜底照常回复，不因缺食缺眠额外扣体力"],
    ["旧伤", "生存", "", "", 1, 0, 0, "阴雨天或剧烈运动时体力额外下降；可经剧情（副模型判定）治愈失去"],
    ["生财有道", "养成", "", "不善营生", 1, 0, 0, "打工收入高一档"],
    ["不善营生", "养成", "", "生财有道", 1, 0, 0, "打工收入低一档"],
    ["精打细算", "养成", "", "败家子,赌徒", 1, 0, 0, "花钱略慢"],
    ["败家子", "养成", "", "精打细算,吝啬鬼", 1, 0, 0, "花钱略快；金钱每天自动小减（乱花）"],
    ["勤奋", "养成", "", "懒虫", 1, 0, 0, "技能成长检定多掷一次取好"],
    ["懒虫", "养成", "", "勤奋,工作狂", 1, 0, 0, "技能成长每两天才可一次"],
    ["学霸", "养成", "", "", 1, 0, 0, "学习、阅读类技能成长涨幅加一"],
    ["话痨", "养成", "", "嘴笨", 1, 0, 0, "社交类检定多一个奖励骰"],
    ["嘴笨", "养成", "", "话痨", 1, 0, 0, "社交类检定多一个惩罚骰"],
    ["人见人爱", "养成", "", "不讨喜", 1, 0, 0, "所有角色对其好感上升略快（只主角可挂）"],
    ["不讨喜", "养成", "", "人见人爱", 1, 0, 0, "所有角色对其好感上升略慢（只主角可挂）"],
    ["社恐", "养成", "", "社牛", 1, 0, 0, "对方好感在「无感」以下时，好感、信任上升减半"],
    ["社牛", "养成", "", "社恐", 1, 0, 0, "起始关系「陌生」按「熟人」计"],
    ["大胃王", "养成", "", "", 1, 0, 0, "进食回复体力加倍；漏餐时体力额外下降"],
    ["早起鸟", "养成", "", "夜猫子", 1, 0, 0, "入睡回复体力略多；熬夜体力消耗加倍"],
    ["夜猫子", "养成", "", "早起鸟", 1, 0, 0, "夜间体力消耗减半；早起体力消耗加倍"],
    ["千杯不醉", "养成", "", "", 1, 0, 0, "饮酒不扣体力、不触发醉酒（若有醉酒结算）"],
    ["贵人相助", "养成", "", "", 1, 0, 0, "每天第一次失败的检定可重掷一次"],
    ["战斗狂", "极端性格", "", "厌战", 1, 0, 0, "战斗胜利压力下降一大档；多日无战斗每天压力缓升；战斗类检定多一个奖励骰"],
    ["厌战", "极端性格", "", "战斗狂,杀手", 1, 0, 0, "战斗那一楼压力上升加倍；和平解决冲突时压力下降一大档"],
    ["狂信徒", "极端性格", "", "无神论者", 1, 0, 0, "对信仰对象（角色卡指定）信任不下降、芥蒂不上升；有人质疑信仰时其芥蒂上升加倍"],
    ["无神论者", "极端性格", "", "狂信徒", 1, 0, 0, "不受信仰、宗教、神迹类事件影响；神秘学类压力上升减半"],
    ["花痴", "极端性格", "", "无欲无求", 1, 0, 0, "对所有颜值高的角色（人设写明）好感、欲望上升加倍；冷却加倍"],
    ["无欲无求", "极端性格", "", "花痴", 1, 0, 0, "欲望不上升；好感上升减半，但不冷却"],
    ["吝啬鬼", "极端性格", "", "败家子", 1, 0, 0, "收入时压力下降，花钱时压力上升加倍；送礼类好感对其减半"],
    ["偏执狂", "极端性格", "", "没心没肺", 1, 0, 0, "芥蒂不自然消退、信任上升减半；认定的事件不受反证影响"],
    ["没心没肺", "极端性格", "", "偏执狂", 1, 0, 0, "芥蒂每天消退加倍；了解上升减半"],
    ["控制狂", "极端性格", "", "佛系", 1, 0, 0, "主角违背其意愿那一楼芥蒂上升略快；主角顺从其安排那一楼其好感小升"],
    ["佛系", "极端性格", "", "控制狂", 1, 0, 0, "芥蒂上升减半；压力上升略慢"],
    ["自恋", "极端性格", "", "自卑", 1, 0, 0, "被夸奖好感上升加倍；被批评芥蒂上升加倍"],
    ["赌徒", "极端性格", "", "精打细算", 1, 0, 0, "检定可押上金钱：成功收入翻倍，失败金钱扣减翻倍；不赌的日子压力缓升"],
    ["疯批", "极端性格", "", "", 1, 0, 0, "压力不影响行动；压力越高，其欲望与好感上升越快（压力过半起略快）"],
    ["通缉犯", "罪犯", "", "", 1, 0, 0, "人多的公共地点每楼压力小升；其身份被揭开那一楼，在场角色对其信任下降一档"],
    ["惯偷", "罪犯", "", "", 1, 0, 0, "偷窃类事件成功那一楼金钱小增；被发现那一楼在场角色对其信任下降一大档"],
    ["骗子", "罪犯", "", "", 1, 0, 0, "他人对其了解上升减半；谎言被揭穿那一楼，对方信任下降一大档、芥蒂上升一档"],
    ["杀手", "罪犯", "", "厌战", 1, 0, 0, "战斗类检定多一个奖励骰；杀伤事件后其压力不上升"],
    ["黑帮", "罪犯", "", "", 1, 0, 0, "灰色收入：打工收入高一档；每天压力缓升"],
    ["混混", "罪犯", "", "大佬", 1, 0, 0, "街头冲突类检定多一个奖励骰；他人对其信任上升略慢"],
    ["大佬", "罪犯", "", "混混", 1, 0, 0, "开局金钱高一档；手下（同组织角色）对其信任不下降；每天压力缓升"],
    ["地头蛇", "罪犯", "", "", 1, 0, 0, "在其常驻地点，其压力不上升、他人对其芥蒂上升减半；离开常驻地点那一楼压力小升"],
    ["黑客", "罪犯", "", "", 1, 0, 0, "技术类检定多一个奖励骰；被追查那一楼压力小升"],
    ["前科犯", "罪犯", "", "", 1, 0, 0, "他人对其信任上升减半；信任过半后改为略快（改过自新被认可）"],
    ["斯德哥尔摩", "罪犯", "", "", 1, 0, 0, "被挟持、关押期间，对挟持者不记芥蒂，好感上升略快"],
    ["共犯", "罪犯", "", "", 1, 0, 1, "两人一起做过坏事：彼此信任不下降；一方被抓那一楼，另一方压力上升一大档"],
    ["购物解压", "资源互换", "", "吝啬鬼", 1, 0, 0, "花钱那一楼压力下降一小档（每天最多一次）；钱照常花"],
    ["化悲愤为食欲", "资源互换", "", "", 1, 0, 0, "压力过半时进食，体力回复略快"],
    ["越累越清醒", "资源互换", "", "", 1, 0, 0, "体力低于三成时检定多一个奖励骰"],
    ["存款即安全感", "资源互换", "", "败家子", 1, 0, 0, "金钱在「富裕」档及以上时，每天压力额外下降一小档；跌出「富裕」那一楼压力小升"],
    ["运动解压", "资源互换", "", "", 1, 0, 0, "体力消耗「中」及以上那一楼，压力下降一小档"],
    ["睡一觉就好", "资源互换", "", "浅眠", 1, 0, 0, "入睡时压力下降加倍"],
    ["拼命三郎", "资源互换", "", "", 1, 0, 0, "可透支体力：体力为零仍能行动，但次日体力上限减一档，持续一天"],
    ["压力变动力", "资源互换", "", "情绪稳定", 1, 0, 0, "压力过半时，打工收入高一档、技能成长检定多一个奖励骰"],
    ["体力怪物", "床上专属", "", "一碰就软", 1, 1, 0, "亲密时体力消耗减半"],
    ["一碰就软", "床上专属", "", "体力怪物", 1, 1, 0, "亲密时体力消耗略快、欲望上升略快"],
    ["敏感体质", "床上专属", "", "", 1, 1, 0, "亲密时欲望上升加倍"],
    ["反差萌", "床上专属", "", "花痴", 0, 1, 0, "平时欲望上升减半；当天发生亲密后，至当天结束欲望上升加倍"],
    ["事后黏人", "床上专属", "", "事后冷淡", 0, 1, 0, "亲密结束那一楼，其对主角好感、信任各小升"],
    ["事后冷淡", "床上专属", "", "事后黏人", 0, 1, 0, "亲密结束那一楼其欲望清零，好感不因亲密上升"],
    ["口嫌体正直", "床上专属", "", "", 0, 1, 0, "本楼有其拒绝类事件时，欲望不降反小升"],
    ["夜夜笙歌", "床上专属", "", "无欲无求", 1, 1, 0, "欲望每天自然回升一档；连续两天未亲密，压力小升"],
    ["初体验", "床上专属", "", "", 1, 1, 0, "第一次亲密那一楼好感上升一大档、压力小升；之后自动摘下"],
    ["调教中", "床上专属", "", "", 0, 1, 0, "每次亲密后，其对主角欲望的自然消退下限提高一小档（最高到一半）；摘下即恢复"],
    ["秒回血", "床上专属", "", "", 1, 1, 0, "亲密结束后体力回复一档"],
    ["声控", "床上专属", "", "", 1, 1, 0, "正文出现低语、耳语、在耳边说话类描写的那一楼，其欲望上升加倍"],
    ["强势", "恋爱人设", "", "犬系", 0, 0, 0, "欲望上升略快；信任上升减半；芥蒂消退加倍"],
    ["护短", "恋爱人设", "", "", 0, 0, 0, "主角受伤、受委屈或压力上升「大」及以上的那一楼，对主角好感、信任额外上升一小档"],
    ["温柔疏离", "恋爱人设", "", "", 0, 0, 0, "好感上升略快、下降减半；了解、信任上升减半；其对主角做出失望类事件时，主角压力上升加倍"],
    ["白月光", "恋爱人设", "", "", 0, 0, 0, "不在场时好感不冷却；久别重逢那一楼好感上升一大档；被提起时其他对主角有好感的角色按吃醋结算；「心动」进「恋人」需多一次关键事件"],
    ["禁欲", "恋爱人设", "", "", 0, 0, 0, "欲望未过半时上升减半，过半后上升加倍"],
    ["追悔", "恋爱人设", "", "", 0, 0, 0, "芥蒂越高，其对主角好感上升越快（芥蒂「明显」起略快）"],
    ["青梅竹马", "恋爱人设", "", "", 0, 0, 0, "开局了解高一档；好感冷却减半；「朋友」进「恋人」需多一次关键事件"],
    ["腹黑", "恋爱人设", "", "天然呆", 0, 0, 0, "主角对其了解未过半时，角色卡好感显示为「？」；主角对其社交检定多一个惩罚骰；了解过半后恢复"],
    ["小笨蛋", "恋爱人设", "", "", 0, 0, 0, "自身各类检定多一个惩罚骰；失败那一楼其对主角好感小升（笨拙却讨人喜欢）；主角帮其收拾残局时好感上升略快"],
    ["绿茶", "恋爱人设", "", "傻白甜", 0, 0, 0, "情敌（其他对主角好感「心动」起的角色）在场那一楼，其对主角好感上升略快，情敌对主角的吃醋结算加倍；主角对其社交检定多一个惩罚骰"],
    ["舔狗", "恋爱人设", "", "人间清醒", 0, 0, 0, "被主角拒绝、冷落时其好感不降、芥蒂不升，压力小升；为主角花钱的事件其好感照涨；主角对其好感上升减半（越追越不值钱）"],
    ["绿帽癖", "恋爱人设", "", "占有欲强,醋坛子,病娇", 1, 1, 0, "恋人与他人亲近时，不记芥蒂、不按吃醋结算，改为其欲望上升一档、压力小降；仅在 NSFW 开启时生效，副模型只在人设写明时挂"],
    ["海王", "恋爱人设", "", "专一", 0, 0, 0, "可同时与多名角色进入「心动」及以上，彼此不触发吃醋；任一对象发现另一对象（同楼在场）时，该对象芥蒂上升一大档"],
    ["钓系", "恋爱人设", "", "", 0, 0, 0, "主角对其好感「心动」起，其对主角好感上升减半、欲望上升略快；主角主动示好被冷处理时主角压力小升"],
    ["白莲", "恋爱人设", "", "", 0, 0, 0, "他人与其冲突的那一楼，在场第三方对该他人芥蒂小升；其自身芥蒂上升减半"],
    ["人间清醒", "恋爱人设", "", "恋爱脑,舔狗", 0, 0, 0, "示好类事件对其好感上升减半；不受「恋爱脑」「花痴」类合成与吃醋连锁影响"],
    ["破碎感", "恋爱人设", "", "情绪稳定", 0, 0, 0, "其压力过半时，在场所有角色对其好感上升略快（激起保护欲）"],
    ["显眼包", "恋爱人设", "", "", 0, 0, 0, "其在场的日子，在场所有角色了解其的速度略快；主角压力每天额外小降"],
    ["社畜", "恋爱人设", "", "富二代", 1, 0, 0, "打工那天体力消耗略快、收入正常；休息日压力下降一大档"],
    ["富二代", "恋爱人设", "", "社畜", 1, 0, 0, "开局金钱高一档；打工收入低一档"],
    ["电子宠物", "恋爱人设", "", "", 0, 0, 0, "主角多日不与其互动，其好感不降但压力上升加倍；主角一互动压力清回原值"],
    ["嘴替", "恋爱人设", "", "", 0, 0, 0, "主角压力上升「大」及以上那一楼，其在场替主角出头，引发冲突方对其芥蒂小升、主角压力小降"],
    ["恋爱军师", "恋爱人设", "", "", 0, 0, 0, "主角对他人示好类检定在其在场时多一个奖励骰；其对主角欲望不上升"],
    ["键盘侠", "恋爱人设", "", "", 1, 0, 0, "社交检定（言语对抗）多一个奖励骰；面对面冲突那一楼其压力小升"],
    ["情绪稳定", "恋爱人设", "", "破碎感", 1, 0, 0, "压力单楼上升最多一档「中」"],
    ["占有欲强", "恋爱人设", "", "", 0, 0, 0, "主角与他人亲近的那一楼，不加芥蒂，改为欲望、压力各上升一小档；主角在场时好感不冷却"],
    ["傲娇", "恋爱人设", "", "", 0, 0, 0, "好感在「喜欢」以下时上升减半，过「喜欢」后上升加倍"],
    ["冰山", "恋爱人设", "", "慢热", 0, 0, 0, "信任未过半时好感上升减半；过半后正常，且冷却减半"],
    ["毒舌", "恋爱人设", "", "", 0, 0, 0, "相处时主角压力小幅上升；信任上升略快"],
    ["黏人", "恋爱人设", "", "", 0, 0, 0, "主角不在身边的日子其压力缓升；主角在场时好感不冷却"],
    ["天然呆", "恋爱人设", "", "腹黑", 0, 0, 0, "吃醋不加芥蒂；主角对其社交检定多一个奖励骰"],
    ["元气", "恋爱人设", "", "", 0, 0, 0, "其在场的日子主角压力每天额外下降"],
    ["无口", "恋爱人设", "", "", 0, 0, 0, "主角对其了解未过半时好感上升减半；过半后好感上升加倍"],
    ["小恶魔", "恋爱人设", "", "", 0, 0, 0, "欲望上升加倍；主角对其社交检定多一个惩罚骰"],
    ["包容", "恋爱人设", "", "", 0, 0, 0, "芥蒂上升减半；主角压力上升「大」及以上的那一楼，其在场时主角压力额外下降一小档"],
    ["爱撒娇", "恋爱人设", "", "", 0, 0, 0, "信任上升加倍；主角在场时其压力额外下降"],
    ["贤惠", "恋爱人设", "", "", 0, 0, 0, "与其相处的日子，主角入睡、进食回复体力略多"],
    ["高岭之花", "恋爱人设", "", "", 0, 0, 0, "好感在「心动」以下时上升减半；过「心动」后冷却减半"],
    ["贪吃鬼", "恋爱人设", "", "", 0, 0, 0, "请客、送吃的、一起吃饭类事件好感上升加倍；饿着（漏餐）的那一楼其好感上升减半"],
    ["犬系", "动物系", "", "", 0, 0, 0, "信任上升加倍；芥蒂上升减半；主角多日不与其互动时其压力缓升（原「忠犬」并入）；与恋爱人设「强势」互斥"],
    ["猫系", "动物系", "", "", 0, 0, 0, "好感上升略慢、冷却减半；主角压力达七成以上时，其在场的那一楼主角压力额外下降"],
    ["狐系", "动物系", "", "", 0, 0, 0, "了解上升减半；欲望上升略快；其对主角的社交检定多一个奖励骰"],
    ["兔系", "动物系", "", "", 0, 0, 0, "其压力上升略快；信任上升略快；主角在场时其压力额外下降"],
    ["狼系", "动物系", "", "", 0, 0, 0, "信任未过半时芥蒂上升略快；过半后好感不冷却；欲望上升略快"],
    ["熊系", "动物系", "", "", 0, 0, 0, "主角受伤那一楼，其对主角好感上升一大档；芥蒂上升减半"],
    ["蛇系", "动物系", "", "", 0, 0, 0, "好感上升减半、下降减半（难以打动，也难以失去）"],
    ["Alpha", "题材设定", "ABO", "", 1, 0, 0, "信息素压制那一楼，被压制的 Omega 压力上升；易感期期间欲望、芥蒂上升略快"],
    ["Beta", "题材设定", "ABO", "", 1, 0, 0, "不受信息素压制与安抚影响；无发情期、易感期"],
    ["Omega", "题材设定", "ABO", "", 1, 0, 0, "发情期期间欲望上升加倍、体力消耗略快；被 Alpha 安抚那一楼压力下降一大档；被压制时压力上升"],
    ["已标记", "题材设定", "ABO", "", 1, 0, 1, "彼此好感不冷却；任一方与他人亲近，另一方压力上升一大档；被标记的 Omega 不再受其他 Alpha 压制"],
    ["信息素契合", "题材设定", "ABO", "", 1, 0, 1, "信息素安抚效果加倍；彼此欲望上升略快"],
    ["哨兵", "题材设定", "哨向", "", 1, 0, 0, "嘈杂、战斗场景压力上升略快；结合向导在场时压力不上升；体力消耗减半"],
    ["向导", "题材设定", "哨向", "", 1, 0, 0, "在场那一楼，哨兵压力下降一大档；进行疏导时自身体力小降"],
    ["精神结合", "题材设定", "哨向", "", 1, 0, 1, "彼此好感不冷却、信任上升加倍；一方压力上升「大」及以上时另一方压力小升"],
    ["精神图景崩溃", "题材设定", "哨向", "", 1, 0, 0, "哨兵压力满时自动挂上，效果同压力转换「崩溃」；向导疏导后摘下"],
    ["精神体", "题材设定", "哨向", "", 1, 0, 0, "角色卡备注一行（动物名），不影响数值；可与动物系对应"],
    ["蛋糕", "题材设定", "蛋糕叉", "", 1, 0, 0, "叉子在场时，叉子对其欲望上升加倍"],
    ["叉子", "题材设定", "蛋糕叉", "", 1, 0, 0, "进食回复体力减半（尝不出味道）；与蛋糕亲密时体力回复一大档、压力下降"],
    ["认出蛋糕", "题材设定", "蛋糕叉", "", 1, 0, 1, "叉子认出对方后挂上：叉子在场时蛋糕压力缓升；叉子对蛋糕好感过「喜欢」后转为「守护」——蛋糕不再紧张、叉子对蛋糕信任上升加倍。好感始终不到「喜欢」就一直停在危险的一侧，甜虐由剧情自然决定"],
    ["兽人", "题材设定", "兽人", "", 1, 0, 0, "体力消耗略慢；发情季（关键词触发）欲望上升略快；可配合动物系表示兽种"],
    ["伴侣印记", "题材设定", "兽人", "", 1, 0, 1, "认定伴侣后彼此好感不冷却；任一方与他人亲近，另一方芥蒂上升一大档"],
    ["吸血鬼", "题材设定", "吸血鬼", "", 1, 0, 0, "白天体力消耗略快、夜晚减半；多日未吸血每天压力缓升；吸血那一楼体力回复一大档"],
    ["血仆", "题材设定", "吸血鬼", "", 1, 0, 0, "被吸血那一楼体力下降、对主人欲望小升；主人在场时压力下降"],
    ["血契", "题材设定", "吸血鬼", "", 1, 0, 1, "主从结契：彼此不冷却；主人只吸契约者的血时，吸血回复加倍"],
    ["人鱼", "题材设定", "人鱼", "", 1, 0, 0, "水边、水下地点压力下降、体力回复加快；长时间离水每天体力额外下降"],
    ["人鱼之歌", "题材设定", "人鱼", "", 1, 0, 0, "其歌唱那一楼，听者对其欲望小升、压力下降"],
    ["契约者", "题材设定", "契约", "", 1, 0, 0, "身负契约一方（召唤师、阴阳师、魔法使）"],
    ["式神", "题材设定", "契约", "", 1, 0, 0, "主人在场时体力消耗减半；主人压力上升「大」及以上时其压力同步小升"],
    ["使魔", "题材设定", "契约", "", 1, 0, 0, "主人在场时体力消耗减半；主人压力上升「大」及以上时其压力同步小升"],
    ["主从契约", "题材设定", "契约", "", 1, 0, 1, "彼此信任不下降；从者对主人芥蒂上升减半；违约（剧情判定）时自动解除并芥蒂上升一大档"],
    ["知恩图报", "恩情", "", "忘恩负义", 1, 0, 0, "恩情类状态效果加倍，且不会淡化"],
    ["忘恩负义", "恩情", "", "知恩图报", 0, 0, 0, "救命之恩过 7 天自动淡化为「欠你人情」"],
    ["不愿亏欠", "恩情", "", "", 1, 0, 0, "欠恩期间每天压力缓升；报恩后好感上升一大档"],
    ["睚眦必报", "仇怨", "", "以德报怨", 1, 0, 0, "中等伤害即可结怨；对抗结怨对象的检定多一个奖励骰"],
    ["以德报怨", "仇怨", "", "睚眦必报", 1, 0, 0, "不会结怨，伤害类芥蒂上升减半"],
    ["一笑泯恩仇", "仇怨", "", "记仇", 1, 0, 0, "宿仇可直接经一次「冰释前嫌」解开，不必先转恩怨两难"],
];

// 关系状态（恩情、仇怨）：记在两人的关系上，由 stat-strain.js 一侧管理；这里只登记定义。行：[显示名, 分组, 说明]
const STATE_ROWS = [
    ["救命之恩", "恩情", "TA 欠你：当楼 TA 信任上升一大档、芥蒂下降一大档；此后 TA 对主角好感单楼最多下降一小档；TA 报恩后消失；你欠 TA：当楼 TA 好感上升一小档；角色卡显示「欠TA一命」；TA 遇险那一楼主角压力额外上升；主角报恩后消失，并让 TA 好感、信任各上升一大档"],
    ["恩怨两难", "恩情", "TA 对你：宿仇转为此状态：芥蒂不再上升，好感可升，但每次好感上升 TA 压力同步小升；走向和解则清除，走向决裂则转回宿仇"],
    ["欠你人情", "恩情", "任一方向：受恩方下一次被求助时，相关检定多一个奖励骰（主角欠时作用于 TA 对主角的求助事件）；用掉即消失"],
    ["报恩", "恩情", "任一方向：对应救命之恩消失，恩人好感、信任各上升一大档（主角作恩人时只结算 TA 一侧）"],
    ["结怨", "仇怨", "TA 恨你：芥蒂当楼上升一大档，此后不自然消退；TA 好感上升减半；未到宿仇，可经道歉 / 弥补类事件化解；你恨 TA：角色卡显示「与TA结怨」；TA 在场时主角压力缓升；主角对 TA 的对抗类检定多一个奖励骰（复仇的劲头）"],
    ["宿仇", "仇怨", "任一方向：现有效果不变；只能经「恩怨两难」或「冰释前嫌」解开"],
    ["血仇", "仇怨", "任一方向：直接定型宿仇；一次救命只降为「恩怨两难」的前半程，需两次恩情事件才转成恩怨两难"],
    ["爱恨交织", "仇怨", "TA 对你：好感上升时欲望同步小升；芥蒂与好感互不抵消"],
    ["冰释前嫌", "仇怨", "任一方向：结怨 / 宿仇清除；芥蒂下降一大档；信任上升一小档"],
    ["大仇得报", "仇怨", "任一方向：报复方压力下降一大档、结怨清除；被报复方按事件结算，可能反向结怨（冤冤相报由剧情决定，不强制）"],
];

// 成就特质：条件达成后系统自动授予，不经副模型；累计计数存 catalog.counters。
export const ACHIEVEMENT_DEFS = Object.freeze([
    ['熟练工', '累计打工成功达到十次', '打工收入高一档（与「生财有道」不叠加，取高）', 'workWins', 10],
    ['一技之长', '任一技能达到八十', '该技能的检定多一个奖励骰', 'skillMax', 80],
    ['万事通', '五项以上技能达到六十', '新技能初值略高', 'skill60', 5],
    ['小有积蓄', '金钱首次达到富裕档', '每天有少量利息收入', 'rich', 1],
    ['情场老手', '当过恋爱对象的角色达到三人', '约会类检定多一个奖励骰', 'romances', 3],
    ['身经百战', '战斗胜利达到十次', '伤势恢复加快', 'battleWins', 10],
    ['劫后余生', '压力转换「崩溃」后恢复为普通压力', '获得「坚韧」（若已有「脆弱」则替换）', 'brokenRecovered', 1],
    ['铁打的身体', '连续七天体力未低于一半', '获得「强健」', 'sturdyDays', 7],
].map(([name, cond, desc, counter, need]) => Object.freeze({ id: name, name, group: '成就', cond, desc, counter, need, exclusive: Object.freeze([]), protagonist: true, nsfw: false, judge: cond, inject: null, achieve: true })));

const tidy = (text) => String(text)
    .replace(/([一-鿿）」，、；])\s+([A-Za-z])/g, '$1$2')
    .replace(/([A-Za-z])\s+([一-鿿（「])/g, '$1$2');

function buildDefs() {
    const idOf = (name) => LEGACY_ID[name] || name;
    const byName = new Map();
    const rows = [...TRAIT_ROWS, ['亲人', '存在', '', '', 0, 0, 0, '']];
    for (const [name, group, sub, excl, protagonist, nsfw, bidir, desc] of rows) {
        byName.set(name, { id: idOf(name), name, group, sub, exclusive: new Set(excl ? excl.split(',').map(idOf) : []), protagonist: protagonist === 1, nsfw: nsfw === 1, bidirectional: bidir === 1, desc: tidy(DESC_FIX[name] || desc), judge: JUDGE[name] || `人设写明其「${name}」的特点`, inject: INJECT[name] || null });
    }
    const list = [...byName.values()];
    // 组内互斥：动物系每人最多一个；ABO 三选一。
    for (const a of list) for (const b of list) {
        if (a === b) continue;
        if ((a.group === '动物系' && b.group === '动物系') || (a.sub === 'ABO' && b.sub === 'ABO' && a.group === '题材设定' && b.group === '题材设定')) a.exclusive.add(b.id);
    }
    // 互斥对称化。
    const byId = new Map(list.map((d) => [d.id, d]));
    for (const a of list) for (const id of [...a.exclusive]) { const b = byId.get(id); if (b) b.exclusive.add(a.id); }
    return list.map((d) => Object.freeze({ ...d, exclusive: Object.freeze([...d.exclusive].sort()) }));
}

export const TRAIT_DEFS = Object.freeze(buildDefs());
export const RELATION_STATE_DEFS = Object.freeze(STATE_ROWS.map(([name, group, desc]) => Object.freeze({ id: name, name, group, desc: tidy(desc) })));

const DEF_BY_ID = new Map([...TRAIT_DEFS, ...ACHIEVEMENT_DEFS].map((d) => [d.id, d]));
const DEF_BY_NAME = new Map([...TRAIT_DEFS, ...ACHIEVEMENT_DEFS].map((d) => [d.name, d]));

export const getTraitDef = (id) => DEF_BY_ID.get(id) || null;
export const getTraitByName = (name) => DEF_BY_NAME.get(name) || null;
export const isComboKey = (key) => typeof key === 'string' && /^combo:.{1,12}$/.test(key);

// ---- 存档读写 ----

const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const NAME_MAX = 20;
const NAMES_MAX = 60;

// 条目是否挂上：兼容旧布尔式（true）与新格式（{ on: true }）。
export const traitOn = (entry) => entry === true || Boolean(entry && entry.on === true);

function cleanEntry(raw, key) {
    if (raw === true) return { on: true, src: 'manual' };
    if (!plain(raw) || raw.on !== true) return null;
    const src = TRAIT_SRC.includes(raw.src) ? raw.src : 'manual';
    if (isComboKey(key)) {
        const parts = Array.isArray(raw.parts) ? raw.parts.filter((p) => typeof p === 'string' && getTraitDef(p)).slice(0, 5) : [];
        return parts.length >= 2 ? { on: true, src, parts } : null;
    }
    return { on: true, src };
}

// 读档规整：旧布尔式迁移为 { on, src: 'manual' }；表外键丢弃；写档只写新格式。
export function sanitizeTraits(raw) {
    const out = {};
    for (const [name, marks] of Object.entries(plain(raw) ? raw : {}).slice(0, NAMES_MAX)) {
        if (!name || name.length > NAME_MAX || !plain(marks)) continue;
        const own = {};
        for (const [key, value] of Object.entries(marks)) {
            if (!isComboKey(key) && !getTraitDef(key)) continue;
            const entry = cleanEntry(value, key);
            if (entry) own[key] = entry;
        }
        if (Object.keys(own).length) out[name] = own;
    }
    return out;
}

export const APTITUDE_TIERS = Object.freeze(['平庸', '出众', '天纵']);

// 悟性：{ 名: { v: '出众'|'天纵', src } }；旧字符串迁移为 src: 'manual'；平庸为默认不存。
export function sanitizeAptitude(raw) {
    const out = {};
    for (const [name, value] of Object.entries(plain(raw) ? raw : {}).slice(0, NAMES_MAX)) {
        if (!name || name.length > NAME_MAX) continue;
        const v = typeof value === 'string' ? value : plain(value) ? value.v : null;
        if (v !== '出众' && v !== '天纵') continue;
        out[name] = { v, src: plain(value) && TRAIT_SRC.includes(value.src) ? value.src : 'manual' };
    }
    return out;
}

// 旧 intimacyForced 名单并入 traits（键 forced，来源手动）；已有 forced 条目（含新格式）的名字不覆盖。
export function mergeLegacyForced(traits, names) {
    const list = [...new Set((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n && n.length <= NAME_MAX))].slice(0, NAMES_MAX);
    let out = traits;
    for (const name of list) {
        if (out[name] && out[name].forced) continue;
        out = { ...out, [name]: { ...(out[name] || {}), forced: { on: true, src: 'manual' } } };
    }
    return out;
}

export const aptitudeLevel = (catalog, name) => {
    const own = catalog && catalog.aptitude && catalog.aptitude[name];
    const v = typeof own === 'string' ? own : own && own.v;
    return v === '出众' || v === '天纵' ? v : '平庸';
};

export function withAptitude(catalog, name, level, src = 'manual') {
    const next = { ...(catalog.aptitude || {}) };
    if (level === '出众' || level === '天纵') next[name] = { v: level, src }; else delete next[name];
    return { ...catalog, aptitude: next };
}

// 已挂条目：[{ id, src, parts? }]（含合成占位）。
export function listTraits(catalog, charName) {
    const own = catalog && catalog.traits && catalog.traits[charName];
    if (!plain(own)) return [];
    return Object.entries(own).filter(([, entry]) => traitOn(entry)).map(([id, entry]) => ({ id, src: entry === true ? 'manual' : entry.src || 'manual', ...(entry && entry.parts ? { parts: [...entry.parts] } : {}) }));
}

// 格位计数：合成整体占 1 格、其组成项不再单独计数；成就另计。
export function slotUsage(catalog, charName) {
    const list = listTraits(catalog, charName);
    const folded = new Set(list.filter((t) => isComboKey(t.id)).flatMap((t) => t.parts || []));
    const regular = list.filter((t) => t.src !== 'achieve');
    const slots = regular.filter((t) => isComboKey(t.id) || !folded.has(t.id)).length;
    return { slots, auto: regular.filter((t) => t.src === 'auto' && !isComboKey(t.id)).length, achieve: list.filter((t) => t.src === 'achieve').length };
}

// 谁有这项特质：聊天级勾选或角色档案里的旧标记字段任一为真；仅 NSFW 的项在 NSFW 关闭时视为未挂。
export function hasTrait(state, catalog, charName, id) {
    const def = getTraitDef(id);
    if (!def) return false;
    if (def.nsfw && !(catalog && catalog.nsfw === true)) return false;
    const own = catalog && catalog.traits && catalog.traits[charName];
    if (own && traitOn(own[id])) return true;
    const character = state && state.characters && state.characters[charName];
    const field = CHARACTER_FLAG[id];
    return Boolean(field && character && character[field] === true);
}

// ---- 倍率与布尔效果 ----
// 规则行：[特质键, 维度, 方向, 系数, 条件]。方向：up 上升、down 下降、fade 自然消退、cool 好感冷却、jealous 吃醋所加芥蒂。
// 条件读该角色当前数值（dims）；读不到的环境一律不生效。
const dimOf = (character, dim) => Number(character && character.dims && character.dims[dim]) || 0;
const favorOf = (c) => dimOf(c, '好感');
import { EXT_DAILY, EXT_DICE, EXT_FLAG, EXT_SCALE } from './stat-trait-rules.js';
const SCALE_RULES = [
    // 心性
    ['fragile', '压力', 'up', 2], ['坚韧', '压力', 'up', 0.5],
    ['宽容', '芥蒂', 'fade', 2],
    ['慢热', '好感', 'up', 0.6], ['慢热', '好感', 'cool', 0.5],
    ['恋爱脑', '好感', 'up', 1.5], ['恋爱脑', '好感', 'down', 1.5],
    ['病娇', '芥蒂', 'jealous', 2],
    ['多疑', '信任', 'up', 0.5], ['傻白甜', '信任', 'up', 1.7],
    // 恋爱人设
    ['强势', '欲望', 'up', 1.5], ['强势', '信任', 'up', 0.5], ['强势', '芥蒂', 'fade', 2],
    ['温柔疏离', '好感', 'up', 1.5], ['温柔疏离', '好感', 'down', 0.5], ['温柔疏离', '了解', 'up', 0.5], ['温柔疏离', '信任', 'up', 0.5],
    ['禁欲', '欲望', 'up', 0.5, (c) => dimOf(c, '欲望') < 50], ['禁欲', '欲望', 'up', 2, (c) => dimOf(c, '欲望') >= 50],
    ['追悔', '好感', 'up', 1.5, (c) => dimOf(c, '芥蒂') >= 26],
    ['青梅竹马', '好感', 'cool', 0.5],
    ['傲娇', '好感', 'up', 0.6, (c) => favorOf(c) < LIKE_FROM], ['傲娇', '好感', 'up', 2, (c) => favorOf(c) >= LIKE_FROM],
    ['冰山', '好感', 'up', 0.5, (c) => dimOf(c, '信任') <= 50], ['冰山', '好感', 'cool', 0.5, (c) => dimOf(c, '信任') > 50],
    ['毒舌', '信任', 'up', 1.5],
    ['无口', '好感', 'up', 0.5, (c) => dimOf(c, '了解') <= 50], ['无口', '好感', 'up', 2, (c) => dimOf(c, '了解') > 50],
    ['小恶魔', '欲望', 'up', 2],
    ['钓系', '好感', 'up', 0.5, (c) => favorOf(c) >= HEARTBEAT_FROM], ['钓系', '欲望', 'up', 1.5, (c) => favorOf(c) >= HEARTBEAT_FROM],
    ['包容', '芥蒂', 'up', 0.5],
    ['爱撒娇', '信任', 'up', 1.7],
    ['高岭之花', '好感', 'up', 0.6, (c) => favorOf(c) < HEARTBEAT_FROM], ['高岭之花', '好感', 'cool', 0.5, (c) => favorOf(c) >= HEARTBEAT_FROM],
    // 动物系
    ['犬系', '信任', 'up', 1.7], ['犬系', '芥蒂', 'up', 0.5],
    ['猫系', '好感', 'up', 0.6], ['猫系', '好感', 'cool', 0.5],
    ['狐系', '了解', 'up', 0.5], ['狐系', '欲望', 'up', 1.5],
    ['兔系', '压力', 'up', 1.5], ['兔系', '信任', 'up', 1.5],
    ['狼系', '芥蒂', 'up', 1.5, (c) => dimOf(c, '信任') <= 50], ['狼系', '欲望', 'up', 1.5],
    ['熊系', '芥蒂', 'up', 0.5],
    ['蛇系', '好感', 'up', 0.6], ['蛇系', '好感', 'down', 0.5],
    ...EXT_SCALE,
];

// 布尔效果：[标记, 特质键, 条件]。
const FLAG_RULES = [
    ['noFade:芥蒂', '记仇'],
    ['noFade:欲望', '病娇'],
    ['noJealousGrudge', '天然呆'],
    ['noJealousGrudge', '占有欲强'],
    ['stressCapMid', '情绪稳定'],
    ['noCool', 'companion'],
    ['noCool', '占有欲强', (c, ctx) => ctx && ctx.here === true],
    ['noCool', '白月光', (c, ctx) => ctx && ctx.here === false],
    ['absentStress', '黏人'],
    ['absentStress', '犬系'],
    ['hereRelief', '爱撒娇'],
    ['hereRelief', '兔系'],
    ['noCool', '黏人', (c, ctx) => ctx && ctx.here === true],
    ['noCool', '狼系', (c) => dimOf(c, '信任') > 50],
    ...EXT_FLAG,
];

// 每天固定加减：[特质键, 维度, 数值]。读 traitDaily。
const DAILY_RULES = [
    ['乐天派', '压力', -5],
    ...EXT_DAILY,
];

export function traitDaily(state, catalog, charName, dim) {
    let sum = 0;
    for (const [id, d, amount] of DAILY_RULES) if (d === dim && hasTrait(state, catalog, charName, id)) sum += amount;
    return sum;
}

// 结算用的特质目录：运行时把聊天级 catalog.traits 与 NSFW 开关一起传进来（nsfw 是运行时字段，不落盘）。
export const traitCatalogOf = (traits, nsfw = false) => ({ traits: plain(traits) ? traits : {}, nsfw: nsfw === true });

export const clampScale = (value) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));

// 角色在 dim 维度、dir 方向上的倍率：命中特质的系数连乘，夹在 ×0.5 到 ×2。没有命中返回 1。
export function traitScale(state, catalog, charName, dim, dir, ctx = null) {
    const character = state && state.characters && state.characters[charName];
    let scale = 1;
    let hit = false;
    for (const [id, d, direction, factor, cond] of SCALE_RULES) {
        if (d !== dim || direction !== dir) continue;
        if (!hasTrait(state, catalog, charName, id)) continue;
        if (cond && !cond(character, ctx)) continue;
        scale *= factor;
        hit = true;
    }
    return hit ? clampScale(scale) : 1;
}

export function traitFlag(state, catalog, charName, flag, ctx = null) {
    const character = state && state.characters && state.characters[charName];
    for (const [name, id, cond] of FLAG_RULES) {
        if (name !== flag || !hasTrait(state, catalog, charName, id)) continue;
        if (cond && !cond(character, ctx)) continue;
        return true;
    }
    return false;
}

// 倍率大于 1 时单楼与每日上限同乘倍率（四舍五入）；小于等于 1 时上限不变。
export const amplifyLimit = (limit, scale) => (scale > 1 ? Math.round(limit * scale) : limit);

// 下降单楼保护：一楼最多掉「无特质时重大档」的 1.2 倍。drop 为正数的下降幅度。
export const DROP_GUARD = Object.freeze({ 好感: 30, 信任: 36, 芥蒂: 18 });
export const guardDrop = (dim, drop) => (Object.hasOwn(DROP_GUARD, dim) ? Math.min(drop, DROP_GUARD[dim]) : drop);

// 数值乘倍率后四舍五入，至少 1（倍率为 1 时原样返回，保证无特质时与旧结果一致）。
export const scaleAmount = (amount, scale) => (scale === 1 ? amount : Math.max(1, Math.round(amount * scale)));

// 食物词表：「送吃的」类礼物命中即算（贪吃鬼）。不进正文提示词。
export const FOOD_WORDS = Object.freeze(['零食', '甜点', '蛋糕', '饭', '菜', '点心', '奶茶', '便当', '糖', '饼', '面包', '水果', '巧克力', '冰淇淋', '饮料', '汤', '烤肉', '火锅', '早餐', '午餐', '晚餐', '宵夜']);
export const isFoodGift = (text) => FOOD_WORDS.some((w) => String(text || '').includes(w));

// ---- 写入：挂上 / 摘下 / 互斥替换 / 满额规则 ----

const setEntry = (catalog, charName, id, entry) => {
    const own = { ...((catalog.traits && catalog.traits[charName]) || {}) };
    if (entry) own[id] = entry; else delete own[id];
    const traits = { ...(catalog.traits || {}) };
    if (Object.keys(own).length) traits[charName] = own; else delete traits[charName];
    return { ...catalog, traits };
};

const refuse = (catalog, reason) => ({ catalog, notices: [], reason });

// 返回 { catalog, notices: [{ type: 'gain'|'lose'|'replace', charName, id, replacedId? }], reason? }。不原地修改传入的 catalog。
// 规则：手动 > 剧情（含成就授予的替换）> 自动；自动评定不覆盖手动与剧情；互斥时后挂的顶掉先挂的；
// 同挂满 5 项时：剧情先顶掉互斥项，再顶掉最早一项自动评定，再没有就不挂；手动挂满时拒绝；自动评定最多 3 项；成就另计最多 2 项。
export function applyTraitChange(state, catalog, charName, id, on, src = 'manual') {
    const def = getTraitDef(id);
    if (!def || !TRAIT_SRC.includes(src)) return refuse(catalog, 'unknown');
    if (charName === PROTAGONIST_NAME && !def.protagonist) return refuse(catalog, 'not-protagonist');
    const listed = listTraits(catalog, charName);
    const current = listed.find((t) => t.id === id);
    if (!on) {
        if (!current) return refuse(catalog, 'absent');
        if (SRC_RANK[src] < SRC_RANK[current.src] && src === 'auto') return refuse(catalog, 'protected');
        let next = setEntry(catalog, charName, id, null);
        // 组成项被摘下，含它的合成自动拆掉。
        for (const t of listed) if (isComboKey(t.id) && (t.parts || []).includes(id)) next = setEntry(next, charName, t.id, null);
        return { catalog: next, notices: [{ type: 'lose', charName, id }] };
    }
    if (current) {
        if (SRC_RANK[src] <= SRC_RANK[current.src] || src === 'achieve') return { catalog, notices: [] };
        return { catalog: setEntry(catalog, charName, id, { on: true, src }), notices: [] };
    }
    const usage = slotUsage(catalog, charName);
    if (src === 'achieve') {
        if (usage.achieve >= TRAIT_LIMITS.achieve) return refuse(catalog, 'achieve-full');
        const next = setEntry(catalog, charName, id, { on: true, src });
        return { catalog: next, notices: [{ type: 'gain', charName, id }] };
    }
    let next = catalog;
    const notices = [];
    let replacedId;
    for (const ex of def.exclusive) {
        const old = listTraits(next, charName).find((t) => t.id === ex);
        if (!old) continue;
        if (src === 'auto' && old.src !== 'auto') return refuse(catalog, 'conflict');
        next = applyTraitChange(state, next, charName, ex, false, 'story').catalog;
        replacedId = replacedId || ex;
    }
    if (src === 'auto' && slotUsage(next, charName).auto >= TRAIT_LIMITS.auto) return refuse(catalog, 'auto-full');
    if (slotUsage(next, charName).slots >= TRAIT_LIMITS.total) {
        if (src !== 'story') return refuse(catalog, 'full');
        const oldest = listTraits(next, charName).find((t) => t.src === 'auto' && !isComboKey(t.id));
        if (!oldest) return refuse(catalog, 'full');
        next = applyTraitChange(state, next, charName, oldest.id, false, 'story').catalog;
        replacedId = replacedId || oldest.id;
    }
    next = setEntry(next, charName, id, { on: true, src });
    notices.push(replacedId ? { type: 'replace', charName, id, replacedId } : { type: 'gain', charName, id });
    return { catalog: next, notices };
}

// 检定奖惩骰：命中特质的骰数相加（正为奖励骰、负为惩罚骰），夹在 -2 到 +2。category 为 '全部' 的规则对任何检定生效。
export function traitDice(state, catalog, charName, category, ctx = null) {
    const character = state && state.characters && state.characters[charName];
    let sum = 0;
    for (const [id, cat, n, cond] of EXT_DICE) {
        if (cat !== '全部' && cat !== category) continue;
        if (!hasTrait(state, catalog, charName, id)) continue;
        if (cond && !cond(character, ctx)) continue;
        sum += n;
    }
    return Math.max(-2, Math.min(2, sum));
}
