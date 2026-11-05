// 战斗机制注册表（规则 v5）。新机制在 mechanics/ 下登记自己的算子、状态与时机钩子；
// 已有算子留在 schema.js / engine.js / rules.js 原位。本文件不引用其他战斗模块，避免循环依赖。
export const MECHANIC_UNIT_KINDS = Object.freeze(['deck', 'skill']);
export const HOOK_POINTS = Object.freeze([
    'turn-start-before', 'turn-start-after', 'turn-end-before', 'turn-end-after',
    'play-before', 'play-after', 'draw', 'create', 'exhaust', 'shuffle', 'debuff-applied',
    'damage-before', 'damage-after', 'hp-loss-before', 'hp-loss-after', 'defeated',
]);
// 伤害修正阶段：outgoing-add 在攻击力之后、outgoing-mult 紧随其后（均在虚弱之前），incoming-mult 在易伤之后。
export const DAMAGE_STAGES = Object.freeze(['outgoing-add', 'outgoing-mult', 'incoming-mult']);
const BUILTIN_LOSS_KINDS = Object.freeze(['poison', 'self']);

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const MECHANICS = new Map();
const OP_OWNERS = new Map();
const STATUS_OWNERS = new Map();
const HOOKS = new Map(HOOK_POINTS.map((point) => [point, []]));
const DAMAGE_MODS = new Map(DAMAGE_STAGES.map((stage) => [stage, []]));
const LOSS_KINDS = new Set(BUILTIN_LOSS_KINDS);
const RESERVED_OPS = new Set();
const RESERVED_STATUSES = new Set();

const isFn = (value) => typeof value === 'function';
const isKey = (value) => typeof value === 'string' && KEY_PATTERN.test(value);
const optionalFn = (value) => value === undefined || isFn(value);
function invalid(key, reason) {
    throw new Error(`mechanic-invalid:${key}:${reason}`);
}

// def：{ key, family, archetypes, unitKinds, ops: { 算子: { validate, apply, value?, damage? } },
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
        if (!isFn(handler?.validate) || !isFn(handler.apply) || !optionalFn(handler.value) || !optionalFn(handler.damage)) invalid(key, `op-handler:${op}`);
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
    for (const [op, handler] of ops) OP_OWNERS.set(op, Object.freeze({ ...handler, op, mechanic: key, unitKinds }));
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
