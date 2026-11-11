// 特质软肋：雷点的反面，主角做对一件事，持有对应特质的角色心意槽 +1。
// 叶子模块：不导入 stat-traits 与规则文件（避免循环引用，见 v0.39.79）；特质判定由调用方以 has(名, 特质) 传入。
import { calcRow } from './stat-status-defs.js';
import { fillHeart } from './stat-trait-landmines.js';

const HALF = 50;
const GAIN = 1;

// [特质, 触发]：触发为事件名，或「送礼」「吃饭」。
export const SOFTSPOTS = Object.freeze([
    ...['冰山', '疑心病', '记仇', '兔系'].map((t) => [t, '守约']),
    ...['玻璃心', '自卑', '撒娇精', '犬系', '龙系'].map((t) => [t, '夸奖']),
    ...['傲娇', '强势', '御姐', '护短'].map((t) => [t, '求助']),
    ...['慢热', '无口', '高岭之花'].map((t) => [t, '交心']),
    ...['讲义气', '狼系'].map((t) => [t, '共患难']),
    ['黏人', '约会'],
    ['贪吃鬼', '吃饭'],
    // 特质加深补充。
    ['外貌协会', '夸奖'],
    ['智性恋', '交心'],
    ['拜金', '送礼'],
    ['清高', '守约'], ['清高', '交心'],
    ['保护欲', '求助'],
]);

const LABEL = Object.freeze({ 守约: '被守约', 夸奖: '被夸奖', 求助: '被求助', 交心: '被交心', 共患难: '共患难', 约会: '被约会', 送礼: '被送礼', 吃饭: '一起吃饭' });
export const softKey = (trait, trig) => `${trait}:${trig}`;
const num = (v) => Number(v) || 0;

export function softspotsOf(trait) {
    return SOFTSPOTS.filter((r) => r[0] === trait).map(([t, trig]) => ({ key: softKey(t, trig), trait: t, trig, label: LABEL[trig] || trig }));
}

// 角色卡「已知软肋」：触发过的恒显示；了解 ≥ 50 时显示全部。返回 [{ text }]。
export function softspotView(holders, known, know) {
    const seen = known && typeof known === 'object' ? known : {};
    const all = num(know) >= HALF;
    const out = [];
    for (const trait of holders) for (const m of softspotsOf(trait)) if (all || Object.hasOwn(seen, m.key)) out.push({ text: `${m.label}（${m.trait}）` });
    return out;
}

/// 结算软肋（雷点之后）。skip 为本楼踩了雷的角色名集合；每角色每游戏日一次（角色字段 softDay）。
/// 返回 { state, known: [{ name, key }] }，不原地改传入对象。
export function settleSoftspots(state, directives, ctx, has, skip) {
    const day = state.clock.day;
    const events = Array.isArray(ctx.reviewEvents) ? ctx.reviewEvents.filter((e) => e && e.type && e.name) : [];
    const present = Array.isArray(ctx.present) ? new Set(ctx.present) : null;
    const hit = (name, trig) => {
        if (trig === '送礼') return directives.some((d) => d.kind === 'gift' && d.target === name);
        if (trig === '吃饭') return (!present || present.has(name)) && directives.some((d) => d.kind === 'stamina' && d.value === '进食' && d.target === name);
        if (trig === '守约' || trig === '夸奖' || trig === '求助') return events.some((e) => e.type === trig && e.name === name && (trig === '求助' || e.dir !== 'me')) || directives.some((d) => (d.kind === 'event' || d.kind === 'traitEvent') && d.value === trig && d.target === name);
        return directives.some((d) => d.kind === 'event' && d.value === trig && d.target === name);
    };
    const known = [];
    let next = state;
    for (const name of Object.keys(state.characters)) {
        if (skip && skip.has(name)) continue;
        const cur = next.characters[name];
        if (cur.softDay === day) continue;
        const pick = SOFTSPOTS.find(([trait, trig]) => has(name, trait) && hit(name, trig));
        if (!pick) continue;
        const key = softKey(pick[0], pick[1]);
        next = fillHeart(next, name, GAIN, `软肋·${pick[0]}：${LABEL[pick[1]] || pick[1]}`, ctx.changes, [calcRow('软肋', `${pick[0]}·${LABEL[pick[1]] || pick[1]}`)]);
        const after = next.characters[name];
        next = { ...next, characters: { ...next.characters, [name]: { ...after, softDay: day } } };
        known.push({ name, key });
    }
    return { state: next, known };
}
