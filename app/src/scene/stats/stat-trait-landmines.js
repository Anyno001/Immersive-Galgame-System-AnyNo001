// 特质雷点：主角做了某件事，持有对应特质的角色扣好感。
// 叶子模块：只从 stat-state、stat-status-defs 导入，不导入 stat-traits 与规则文件（避免循环引用，见 v0.39.79）；特质判定由调用方以 has(名, 特质) 传入。
import { DIM_MAX, clamp, withCharacter } from './stat-state.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { rollOver } from './stat-rng.js';
import { HEART_BURST_GAIN, HEART_BURST_NOTE, HEART_FULL, gateCap } from './stat-favor.js';

// 档：轻 = 本楼好感上升作废；雷 = 再 −3；重 = 再 −8、芥蒂 +2。
export const TIER_NAME = Object.freeze({ 轻: '轻雷', 雷: '雷', 重: '重雷' });
const RANK = Object.freeze({ 轻: 1, 雷: 2, 重: 3 });
const PENALTY = Object.freeze({ 轻: 0, 雷: 3, 重: 8 });
const GRUDGE_UP = Object.freeze({ 轻: 0, 雷: 0, 重: 2 });
export const DAY_CAP = 15;
// 与 stat-traits.js 的 DROP_GUARD.好感 同值：好感下降单楼保护。
const FLOOR_DROP_GUARD = 30;
const HEART = 51;
const LIKE = 26;
const HALF = 50;
// 引起注意：这些特质被顶撞后，了解掷骰通过则心意槽 +2；每角色每游戏日最多通过一次。
const NOTICE_TRAITS = Object.freeze(['强势', '女王', '大小姐']);
const NOTICE_GAIN = 2;
const MOVE_TAGS = new Set(['tag', 'trait']);

const L = '轻';
const T = '雷';
const H = '重';
const FAVOR_LOW = Object.freeze({ dim: '好感', lt: LIKE });
const KNOW_LOW = Object.freeze({ dim: '了解', lt: HALF });
const NO_GRUDGE = Object.freeze({ noGrudge: true });

// [特质, 触发, 档, 附加]：附加 { cond: { dim, lt }（事件发生前的维度值）, noGrudge }。
export const LANDMINES = Object.freeze([
    ['强势', 'event:顶撞', T], ['强势', 'event:命令', T], ['强势', 'event:拒绝', L], ['强势', 'lose', L],
    ['大小姐', 'event:批评', T], ['大小姐', 'event:命令', L],
    ['御姐', 'event:炫耀', L],
    ['女王', 'event:顶撞', T],
    ['护短', 'event:背叛', H],
    ['温柔疏离', 'early:告白', L],
    ['白月光', 'event:冷落', T],
    ['禁欲', 'early:亲密', T],
    ['青梅竹马', 'event:失约', T], ['青梅竹马', 'event:背叛', H],
    ['腹黑', 'event:谎言揭穿', L],
    ['小笨蛋', 'event:批评', L],
    ['绿茶', 'watch:约会', T],
    ['海王', 'event:告白', L],
    ['钓系', 'early:告白', L],
    ['白莲', 'event:批评', T],
    ['人间清醒', 'event:炫耀', L],
    ['破碎感', 'event:批评', T],
    ['显眼包', 'event:冷落', T],
    ['社畜', 'event:命令', L],
    ['富二代', 'event:炫耀', L],
    ['键盘侠', 'event:批评', T],
    ['情绪稳定', 'event:背叛', H],
    ['占有狂', 'watch:亲密', H, NO_GRUDGE], ['占有狂', 'watch:约会', T],
    ['傲娇', 'event:夸奖', L, { cond: FAVOR_LOW }],
    ['冰山', 'repeat:约会', L], ['冰山', 'repeat:亲密', L],
    ['毒舌', 'event:夸奖', L],
    ['黏人', 'event:冷落', T], ['黏人', 'event:失约', T],
    ['天然呆', 'event:批评', L],
    ['元气', 'event:冷落', L],
    ['无口', 'event:告白', L, { cond: KNOW_LOW }],
    ['小恶魔', 'event:冷落', L],
    ['包容', 'event:背叛', H],
    ['撒娇精', 'event:冷落', T], ['撒娇精', 'event:拒绝', L],
    ['贤惠', 'event:失约', T],
    ['高岭之花', 'repeat:约会', T], ['高岭之花', 'repeat:告白', T], ['高岭之花', 'event:炫耀', L],
    ['贪吃鬼', 'event:失约', L],
    ['中二病', 'event:批评', L],
    ['爱哭鬼', 'event:批评', T],
    ['公众人物', 'event:谎言揭穿', T],
    ['犬系', 'event:冷落', T], ['犬系', 'event:失约', T],
    ['猫系', 'event:命令', T], ['猫系', 'repeat:亲密', L],
    ['狐系', 'event:炫耀', L],
    ['兔系', 'event:顶撞', L], ['兔系', 'event:背叛', H],
    ['狼系', 'watch:亲密', T], ['狼系', 'event:背叛', H],
    ['熊系', 'event:失约', L],
    ['蛇系', 'event:背叛', H],
    ['鹰系', 'event:谎言揭穿', T],
    ['鹿系', 'event:顶撞', T],
    ['鸟系', 'event:命令', T],
    ['龙系', 'event:批评', T], ['龙系', 'event:命令', T],
    ['逆鳞', 'event:背叛', H],
]);

const EVENT_LABEL = Object.freeze({ 顶撞: '被顶撞', 命令: '被命令', 冷落: '被冷落', 炫耀: '被炫耀', 批评: '被批评', 拒绝: '被拒绝', 背叛: '遭背叛', 失约: '被失约', 谎言揭穿: '谎言被揭穿', 夸奖: '被夸奖', 告白: '被告白' });
const OTHER_LABEL = Object.freeze({ 'watch:亲密': '主角与他人亲密', 'watch:约会': '主角与他人约会', 'repeat:约会': '同日再次约会', 'repeat:亲密': '同日再次亲密', 'repeat:告白': '同日再次告白', 'early:亲密': '好感未到即亲密', 'early:告白': '好感未到即告白', lose: '主角当面战败' });
// 下一楼强制事项里的说法，不提特质。
const EVENT_NOUN = Object.freeze({ 谎言揭穿: '谎言被揭穿', 夸奖: '夸奖' });
const OTHER_NOUN = Object.freeze({ 'watch:亲密': '与他人亲密', 'watch:约会': '与他人约会', 'repeat:约会': '再次邀约', 'repeat:亲密': '再次亲近', 'repeat:告白': '再次告白', 'early:亲密': '过早的亲密举动', 'early:告白': '过早的告白', lose: '当面战败' });

export const mineLabel = (trig) => (trig.startsWith('event:') ? EVENT_LABEL[trig.slice(6)] || trig.slice(6) : OTHER_LABEL[trig] || trig);
const mineNoun = (trig) => (trig.startsWith('event:') ? EVENT_NOUN[trig.slice(6)] || trig.slice(6) : OTHER_NOUN[trig] || trig);
export const mineKey = (trait, trig) => `${trait}:${trig}`;

const num = (v) => Number(v) || 0;
const dimOf = (c, dim) => num(c && c.dims && c.dims[dim]);

// 该特质的全部雷点：[{ key, trait, trig, tier, label }]。
export function minesOf(trait) {
    return LANDMINES.filter((r) => r[0] === trait).map((r) => ({ key: mineKey(r[0], r[1]), trait: r[0], trig: r[1], tier: r[2], label: mineLabel(r[1]) }));
}

// 角色卡「已知雷点」：踩过的恒显示；了解 ≥ 50 时显示全部。返回 [{ text }]。
export function landmineView(holders, known, know) {
    const seen = known && typeof known === 'object' ? known : {};
    const all = num(know) >= HALF;
    const out = [];
    for (const trait of holders) for (const m of minesOf(trait)) if (all || Object.hasOwn(seen, m.key)) out.push({ text: `${m.label}（${m.trait}·${TIER_NAME[m.tier]}）` });
    return out;
}

// 下一楼强制事项文案；不提特质名。
export const landmineMandate = (flag) => (flag && flag.text ? flag.text : flag && flag.name && flag.noun ? `${flag.name}对上一楼主角的${flag.noun}心里不快，本楼表现出来` : '');

// 本楼标签统计：{ 名: { 约会, 告白, 亲密 } }。
function actCounts(directives) {
    const out = new Map();
    const add = (name, key) => { if (!name) return; const cur = out.get(name) || { 约会: 0, 告白: 0, 亲密: 0 }; cur[key] += 1; out.set(name, cur); };
    for (const d of directives) {
        if (d.kind === 'event' && (d.value === '约会' || d.value === '告白')) add(d.target, d.value);
        else if (d.kind === 'intimate' && d.target) add(d.target, '亲密');
    }
    return out;
}

// 引起注意通过：记当日、心意槽 +2，满 5 溢出为好感 +5（受关口封顶；封顶压成 0 时槽停在 4）。
function applyNotice(state, name, notice, noticeRow, ctx, day, setMandate) {
    const cur = state.characters[name];
    const h0 = Math.max(0, Math.min(HEART_FULL - 1, Math.round(num(cur.heart))));
    const total = h0 + NOTICE_GAIN;
    const rows = [noticeRow, calcRow('心意槽', `${h0} + ${NOTICE_GAIN} = ${total} / ${HEART_FULL}`)];
    let heart = total;
    let dims = cur.dims;
    if (total >= HEART_FULL) {
        const from = dimOf(cur, '好感');
        const to = gateCap(from, clamp(from + HEART_BURST_GAIN, -DIM_MAX, DIM_MAX), Array.isArray(cur.unlocked) ? cur.unlocked : []);
        if (to > from) {
            heart = total - HEART_FULL;
            dims = { ...cur.dims, 好感: to };
            ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from, to, note: HEART_BURST_NOTE, heartFrom: h0, heartTo: heart }, { calc: [...rows, calcRow('结果', to - from)], traitTags: [] }));
        } else heart = HEART_FULL - 1;
    } else {
        const f = dimOf(cur, '好感');
        ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from: f, to: f, note: '引起注意', heartFrom: h0, heartTo: heart }, { calc: rows, traitTags: [] }));
    }
    setMandate(name);
    return withCharacter(state, name, { ...cur, dims, heart, noticeDay: day });
}

/// 结算雷点（特质钩子之后）。state 为本楼已结算的状态，before 为本楼开始前（读事件发生时的好感、了解）。
/// 返回 { state, known: [{ name, key }], mandate: { name, noun } | { name, text } | null }，不原地改传入对象。
export function settleLandmines(state, before, directives, ctx, has) {
    const day = state.clock.day;
    const counts = actCounts(directives);
    const present = Array.isArray(ctx.present) ? ctx.present : null;
    const here = new Set(present || []);
    if (!present) for (const d of directives) if (d.target) here.add(d.target);
    const events = Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : [];
    const bonds = Array.isArray(ctx.bondEvents) ? ctx.bondEvents.filter((e) => e && e.type === '谎言揭穿') : [];
    const flags = ctx.flags || {};
    const lost = Boolean((flags.battle && flags.battle.outcome === '败') || (flags.challenge && flags.challenge.outcome === '失败'));
    const known = [];
    let mandate = null;
    let mandateRank = 0;
    const mandateSet = (name) => {
        if (mandateRank > 2) return;
        mandate = { name, text: `${name}被主角顶撞后表面不悦，心里却开始留意对方，本楼表现出来` };
        mandateRank = 2;
    };
    let next = state;
    const isHere = (name) => here.has(name);
    const hit = (name, trig) => {
        const [kind, arg] = trig.split(':');
        const mine = counts.get(name) || { 约会: 0, 告白: 0, 亲密: 0 };
        const prior = next.characters[name].acts && next.characters[name].acts.day === day ? next.characters[name].acts : {};
        if (kind === 'event') {
            if (events.some((e) => e.type === arg && e.name === name && e.dir !== 'me')) return true;
            if (directives.some((d) => (d.kind === 'event' || d.kind === 'traitEvent') && d.value === arg && d.target === name)) return true;
            return arg === '谎言揭穿' && bonds.some((e) => e.who === '主角' && (isHere(name) || (Array.isArray(e.by) ? e.by : [e.by]).includes(name)));
        }
        if (kind === 'watch') {
            if (!isHere(name)) return false;
            if (arg === '约会') return directives.some((d) => d.kind === 'event' && d.value === '约会' && d.target && d.target !== name && next.characters[d.target]);
            return directives.some((d) => d.kind === 'intimate' && (d.crowd || (d.target && d.target !== name && next.characters[d.target])));
        }
        if (kind === 'repeat') return mine[arg] > 0 && num(prior[arg]) + mine[arg] >= 2;
        if (kind === 'early') return mine[arg] > 0 && dimOf(before.characters[name], '好感') < HEART;
        return trig === 'lose' && lost && isHere(name);
    };
    for (const name of Object.keys(state.characters)) {
        let pick = null;
        for (const [trait, trig, tier, opts = {}] of LANDMINES) {
            if (pick && RANK[tier] <= RANK[pick.tier]) continue;
            if (!has(name, trait)) continue;
            if (opts.cond && dimOf(before.characters[name], opts.cond.dim) >= opts.cond.lt) continue;
            // 追妻火葬场（追悔+强势+冷血）：芥蒂「明显」起，强势的「拒绝」雷点不生效。
            if (trait === '强势' && trig === 'event:拒绝' && has(name, 'combo:追妻火葬场') && dimOf(next.characters[name], '芥蒂') >= LIKE) continue;
            if (hit(name, trig)) pick = { trait, trig, tier, opts };
        }
        const cur0 = next.characters[name];
        const noticeOn = NOTICE_TRAITS.some((t) => has(name, t)) && hit(name, 'event:顶撞');
        const know = dimOf(before.characters[name], '了解');
        const notice = noticeOn && !(cur0.noticeDay === day) ? rollOver(know, ctx.random) : null;
        const noticeRow = notice ? calcRow(`引起注意 掷骰 ${notice.roll}（需大于了解 ${know}）`, notice.passed ? '通过' : '未通过') : null;
        if (!pick && !notice) continue;
        if (!pick) {
            if (notice.passed) next = applyNotice(next, name, notice, noticeRow, ctx, day, mandateSet);
            continue;
        }
        const cur = next.characters[name];
        const note = `踩雷·${pick.trait}：${mineLabel(pick.trig)}`;
        known.push({ name, key: mineKey(pick.trait, pick.trig) });
        if (RANK[pick.tier] >= 2 && RANK[pick.tier] > mandateRank) { mandate = { name, noun: mineNoun(pick.trig) }; mandateRank = RANK[pick.tier]; }
        const gains = ctx.changes.filter((c) => c.target === name && c.key === '好感' && MOVE_TAGS.has(c.source) && num(c.to) > num(c.from));
        const undo = gains.reduce((s, c) => s + num(c.to) - num(c.from), 0);
        const falls = ctx.changes.filter((c) => c.target === name && c.key === '好感' && num(c.to) < num(c.from)).reduce((s, c) => s + num(c.from) - num(c.to), 0);
        const used = cur.mineDay && cur.mineDay.day === day ? num(cur.mineDay.lost) : 0;
        const wanted = PENALTY[pick.tier];
        const pen = Math.max(0, Math.min(wanted, DAY_CAP - used, FLOOR_DROP_GUARD - falls));
        const from = dimOf(cur, '好感');
        // 作废上升不低于楼首值：其他钩子已削掉的部分不重复扣。
        const floorStart = dimOf(before.characters[name], '好感');
        const to = clamp(Math.min(from, Math.max(from - undo, floorStart)) - pen, -DIM_MAX, DIM_MAX);
        const dims = { ...cur.dims };
        const calc = [calcRow('雷点', `${pick.trait}·${mineLabel(pick.trig)}`), calcRow('档位', TIER_NAME[pick.tier])];
        if (noticeRow) calc.push(noticeRow);
        if (undo) calc.push(calcRow('好感上升作废', -undo));
        if (wanted) calc.push(calcRow('固定扣分', -pen), ...(pen < wanted ? [calcRow('每日上限', `${DAY_CAP - used > 0 ? '剩' + (DAY_CAP - used) : '已满'}`)] : []));
        let daily = cur.daily;
        if (to !== from) {
            dims.好感 = to;
            calc.push(calcRow('结果', to - from));
            ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from, to, note }, { calc, traitTags: [pick.trait] }));
            if (undo && cur.daily && cur.daily.day === day) daily = { ...cur.daily, gained: { ...cur.daily.gained, 好感: Math.max(0, num(cur.daily.gained && cur.daily.gained.好感) - undo) } };
        }
        // 女王、控制狂：被拒绝已加芥蒂，雷点不再重复加；占有狂旁观雷不加芥蒂。
        const grudgeSkip = pick.opts.noGrudge || (pick.trig === 'event:拒绝' && (has(name, '女王') || has(name, '控制狂')));
        const gUp = grudgeSkip ? 0 : GRUDGE_UP[pick.tier];
        if (gUp) {
            const g0 = dimOf(cur, '芥蒂');
            const g1 = clamp(g0 + gUp, -DIM_MAX, DIM_MAX);
            if (g1 !== g0) {
                dims.芥蒂 = g1;
                ctx.changes.push(withCalc({ source: 'trait', target: name, key: '芥蒂', from: g0, to: g1, note }, { calc: [calcRow('雷点', `${pick.trait}·${mineLabel(pick.trig)}`), calcRow('档位', TIER_NAME[pick.tier]), calcRow('结果', g1 - g0)], traitTags: [pick.trait] }));
            }
        }
        next = withCharacter(next, name, { ...cur, dims, daily, ...(pen ? { mineDay: { day, lost: used + pen } } : {}) });
        if (notice && notice.passed) next = applyNotice(next, name, notice, noticeRow, ctx, day, mandateSet);
    }
    // 记当日对该角色的约会、告白、亲密次数（供「同日重复」判定）。
    for (const [name, mine] of counts) {
        const cur = next.characters[name];
        if (!cur) continue;
        const old = cur.acts && cur.acts.day === day ? cur.acts : { day };
        const acts = { ...old, day };
        for (const k of ['约会', '告白', '亲密']) if (mine[k]) acts[k] = num(old[k]) + mine[k];
        next = withCharacter(next, name, { ...cur, acts });
    }
    return { state: next, known, mandate };
}
