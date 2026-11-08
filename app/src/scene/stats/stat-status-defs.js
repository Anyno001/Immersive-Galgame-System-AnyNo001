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
    ['冷战中', '关系', 'until', 0, '', '{{名}}正与{{对象}}冷战', '彼此好感不上升；同场时压力缓升', ''],
    ['身体不适', '个人', 'timer', 2, '', '{{名}}身体不适', '体力消耗略快', ''],
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
    Object.freeze({ id: '生理期', status: '身体不适', period: 28, length: 5, sub: '' }),
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
    已标记: Object.freeze({ to: 'relation', kind: 'until' }),
    信息素契合: Object.freeze({ to: 'relation', kind: 'until' }),
    精神结合: Object.freeze({ to: 'relation', kind: 'until' }),
    认出蛋糕: Object.freeze({ to: 'relation', kind: 'until' }),
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
