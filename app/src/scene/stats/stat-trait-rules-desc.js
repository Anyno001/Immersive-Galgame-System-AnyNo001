// 特质规则分文件（C 批）：说明里写了、此前没有结算的子效果。由 stat-trait-rules.js 汇总，排在其他规则文件之后。
// 本文件不得 import stat-traits.js（避免循环），也不 import stat-state / stat-strain；只改数值，不碰战斗与亲密对决规则。
import { FAVOR_DELTA, FAVOR_WORDS } from './stat-vocab.js';

const HERO = '主角';
// 「一档」换算：好感小 2、欲望小 2、压力小 5、日结算缓升 3。
const FAVOR_STEP = 1;
const DESIRE_SMALL = 2;
const STRESS_SMALL = 5;
const STRESS_DAY = 3;
const CLOSE_EVENTS = new Set(['约会', '告白']);

const num = (v) => Number(v) || 0;
const favorSign = (d) => (Object.hasOwn(FAVOR_WORDS, d.value) ? FAVOR_WORDS[d.value].sign : Math.sign(FAVOR_DELTA[d.value] || 0));

export const SCALE = [];
export const FLAG = [];
export const DAILY = [];

// 主角与 owner 以外的已建档角色亲近：好感上升、亲密、约会或告白。
const closeToOther = (state, directives, owner) => directives.some((d) => d.target && d.target !== owner && state.characters[d.target]
    && ((d.kind === 'favor' && favorSign(d) > 0) || d.kind === 'intimate' || (d.kind === 'event' && CLOSE_EVENTS.has(d.value))));

// 角色（非主角）压力改动：简单夹取，压力转换进行中（bars.strain）的不动。
function npcStress(state, name, delta, note, ctx) {
    const cur = state.characters[name];
    if (!cur) return state;
    const bars = cur.bars && typeof cur.bars === 'object' ? cur.bars : { stamina: 100, money: 0, stress: 0 };
    if (bars.strain) return state;
    const from = num(bars.stress);
    const to = Math.max(0, Math.min(100, from + delta));
    if (to === from) return state;
    ctx.changes.push({ source: 'trait', target: name, key: 'stress', from, to, note });
    return { ...state, characters: { ...state.characters, [name]: { ...cur, bars: { ...bars, stress: to } } } };
}

export const TAG_HOOKS = [
    (state, api) => {
        const { ctx, directives } = api;
        const changes = ctx.changes.slice();
        let next = state;
        // 完美主义者（主角）：战斗失败的压力上升再补一份（挑战失败已在性格规则里加倍）。
        if (api.has(next, HERO, '完美主义者') && ctx.flags && ctx.flags.battle && ctx.flags.battle.outcome === '败') {
            for (const c of changes) if (c.source === 'battle' && c.target === HERO && c.key === 'stress' && num(c.to) > num(c.from)) next = api.bumpHeroStress(next, num(c.to) - num(c.from), '完美主义者');
        }
        for (const name of Object.keys(next.characters)) {
            const has = (id) => api.has(next, name, id);
            // 占有狂：主角与他人亲近的那一楼，其欲望、压力各上升一小档（芥蒂不加由吃醋开关负责）。
            if (has('占有狂') && closeToOther(next, directives, name)) {
                next = api.bump(next, name, '欲望', DESIRE_SMALL, '占有狂');
                next = npcStress(next, name, STRESS_SMALL, '占有狂', ctx);
            }
            // 现实派：约会那一楼好感上升少 1（本楼好感上升不足 2 时不扣，保证仍是上升）。
            if (has('现实派') && directives.some((d) => d.kind === 'event' && d.value === '约会' && d.target === name)) {
                const gain = changes.filter((c) => c.target === name && c.key === '好感' && c.source === 'tag' && num(c.to) > num(c.from)).reduce((s, c) => s + num(c.to) - num(c.from), 0);
                if (gain >= 2) next = api.bump(next, name, '好感', -FAVOR_STEP, '现实派');
            }
        }
        return next;
    },
];

export const DAILY_HOOKS = [
    // 毒舌：与主角同场的日子，主角压力缓升。需要在场名单，读不到时不生效。
    (state, api) => {
        if (!Array.isArray(api.ctx.present)) return state;
        let next = state;
        for (const name of Object.keys(state.characters)) if (api.present.has(name) && api.has(next, name, '毒舌')) next = api.shiftStress(HERO, STRESS_DAY, '毒舌');
        return next;
    },
];

// DICE：[特质键, 检定类别, 奖惩骰数, 条件?]。写在对方身上，表示主角对其的检定。
export const DICE = [
    ['天然呆', '社交', 1],
    ['小恶魔', '社交', -1],
    ['狐系', '社交', -1],
];
