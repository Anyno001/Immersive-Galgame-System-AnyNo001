// 敌人模板特性（敌人模板库步骤 4，能力矩阵见 .limcode/cache/enemy-research/136）：只限技能单位的算子与敌方特性状态。
// 状态经 apply-status 施加（层数上限与估值见 apply-status.js）；本文件只引用 registry.js。
import { registerMechanic } from './registry.js';

// barbed：折甲巨像双重猛击卸下尖壳（刺甲，按攻击牌反伤）。
const SHED_STATUSES = Object.freeze(['thorns', 'strength', 'dexterity', 'plating', 'soar', 'barbed']);
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
function mapOf(ctx, key) {
    if (!ctx[key]) ctx[key] = new Map();
    return ctx[key];
}
// 连击成长：段数 = hits + per × floor(计数 / every)。uses 计本单位此前打出同 track 连击的次数（不含本次），
// turn 计已过的玩家回合数（state.turn - 1）。计数只由动作序列决定，重放一致；不设运行时段数上限，不裁段。
const VOLLEY_SOURCES = Object.freeze(['uses', 'turn']);
const volleyCount = (state, unit, e) => (e.source === 'turn'
    ? Math.max(0, (state?.turn || 1) - 1)
    : unit?.res?.volleys?.[e.track] || 0);
const volleyHits = (e, count) => e.hits + e.per * Math.floor(count / e.every);
const volleyStrike = (e, hits) => ({ op: 'damage', amount: e.amount, hits, target: e.target });
const volleyRule = (e) => {
    const step = e.every > 1 ? `每 ${e.every} ${e.source === 'turn' ? '回合' : '次'}` : (e.source === 'turn' ? '每过 1 回合' : '每用 1 次');
    return `${step}多打 ${e.per} 段`;
};
// 数值成长（M5）：每段伤害随计数变化。uses 本单位此前打出同 track 的次数（不含本次）；turn 当前回合数（state.turn）；
// dexterity 自身防御力减去 seized-def 抵扣（可为负，结果不低于 0）；target-hp 目标在其最近一次回合开始时的生命（res.turnStartHp，没有记录时取当前生命）÷ div 向下取整。
// 每段 = amount + per × 计数（target-hp 为 amount + floor(生命 / div)），写了 cap 时每段不超过 cap。计数只由动作序列决定，重放一致。
const SURGE_SOURCES = Object.freeze(['uses', 'turn', 'dexterity', 'target-hp']);
function surgeTarget(state, unit, aimId) {
    const aimed = aimId != null ? state.units[aimId] : null;
    if (aimed?.alive && aimed.side !== unit.side) return aimed;
    return foesOf(state, unit)[0] || null;
}
function surgeAmount(state, unit, e, aimId) {
    let base;
    if (e.source === 'target-hp') {
        const target = surgeTarget(state, unit, aimId);
        const hp = target ? (target.res?.turnStartHp ?? target.hp) : 0;
        base = e.amount + Math.floor(Math.max(0, hp) / e.div);
    } else {
        const count = e.source === 'turn' ? (state?.turn || 1)
            : e.source === 'dexterity' ? st(unit, 'dexterity') - st(unit, 'seized-def')
                : unit?.res?.surges?.[e.track] || 0;
        base = e.amount + e.per * count;
    }
    if (e.cap !== undefined) base = Math.min(base, e.cap);
    return Math.max(0, base);
}
const surgeStrike = (e, amount) => ({ op: 'damage', amount, hits: e.hits, target: e.target });
const SURGE_TEXT = Object.freeze({ uses: '每用 1 次', turn: '每过 1 回合', dexterity: '自身每有 1 点防御力' });
// 只有对手带「按目标回合开始生命」成长的单位才记 res.turnStartHp，其余单位形状不变。
const watchesHp = (state, unit) => foesOf(state, unit).some((foe) => (foe.skills || []).some((skill) => (skill.effects || [])
    .some((effect) => effect.op === 'foe-surge' && effect.source === 'target-hp')));
// 睡眠（M4）：脚本带 sleep 的单位开战持有 asleep（层数为剩余睡眠回合），期间每次行动都用睡眠技能、不推进脚本。
// 层数在自身回合结束减 1，走完自然醒来。失去生命（格挡吸收不算）：hurt 为 'wake'（缺省）时立即惊醒；为 'tick' 时每次失血减 1 层，
// 减完惊醒。醒来移除 sleep.shed 的状态，因失血醒来且 groggy 时附 1 层晕厥，随后立即按脚本重新规划意图。
function wake(ctx, unit, cause, kit) {
    const sleep = unit.script?.sleep;
    kit.setStatus(unit, 'asleep', 0);
    for (const key of sleep?.shed || []) if (st(unit, key)) kit.setStatus(unit, key, 0);
    kit.emit(ctx, { type: 'wake', unitId: unit.id, cause });
    if (cause === 'hurt' && sleep?.groggy) kit.addStatus(ctx, unit, 'stun', 1, statusSource(unit, 'asleep'));
    kit.replanIntent(ctx, unit);
}
// 打断（M4）：script.interrupts 的规则在事件发生时触发，把已公示的意图立即改写为 seq 首招，序列记在 res.interrupt = { rule, pos }，
// 由 policy 优先规划、引擎出手后推进（不推进脚本）。已有序列进行中或 once 规则已触发过时不再触发；触发次数记 res.interruptFired。
// hp-lost 的累计失血记 res.hpTally，序列进行中不累计，触发时清零。规则带 rearm 时序列出完前 rearm 招即解锁：恢复累计、可再次触发。
function sequenceLocked(unit) {
    const queue = unit.res?.interrupt;
    if (!queue) return false;
    const rearm = unit.script?.interrupts?.[queue.rule]?.rearm;
    return !(Number.isInteger(rearm) && queue.pos >= rearm);
}
const interruptArmed = (unit, index, rule) => !sequenceLocked(unit) && !(rule.once && unit.res?.interruptFired?.[index]);
function fireInterrupt(ctx, unit, index, kit) {
    const rule = unit.script.interrupts[index];
    const res = kit.resOf(ctx, unit);
    if (!res) return;
    res.interruptFired = { ...res.interruptFired, [index]: (res.interruptFired?.[index] || 0) + 1 };
    res.interrupt = { rule: index, pos: 0 };
    delete res.hpTally;
    for (const key of rule.shed || []) if (st(unit, key)) kit.setStatus(unit, key, 0);
    if (rule.unstun && st(unit, 'stun')) kit.setStatus(unit, 'stun', 0);
    kit.emit(ctx, { type: 'interrupt', unitId: unit.id, rule: index, on: rule.on });
    if (rule.block) kit.gainBlock(ctx, unit, rule.block, statusSource(unit, 'interrupt'));
    kit.replanIntent(ctx, unit);
}
function tallyHpLoss(ctx, unit, hpLoss, kit) {
    const rules = unit.script?.interrupts;
    if (!rules?.some((rule) => rule.on === 'hp-lost') || sequenceLocked(unit)) return;
    const res = kit.resOf(ctx, unit);
    if (!res) return;
    res.hpTally = (res.hpTally || 0) + hpLoss;
    const index = rules.findIndex((rule, i) => rule.on === 'hp-lost' && interruptArmed(unit, i, rule)
        && res.hpTally >= rule.amount + (rule.step || 0) * (res.interruptFired?.[i] || 0));
    if (index >= 0) fireInterrupt(ctx, unit, index, kit);
}

registerMechanic({
    key: 'foe-traits', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [
        { key: 'death-curse', label: '死咒' },
        { key: 'rile', label: '恼怒' },
        { key: 'ritual', label: '仪式' },
        { key: 'plating', label: '镀甲' },
        { key: 'metallicize', label: '金属化' },
        { key: 'imbalanced', label: '失重', debuff: true },
        { key: 'tender', label: '酥软', debuff: true },
        { key: 'soar', label: '翱翔' },
        { key: 'asleep', label: '睡眠' },
        { key: 'about-to-blow', label: '将爆' },
    ],
    ops: {
        // 致死转爆炸（M4）：对目标造成等于 res.stored（重生时记下的 needs 状态层数）的攻击伤害；没有记录时不造成伤害。
        release: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'release' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const amount = unit.res?.stored || 0;
                if (amount > 0) kit.strike(ctx, unit, { op: 'damage', amount }, aimId, source);
            },
            value: () => 0,
            estimateDamage: (e, kit) => kit.attacker?.res?.stored > 0
                ? kit.estimate([{ op: 'damage', amount: kit.attacker.res.stored }]) : 0,
            describe: () => '释放积蓄的压力造成伤害',
            brief: () => '释放',
        },
        // 不行动：技能的唯一效果，意图为 idle。
        idle: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'idle' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                kit.emit(ctx, { type: 'idle', unitId: unit.id });
            },
            value: () => 0,
            describe: () => '不行动',
            brief: () => '待机',
        },
        // 本技能前面的效果结算后自身倒下；不冒用逃跑/撤离入口，也不归因于对方攻击。
        'self-destruct': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op'], path, state);
                return { op: 'self-destruct' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                kit.defeatUnit(ctx, unit, source, 'self');
            },
            value: () => 0,
            describe: () => '随后自身倒下',
            brief: () => '自毁',
        },
        // 回复至最大生命的 pct%（向上取整），已不低于该值时不回复。
        'heal-to': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'pct'], path, state);
                return { op: 'heal-to', pct: kit.intField(effect.pct, kit.joinPath(path, 'pct'), state, 1, 100) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const goal = Math.ceil((unit.maxHp * effect.pct) / 100);
                if (unit.alive && goal > unit.hp) kit.heal(ctx, unit, goal - unit.hp, source);
            },
            value: (e) => e.pct * 0.3,
            describe: (e) => `生命回复至最大生命的 ${e.pct}%`,
            brief: (e) => `回复至${e.pct}%`,
        },
        // 移除自身指定状态 stacks 层。
        shed: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'status', 'stacks'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const status = kit.enumField(effect.status, at('status'), state, SHED_STATUSES);
                return status ? { op: 'shed', status, stacks: kit.intField(effect.stacks, at('stacks'), state, 1, 10) } : undefined;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const had = st(unit, effect.status);
                if (!had) return;
                const amount = Math.min(had, effect.stacks);
                kit.setStatus(unit, effect.status, had - amount);
                kit.emit(ctx, { type: 'shed', unitId: unit.id, status: effect.status, amount });
            },
            value: (e) => -e.stacks,
            describe: (e, kit) => `移除自身 ${e.stacks} 层${kit.statusName(e.status)}`,
            brief: (e, kit) => `去${kit.statusName(e.status)}${e.stacks}`,
        },
        // 连击成长：首用段数受档案段数上限约束，之后按使用次数或回合增长；静态伤害上限按首用段数计（同力量成长，属运行时成长）。
        'foe-volley': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'hits', 'per', 'every', 'source', 'track', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'foe-volley',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 99),
                    hits: kit.intField(effect.hits, at('hits'), state, 1, kit.hitsMax, 1),
                    per: kit.intField(effect.per, at('per'), state, 1, 3, 1),
                    every: kit.intField(effect.every, at('every'), state, 1, 3, 1),
                    source: kit.enumField(effect.source, at('source'), state, VOLLEY_SOURCES),
                    track: effect.track === undefined ? 'volley' : kit.idField(effect.track, at('track'), state),
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const hits = volleyHits(effect, volleyCount(ctx.state, unit, effect));
                kit.emit(ctx, { type: 'volley', unitId: unit.id, track: effect.track, hits });
                kit.strike(ctx, unit, volleyStrike(effect, hits), aimId, source);
                const res = kit.resOf(ctx, unit);
                if (res && effect.source === 'uses') res.volleys = { ...res.volleys, [effect.track]: (res.volleys?.[effect.track] || 0) + 1 };
            },
            value: (e) => e.amount * (4 / 3) * (e.hits + e.per),
            damage: (e) => e.amount * e.hits,
            estimateDamage: (e, kit) => kit.estimate([volleyStrike(e, volleyHits(e, volleyCount(kit.state, kit.attacker, e)))]),
            describe: (e, kit) => `${kit.on(e.target)}造成 ${kit.fmt(e.amount)} 点伤害 ×${e.hits}；${volleyRule(e)}`,
            brief: (e) => `连击成长+${e.per}`,
        },
        'foe-surge': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'hits', 'per', 'div', 'cap', 'source', 'track', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const source = kit.enumField(effect.source, at('source'), state, SURGE_SOURCES);
                const byHp = effect.source === 'target-hp';
                const result = {
                    op: 'foe-surge',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 99),
                    hits: kit.intField(effect.hits, at('hits'), state, 1, kit.hitsMax, 1),
                    source,
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                };
                if (byHp) {
                    if (effect.per !== undefined) kit.addIssue(state, at('per'), 'unknown-field');
                    result.div = kit.intField(effect.div, at('div'), state, 1, 99);
                } else {
                    if (effect.div !== undefined) kit.addIssue(state, at('div'), 'unknown-field');
                    result.per = kit.intField(effect.per, at('per'), state, 1, 20);
                }
                if (effect.track !== undefined && effect.source !== 'uses') kit.addIssue(state, at('track'), 'unknown-field');
                if(effect.source === 'uses') result.track = effect.track === undefined ? 'surge' : kit.idField(effect.track, at('track'), state);
                if (effect.cap !== undefined) result.cap = kit.intField(effect.cap, at('cap'), state, 1, 999);
                return result;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const amount = surgeAmount(ctx.state, unit, effect, aimId);
                kit.emit(ctx, { type: 'surge', unitId: unit.id, amount });
                if (amount > 0) kit.strike(ctx, unit, surgeStrike(effect, amount), aimId, source);
                const res = effect.source === 'uses' ? kit.resOf(ctx, unit) : null;
                if (res) res.surges = { ...res.surges, [effect.track]: (res.surges?.[effect.track] || 0) + 1 };
            },
            value: (e) => e.amount * (4 / 3) * e.hits * 1.5,
            damage: (e) => e.amount * e.hits,
            estimateDamage: (e, kit) => kit.estimate([surgeStrike(e, surgeAmount(kit.state, kit.attacker, e, kit.aimId ?? kit.target?.id))]),
            describe: (e, kit) => (e.source === 'target-hp'
                ? `${kit.on(e.target)}造成（目标回合开始生命 ÷ ${e.div} + ${e.amount}）点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}`
                : `${kit.on(e.target)}造成 ${kit.fmt(e.amount)} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}；${SURGE_TEXT[e.source]}伤害 +${e.per}${e.cap !== undefined ? `，至多 ${e.cap}` : ''}`),
            brief: (e) => `伤害成长${e.per ? `+${e.per}` : ''}`,
        },
    },
    modifiers: {
        // 酥软：本回合每打出一张牌累计的攻击力与防御力下降（记在 res.tender，回合结束清掉）。
        'outgoing-add': (attacker, target, value) => value - (attacker?.res?.tender || 0),
        'block-add': (source, target, value, origin) => (origin === 'card' ? value - (source?.res?.tender || 0) : value),
        // 翱翔：受到的攻击伤害减半（只作用于经 computeDamage 的攻击伤害）；不随回合或命中衰减，由持有者的技能卸下。
        'incoming-mult': (attacker, target, value) => (st(target, 'soar') ? value * 0.5 : value),
    },
    hooks: {
        'hp-loss-after'(ctx, { target, hpLoss }, kit) {
            const sleep = target.script?.sleep;
            const asleep = st(target, 'asleep');
            if (!(hpLoss > 0) || !target.alive || ctx.state.outcome) return;
            if (asleep && sleep) {
                if (sleep.hurt === 'tick' && asleep > 1) kit.setStatus(target, 'asleep', asleep - 1);
                else wake(ctx, target, 'hurt', kit);
            }
            if (target.alive && !ctx.state.outcome) tallyHpLoss(ctx, target, hpLoss, kit);
        },
        // 将爆（M4 致死转爆炸）：不再失去生命，直到自身爆炸倒下。
        'hp-loss-before'(ctx, pre) {
            if (st(pre.target, 'about-to-blow')) pre.hpLoss = 0;
        },
        // 打断：伤害前记下规则关注的状态层数，伤害后比较（其他机制在 damage-after 里移除状态，本文件登记在后）。
        'damage-before'(ctx, { target }) {
            const rules = target?.script?.interrupts;
            if (!rules) return;
            const snap = {};
            for (const rule of rules) if (rule.on === 'status-lost') snap[rule.status] = st(target, rule.status);
            mapOf(ctx, 'interruptSnap').set(target.id, snap);
        },
        'damage-after'(ctx, { target, source, kind, blocked, hpLoss }, kit) {
            // 受击重掷（M4）：记下受到对方攻击且失去生命的单位（格挡完全吸收不算，实现假设，来源边界见台账 27:35），攻击者这次出手结束后重掷。
            if (target.script?.reroll && target.alive && !ctx.state.outcome && kind === 'attack' && hpLoss > 0) {
                const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
                if (attacker && attacker.side !== target.side) {
                    const hits = mapOf(ctx, 'rerollHits');
                    if (!hits.has(attacker.id)) hits.set(attacker.id, new Set());
                    hits.get(attacker.id).add(target.id);
                }
            }
            const rules = target.script?.interrupts;
            if (!rules) return;
            const snap = ctx.interruptSnap?.get(target.id);
            ctx.interruptSnap?.delete(target.id);
            if (!target.alive || ctx.state.outcome) return;
            const index = rules.findIndex((rule, i) => interruptArmed(target, i, rule) && (rule.on === 'status-lost'
                ? (snap?.[rule.status] || 0) > 0 && !st(target, rule.status)
                : rule.on === 'block-broken' && blocked > 0 && target.block === 0 && (!rule.status || st(target, rule.status) > 0)));
            if (index >= 0) fireInterrupt(ctx, target, index, kit);
        },
        'attack-after'(ctx, { attacker, target, hpLoss, blockBefore }) {
            if (!attacker || attacker.side === target.side) return;
            // 失重的防伤包含 Buffer 等减免；必须在命中前有格挡，不能只检查格挡实际消耗。
            if (st(attacker, 'imbalanced')) {
                const tally = mapOf(ctx, 'traitStrikes');
                const rec = tally.get(attacker.id) || { hit: false, blocked: false };
                if (hpLoss > 0) rec.hit = true;
                if (blockBefore > 0) rec.blocked = true;
                tally.set(attacker.id, rec);
            }
        },
        'action-after'(ctx, { unit }, kit) {
            const rerolled = ctx.rerollHits?.get(unit.id);
            if (rerolled) {
                ctx.rerollHits.delete(unit.id);
                for (const id of rerolled) {
                    const foe = ctx.state.units[id];
                    if (foe?.alive && !ctx.state.outcome) {
                        kit.emit(ctx, { type: 'reroll', unitId: id });
                        kit.rerollIntent(ctx, foe);
                    }
                }
            }
            const rec = ctx.traitStrikes?.get(unit.id);
            if (!rec) return;
            ctx.traitStrikes.delete(unit.id);
            if (!unit.alive || ctx.state.outcome) return;
            if (!rec.hit && rec.blocked && st(unit, 'imbalanced')) {
                kit.emit(ctx, { type: 'off-balance', unitId: unit.id });
                kit.addStatus(ctx, unit, 'stun', 1, statusSource(unit, 'imbalanced'));
            }
        },
        // 死咒：持有者倒下时对方全体陷入易伤。
        defeated(ctx, { unit }, kit) {
            const n = st(unit, 'death-curse');
            if (!n) return;
            for (const foe of foesOf(ctx.state, unit)) {
                if (ctx.state.outcome) break;
                kit.addStatus(ctx, foe, 'vulnerable', n, statusSource(unit, 'death-curse'));
            }
        },
        'play-after'(ctx, { unit, card }, kit) {
            if (!card) return;
            for (const foe of foesOf(ctx.state, unit)) {
                if (ctx.state.outcome) break;
                // 恼怒：对方打出技能牌时获得层数攻击力（能力牌不算）。
                if (card.type === 'skill' && st(foe, 'rile')) kit.addStatus(ctx, foe, 'strength', st(foe, 'rile'), statusSource(foe, 'rile'));
            }
            const tender = st(unit, 'tender');
            if (tender && unit.alive) {
                const res = kit.resOf(ctx, unit);
                if (res) res.tender = (res.tender || 0) + tender;
            }
        },
        // 镀甲：自身回合结束获得层数格挡；自身回合开始减 1 层。金属化：自身回合结束获得层数格挡，不衰减、不因受击减层。
        'turn-end-before'(ctx, { unit }, kit) {
            const n = st(unit, 'plating');
            if (n && unit.alive) kit.gainBlock(ctx, unit, n, statusSource(unit, 'plating'));
            const metal = st(unit, 'metallicize');
            if (metal && unit.alive && !ctx.state.outcome) kit.gainBlock(ctx, unit, metal, statusSource(unit, 'metallicize'));
        },
        'turn-start-after'(ctx, { unit }, kit) {
            const n = st(unit, 'plating');
            if (n) kit.setStatus(unit, 'plating', n - 1);
            // 数值成长 target-hp（M5）：对手带该成长时，记下本单位回合开始结算（中毒等）之后的生命。
            if (unit.alive && watchesHp(ctx.state, unit)) {
                const res = kit.resOf(ctx, unit);
                if (res) res.turnStartHp = unit.hp;
            }
        },
        'turn-end-after'(ctx, { unit }, kit) {
            if (unit.res?.tender) tidyRes(unit, 'tender');
            const asleep = st(unit, 'asleep');
            if (asleep && unit.alive) {
                if (asleep > 1 || !unit.script?.sleep) kit.setStatus(unit, 'asleep', asleep - 1);
                else wake(ctx, unit, 'natural', kit);
            }
            // 仪式：自身回合结束获得层数攻击力，持有后的第一次回合结束不触发。
            const ritual = st(unit, 'ritual');
            if (!ritual || !unit.alive) return;
            const res = kit.resOf(ctx, unit);
            if (!res) return;
            if (!res.ritualArmed) res.ritualArmed = true;
            else kit.addStatus(ctx, unit, 'strength', ritual, statusSource(unit, 'ritual'));
        },
    },
    report(event, kit) {
        if (event.type === 'idle') kit.note(event.unitId, '按兵不动');
        else if (event.type === 'wake') kit.note(event.unitId, event.cause === 'hurt' ? '被惊醒' : '醒了过来');
        else if (event.type === 'shed') kit.note(event.unitId, `卸下 ${event.amount} 层${kit.statusName ? kit.statusName(event.status) : event.status}`);
        else if (event.type === 'volley') kit.note(event.unitId, `连击 ${event.hits} 段`);
    },
});
