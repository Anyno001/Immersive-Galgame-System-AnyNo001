// 特质雷点：主角做了某件事，持有对应特质的角色扣好感。
// 叶子模块：只从 stat-state、stat-status-defs 导入，不导入 stat-traits 与规则文件（避免循环引用，见 v0.39.79）；特质判定由调用方以 has(名, 特质) 传入。
import { DIM_MAX, clamp, isRomance, withCharacter } from './stat-state.js';
import { OFFENSE_KEYS, habitNoteSuffix, habitRow, showHabit } from './stat-habit.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { cryptoRandom, rollOver } from './stat-rng.js';
import { FAVOR_NEG_BASE, GRUDGE_DOWN_BASE } from './stat-vocab.js';
import { GRUDGE_FLOOR_MAX, GRUDGE_UP_DAILY_MAX, GRUDGE_UP_KEY, HEART_BURST_GAIN, HEART_BURST_NOTE, HEART_FULL, JEALOUS_NOTE, gateCap, posBaseOf } from './stat-favor.js';
import { applyStatusChange, statusesOf } from './stat-status.js';

// 档：轻 = 本楼好感上升作废；雷 = 再 −3；重 = 再 −8、芥蒂 +2。
export const TIER_NAME = Object.freeze({ 轻: '轻雷', 雷: '雷', 重: '重雷' });
const RANK = Object.freeze({ 轻: 1, 雷: 2, 重: 3 });
const TIER_OF_RANK = Object.freeze(['', '轻', '雷', '重']);
// 当众加重：持有这些特质之一，被当着其他已建档角色批评、拒绝、命令、揭穿谎言时，雷点升一档。
const PUBLIC_TRAITS = Object.freeze(['大小姐', '强势', '龙系', '自恋', '公众人物']);
const PUBLIC_TRIGS = new Set(['event:批评', 'event:拒绝', 'event:命令', 'event:谎言揭穿']);
// 屡犯升级：同一雷点距上次踩中不超过 7 天再踩，升一档；持有记仇时不设期限。
const REPEAT_DAYS = 7;
// 闹别扭：踩重雷时挂上，默认 2 天；记仇、偏执狂直到解除；宽容类 1 天。
export const SULK = '闹别扭';
const SULK_DAYS = 2;
const SULK_FOREVER = Object.freeze(['记仇', '偏执狂']);
const SULK_SHORT = Object.freeze(['宽容', '以德报怨', '老好人', '一笑泯恩仇', '没心没肺']);
const SULK_MEND = new Set(['约会', '交心']);
const WIN_BATTLE = new Set(['大胜', '胜', '险胜']);
const WIN_CHALLENGE = new Set(['圆满', '勉强']);
const HERO = '主角';
const PENALTY = Object.freeze({ 轻: 0, 雷: 3, 重: 8 });
const GRUDGE_UP = Object.freeze({ 轻: 0, 雷: 0, 重: 2 });
export const DAY_CAP = 15;
// 与 stat-traits.js 的 DROP_GUARD.好感 同值：好感下降单楼保护。
const FLOOR_DROP_GUARD = 30;
const HEART = 51;
const LIKE = 26;
const HALF = 50;
// 引起注意（反弹）：[特质, 触发, 下一楼强制事项]；了解掷骰通过则心意槽 +2，每角色每游戏日最多通过一次。按表序取第一条命中的。
const TOPPLE = (n) => `${n}被主角顶撞后表面不悦，心里却开始留意对方，接下来表现出来`;
const SNUB_NEAR = (n) => `${n}被主角冷落后嘴上不说，却忍不住主动靠近，接下来表现出来`;
const SNUB_MIND = (word) => (n) => `${n}被主角${word}后反而在意起对方，接下来表现出来`;
const BEATEN = (n) => `${n}输给主角后不服气，却开始正眼看待对方，接下来表现出来`;
export const NOTICE_RULES = Object.freeze([
    ...['强势', '女王', '大小姐', '慕强者', '毒舌', '龙系'].map((t) => [t, 'event:顶撞', TOPPLE]),
    ...['傲娇', '猫系'].map((t) => [t, 'event:冷落', SNUB_NEAR]),
    ...['高岭之花', '钓系'].flatMap((t) => [[t, 'event:拒绝', SNUB_MIND('拒绝')], [t, 'event:冷落', SNUB_MIND('冷落')]]),
    ['好胜', 'win', BEATEN],
]);
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
    // 特质加深 A1（11-11）。
    ['慢热', 'early:告白', T], ['慢热', 'early:亲密', H],
    ['恋爱脑', 'event:冷落', T],
    ['玻璃心', 'event:批评', T], ['玻璃心', 'event:冷落', L],
    ['疑心病', 'event:谎言揭穿', H],
    ['偏执狂', 'event:谎言揭穿', H],
    ['记仇', 'event:失约', T], ['记仇', 'event:背叛', H],
    ['自恋', 'event:冷落', T], ['自恋', 'event:批评', L],
    ['自卑', 'event:炫耀', T],
    ['正义使者', 'event:谎言揭穿', T],
    ['讲义气', 'event:失约', T], ['讲义气', 'event:背叛', H],
    ['慕强者', 'lose', T],
    ['纯爱战士', 'watch:亲密', H, NO_GRUDGE],
    ['醋坛子', 'watch:约会', T, NO_GRUDGE],
    ['完美主义者', 'event:失约', T],
    ['控制狂', 'event:顶撞', T],
    ['害羞鬼', 'early:亲密', T],
    ['性冷淡', 'early:亲密', T],
    ['好胜', 'event:炫耀', L],
    // 特质加深 D 批补充（11-11）。
    ['外貌协会', 'lose', L],
    ['审美清奇', 'event:炫耀', L],
    ['智性恋', 'event:谎言揭穿', L],
    ['拜金', 'event:失约', L],
    ['清高', 'event:炫耀', T],
    ['保护欲', 'event:拒绝', T],
]);

const EVENT_LABEL = Object.freeze({ 顶撞: '被顶撞', 命令: '被命令', 冷落: '被冷落', 炫耀: '被炫耀', 批评: '被批评', 拒绝: '被拒绝', 背叛: '遭背叛', 失约: '被失约', 谎言揭穿: '谎言被揭穿', 夸奖: '被夸奖', 告白: '被告白' });
const OTHER_LABEL = Object.freeze({ 'watch:亲密': '主角与他人亲密', 'watch:约会': '主角与他人约会', 'repeat:约会': '同日再次约会', 'repeat:亲密': '同日再次亲密', 'repeat:告白': '同日再次告白', 'early:亲密': '好感未到即亲密', 'early:告白': '好感未到即告白', lose: '主角当面战败' });
// 下一楼强制事项里的说法，不提特质。
const EVENT_NOUN = Object.freeze({ 谎言揭穿: '谎言被揭穿' });
const OTHER_NOUN = Object.freeze({ 'watch:亲密': '主角与他人亲密', 'watch:约会': '主角与他人约会', 'repeat:约会': '主角再次邀约', 'repeat:亲密': '主角再次亲近', 'repeat:告白': '主角再次告白', 'early:亲密': '主角过早的亲密举动', 'early:告白': '主角过早的告白', lose: '主角当面战败' });

export const mineLabel = (trig) => (trig.startsWith('event:') ? EVENT_LABEL[trig.slice(6)] || trig.slice(6) : OTHER_LABEL[trig] || trig);
const mineNoun = (trig) => (trig.startsWith('event:') ? `主角的${EVENT_NOUN[trig.slice(6)] || trig.slice(6)}` : OTHER_NOUN[trig] || trig);
export const mineKey = (trait, trig) => `${trait}:${trig}`;

const num = (v) => Number(v) || 0;
const dimOf = (c, dim) => num(c && c.dims && c.dims[dim]);
const condValue = (c, dim, ctx) => (dim === '了解' && ctx && ctx.heroSide === true && c && c.hero && c.hero.dims ? num(c.hero.dims[dim]) : dimOf(c, dim));

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
export const landmineMandate = (flag) => (flag && flag.text ? flag.text : flag && flag.name && flag.noun ? `${flag.name}对刚才${flag.noun}心里不快，接下来表现出来` : '');

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

// 心意槽加 gain，满 5 溢出为好感 +5（受关口封顶；封顶压成 0 时槽停在 4）。rows 为明细前缀，note 为未溢出时那条记录的备注。
// 只改心意槽与好感、记一条变动，不发强制事项、不记当日；供引起注意与软肋共用。返回新 state。
export function fillHeart(state, name, gain, note, changes, rows = []) {
    const cur = state.characters[name];
    const h0 = Math.max(0, Math.min(HEART_FULL - 1, Math.round(num(cur.heart))));
    const total = h0 + gain;
    const calc = [...rows, calcRow('心意槽', `${h0} + ${gain} = ${total} / ${HEART_FULL}`)];
    let heart = total;
    let dims = cur.dims;
    if (total >= HEART_FULL) {
        const from = dimOf(cur, '好感');
        const to = gateCap(from, clamp(from + HEART_BURST_GAIN, -DIM_MAX, DIM_MAX), Array.isArray(cur.unlocked) ? cur.unlocked : []);
        if (to > from) {
            heart = total - HEART_FULL;
            dims = { ...cur.dims, 好感: to };
            changes.push(withCalc({ source: 'trait', target: name, key: '好感', from, to, note: HEART_BURST_NOTE, heartFrom: h0, heartTo: heart }, { calc: [...calc, calcRow('结果', to - from)], traitTags: [] }));
        } else heart = HEART_FULL - 1;
    } else {
        const f = dimOf(cur, '好感');
        changes.push(withCalc({ source: 'trait', target: name, key: '好感', from: f, to: f, note, heartFrom: h0, heartTo: heart }, { calc, traitTags: [] }));
    }
    return withCharacter(state, name, { ...cur, dims, heart });
}

// 引起注意通过：心意槽 +2，记当日与该特质的通过次数（noticeCount，供进化读取），下一楼强制事项改写。
function applyNotice(state, name, rule, noticeRow, ctx, day, setMandate) {
    const filled = fillHeart(state, name, NOTICE_GAIN, '引起注意', ctx.changes, [noticeRow]);
    const cur = filled.characters[name];
    const counts = cur.noticeCount && typeof cur.noticeCount === 'object' ? cur.noticeCount : {};
    setMandate(name, rule[2](name));
    return withCharacter(filled, name, { ...cur, noticeDay: day, noticeCount: { ...counts, [rule[0]]: num(counts[rule[0]]) + 1 } });
}

// 闹别扭的解除：本楼对其的约会、交心（关键事件成功、大成功；不在关口时照常发生也算）或送礼（未因重复失效）任一成立。
function mended(name, directives, ctx, before) {
    const evs = Array.isArray(ctx.events) ? ctx.events : [];
    if (evs.some((e) => e && e.target === name && SULK_MEND.has(e.event) && (e.success || e.reason === 'not-at-gate'))) return true;
    const b = before.characters[name];
    const recent = b && Array.isArray(b.recent) ? b.recent : [];
    return directives.some((d) => d.kind === 'gift' && d.target === name && recent.filter((x) => x === `送礼:${d.value}`).length < 2);
}

// 挂上或摘下闹别扭，写进 ctx.statusBox（与本楼其他状态一起经 meta.statuses 交运行时落盘）。
// 记仇、偏执狂：直到解除（类型改为 until、去掉到期日）；宽容类：1 天；其余 2 天。
function putSulk(ctx, name, on, has, day) {
    const box = ctx.statusBox;
    if (!box) return false;
    const forever = on && SULK_FOREVER.some((t) => has(name, t));
    const days = !forever && SULK_SHORT.some((t) => has(name, t)) ? 1 : SULK_DAYS;
    const r = applyStatusChange(box.cat, name, SULK, on ? { on: true, src: 'system', toward: HERO, days, day, floor: ctx.floor } : { on: false, src: 'system' });
    if (r.reason) return false;
    let cat = r.catalog;
    const changes = [...r.changes];
    if (forever) {
        const own = statusesOf(cat, name);
        const { until, ...rest } = own[SULK];
        cat = { ...cat, statuses: { ...cat.statuses, [name]: { ...own, [SULK]: { ...rest, kind: 'until' } } } };
        const i = changes.length - 1;
        changes[i] = { ...changes[i], calc: (changes[i].calc || []).filter((x) => x.label !== '持续天数' && x.label !== '到期日').concat([calcRow('持续', '直到解除')]) };
    }
    box.cat = cat;
    ctx.changes.push(...changes);
    return true;
}

/// 结算雷点（特质钩子之后）。state 为本楼已结算的状态，before 为本楼开始前（读事件发生时的好感、了解）。
/// 返回 { state, known: [{ name, key }], mandate: { name, noun } | { name, text } | null, sulk: [{ name, on }] }，不原地改传入对象。
/// 闹别扭直接写进 ctx.statusBox（box 整体替换，不改原 catalog）；sulk 只作记录。
export function settleLandmines(state, before, directives, ctx, has) {
    const day = state.clock.day;
    // 重算同一楼（重新生成、编辑）：先摘掉上一次在本楼挂上的闹别扭，本楼仍踩重雷会重新挂上。
    if (ctx.statusBox && ctx.floor !== undefined && ctx.floor !== null) {
        for (const name of Object.keys(state.characters)) {
            const old = statusesOf(ctx.statusBox.cat, name)[SULK];
            if (old && old.src === 'system' && Number(old.floor) === Number(ctx.floor)) putSulk(ctx, name, false, has, day);
        }
    }
    const counts = actCounts(directives);
    const present = Array.isArray(ctx.present) ? ctx.present : null;
    const here = new Set(present || []);
    if (!present) for (const d of directives) if (d.target) here.add(d.target);
    const events = Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : [];
    const bonds = Array.isArray(ctx.bondEvents) ? ctx.bondEvents.filter((e) => e && e.type === '谎言揭穿') : [];
    const flags = ctx.flags || {};
    const lost = Boolean((flags.battle && flags.battle.outcome === '败') || (flags.challenge && flags.challenge.outcome === '失败'));
    const won = Boolean((flags.battle && WIN_BATTLE.has(flags.battle.outcome)) || (flags.challenge && WIN_CHALLENGE.has(flags.challenge.outcome)));
    const known = [];
    const sulk = [];
    let mandate = null;
    let mandateRank = 0;
    const mandateSet = (name, text) => {
        if (mandateRank > 2) return;
        mandate = { name, text };
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
        if (trig === 'win') return won && isHere(name);
        return trig === 'lose' && lost && isHere(name);
    };
    // 当众：在场名单里除其本人外还有至少一名已建档角色。
    const crowded = (name) => [...here].some((n) => n && n !== name && n !== HERO && next.characters[n]);
    for (const name of Object.keys(state.characters)) {
        // 闹别扭：先按本楼的和好举动摘下（本楼又踩重雷时下面重新挂上）。
        next = mendColdWar(next, ctx, name, directives, before);
        if (ctx.statusBox && statusesOf(ctx.statusBox.cat, name)[SULK] && mended(name, directives, ctx, before) && putSulk(ctx, name, false, has, day)) sulk.push({ name, on: false });
        let pick = null;
        for (const [trait, trig, tier, opts = {}] of LANDMINES) {
            if (pick && RANK[tier] <= RANK[pick.tier]) continue;
            if (!has(name, trait)) continue;
            if (opts.cond && condValue(before.characters[name], opts.cond.dim, ctx) >= opts.cond.lt) continue;
            // 追妻火葬场（追悔+强势+冷血）：芥蒂「明显」起，强势的「拒绝」雷点不生效。
            if (trait === '强势' && trig === 'event:拒绝' && has(name, 'combo:追妻火葬场') && dimOf(next.characters[name], '芥蒂') >= LIKE) continue;
            if (hit(name, trig)) pick = { trait, trig, tier, opts };
        }
        // 习惯机制：冒犯型雷点读本楼预扫的习惯条目（ctx.habit，楼首值）；恋人、久别重逢都以楼首为准。
        const offArg = pick && pick.trig.startsWith('event:') ? pick.trig.slice(6) : '';
        const offense = OFFENSE_KEYS.includes(offArg);
        const hb = offense && ctx.habit && typeof ctx.habit.get === 'function' ? ctx.habit.get(name) : null;
        const h = hb ? hb.by[offArg] || null : null;
        const loverCalm = offense && isRomance(before.characters[name], name, ctx.romanceSeen);
        if (pick && offense && hb && hb.reunion) {
            const f0 = dimOf(next.characters[name], '好感');
            const rnote = `踩雷·${pick.trait}：${mineLabel(pick.trig)}（久别重逢，不计较）`;
            ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from: f0, to: f0, note: rnote }, { calc: [calcRow('雷点', `${pick.trait}·${mineLabel(pick.trig)}`), calcRow('久别重逢', '本楼不按冒犯算'), calcRow('结果', 0)], traitTags: [pick.trait] }));
            pick = null;
        }
        const cur0 = next.characters[name];
        const rule = NOTICE_RULES.find(([t, trig]) => has(name, t) && hit(name, trig)) || null;
        const know = dimOf(before.characters[name], '了解');
        const notice = rule && !(cur0.noticeDay === day) ? rollOver(know, ctx.random) : null;
        const noticeRow = notice ? calcRow(`引起注意 掷骰 ${notice.roll}（需大于了解 ${know}）`, notice.passed ? '通过' : '未通过') : null;
        if (!pick && !notice) continue;
        if (!pick) {
            if (notice.passed) next = applyNotice(next, name, rule, noticeRow, ctx, day, mandateSet);
            continue;
        }
        const cur = next.characters[name];
        const key = mineKey(pick.trait, pick.trig);
        // 当众、屡犯各升一档，封顶重雷。
        const ups = [];
        if (PUBLIC_TRIGS.has(pick.trig) && PUBLIC_TRAITS.some((t) => has(name, t)) && crowded(name)) ups.push(calcRow('当众', '升一档'));
        const lastDay = cur.mineLast && typeof cur.mineLast === 'object' && Object.hasOwn(cur.mineLast, key) ? num(cur.mineLast[key]) : null;
        // 冒犯型雷点：只有记仇、偏执狂与强势类前 5 次保留屡犯升档，其余走习惯打折；恋人被冒犯降为轻雷。
        if (lastDay !== null && (has(name, '记仇') || day - lastDay <= REPEAT_DAYS) && (!offense || !h || h.exempt)) ups.push(calcRow('屡犯', `距上次${day - lastDay}天，升一档`));
        if (loverCalm) ups.length = 0;
        const tier = loverCalm ? L : TIER_OF_RANK[Math.min(RANK.重, RANK[pick.tier] + ups.length)];
        const mult = h && !loverCalm && h.mult < 1 ? h.mult : 1;
        const hRow = h && !loverCalm && showHabit(h) ? [habitRow(h)] : [];
        const note = `踩雷·${pick.trait}：${mineLabel(pick.trig)}${loverCalm ? '（恋人，不计较）' : habitNoteSuffix(h)}`;
        known.push({ name, key });
        // 冒犯习惯到 ×0.3 时（刚跨过那一次）改写一句「已经习惯」替代「心里不快」；更低的倍率不再写，保持克制。
        if (RANK[tier] >= 2 && h && !loverCalm && !h.exempt && h.mult <= 0.3) {
            if (h.mult === 0.3 && mandateRank < 2) { mandate = { name, text: `${name}对主角的${offArg}已经习惯，不再当回事` }; mandateRank = 1.5; }
        } else if (RANK[tier] >= 2 && RANK[tier] > mandateRank) { mandate = { name, noun: mineNoun(pick.trig) }; mandateRank = RANK[tier]; }
        // 恋人的轻雷只作废与冒犯同楼的正文标签上升，不作废关键事件突破与心意满溢。
        const gains = ctx.changes.filter((c) => c.target === name && c.key === '好感' && MOVE_TAGS.has(c.source) && num(c.to) > num(c.from) && !(loverCalm && /突破|^心意满溢/.test(String(c.note || ''))));
        const undo = gains.reduce((s, c) => s + num(c.to) - num(c.from), 0);
        const falls = ctx.changes.filter((c) => c.target === name && c.key === '好感' && num(c.to) < num(c.from)).reduce((s, c) => s + num(c.from) - num(c.to), 0);
        const used = cur.mineDay && cur.mineDay.day === day ? num(cur.mineDay.lost) : 0;
        // 与同楼正文标签取重：标签已扣的好感、已加的芥蒂不再重复，雷点只补差。
        const tagSum = (key, up) => ctx.changes.filter((c) => c.target === name && c.key === key && c.source === 'tag' && c.note !== JEALOUS_NOTE && (up ? num(c.to) > num(c.from) : num(c.to) < num(c.from))).reduce((s, c) => s + Math.abs(num(c.to) - num(c.from)), 0);
        const tagFalls = offense ? tagSum('好感', false) : 0;
        const wanted = PENALTY[tier] && mult < 1 ? Math.max(1, Math.round(PENALTY[tier] * mult)) : PENALTY[tier];
        const merged = wanted > 0 && tagFalls >= wanted;
        const pen = Math.max(0, Math.min(Math.max(0, wanted - tagFalls), DAY_CAP - used, FLOOR_DROP_GUARD - falls));
        const from = dimOf(cur, '好感');
        // 作废上升不低于楼首值：其他钩子已削掉的部分不重复扣。
        const floorStart = dimOf(before.characters[name], '好感');
        const to = clamp(Math.min(from, Math.max(from - undo, floorStart)) - pen, -DIM_MAX, DIM_MAX);
        const dims = { ...cur.dims };
        const calc = [calcRow('雷点', `${pick.trait}·${mineLabel(pick.trig)}`), ...ups, calcRow('档位', TIER_NAME[tier]), ...hRow];
        if (loverCalm) calc.push(calcRow('恋人', '不计较，只作废本楼好感上升'));
        if (noticeRow) calc.push(noticeRow);
        if (undo) calc.push(calcRow('好感上升作废', -undo));
        if (tagFalls && wanted) calc.push(calcRow('与正文标签取重', `标签已扣${tagFalls}`));
        if (wanted) calc.push(calcRow('固定扣分', -pen), ...(pen < wanted ? [calcRow('每日上限', `${DAY_CAP - used > 0 ? '剩' + (DAY_CAP - used) : '已满'}`)] : []));
        let daily = cur.daily;
        if (to !== from) {
            dims.好感 = to;
            calc.push(calcRow('结果', to - from));
            ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from, to, note }, { calc, traitTags: [pick.trait] }));
            if (undo && cur.daily && cur.daily.day === day) daily = { ...cur.daily, gained: { ...cur.daily.gained, 好感: Math.max(0, num(cur.daily.gained && cur.daily.gained.好感) - undo) } };
        } else if (loverCalm || merged) {
            // 零增量也记一行：恋人不计较、与标签取重。
            calc.push(calcRow('结果', 0));
            ctx.changes.push(withCalc({ source: 'trait', target: name, key: '好感', from, to: from, note }, { calc, capped: merged && !loverCalm ? 'merged' : null, traitTags: [pick.trait] }));
        }
        // 女王、控制狂：被拒绝已加芥蒂，雷点不再重复加；占有狂、纯爱战士、醋坛子的旁观雷不加芥蒂。
        const grudgeSkip = pick.opts.noGrudge || (pick.trig === 'event:拒绝' && (has(name, '女王') || has(name, '控制狂')));
        const gBase = grudgeSkip || loverCalm ? 0 : GRUDGE_UP[tier];
        const gScaled = gBase && mult < 1 ? Math.round(gBase * mult) : gBase;
        // 取重（标签已加的芥蒂不重复）与单楼 5、每日 10 的上升上限。
        const gTag = offense ? tagSum('芥蒂', true) : 0;
        const gFloor = GRUDGE_FLOOR_MAX - num(ctx.floorGained && ctx.floorGained.get(`${name}|芥蒂`));
        const gDaily = GRUDGE_UP_DAILY_MAX - num(daily && daily.day === day && daily.gained && daily.gained[GRUDGE_UP_KEY]);
        const gUp = Math.max(0, Math.min(Math.max(0, gScaled - gTag), gFloor, gDaily));
        if (gUp) {
            const g0 = dimOf(cur, '芥蒂');
            const g1 = clamp(g0 + gUp, -DIM_MAX, DIM_MAX);
            if (g1 !== g0) {
                dims.芥蒂 = g1;
                ctx.changes.push(withCalc({ source: 'trait', target: name, key: '芥蒂', from: g0, to: g1, note }, { calc: [calcRow('雷点', `${pick.trait}·${mineLabel(pick.trig)}`), ...ups, calcRow('档位', TIER_NAME[tier]), ...hRow, ...(gTag ? [calcRow('与正文标签取重', `标签已加${gTag}`)] : []), calcRow('结果', g1 - g0)], traitTags: [pick.trait] }));
                if (daily && daily.gained) daily = { ...daily, gained: { ...daily.gained, [GRUDGE_UP_KEY]: num(daily.gained[GRUDGE_UP_KEY]) + (g1 - g0) } };
                if (ctx.floorGained) ctx.floorGained.set(`${name}|芥蒂`, num(ctx.floorGained.get(`${name}|芥蒂`)) + (g1 - g0));
            }
        }
        const mineLast = { ...(cur.mineLast && typeof cur.mineLast === 'object' ? cur.mineLast : {}), [key]: day };
        next = withCharacter(next, name, { ...cur, dims, daily, mineLast, ...(pen ? { mineDay: { day, lost: used + pen } } : {}) });
        if (tier === '重' && putSulk(ctx, name, true, has, day)) sulk.push({ name, on: true });
        if (notice && notice.passed) next = applyNotice(next, name, rule, noticeRow, ctx, day, mandateSet);
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
    return { state: next, known, mandate, sulk };
}

// ---- 冷战（rev ≥ 3）：角色对主角的「冷战中」。好感不上升由 stat-settle 的结算循环拦；这里管进入、每日掷骰、和好与自然结束。 ----
export const COLD = '冷战中';
const COLD_GRUDGE_MIN = 40;
const COLD_ROLLS_MAX = 7;
const COLD_SELF_DAYS = 3;
const FORGIVING = Object.freeze(['宽容', '以德报怨', '老好人', '一笑泯恩仇']);

const heroEntry = (e) => (e && (!e.toward || e.toward === HERO) ? e : null);
export const coldWarOf = (cat, name) => heroEntry(statusesOf(cat, name)[COLD]);
export const coldNames = (cat) => Object.keys((cat && cat.statuses) || {}).filter((n) => coldWarOf(cat, n));

// 摘下冷战并按和好处理：芥蒂降一档；传入 ctx 时好感按「小」档直接回升一次（受单楼与每日上限、关口约束）。
function liftCold(state, box, name, changes, note, ctx) {
    const r = applyStatusChange(box.cat, name, COLD, { on: false, src: 'system' });
    if (r.reason) return state;
    box.cat = r.catalog;
    changes.push(...r.changes.map((c) => ({ ...c, note })));
    const cur = state.characters[name];
    const source = ctx ? 'trait' : 'daily';
    const dims = { ...cur.dims };
    let daily = cur.daily;
    const g0 = dimOf(cur, '芥蒂');
    const g1 = clamp(g0 + GRUDGE_DOWN_BASE.小, -DIM_MAX, DIM_MAX);
    if (g1 !== g0) {
        dims.芥蒂 = g1;
        changes.push(withCalc({ source, target: name, key: '芥蒂', from: g0, to: g1, note }, { calc: [calcRow(note, `芥蒂下降一档 ${g1 - g0}`), calcRow('结果', g1 - g0)] }));
    }
    if (ctx) {
        const from = dimOf(cur, '好感');
        const floorLeft = (ctx.limits ? ctx.limits.floor : 0) - (ctx.floorGained.get(`${name}|好感`) || 0);
        const dailyLeft = (ctx.limits ? ctx.limits.daily : 0) - num(cur.daily && cur.daily.gained && cur.daily.gained.好感);
        const base = posBaseOf(ctx.tier, ctx.rev).小;
        const amount = Math.max(0, Math.min(base, floorLeft, dailyLeft));
        const to = gateCap(from, clamp(from + amount, -DIM_MAX, DIM_MAX), Array.isArray(cur.unlocked) ? cur.unlocked : []);
        if (to > from) {
            dims.好感 = to;
            daily = { ...cur.daily, gained: { ...cur.daily.gained, 好感: num(cur.daily.gained && cur.daily.gained.好感) + (to - from) } };
            ctx.floorGained.set(`${name}|好感`, (ctx.floorGained.get(`${name}|好感`) || 0) + (to - from));
            changes.push(withCalc({ source, target: name, key: '好感', from, to, note }, { calc: [calcRow(`${note} 好感回升（小）`, base), calcRow('结果', to - from)] }));
        }
    }
    return withCharacter(state, name, { ...cur, dims, daily });
}

// 本楼的和好（结算雷点时调用，next 为运行中的状态）。
export function mendColdWar(state, ctx, name, directives, before) {
    if (!(ctx.rev >= 3) || !ctx.statusBox || !coldWarOf(ctx.statusBox.cat, name)) return state;
    const tagEnd = directives.some((d) => d && d.kind === 'status' && d.target === name && d.status === COLD && d.on === false);
    if (!tagEnd && !mended(name, directives, ctx, before)) return state;
    return liftCold(state, ctx.statusBox, name, ctx.changes, '和好', ctx);
}

// 过天前：哪些闹别扭会在这次推进中到期。
export function dueSulks(box, day, days) {
    return Object.keys((box && box.cat && box.cat.statuses) || {}).filter((n) => {
        const e = heroEntry(statusesOf(box.cat, n)[SULK]);
        return e && e.kind === 'timer' && (days > 1 || Number(e.until) <= day);
    });
}

// 过天后：闹别扭自然到期且芥蒂 ≥ 40 转冷战；冷战每天掷骰（命中率 = 芥蒂，夹在 20%–80%，命中好感降「小」档）；宽容类满 3 天自行结束。
export function coldWarDay(state, box, day, days, due, { random, changes, rev, has, floor = null }) {
    if (!(rev >= 3) || !box || !box.cat) return state;
    const rnd = typeof random === 'function' ? random : cryptoRandom;
    let next = state;
    for (const name of due) {
        const c = next.characters[name];
        if (!c || statusesOf(box.cat, name)[SULK] || coldWarOf(box.cat, name) || dimOf(c, '芥蒂') < COLD_GRUDGE_MIN) continue;
        const r = applyStatusChange(box.cat, name, COLD, { on: true, src: 'system', toward: HERO, day, floor });
        if (r.reason) continue;
        box.cat = r.catalog;
        changes.push(...r.changes.map((x) => ({ ...x, note: '闹别扭转为冷战' })));
    }
    for (const [name, c] of Object.entries(next.characters)) {
        const e = coldWarOf(box.cat, name);
        if (!e) continue;
        const elapsed = day - (Number(e.since) || 0);
        if (elapsed <= 0) continue;
        const forgiving = FORGIVING.some((t) => has(name, t));
        const n = Math.min(COLD_ROLLS_MAX, days, elapsed, forgiving ? COLD_SELF_DAYS : COLD_ROLLS_MAX);
        const p = clamp(dimOf(c, '芥蒂'), 20, 80);
        let hits = 0;
        for (let i = 0; i < n; i++) if (rnd() * 100 < p) hits += 1;
        if (hits) {
            const from = dimOf(c, '好感');
            const to = clamp(from + hits * FAVOR_NEG_BASE.小, -DIM_MAX, DIM_MAX);
            if (to !== from) {
                changes.push(withCalc({ source: 'daily', target: name, key: '好感', from, to, note: '冷战' }, { calc: [calcRow('冷战 每日掷骰', `${n}次，命中率${p}%，命中${hits}次`), calcRow('结果', to - from)] }));
                next = withCharacter(next, name, { ...c, dims: { ...c.dims, 好感: to } });
            }
        }
        if (forgiving && elapsed >= COLD_SELF_DAYS) next = liftCold(next, box, name, changes, '冷战自行结束', null);
    }
    return next;
}

// 本楼结束时对照楼首：新进入冷战的摘掉闹别扭；楼首在冷战、现在不在了的算和好。返回 { entered, ended }。
export function coldWarShift(box, startNames, changes) {
    const now = coldNames(box.cat);
    const entered = now.filter((n) => !startNames.includes(n));
    for (const name of entered) {
        if (!statusesOf(box.cat, name)[SULK]) continue;
        const r = applyStatusChange(box.cat, name, SULK, { on: false, src: 'system' });
        if (r.reason) continue;
        box.cat = r.catalog;
        changes.push(...r.changes.map((c) => ({ ...c, note: '进入冷战，闹别扭摘下' })));
    }
    return { entered, ended: startNames.filter((n) => !now.includes(n)) };
}
