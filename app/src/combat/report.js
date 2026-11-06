// 战斗战报：把战斗事件流压成按回合的文字摘要，写进 <igs-combat-report> 块，并给战利品/经验打标记。
// 纯函数。文案与阈值原样来自 v0.39.0。
import { COMBAT_RULES, TOKEN_CARDS, combatExpReward } from './rules.js';
import { hashString } from './random.js';
import { COMBAT_AWAKEN_TYPES } from '../scene/combat-directives.js';
import { mechanicReporters, statusDef, statusLabel } from './mechanics/registry.js';

export const REPORT_RESULT = Object.freeze({ victory: 'win', defeat: 'lose', escape: 'escape' });
// detail 档位 -> 每回合最多写几条出手。
export const REPORT_DETAIL = Object.freeze({ brief: 2, normal: 4 });
// 回合数超过此值时，只保留首尾各 3 回合，中间合并成一句。
const FOLD_TURN_LIMIT = 8;

const STATUS_NAMES = Object.freeze({
    vulnerable: '易伤', weak: '虚弱', strength: '攻击力', dexterity: '防御力', poison: '中毒', regen: '再生', thorns: '荆棘',
    intangible: '无形', 'no-draw': '禁抽', endure: '不屈', artifact: '人工制品', frail: '脆弱',
});
// 对自己是增益、对别人写成「赋予」的状态。
const BUFF_STATUSES = new Set(['strength', 'dexterity', 'regen', 'thorns', 'artifact']);
// 内置状态按原表；规则 v5 登记的状态取其 label。
const statusName = (status) => STATUS_NAMES[status] || statusLabel(status) || status;

const ENDING_TEXT = Object.freeze({ win: '终局：我方获胜。', lose: '终局：我方力竭落败。', escape: '终局：我方撤离战场，敌人仍在。' });
const WIPE_TEXT = '终局：我方全员倒下，全队覆灭。';

// 觉醒类型 -> 名称（COMBAT_AWAKEN_TYPES 的反表）。
export const AWAKEN_TYPE_NAMES = Object.freeze(Object.fromEntries(Object.entries(COMBAT_AWAKEN_TYPES).map(([name, type]) => [type, name])));

export const reportIdFor = (combatId) => `r${hashString(combatId)}`;

// 去掉会破坏标记结构的字符。
const sanitize = (value) => String(value ?? '').replace(/["<>\[\]|\n]/g, '').trim();

const LOOT_VERB = Object.freeze({ card: '领悟了', gear: '得到了', item: '拾得', keepsake: '顺手捡到' });
const LOOT_MARK = /\[igs-combat:loot\|/;
export const hasLoot = (text) => LOOT_MARK.test(String(text || ''));

// 在战报块末尾追加一行战利品描述，并在块后追加战利品标记。已有标记或没有战报块时原样返回。
export function attachLoot(text, loot) {
    const body = String(text || '');
    if (!loot?.slot || hasLoot(body) || !body.includes('</igs-combat-report>')) return body;
    const character = sanitize(loot.character);
    const slot = loot.slot;
    const countText = slot.kind === 'item' && slot.item?.count > 1 ? `×${slot.item.count}` : '';
    const line = `战利品：${character}${LOOT_VERB[slot.kind] || '得到了'}「${sanitize(slot.name)}」${countText}。`;
    const mark = `[igs-combat:loot|${character}|${loot.reportId}|${loot.index}|${loot.set === 'reserve' ? 'reserve' : 'main'}]`;
    return `${body.replace('</igs-combat-report>', `${line}\n</igs-combat-report>`)}\n${mark}`;
}

// 伤势描述：按剩余血量比例分档。
export function injuryLevel(unit) {
    if (unit?.left) return unit.left === 'split' ? '分裂' : '退场';
    if (!unit || !unit.alive || unit.hp <= 0) return '倒下';
    const ratio = unit.hp / unit.maxHp;
    return ratio >= 1 ? '无伤' : ratio > 0.6 ? '轻伤' : ratio > 0.3 ? '重创' : '濒死';
}

// 一次出手的一句话描述。
function describeAction(action, units) {
    const nameOf = (id) => sanitize(units[id]?.name || id);
    const parts = [];
    for (const [targetId, effect] of action.targets) {
        const isSelf = targetId === action.actorId;
        const who = isSelf ? '自身' : nameOf(targetId);
        const maxHp = units[targetId]?.maxHp || 1;
        if (effect.defeated) parts.push(`击倒${who}`);
        else if (effect.hpLoss >= maxHp * 0.25) parts.push(`重创${who}`);
        else if (effect.hpLoss > 0) parts.push(`击中${who}`);
        else if (effect.blocked > 0) parts.push(`被${who}挡下`);
        if (effect.heal) parts.push(isSelf ? '恢复了体力' : `为${who}疗伤`);
        if (effect.block && isSelf) parts.push('摆出守势');
        else if (effect.block) parts.push(`护住${who}`);
        for (const status of effect.statuses) {
            // 规则 v5 登记的状态按其 debuff 声明选措辞。
            const label = statusName(status);
            const buff = BUFF_STATUSES.has(status) || (statusDef(status) ? !statusDef(status).debuff : false);
            if (buff) parts.push(isSelf ? `获得${label}` : `赋予${who}${label}`);
            else parts.push(`使${who}陷入${label}`);
        }
        for (const status of effect.warded || []) parts.push(`${who}的人工制品抵消了${statusName(status)}`);
        for (const card of effect.junk || []) parts.push(`往${who}的牌堆塞入「${sanitize(card)}」`);
        // 规则 v5 机制写入的短句（如「X 回复了吸取的生命」），{who} 换成目标称呼。
        for (const note of effect.notes || []) parts.push(sanitize(String(note).replace(/\{who\}/g, who)));
    }
    const reacted = (action.reactions || []).map(nameOf);
    if (reacted.length) parts.push(`${reacted.join('、')}随即应变`);
    const tail = parts.length ? `，${[...new Set(parts)].join('、')}` : '';
    return `${nameOf(action.actorId)} 以「${sanitize(action.skill)}」出手${tail}`;
}

const emptyEffect = () => ({ hpLoss: 0, blocked: 0, heal: 0, block: 0, statuses: [], warded: [], junk: [], notes: [], defeated: false });
const ACTION_EVENT_TYPES = new Set(['card', 'skill', 'hero-skill', 'item']);

// 把事件流整理成回合列表：每回合含出手列表、倒下名单、撤离者、觉醒。
export function collectTurns(events, units = {}) {
    const turns = [];
    const hpNow = Object.fromEntries(Object.entries(units).map(([id, unit]) => [id, unit.maxHp]));
    const lastHitBy = new Map(); // 单位 -> 最后打到它的出手
    let turn = null;
    let action = null;
    const currentTurn = () => {
        if (!turn) {
            turn = { index: turns.length + 1, actions: [], escape: null };
            turns.push(turn);
        }
        return turn;
    };
    const effectOn = (id) => {
        if (!action.targets.has(id)) action.targets.set(id, emptyEffect());
        return action.targets.get(id);
    };
    // 事件是否来自当前出手者的出手。
    const fromCurrentAction = (event) => action && ACTION_EVENT_TYPES.has(event.source?.kind) && event.source.unitId === action.actorId;
    for (const event of Array.isArray(events) ? events : []) {
        if (event.type === 'turn-start' && event.side === 'ally') {
            turn = null;
            action = null;
            currentTurn();
            continue;
        }
        if (ACTION_EVENT_TYPES.has(event.type)) {
            const unit = units[event.unitId];
            const hpRatio = unit ? (hpNow[event.unitId] ?? unit.maxHp) / unit.maxHp : 1;
            action = { actorId: event.unitId, skill: (event.type === 'card' && event.skillRef) || event.name, targets: new Map(), reactions: [], desperate: hpRatio < 0.3 };
            currentTurn().actions.push(action);
            continue;
        }
        if (event.type === 'damage') {
            if (event.target in hpNow) hpNow[event.target] = Math.max(0, hpNow[event.target] - (event.hpLoss || 0));
            if (!fromCurrentAction(event)) continue;
            if (event.overkill) {
                action.whipped = true;
                continue;
            }
            const effect = effectOn(event.target);
            effect.hpLoss += event.hpLoss || 0;
            effect.blocked += event.blocked || 0;
            lastHitBy.set(event.target, action);
        } else if (event.type === 'heal') {
            if (event.target in hpNow) hpNow[event.target] += event.amount || 0;
            if (fromCurrentAction(event)) effectOn(event.target).heal += event.amount || 0;
        } else if (event.type === 'block') {
            if (fromCurrentAction(event)) effectOn(event.target).block += event.amount || 0;
        } else if (event.type === 'status') {
            if (fromCurrentAction(event)) {
                const effect = effectOn(event.target);
                if (!effect.statuses.includes(event.status)) effect.statuses.push(event.status);
            }
        } else if (event.type === 'artifact') {
            if (fromCurrentAction(event)) {
                const effect = effectOn(event.target);
                if (!effect.warded.includes(event.status)) effect.warded.push(event.status);
            }
        } else if (event.type === 'card-created') {
            // 技能单位往对面牌堆塞状态牌：事件只带承受方，按当前出手者与对立阵营归因。
            const card = TOKEN_CARDS[event.cardId];
            const victim = units[event.unitId];
            if (action && (card?.unplayable || String(event.cardId).startsWith('status-')) && victim && units[action.actorId] && victim.side !== units[action.actorId].side) effectOn(event.unitId).junk.push(card.name);
        } else if (event.type === 'passive') {
            // 对方出牌触发的被动：记为本次出手引起的应变。
            if (event.trigger === 'foe-card-played' && action && units[event.unitId] && units[event.unitId].side !== units[action.actorId]?.side && !action.reactions.includes(event.unitId)) action.reactions.push(event.unitId);
        } else if (event.type === 'defeated') {
            const killer = lastHitBy.get(event.unitId);
            if (killer) {
                if (!killer.targets.has(event.unitId)) killer.targets.set(event.unitId, emptyEffect());
                killer.targets.get(event.unitId).defeated = true;
            } else {
                currentTurn().fallen = [...(turn.fallen || []), event.unitId];
            }
        } else if (event.type === 'escape') {
            currentTurn().escape = event.unitId;
        } else if (event.type === 'awaken') {
            currentTurn().awaken = { unitId: event.unitId, type: event.awakenType, line: event.line || '' };
        } else {
            // 规则 v5 机制事件：交给登记了 report 的机制，只能给当前出手追加短句；未知事件仍忽略。
            const reporters = mechanicReporters();
            if (!reporters.length || !action) continue;
            const kit = {
                units, actorId: action.actorId, fromCurrentAction: fromCurrentAction(event),
                note: (targetId, text) => {
                    if (targetId != null && text) effectOn(targetId).notes.push(String(text));
                },
            };
            for (const report of reporters) report(event, kit);
        }
    }
    // 只有鞭尸（溢出伤害）而没有其他效果的出手不计入。
    for (const t of turns) t.actions = t.actions.filter((a) => !(a.whipped && !a.targets.size));
    return turns;
}

// 出手的重要度：击倒 4、造成伤害 1；全战第一击 5、终结一击 3、绝境反击至少 3。
function actionScore(action, firstAction, finalAction) {
    let score = 0;
    for (const effect of action.targets.values()) {
        if (effect.defeated) score = Math.max(score, 4);
        else if (effect.hpLoss > 0) score = Math.max(score, 1);
    }
    if (action === finalAction) score = Math.max(score, 5);
    if (action === firstAction) score = Math.max(score, 3);
    if (action.desperate && score >= 1) score = Math.max(score, 3);
    return score;
}

// 一回合的文字：觉醒、挑出重要度最高的若干出手（保持原顺序）、倒下者、撤离。
function describeTurn(turn, units, maxActions, firstAction, finalAction) {
    const picked = turn.actions
        .map((action, index) => ({ action, index, score: actionScore(action, firstAction, finalAction) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, maxActions)
        .sort((a, b) => a.index - b.index);
    const lines = [];
    if (turn.awaken) {
        const { unitId, type } = turn.awaken;
        const line = sanitize(turn.awaken.line);
        lines.push(`${sanitize(units[unitId]?.name || unitId)} 觉醒：${AWAKEN_TYPE_NAMES[type] || sanitize(type)}${line ? `『${line}』` : ''}`);
    }
    lines.push(...picked.map(({ action }) => `${describeAction(action, units)}${action.desperate ? '（绝境反击）' : ''}`));
    for (const id of turn.fallen || []) lines.push(`${sanitize(units[id]?.name || id)} 力竭倒下`);
    if (turn.escape) lines.push(`${sanitize(units[turn.escape]?.name || turn.escape)} 带领众人撤离`);
    return lines.length ? `第${turn.index}回合：${lines.join('；')}。` : '';
}

// 折叠中间回合时，汇总先后倒下的单位。
function defeatedIds(turns) {
    const ids = [];
    for (const turn of turns) {
        for (const action of turn.actions) for (const [id, effect] of action.targets) if (effect.defeated) ids.push(id);
        ids.push(...(turn.fallen || []));
    }
    return ids;
}

function describeFolded(turns, units) {
    const names = [...new Set(defeatedIds(turns))].map((id) => sanitize(units[id]?.name || id));
    const fallen = names.length ? `，${names.join('、')} 先后倒下` : '';
    return `第${turns[0].index}–${turns.at(-1).index}回合：双方反复交锋${fallen}。`;
}

// 终局双方伤势一行。
function sideStatus(units, side) {
    return Object.values(units).filter((unit) => unit.side === side).map((unit) => `${sanitize(unit.name)} ${injuryLevel(unit)}`).join('，');
}

// 生成战报。战斗未结束返回 { ok: false }；胜利时按敌人阶级发经验，并追加经验标记行。
export function buildCombatReport({ combatId, encounter = '', state, events, enemyTiers = [], expTargets = [], detail = 'normal' } = {}) {
    const result = REPORT_RESULT[state?.outcome];
    if (!result) return { ok: false, reason: 'combat-not-finished' };
    const units = state.units;
    const maxActions = REPORT_DETAIL[detail] || REPORT_DETAIL.normal;
    const turns = collectTurns(events, units).filter((turn) => turn.actions.length || turn.fallen || turn.escape || turn.awaken);
    const allActions = turns.flatMap((turn) => turn.actions);
    const firstAction = allActions[0];
    const finalAction = result === 'win'
        ? [...allActions].reverse().find((action) => [...action.targets.values()].some((effect) => effect.defeated))
        : allActions.at(-1);
    const lines = [];
    if (turns.length > FOLD_TURN_LIMIT) {
        lines.push(...turns.slice(0, 3).map((turn) => describeTurn(turn, units, maxActions, firstAction, finalAction)));
        lines.push(describeFolded(turns.slice(3, -3), units));
        lines.push(...turns.slice(-3).map((turn) => describeTurn(turn, units, maxActions, firstAction, finalAction)));
    } else {
        lines.push(...turns.map((turn) => describeTurn(turn, units, maxActions, firstAction, finalAction)));
    }
    const allyAlive = Object.values(units).some((unit) => unit.side === 'ally' && unit.alive);
    const ending = result === 'lose' && state.wipe === true && !allyAlive ? WIPE_TEXT : ENDING_TEXT[result];
    lines.push(`${ending}我方：${sideStatus(units, 'ally')}。敌方：${sideStatus(units, 'enemy')}。`);
    const reportId = reportIdFor(combatId);
    const expEach = result === 'win' ? Math.min(combatExpReward(enemyTiers), 1e3) : 0;
    const exp = expEach > 0 ? [...new Set(expTargets.map(sanitize).filter(Boolean))].map((name) => ({ name, amount: expEach })) : [];
    const expMarks = exp.map((item) => `[igs-combat:exp|${item.name}|${item.amount}|战斗:${reportId}]`);
    const text = [
        '（战斗结束）',
        `<igs-combat-report id="${reportId}" result="${result}" encounter="${sanitize(encounter)}">`,
        ...lines.filter(Boolean),
        '</igs-combat-report>',
        ...expMarks,
    ].join('\n');
    return { ok: true, text, result, reportId, exp };
}

const REPORT_ID_PATTERN = /<igs-combat-report\b[^>]*\bid\s*=\s*"([^"]+)"/i;
export const reportIdOf = (text) => String(text || '').match(REPORT_ID_PATTERN)?.[1] ?? null;

export const COMBAT_SKIP_TEXT = '（本场战斗不使用卡牌结算，请直接用文字描写这场战斗的经过与结果。）';
export const COMBAT_RULES_VERSION = COMBAT_RULES.version;
