// 特质规则分文件：卡牌战斗战报对数值的影响（A 类）。由 stat-trait-rules.js 汇总；本文件不得 import stat-traits.js（避免循环），
// 只 import 底层状态工具与 bond 文件的关系状态读写。只改数值，不碰牌面与牌局；只读 ctx.flags.battle（战报合成，fromReport）。
// 战报字段（stat-battle.js 透传）：flags.battle = { outcome, heroStatus, party:[{name,status}]（不含主角）, fallen:[name], weak, foes:[{name,status}] }。
// 「同场 NPC」= 战报里的我方同伴（party，已建档、未倒下）；「任意」= 主角与这些同伴。
// ctx.changes 约定：特质触发的变动 source 为 'trait'，note 为特质名（calc 里有「触发」行说明战斗场景，traitTags 为 [特质名]）；
//   基础规则「同伴倒下」的压力变动 note 为 '同伴倒下'。恩情状态的升降不进 changes，记在 relStates 上。
// 限制：好感、信任类每人每天最多一次（character.combatFavorDay）且弱小战不触发；战败扣好感每人每场只取一次，与雷点「主角当面战败」不叠加。
import { barsOf, clamp, withBars, withCharacter } from './stat-state.js';
import { shiftStress } from './stat-strain.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { addRel, dropRel, hasRel } from './stat-trait-rules-bond.js';

const HERO = '主角';
const STRESS_SMALL = 5;
const STRESS_MID = 10;
const STRESS_BIG = 20;
const FAVOR_SMALL = 2;
const TRUST_SMALL = 1;
const DESIRE_SMALL = 2;
const GRUDGE_SMALL = 2;
const STAMINA_SMALL = 5;
const STAMINA_LOW = 30;
// 同伴倒下一份压力、单人单场最多计的份数；玻璃心 / 爱哭鬼的倍数。
const FALLEN_STRESS = 5;
const FALLEN_SHARE_CAP = 2;
const SENSITIVE_RATE = 1.5;
const HURT_STATUS = Object.freeze(['轻伤', '重创', '濒死']);
const WINS = Object.freeze(['胜', '险胜', '大胜']);
const CALM = Object.freeze(['乐天派', '没心没肺', '抗压王', '情绪稳定']);
const PROUD = Object.freeze(['女王', '强势', '大小姐']);
// 带雷点「主角当面战败」的特质（stat-trait-landmines.js）：在场时雷点已扣，本文件的战败扣好感整体让位。
const LOSE_MINES = Object.freeze(['慕强者', '强势', '外貌协会']);

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];
export const DICE = [];
export const DAILY_HOOKS = [];

// ---- 底层写入：返回新 state，不原地改 ----
const barsOfName = (state, name) => (name === HERO ? state.protagonist.bars : state.characters[name] ? barsOf(state.characters[name]) : null);
const putBars = (state, name, bars) => (name === HERO ? withBars(state, bars) : withCharacter(state, name, { ...state.characters[name], bars }));
const tagged = (change, note, trigger) => withCalc(change, { calc: [calcRow('来源', note), calcRow('触发', trigger), calcRow('结果', change.to - change.from)], traitTags: [note] });

function moveStress(state, name, delta, note, trigger, ctx, ledger) {
    const bars = barsOfName(state, name);
    if (!bars || !delta) return state;
    const moved = shiftStress(bars, delta);
    const from = Number(bars.stress) || 0;
    const to = Number(moved.stress) || 0;
    if (to === from) return state;
    ctx.changes.push(tagged({ source: 'trait', target: name, key: 'stress', from, to, note }, note, trigger));
    ledger.set(name, (ledger.get(name) || 0) + (to - from));
    return putBars(state, name, moved);
}

function moveStamina(state, name, delta, note, trigger, ctx) {
    const bars = barsOfName(state, name);
    if (!bars || !delta) return state;
    const from = Number(bars.stamina) || 0;
    const to = clamp(from + delta, Math.min(0, from), Math.max(100, from));
    if (to === from) return state;
    ctx.changes.push(tagged({ source: 'trait', target: name, key: 'stamina', from, to, note }, note, trigger));
    return putBars(state, name, { ...bars, stamina: to });
}

// 恩情状态一档：无 → 欠你人情 → 救命之恩（TA 对主角）。
function raiseGratitude(state, name) {
    if (hasRel(state, name, '救命之恩', 'ta')) return state;
    if (hasRel(state, name, '欠你人情', 'ta')) return addRel(dropRel(state, name, '欠你人情', 'ta'), name, '救命之恩', 'ta');
    return addRel(state, name, '欠你人情', 'ta');
}
function fadeGratitude(state, name) {
    if (hasRel(state, name, '救命之恩', 'ta')) return addRel(dropRel(state, name, '救命之恩', 'ta'), name, '欠你人情', 'ta');
    return dropRel(state, name, '欠你人情', 'ta');
}

function combatHook(state, api) {
    const { ctx } = api;
    const b = ctx.flags && ctx.flags.battle;
    if (!b || b.fromReport !== true || !Array.isArray(b.party)) return state;
    const win = WINS.includes(b.outcome);
    const lose = b.outcome === '败';
    if (!win && !lose) return state;
    const weak = b.weak === true;
    const day = Number(state.clock && state.clock.day) || 0;
    const statusOf = new Map([[HERO, b.heroStatus || '无伤']]);
    for (const m of b.party) if (m && m.name && Object.hasOwn(state.characters, m.name)) statusOf.set(m.name, m.status);
    const mates = [...statusOf.keys()].filter((n) => n !== HERO);
    const standing = mates.filter((n) => statusOf.get(n) !== '倒下');
    const holders = [...statusOf.keys()].filter((n) => statusOf.get(n) !== '倒下');
    const fallen = (Array.isArray(b.fallen) ? b.fallen : []).filter((n) => Object.hasOwn(state.characters, n));
    const heroHurt = Boolean(ctx.flags && ctx.flags.battleHurt);
    const hurtOf = (n) => (n === HERO ? heroHurt : HURT_STATUS.includes(statusOf.get(n)));
    const has = (s, name, id) => api.has(s, name, id);
    const ledger = new Map();
    const heroBattleStress = ctx.changes.filter((c) => c.source === 'battle' && c.target === HERO && c.key === 'stress').reduce((s, c) => s + (Number(c.to) - Number(c.from)), 0);
    let next = state;

    const stress = (name, delta, note, trigger) => { next = moveStress(next, name, delta, note, trigger, ctx, ledger); };
    // 好感、信任类：弱小战不触发，每人每天一次；写入成功才记当天。
    const favor = (name, dim, amount, note, trigger) => {
        const cur = next.characters[name];
        if (weak || !cur || (Number(cur.combatFavorDay) === day && day)) return false;
        const at = ctx.changes.length;
        next = api.bump(next, name, dim, amount, note);
        if (ctx.changes.length === at) return false;
        const c = ctx.changes[at];
        ctx.changes[at] = tagged(c, note, trigger);
        next = withCharacter(next, name, { ...next.characters[name], combatFavorDay: day });
        return true;
    };

    // 基础规则「同伴倒下」：我方未倒下的人压力小升（每倒下一人一份，单场最多两份）。冷血免除；玻璃心 / 爱哭鬼 ×1.5；战败时乐天派一类减半。
    if (fallen.length) {
        for (const name of holders) {
            const shares = Math.min(FALLEN_SHARE_CAP, fallen.filter((n) => n !== name).length);
            if (!shares || has(next, name, '冷血')) continue;
            const sensitive = ['玻璃心', '爱哭鬼'].find((id) => has(next, name, id));
            let amount = shares * (sensitive ? Math.round(FALLEN_STRESS * SENSITIVE_RATE) : FALLEN_STRESS);
            const calm = lose ? CALM.find((id) => has(next, name, id)) : null;
            if (calm) amount = Math.round(amount / 2);
            stress(name, amount, sensitive || calm || '同伴倒下', '同伴倒下');
        }
    }

    // 战败：乐天派 / 没心没肺 / 抗压王 / 情绪稳定把主角的战败压力上升减半；自卑（主角）额外小升。
    if (lose) {
        const calm = CALM.find((id) => has(next, HERO, id));
        if (calm && heroBattleStress > 0) stress(HERO, -Math.round(heroBattleStress / 2), calm, '战败');
        if (has(next, HERO, '自卑')) stress(HERO, STRESS_SMALL, '自卑', '战败');
    }

    // 任意：赌徒、抖M、疯批、铁人、吸血鬼。
    for (const name of holders) {
        const trigger = win ? '取胜' : '战败';
        if (has(next, name, '赌徒')) stress(name, win ? -STRESS_BIG : STRESS_BIG, '赌徒', trigger);
        if (has(next, name, '抖M') && hurtOf(name)) stress(name, -STRESS_SMALL, '抖M', '自身负伤');
        if (win && has(next, name, '疯批') && statusOf.get(name) === '濒死') stress(name, -STRESS_BIG, '疯批', '濒死取胜');
        if (win && has(next, name, '铁人') && (Number((barsOfName(next, name) || {}).stamina) || 0) < STAMINA_LOW) stress(name, -STRESS_SMALL, '铁人', '体力不足三成取胜');
        if (win && has(next, name, '吸血鬼')) next = moveStamina(next, name, STAMINA_SMALL, '吸血鬼', '取胜', ctx);
    }

    // 同场 NPC（我方未倒下的同伴）。
    const heroHere = standing.length > 0;
    for (const name of standing) {
        const mine = (id) => has(next, name, id);
        if (win) {
            // 犬系：主角取胜好感小升；狼系：并肩取胜信任小升（每人每天一次，先好感后信任）。
            const dogged = mine('犬系') && favor(name, '好感', FAVOR_SMALL, '犬系', '主角取胜');
            if (!dogged && mine('狼系')) favor(name, '信任', TRUST_SMALL, '狼系', '并肩取胜');
            if (heroHere && mine('花痴') && statusOf.get(HERO) === '无伤') next = api.bump(next, name, '欲望', DESIRE_SMALL * 2, '花痴');
            // 知恩图报：TA 负伤未倒下的取胜，恩情小升（弱小战不触发）。
            if (!weak && mine('知恩图报') && hurtOf(name)) next = raiseGratitude(next, name);
        }
        if (hurtOf(HERO)) {
            if (mine('病娇') || mine('占有狂')) stress(name, STRESS_MID, mine('病娇') ? '病娇' : '占有狂', '主角负伤');
            else if (mine('黏人') || mine('恋爱脑')) stress(name, STRESS_SMALL, mine('黏人') ? '黏人' : '恋爱脑', '主角负伤');
        }
        if (lose) {
            // 女王 / 强势 / 大小姐（及慕强者）：战败好感小降，每人每场只取一次；在场的慕强者、强势已有雷点「主角当面战败」，以雷点为准，不再叠加。
            const mined = api.here.has(name) && LOSE_MINES.some(mine);
            const proud = mined ? null : ['慕强者', ...PROUD].find(mine);
            if (proud) favor(name, '好感', -FAVOR_SMALL, proud, '主角战败');
            if (!weak && mine('白眼狼')) next = fadeGratitude(next, name);
        }
    }

    // D3 敌方 NPC：已建档敌人被击败后，记仇者芥蒂小升，慕强者好感小升（化敌为友）。
    if (win) {
        const foes = (Array.isArray(b.foes) ? b.foes : []).filter((f) => f && f.status === '倒下' && Object.hasOwn(next.characters, f.name) && !statusOf.has(f.name));
        for (const foe of foes) {
            if (has(next, foe.name, '记仇')) {
                const at = ctx.changes.length;
                next = api.bump(next, foe.name, '芥蒂', GRUDGE_SMALL, '记仇');
                if (ctx.changes.length > at) ctx.changes[at] = tagged(ctx.changes[at], '记仇', '败于主角');
            }
            if (has(next, foe.name, '慕强者') && !api.here.has(foe.name)) favor(foe.name, '好感', FAVOR_SMALL, '慕强者', '败于主角');
        }
    }

    // 佛系：战斗压力变动全部撤销（主角的战败压力 + 本文件在其身上记的压力变动）。
    for (const name of holders) {
        if (!has(next, name, '佛系')) continue;
        const net = (ledger.get(name) || 0) + (name === HERO ? heroBattleStress : 0);
        if (net) stress(name, -net, '佛系', '战斗');
    }
    return next;
}

export const TAG_HOOKS = [combatHook];
