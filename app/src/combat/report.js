import { COMBAT_RULES, combatExpReward } from './rules.js';
import { hashString } from './random.js';

// 战报：把引擎事件压缩成按回合的叙事要点。只写技能名与相对伤势，不出现卡牌、费用、能量或具体数值。
// 胜利时在战报块之后附 EXP 标签，失败与撤退不附。
export const REPORT_RESULT = Object.freeze({ victory: 'win', defeat: 'lose', escape: 'escape' });
export const REPORT_DETAIL = Object.freeze({ brief: 2, normal: 4 });
const MIDDLE_MERGE_AFTER = 8;
const STATUS_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '力量', dexterity: '敏捷', poison: '中毒', regen: '再生', thorns: '荆棘' });
const SELF_BUFFS = new Set(['strength', 'dexterity', 'regen', 'thorns']);
const END_LINES = Object.freeze({ win: '终局：我方获胜。', lose: '终局：我方力竭落败。', escape: '终局：我方撤离战场，敌人仍在。' });

// 战报 ID 不含「|」，可以直接写进成长标签的原因栏。
export const reportIdFor = (combatId) => `r${hashString(combatId)}`;
const clean = (value) => String(value ?? '').replace(/["<>\[\]|\n]/g, '').trim();

export function injuryLevel(unit) {
    if (!unit || !unit.alive || unit.hp <= 0) return '倒下';
    const ratio = unit.hp / unit.maxHp;
    if (ratio >= 1) return '无伤';
    if (ratio > 0.6) return '轻伤';
    if (ratio > 0.3) return '重创';
    return '濒死';
}

function describe(action, units) {
    const name = (id) => clean(units[id]?.name || id);
    const parts = [];
    for (const [targetId, t] of action.targets) {
        const who = targetId === action.actorId ? '自身' : name(targetId);
        const maxHp = units[targetId]?.maxHp || 1;
        if (t.defeated) parts.push(`击倒${who}`);
        else if (t.hpLoss >= maxHp * 0.25) parts.push(`重创${who}`);
        else if (t.hpLoss > 0) parts.push(`击中${who}`);
        else if (t.blocked > 0) parts.push(`被${who}挡下`);
        if (t.heal) parts.push(targetId === action.actorId ? '恢复了体力' : `为${who}疗伤`);
        if (t.block && targetId === action.actorId) parts.push('摆出守势');
        else if (t.block) parts.push(`护住${who}`);
        for (const status of t.statuses) {
            if (SELF_BUFFS.has(status)) parts.push(targetId === action.actorId ? `获得${STATUS_NAMES[status]}` : `赋予${who}${STATUS_NAMES[status]}`);
            else parts.push(`使${who}陷入${STATUS_NAMES[status] || status}`);
        }
    }
    const what = parts.length ? `，${[...new Set(parts)].join('、')}` : '';
    return `${name(action.actorId)} 以「${clean(action.skill)}」出手${what}`;
}

const blankTarget = () => ({ hpLoss: 0, blocked: 0, heal: 0, block: 0, statuses: [], defeated: false });
const ACTION_SOURCES = new Set(['card', 'skill']);

// 引擎事件 → 按回合的出手列表。只有卡牌与技能开启一次出手；被动、中毒等效果不单列，击倒归到最后一次伤害的出手。
export function collectTurns(events, units = {}) {
    const turns = [];
    const hp = Object.fromEntries(Object.entries(units).map(([id, u]) => [id, u.maxHp]));
    const lastHit = new Map();
    let turn = null;
    let action = null;
    const ensureTurn = () => {
        if (!turn) { turn = { index: turns.length + 1, actions: [], escape: null }; turns.push(turn); }
        return turn;
    };
    const targetOf = (id) => {
        if (!action.targets.has(id)) action.targets.set(id, blankTarget());
        return action.targets.get(id);
    };
    const owned = (ev) => action && ACTION_SOURCES.has(ev.source?.kind) && ev.source.unitId === action.actorId;
    for (const ev of Array.isArray(events) ? events : []) {
        if (ev.type === 'turn-start' && ev.side === 'ally') {
            turn = null;
            action = null;
            ensureTurn();
            continue;
        }
        if (ev.type === 'card' || ev.type === 'skill') {
            const actor = units[ev.unitId];
            const ratio = actor ? (hp[ev.unitId] ?? actor.maxHp) / actor.maxHp : 1;
            action = { actorId: ev.unitId, skill: ev.type === 'card' ? (ev.skillRef || ev.name) : ev.name, targets: new Map(), desperate: ratio < 0.3 };
            ensureTurn().actions.push(action);
            continue;
        }
        if (ev.type === 'damage') {
            if (ev.target in hp) hp[ev.target] = Math.max(0, hp[ev.target] - (ev.hpLoss || 0));
            if (!owned(ev)) continue;
            const t = targetOf(ev.target);
            t.hpLoss += ev.hpLoss || 0;
            t.blocked += ev.blocked || 0;
            lastHit.set(ev.target, action);
        } else if (ev.type === 'heal') {
            if (ev.target in hp) hp[ev.target] += ev.amount || 0;
            if (owned(ev)) targetOf(ev.target).heal += ev.amount || 0;
        } else if (ev.type === 'block') {
            if (owned(ev)) targetOf(ev.target).block += ev.amount || 0;
        } else if (ev.type === 'status') {
            if (owned(ev)) {
                const t = targetOf(ev.target);
                if (!t.statuses.includes(ev.status)) t.statuses.push(ev.status);
            }
        } else if (ev.type === 'defeated') {
            const by = lastHit.get(ev.unitId);
            if (by) {
                if (!by.targets.has(ev.unitId)) by.targets.set(ev.unitId, blankTarget());
                by.targets.get(ev.unitId).defeated = true;
            } else ensureTurn().fallen = [...(turn.fallen || []), ev.unitId];
        } else if (ev.type === 'escape') {
            ensureTurn().escape = ev.unitId;
        }
    }
    return turns;
}

function importance(action, first, last) {
    let score = 0;
    for (const t of action.targets.values()) {
        if (t.defeated) score = Math.max(score, 4);
        else if (t.hpLoss > 0) score = Math.max(score, 1);
    }
    if (action === last) score = Math.max(score, 5);
    if (action === first) score = Math.max(score, 3);
    if (action.desperate && score >= 1) score = Math.max(score, 3);
    return score;
}

function turnLine(turn, units, perTurn, first, last) {
    const ranked = turn.actions.map((a, i) => ({ a, i, s: importance(a, first, last) }))
        .sort((x, y) => y.s - x.s || x.i - y.i).slice(0, perTurn).sort((x, y) => x.i - y.i);
    const parts = ranked.map(({ a }) => `${describe(a, units)}${a.desperate ? '（绝境反击）' : ''}`);
    for (const id of turn.fallen || []) parts.push(`${clean(units[id]?.name || id)} 力竭倒下`);
    if (turn.escape) parts.push(`${clean(units[turn.escape]?.name || turn.escape)} 带领众人撤离`);
    return parts.length ? `第${turn.index}回合：${parts.join('；')}。` : '';
}

function defeatsIn(turns) {
    const out = [];
    for (const turn of turns) {
        for (const a of turn.actions) for (const [id, t] of a.targets) if (t.defeated) out.push(id);
        out.push(...(turn.fallen || []));
    }
    return out;
}

function summaryLine(turns, units) {
    const fallen = [...new Set(defeatsIn(turns))].map((id) => clean(units[id]?.name || id));
    const tail = fallen.length ? `，${fallen.join('、')} 先后倒下` : '';
    return `第${turns[0].index}–${turns.at(-1).index}回合：双方反复交锋${tail}。`;
}

function sideStatus(units, side) {
    return Object.values(units).filter((u) => u.side === side).map((u) => `${clean(u.name)} ${injuryLevel(u)}`).join('，');
}

// 战报用户楼正文。state 为结束时的引擎状态，events 为开局以来的全部事件；expTargets 为可获得 EXP 的友方角色名。
// 返回 { ok, text, result, reportId, exp: [{ name, amount }] }；战斗未结束时拒绝构造。
export function buildCombatReport({ combatId, encounter = '', state, events, enemyTiers = [], expTargets = [], detail = 'normal' } = {}) {
    const result = REPORT_RESULT[state?.outcome];
    if (!result) return { ok: false, reason: 'combat-not-finished' };
    const units = state.units;
    const perTurn = REPORT_DETAIL[detail] || REPORT_DETAIL.normal;
    const turns = collectTurns(events, units).filter((t) => t.actions.length || t.fallen || t.escape);
    const all = turns.flatMap((t) => t.actions);
    const first = all[0];
    const last = result === 'win' ? [...all].reverse().find((a) => [...a.targets.values()].some((t) => t.defeated)) : all.at(-1);
    const lines = [];
    if (turns.length > MIDDLE_MERGE_AFTER) {
        const head = turns.slice(0, 3);
        const tail = turns.slice(-3);
        lines.push(...head.map((t) => turnLine(t, units, perTurn, first, last)));
        lines.push(summaryLine(turns.slice(3, -3), units));
        lines.push(...tail.map((t) => turnLine(t, units, perTurn, first, last)));
    } else lines.push(...turns.map((t) => turnLine(t, units, perTurn, first, last)));
    lines.push(`${END_LINES[result]}我方：${sideStatus(units, 'ally')}。敌方：${sideStatus(units, 'enemy')}。`);
    const reportId = reportIdFor(combatId);
    const amount = result === 'win' ? Math.min(combatExpReward(enemyTiers), 1000) : 0;
    const exp = amount > 0 ? [...new Set(expTargets.map(clean).filter(Boolean))].map((name) => ({ name, amount })) : [];
    const tags = exp.map((e) => `[igs-combat:exp|${e.name}|${e.amount}|战斗:${reportId}]`);
    const text = [
        '（战斗结束）',
        `<igs-combat-report id="${reportId}" result="${result}" encounter="${clean(encounter)}">`,
        ...lines.filter(Boolean),
        '</igs-combat-report>',
        ...tags,
    ].join('\n');
    return { ok: true, text, result, reportId, exp };
}

// 下一条带同一 reportId 战报的用户楼存在即视为已回传。
const REPORT_ID_RE = /<igs-combat-report\b[^>]*\bid\s*=\s*"([^"]+)"/i;
export function reportIdOf(text) {
    return String(text || '').match(REPORT_ID_RE)?.[1] ?? null;
}

export const COMBAT_SKIP_TEXT = '（本场战斗不使用卡牌结算，请直接用文字描写这场战斗的经过与结果。）';
export const COMBAT_RULES_VERSION = COMBAT_RULES.version;


