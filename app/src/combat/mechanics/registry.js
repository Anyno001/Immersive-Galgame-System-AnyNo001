// 战斗机制注册表（规则 v5）。新机制在 mechanics/ 下登记自己的算子、状态与时机钩子；
// 已有算子留在 schema.js / engine.js / rules.js 原位。本文件不引用其他战斗模块，避免循环依赖。
export const MECHANIC_UNIT_KINDS = Object.freeze(['deck', 'skill']);
export const HOOK_POINTS = Object.freeze([
    'turn-start-before', 'turn-start-ready', 'turn-start-after', 'turn-end-before', 'turn-end-after',
    'play-before', 'play-after', 'draw', 'draw-card', 'create', 'exhaust', 'shuffle', 'debuff-applied',
    'damage-before', 'damage-after', 'hp-loss-before', 'hp-loss-after', 'defeated',
    // 一次出手（出牌、技能单位出手、人物技能）结算完：{ unit, kind: 'card' | 'skill' | 'hero-skill', card?, skill?, effects }。
    'action-after',
    // 每段攻击结算后（含零伤害），反伤之前：{ attacker, target, hpLoss, blockBefore }；不冒充 damage-after。
    'attack-after',
    // 获得格挡之后、「获得格挡」总线之前：{ target, amount, source, shared? }，可追加格挡并改写 amount 为本次合计。
    'block-gained',
    // 单体攻击每次选定存活目标后：{ attacker, target }，可把 target 换成同阵营另一名存活单位（D07 掩护）。
    'attack-target',
    // 单位回合开始结算完、行动之前：{ unit, skip }，置 skip = true 跳过这一次行动（E01 晕厥），回合结束照常结算。
    'act-before',
    // 开战：首个玩家回合抽完牌之后、开战被动之前触发一次，payload 为空对象（P5b 预燃）。
    'battle-start',
    // 使用道具、结算效果之前：{ unit, itemId, aimId }（M8 单目标道具转向背击单位）。
    'item-before',
]);
// 伤害修正阶段：outgoing-add 在攻击力之后、outgoing-mult 紧随其后（均在虚弱之前），incoming-mult 在易伤之后。
export const DAMAGE_STAGES = Object.freeze(['outgoing-add', 'outgoing-mult', 'incoming-mult']);
// 格挡修正阶段：block-add 在防御力之后、脆弱之前，签名 (source, target, value) => value。
export const BLOCK_STAGES = Object.freeze(['block-add']);
// 费用修正阶段：card-cost 在常规费用修正（全体手牌、本场、本回合）之后，签名 (state, owner, view) => cost，只作用于数字费用。
export const COST_STAGES = Object.freeze(['card-cost']);
// 规则 v5 出牌与抽牌限制阶段（E18、E20）：card-play 签名 (state, unit, card) => 拒绝原因字符串 | null；draw-count 签名 (state, unit, count) => count；
// card-upgrade 签名 (state, owner) => 返回 false 时该单位的牌按未升级显示与结算。
export const PLAY_STAGES = Object.freeze(['card-play', 'draw-count', 'card-upgrade']);
const BUILTIN_LOSS_KINDS = Object.freeze(['poison', 'self']);
// 事件总线的过滤字段（规则 v6 G5b）：被动或限时 buff 带同名字段时，必须与本次触发的附带值相等才触发。
export const BUS_FILTERS = Object.freeze(['cardType', 'status', 'orb', 'cause']);
// 「敌人倒下」触发器的死因：攻击、中毒、灾厄、法珠、随从、荆棘、自伤；其余伤害种类记为 other。
export const DEFEAT_CAUSES = Object.freeze(['attack', 'poison', 'doom', 'orb', 'minion', 'thorns', 'self']);
export const ORB_FILTER_KINDS = Object.freeze(['lightning', 'frost', 'dark', 'plasma', 'glass']);

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const MECHANICS = new Map();
const OP_OWNERS = new Map();
const STATUS_OWNERS = new Map();
const HOOKS = new Map(HOOK_POINTS.map((point) => [point, []]));
const DAMAGE_MODS = new Map([...DAMAGE_STAGES, ...BLOCK_STAGES, ...COST_STAGES, ...PLAY_STAGES].map((stage) => [stage, []]));
const LOSS_KINDS = new Set(BUILTIN_LOSS_KINDS);
const RESERVED_OPS = new Set();
const RESERVED_STATUSES = new Set();

const isFn = (value) => typeof value === 'function';
const isKey = (value) => typeof value === 'string' && KEY_PATTERN.test(value);
const optionalFn = (value) => value === undefined || isFn(value);
// 算子可选的缩放声明：ability 为关键能力（phys 取力量 / 敏捷较高者），key 为效果里可缩放的数值字段，max 为上限。
const SCALE_ABILITIES = Object.freeze(['phys', 'str', 'dex', 'con', 'int', 'wis', 'cha']);
const validScale = (spec) => spec === undefined || (spec !== null && typeof spec === 'object' && SCALE_ABILITIES.includes(spec.ability)
    && typeof spec.key === 'string' && /^[a-zA-Z]{1,20}$/.test(spec.key) && Number.isInteger(spec.max) && spec.max >= 1 && spec.max <= 99);
export const validAttributeSpec = (spec) => Boolean(spec && typeof spec === 'object'
    && ['damage', 'block', 'heal', 'str', 'dex', 'int', 'wis', 'cha'].includes(spec.ability)
    && typeof spec.key === 'string' && /^[a-zA-Z]{1,20}$/.test(spec.key)
    && ['normal', 'support'].includes(spec.tier)
    && ['static', 'deferred'].includes(spec.timing)
    && (spec.max === undefined || (Number.isInteger(spec.max) && spec.max > 0)));
const validAttribute = (spec) => spec === undefined || isFn(spec) || validAttributeSpec(spec);

// 算子可选的函数字段：估值、技能伤害上限、托管估算、牌面说明、面板短写、手牌待选（choice(state, unit, effect, kit) → { options, count } | null）、
// 引用的随从种类（refs(effect) → 种类键数组，档案与建局据此核对随从表）。
const HANDLER_FNS = Object.freeze(['value', 'damage', 'estimateDamage', 'estimateBlock', 'describe', 'brief', 'choice', 'refs']);
function invalid(key, reason) {
    throw new Error(`mechanic-invalid:${key}:${reason}`);
}

// def：{ key, family, archetypes, unitKinds, ops: { 算子: { validate, apply, value?, damage?, estimateDamage?, estimateBlock?, describe?, brief?, scale? } },
//       statuses?: [{ key, label?, debuff?, decay? }], hooks?: { 时机: fn }, modifiers?: { 阶段: (attacker, target, value) => value },
//       lossKinds?: [失去生命类伤害种类], describe?, report? }
// 先整体校验再写入，任一项不合法即抛错且不留下部分登记。archetypes 为空表示所有职业可用。
export function registerMechanic(def) {
    const key = def?.key;
    if (!isKey(key)) invalid(String(key), 'key');
    if (MECHANICS.has(key)) invalid(key, 'duplicate');
    if (!isKey(def.family)) invalid(key, 'family');
    if (!Array.isArray(def.archetypes) || !def.archetypes.every(isKey)) invalid(key, 'archetypes');
    if (!Array.isArray(def.unitKinds) || !def.unitKinds.length || !def.unitKinds.every((kind) => MECHANIC_UNIT_KINDS.includes(kind))) invalid(key, 'unit-kinds');
    const ops = Object.entries(def.ops || {});
    for (const [op, handler] of ops) {
        if (!isKey(op) || RESERVED_OPS.has(op) || OP_OWNERS.has(op)) invalid(key, `op:${op}`);
        if (!isFn(handler?.validate) || !isFn(handler.apply) || !HANDLER_FNS.every((name) => optionalFn(handler[name])) || !validScale(handler.scale) || !validAttribute(handler.attribute)) invalid(key, `op-handler:${op}`);
    }
    const statuses = def.statuses ?? [];
    if (!Array.isArray(statuses)) invalid(key, 'statuses');
    const seen = new Set();
    for (const status of statuses) {
        const name = status?.key;
        if (!isKey(name) || seen.has(name) || RESERVED_STATUSES.has(name) || STATUS_OWNERS.has(name)) invalid(key, `status:${name}`);
        if (status.label !== undefined && (typeof status.label !== 'string' || !status.label.trim() || status.label.length > 8)) invalid(key, `status-label:${name}`);
        seen.add(name);
    }
    const hooks = Object.entries(def.hooks || {});
    for (const [point, run] of hooks) if (!HOOKS.has(point) || !isFn(run)) invalid(key, `hook:${point}`);
    const modifiers = Object.entries(def.modifiers || {});
    for (const [stage, fn] of modifiers) if (!DAMAGE_MODS.has(stage) || !isFn(fn)) invalid(key, `modifier:${stage}`);
    const lossKinds = def.lossKinds ?? [];
    if (!Array.isArray(lossKinds) || !lossKinds.every(isKey)) invalid(key, 'loss-kinds');
    if (!optionalFn(def.describe) || !optionalFn(def.report)) invalid(key, 'presenter');

    const unitKinds = Object.freeze([...def.unitKinds]);
    const mechanic = Object.freeze({ key, family: def.family, archetypes: Object.freeze([...def.archetypes]), unitKinds, describe: def.describe, report: def.report });
    MECHANICS.set(key, mechanic);
    for (const [op, handler] of ops) OP_OWNERS.set(op, Object.freeze({ ...handler, ...(handler.scale ? { scale: Object.freeze({ ...handler.scale }) } : {}), ...(handler.attribute && !isFn(handler.attribute) ? { attribute: Object.freeze({ ...handler.attribute }) } : {}), op, mechanic: key, unitKinds }));
    for (const status of statuses) STATUS_OWNERS.set(status.key, Object.freeze({ key: status.key, label: status.label?.trim() || null, debuff: Boolean(status.debuff), decay: Boolean(status.decay), mechanic: key }));
    for (const [point, run] of hooks) HOOKS.get(point).push(Object.freeze({ mechanic: key, run }));
    for (const [stage, fn] of modifiers) DAMAGE_MODS.get(stage).push(Object.freeze({ mechanic: key, fn }));
    for (const kind of lossKinds) LOSS_KINDS.add(kind);
    return mechanic;
}


// schema.js 启动时登记内置算子与状态：内置名不能再被机制占用，与已登记机制冲突时抛错。
export function reserveBuiltins(ops, statuses) {
    for (const op of ops) {
        if (OP_OWNERS.has(op)) invalid(OP_OWNERS.get(op).mechanic, `op-reserved:${op}`);
        RESERVED_OPS.add(op);
    }
    for (const status of statuses) {
        if (STATUS_OWNERS.has(status)) invalid(STATUS_OWNERS.get(status).mechanic, `status-reserved:${status}`);
        RESERVED_STATUSES.add(status);
    }
}

// 查询：未登记时一律返回 null 或空数组，调用方按原有规则处理（校验拒收、结算不动、估值为 0）。
export const opHandler = (op) => OP_OWNERS.get(op) ?? null;
export const statusDef = (key) => STATUS_OWNERS.get(key) ?? null;
// 已登记状态的中文显示名；未登记或未给 label 时为 null（面板与战报再回落到键名）。
export const statusLabel = (key) => STATUS_OWNERS.get(key)?.label ?? null;
export const mechanicFor = (key) => MECHANICS.get(key) ?? null;
export const hooksAt = (point) => HOOKS.get(point) ?? [];
export const registeredOps = () => [...OP_OWNERS.keys()];
export const registeredStatuses = () => [...STATUS_OWNERS.keys()];

// 该算子能否用于给定单位类型（deck 卡组单位 / skill 技能单位）。
export function opAllowedFor(op, unitKind) {
    const handler = OP_OWNERS.get(op);
    return Boolean(handler && handler.unitKinds.includes(unitKind));
}

// 伤害修正阶段的登记项与「失去生命」类伤害种类（不经格挡、不算受到伤害）。
export const damageModifiers = (stage) => DAMAGE_MODS.get(stage) ?? [];
export const isLossKind = (kind) => LOSS_KINDS.has(kind);

// 牌面说明：先取算子自己的 describe，再回落到机制级 describe；未登记或未提供时为空串。kit 由牌面层传入（数值格式化、关键字、状态名等）。
export function describeRegistered(effect, kit) {
    const handler = OP_OWNERS.get(effect?.op);
    const fn = handler && (handler.describe || MECHANICS.get(handler.mechanic)?.describe);
    return fn ? String(fn(effect, kit) ?? '') : '';
}
// 面板窄签的附加效果短写；未提供时为空串。
export function briefRegistered(effect, kit) {
    const fn = OP_OWNERS.get(effect?.op)?.brief;
    return fn ? String(fn(effect, kit) ?? '') : '';
}
// 算子的缩放声明（card-scaling 用）；未声明为 null。
export const scaleSpecOf = (op) => OP_OWNERS.get(op)?.scale ?? null;
// 战报：带 report 的机制按登记顺序列出，collectTurns 把内置分支之外的事件交给它们。
export const mechanicReporters = () => [...MECHANICS.values()].filter((mechanic) => mechanic.report).map((mechanic) => mechanic.report);
