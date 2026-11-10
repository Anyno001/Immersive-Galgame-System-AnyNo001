// 状态定义表与共用约定（计划 docs/STATS_STATUS_TIME_PLAN.md 第二节；定稿细节见 docs/STATS_TRAITS_BALANCE_BACKLOG.md 第四节）。
// 本文件是 A、B、C、D、E 各批的共同约定：只放常量、定义表与纯函数，不依赖其他数值模块。
//
// 【状态存档】catalog.statuses = { 角色名: { 状态键: StatusEntry } }
//   StatusEntry = { src, kind, since: 游戏日, until?: 游戏日（timer 用）, floor: 挂上的楼号,
//                   toward?: 对象名（关系状态才有）, inject?: false（manual 单条关闭注入）, manualLock?: true（手动改过，AI 标签不覆盖） }
// 【周期存档】catalog.cycles = { 角色名: { 周期键: { period: 28, length: 5, last: 游戏日, on: true } } }
// 关系状态（结怨、救命之恩、血契……）仍存 character.relStates（[{ id, dir, since, ... }]），不搬数据，只在读取层并进「关系」栏。
// 恢复型状态「受伤」不另存，直接读战斗账本的 wound（生命百分比）。
//
// 【结算明细】所有批次往 changes 里写变动时，在 { source, target, key, from, to, note } 之外可带：
//   calc: [{ label, value }]  完整公式，最后一行为「结果」；
//   capped: CHANGE_CAP 之一或 null  被截住的原因；
//   dropped?: string  同楼正负标签取较大者时丢弃的那条（原文）；
//   traitTags: [特质显示名]  参与了这次结算的特质，飘字后显示小标签。
// 用 calcRow / withCalc 组装，不要各自拼对象。

// 来源：setting 开场评定（读人设、世界书）；story 正文标签；system 系统按条件；cycle 周期；manual 手动。
export const STATUS_SRC = Object.freeze(['setting', 'story', 'system', 'cycle', 'manual']);
// 注入正文的来源（setting 不注入；manual 可被 inject:false 单条关闭）。
export const STATUS_INJECT_SRC = Object.freeze(['story', 'system', 'cycle', 'manual']);
// 副模型复核时来源只升不降：setting 一旦定下不会回到 story。
export const STATUS_SRC_RANK = Object.freeze({ story: 0, system: 1, cycle: 1, setting: 2, manual: 3 });

// 类型：timer 倒计时（天数到即摘）；cycle 周期（按日期挂摘）；recover 恢复型（每天回复，读 wound）；until 直到解除（剧情事件摘）。
export const STATUS_KINDS = Object.freeze(['timer', 'cycle', 'recover', 'until']);
export const STATUS_GROUPS = Object.freeze(['个人', '关系']);

// 正文标签：[igs-stat:status|角色名|状态名|开始/结束]，关系状态加第五段对象名。
export const STATUS_TAG_ON = Object.freeze(['开始', '来了', '挂上', '得了']);
export const STATUS_TAG_OFF = Object.freeze(['结束', '好了', '摘下', '解除']);

// 行：[显示名, 分组, 类型, 默认天数（timer 用，其余 0）, 世界观子类（空=通用）, 注入句（含 {{名}}）, 效果说明, 互斥（逗号分隔显示名）]
// B 批只放 5 个样板；E 批补全集（backlog 第四节第 10 条）；C 批迁入的状态也在这里补行。
const STATUS_ROWS = [
    ['感冒', '个人', 'timer', 3, '', '{{名}}正在感冒', '体力消耗略快；体力恢复略慢', ''],
    ['宿醉', '个人', 'timer', 1, '', '{{名}}宿醉未醒，头痛乏力', '当天体力上限下降；检定多一个惩罚骰', ''],
    ['失恋期', '个人', 'timer', 14, '', '{{名}}刚刚失恋', '压力每天缓升；对他人好感上升减半', '热恋期'],
    ['冷战中', '关系', 'until', 0, '', '{{名}}正与{{对象}}冷战', '对主角的好感不上升，每天可能下降；同场时压力缓升', ''],
    ['身体不适', '个人', 'timer', 2, '', '{{名}}身体不适', '体力消耗略快', ''],
    // E1 批（backlog 第 10 条）：通用状态。醉酒为 until：次日由系统转成宿醉；囊中羞涩、犯瘾由系统按条件挂摘（见 stat-status-auto.js）。
    ['醉酒', '个人', 'until', 0, '', '{{名}}喝醉了，举止失控、口齿不清', '压力上升略慢；次日转为宿醉', '宿醉'],
    ['失眠', '个人', 'timer', 2, '', '{{名}}近来失眠，睡不安稳', '体力恢复变慢', ''],
    ['受惊', '个人', 'timer', 1, '', '{{名}}受到惊吓，惊魂未定', '压力上升加快', ''],
    ['热恋期', '个人', 'timer', 14, '', '{{名}}正处于热恋期，心情甜蜜', '压力上升变慢', '失恋期'],
    ['吃醋中', '关系', 'until', 0, '', '{{名}}正在吃{{对象}}的醋', '压力上升略快', ''],
    ['心情很好', '个人', 'timer', 3, '', '{{名}}心情很好', '压力上升变慢', ''],
    ['赶工期', '个人', 'timer', 5, '', '{{名}}正在赶工，疲惫又焦躁', '压力上升略快', ''],
    ['囊中羞涩', '个人', 'until', 0, '', '{{名}}最近囊中羞涩，为钱发愁', '压力上升略快', ''],
    ['中毒', '个人', 'timer', 3, '', '{{名}}中了毒，虚弱难受', '体力恢复大减', ''],
    ['犯瘾', '个人', 'until', 0, '', '{{名}}犯了瘾，心神不宁', '压力上升加快', ''],
    ['信物', '关系', 'until', 0, '', '{{名}}留着{{对象}}送的信物', '压力上升略慢', ''],
    // 特质加深 A5：踩重雷时由系统挂上（stat-trait-landmines.js）；约会、交心、送礼成功当楼摘下。
    ['闹别扭', '关系', 'timer', 2, '', '{{名}}还在生{{对象}}的气', '对主角好感上升减半', ''],
    // 世界观状态：子类对应登记表「题材子类」；系统不自动挂，正文标签或副模型评定挂摘。
    ['透支', '个人', 'timer', 2, '修仙/西幻', '{{名}}灵力（魔力）透支，虚弱无力', '体力恢复变慢', ''],
    ['受祝福', '个人', 'timer', 3, '西幻', '{{名}}受到祝福，心境安稳', '压力上升变慢', ''],
    ['走火入魔', '个人', 'until', 0, '修仙', '{{名}}走火入魔，心神不稳', '压力上升加快', '闭关中'],
    ['闭关中', '个人', 'until', 0, '修仙', '{{名}}正在闭关，不见外人', '压力上升略慢', '走火入魔'],
    ['渡劫', '个人', 'until', 0, '修仙', '{{名}}正在渡劫，生死一线', '压力上升加快', ''],
    ['被控制', '个人', 'until', 0, '妖异', '{{名}}被人控制，言行不由自己', '压力上升加快', ''],
    ['感染初期', '个人', 'timer', 3, '末世', '{{名}}被感染，尚在潜伏期，隐隐发热', '体力恢复变慢', '感冒'],
    // 周期状态（D 批，kind:'cycle'）：由 catalog.cycles 按日期挂摘，正文标签「来了」可校准上次开始日；天数不写在定义里。
    ['生理期', '个人', 'cycle', 0, '', '{{名}}正处于生理期', '体力消耗略快；情绪容易波动', ''],
    ['发情期', '个人', 'cycle', 0, 'ABO', '{{名}}正处于发情期，信息素外溢、身体燥热', '压力缓升；欲望更容易上升', '易感期'],
    ['易感期', '个人', 'cycle', 0, 'ABO', '{{名}}正处于易感期，情绪激烈、占有欲强', '压力缓升；对冲突更敏感', '发情期'],
    // G 批：世界观状态（ABO、哨向）。效果见 STATUS_EFFECT 与 stat-trait-rules-genre.js 的钩子。
    ['临时标记', '关系', 'timer', 7, 'ABO', '{{名}}身上带着{{对象}}的临时标记', '不受其他Alpha压制；压力上升略慢；对标记者欲望上升略快；七天后自行消退', ''],
    ['抑制剂', '个人', 'timer', 1, 'ABO', '{{名}}用了抑制剂，信息素被压住', '发情期、易感期的效果暂停；体力恢复略慢', ''],
    ['信息素紊乱', '个人', 'until', 0, 'ABO', '{{名}}信息素紊乱，时强时弱、难以自控', '压力上升加快', ''],
    ['戒断反应', '个人', 'timer', 7, 'ABO', '{{名}}的标记被洗去，正经历戒断反应', '压力上升加快', ''],
    ['筑巢', '个人', 'timer', 2, 'ABO', '{{名}}正在筑巢，收集带有伴侣气味的衣物', '压力上升变慢', ''],
    ['精神疏导', '关系', 'timer', 3, '哨向', '{{名}}刚接受过{{对象}}的精神疏导', '压力上升变慢', ''],
    ['感官过载', '个人', 'timer', 1, '哨向', '{{名}}感官过载，声音与光线都难以忍受', '压力上升加快', ''],
];

const freezeDef = ([name, group, kind, days, sub, inject, desc, excl]) => Object.freeze({
    id: name,
    name,
    group,
    kind,
    days: kind === 'timer' ? days : 0,
    sub,
    inject: inject || null,
    desc,
    exclusive: Object.freeze(excl ? excl.split(',') : []),
    relation: group === '关系',
});

export const STATUS_DEFS = Object.freeze(STATUS_ROWS.map(freezeDef));
const DEF_BY_ID = new Map(STATUS_DEFS.map((d) => [d.id, d]));
export const getStatusDef = (id) => DEF_BY_ID.get(id) || null;

// 注入句：{{名}} → 角色名，{{对象}} → toward。没有注入句返回空串。
export const statusInjectText = (def, name, toward = '') => (def && def.inject
    ? def.inject.replaceAll('{{名}}', name).replaceAll('{{对象}}', toward || '对方')
    : '');

// 名字旁只显示最紧急的 1 个：受伤 > 生病类 > 其他。数值越小越紧急；F 批按此排序。
export const STATUS_URGENCY = Object.freeze({ 受伤: 0, 感冒: 1, 中毒: 1, 身体不适: 2 });

// 周期（D 批）：第一批生理期、ABO 发情期、易感期（用户 11-08 定）。
export const CYCLE_DEFS = Object.freeze([
    Object.freeze({ id: '生理期', status: '生理期', period: 28, length: 5, sub: '' }),
    Object.freeze({ id: '发情期', status: '发情期', period: 28, length: 3, sub: 'ABO' }),
    Object.freeze({ id: '易感期', status: '易感期', period: 28, length: 3, sub: 'ABO' }),
]);

// 时间跳跃：跳过的天数达到此值时，回血直接回满、压力直接降到 SKIP_STRESS_FLOOR（已低于则不动）。
export const SKIP_FULL_DAYS = 7;
export const SKIP_STRESS_FLOOR = 20;

// ───── C 批迁移映射（占位，C 批据此写迁移函数；旧存档键不变，只改归类与显示）─────
// to: 'status' 个人状态（进 catalog.statuses 的读取层）；'relation' 关系状态（并进关系栏）；
//     'setting' 改为编辑区开关；'note' 改为角色卡备注。kind 为迁入后的状态类型。
export const TRAIT_MIGRATION = Object.freeze({
    // 个人状态 11 项
    伪装身份: Object.freeze({ to: 'status', kind: 'until' }),
    失忆: Object.freeze({ to: 'status', kind: 'until' }),
    附身: Object.freeze({ to: 'status', kind: 'until' }),
    随身: Object.freeze({ to: 'status', kind: 'until' }),
    诅咒: Object.freeze({ to: 'status', kind: 'until' }),
    旧伤: Object.freeze({ to: 'status', kind: 'until' }),
    通缉犯: Object.freeze({ to: 'status', kind: 'until' }),
    初体验: Object.freeze({ to: 'status', kind: 'until' }),
    精神图景崩溃: Object.freeze({ to: 'status', kind: 'until' }),
    斯德哥尔摩: Object.freeze({ to: 'status', kind: 'until' }),
    已故: Object.freeze({ to: 'status', kind: 'until' }),
    // 关系状态 14 项
    共犯: Object.freeze({ to: 'relation', kind: 'until' }),
    永久标记: Object.freeze({ to: 'relation', kind: 'until' }),
    信息素契合: Object.freeze({ to: 'relation', kind: 'until' }),
    精神结合: Object.freeze({ to: 'relation', kind: 'until' }),
    尝到味道: Object.freeze({ to: 'relation', kind: 'until' }),
    守护: Object.freeze({ to: 'relation', kind: 'until' }),
    伴侣印记: Object.freeze({ to: 'relation', kind: 'until' }),
    血契: Object.freeze({ to: 'relation', kind: 'until' }),
    主从契约: Object.freeze({ to: 'relation', kind: 'until' }),
    血仆: Object.freeze({ to: 'relation', kind: 'until' }),
    调教中: Object.freeze({ to: 'relation', kind: 'until' }),
    追悔: Object.freeze({ to: 'relation', kind: 'until' }),
    青梅竹马: Object.freeze({ to: 'relation', kind: 'until' }),
    白月光: Object.freeze({ to: 'relation', kind: 'until' }),
    命定之人: Object.freeze({ to: 'relation', kind: 'until' }),
    // 改为设置 / 备注
    豁免亲密门槛: Object.freeze({ to: 'setting' }),
    精神体: Object.freeze({ to: 'note' }),
});
// 状态改名别名：旧存档里的旧名读取时转成新名。
export const STATUS_RENAME = Object.freeze({ 手头紧: '囊中羞涩', 手头紧张: '囊中羞涩' });
// 旧特质「附带注入句」五项改走状态注入（B 批）。键为显示名，值为注入句（与 stat-traits.js 的 INJECT 一致）。
export const LEGACY_INJECT_STATUS = Object.freeze({
    无实体: '{{名}}没有实体，无法触碰',
    已故: '{{名}}已经去世，只在回忆中出现',
    失忆: '{{名}}失去了与主角有关的记忆',
    不眠: '{{名}}不需要睡眠',
    附身: '{{名}}附在某人身上',
});

// ───── 结算明细（A 批定义，所有批次共用）─────
// gate 卡在关口（需要一次关键事件）；daily 今日已满；bigUsed 大档已用；merged 同楼取较大者被丢弃。
export const CHANGE_CAP = Object.freeze({ gate: 'gate', daily: 'daily', bigUsed: 'bigUsed', merged: 'merged' });
export const CHANGE_CAP_TEXT = Object.freeze({ gate: '需要一次关键事件', daily: '今日已满', bigUsed: '大档已用', merged: '同楼取较大者' });

export const calcRow = (label, value) => Object.freeze({ label: String(label), value });

// 给一条 change 补明细：只在有内容时加字段，旧记录与不关心明细的调用方不受影响。
export function withCalc(change, { calc = null, capped = null, dropped = null, traitTags = null } = {}) {
    const out = { ...change };
    if (Array.isArray(calc) && calc.length) out.calc = calc.map((r) => calcRow(r.label, r.value));
    if (capped && Object.hasOwn(CHANGE_CAP, capped)) out.capped = capped;
    if (dropped) out.dropped = String(dropped);
    if (Array.isArray(traitTags) && traitTags.length) out.traitTags = [...new Set(traitTags.map(String))];
    return out;
}

// 关键事件四档（A 批）。
export const EVENT_GRADES = Object.freeze(['大成功', '成功', '失败', '大失败']);

// ───── E1 状态效果（数值）：每个状态一条，只接两个入口 —— stressUp 压力上升倍率、staminaRecover 过天体力恢复到的上限倍率。
// 读取用 stat-status.js 的 statusScale(cat, 名, 键)；同键多个状态连乘。
export const STATUS_EFFECT = Object.freeze({
    感冒: ['staminaRecover', 0.85], 宿醉: ['staminaRecover', 0.8], 醉酒: ['stressUp', 0.8], 失眠: ['staminaRecover', 0.8],
    受惊: ['stressUp', 1.5], 失恋期: ['stressUp', 1.3], 热恋期: ['stressUp', 0.8], 冷战中: ['stressUp', 1.2],
    吃醋中: ['stressUp', 1.2], 心情很好: ['stressUp', 0.7], 赶工期: ['stressUp', 1.2], 囊中羞涩: ['stressUp', 1.2],
    身体不适: ['staminaRecover', 0.9], 中毒: ['staminaRecover', 0.6], 犯瘾: ['stressUp', 1.3], 信物: ['stressUp', 0.9],
    透支: ['staminaRecover', 0.8], 受祝福: ['stressUp', 0.8], 走火入魔: ['stressUp', 1.5], 闭关中: ['stressUp', 0.8],
    渡劫: ['stressUp', 1.3], 被控制: ['stressUp', 1.3], 感染初期: ['staminaRecover', 0.8], 生理期: ['staminaRecover', 0.9],
    发情期: ['stressUp', 1.2], 易感期: ['stressUp', 1.2],
    临时标记: ['stressUp', 0.8], 抑制剂: ['staminaRecover', 0.9], 信息素紊乱: ['stressUp', 1.3], 戒断反应: ['stressUp', 1.3],
    筑巢: ['stressUp', 0.7], 精神疏导: ['stressUp', 0.7], 感官过载: ['stressUp', 1.5],
    // favorUp：对主角好感上升倍率，与特质倍率连乘后夹在 ×0.5–×2（stat-settle.js characterScale）。
    闹别扭: ['favorUp', 0.5],
});

// 题材（E5）：登记表「题材子类」出现过的全部取值（子类可写「修仙/西幻」表示任一）。
export const WORLD_GENRES = Object.freeze(['ABO', '修仙', '西幻', '兽人', '吸血鬼', '哨向', '契约', '妖异', '星际', '末世', '蛋糕叉', '人鱼']);
// 子类为空始终保留；worlds 为空不过滤；否则子类任一取值在 worlds 里才保留。
export const subInWorlds = (sub, worlds) => {
    if (!sub || !Array.isArray(worlds) || !worlds.length) return true;
    return String(sub).split('/').some((w) => worlds.includes(w));
};
