// 特质平衡模拟（不进 build）：固定随机数，对代表性特质跑 30 楼典型序列，核对计划附录「平衡定稿」第 6 条。
// 用法：node scripts/trait-balance-sim.mjs
// 验收：加成型到达同一关系阶段的楼数比无特质少 25%–45%；减弱型多 40%–80%；任何组合一楼上升不超过无特质同档单楼上限的 2 倍，下降不超过保护值。
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { applyTraitChange, getTraitByName, traitCatalogOf } from '../src/scene/stats/stat-traits.js';

const NAME = '林夏';
const FLOORS = 90; // 到达关口的楼数用 90 楼窗口测，避免减弱型被截断
const SEEDS = 200;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const catalogWith = (traitNames, charName = NAME) => {
    let catalog = { traits: {}, nsfw: true };
    for (const n of traitNames) catalog = applyTraitChange(null, catalog, charName, getTraitByName(n).id, true, 'manual').catalog;
    return catalog;
};

// 典型序列：每两楼过一天（sleep 标签清每日上限）；好感按 中、小、大、中、中 循环，每十楼一次「失望 小」；信任每楼「上升」中小交替。
function floorText(i) {
    const lines = [];
    const level = ['中', '小', '大', '中', '中'][i % 5];
    lines.push(`[igs-stat:favor|${NAME}|${level === '大' ? '心动' : '开心'}|${level}]`);
    lines.push(`[igs-stat:trust|${NAME}|上升|${['中', '大', '中', '中', '小'][i % 5]}]`);
    if (i % 10 === 9) lines.push(`[igs-stat:favor|${NAME}|失望|小]`);
    if (i % 2 === 1) lines.push('[igs-stat:sleep]');
    return lines.join('');
}

function run(traitNames, seed, text = floorText) {
    const random = mulberry32(seed);
    const catalog = catalogWith(traitNames);
    const base = createCharacter(1, { nsfw: true });
    let state = { ...createStatsState(), characters: { [NAME]: { ...base, unlocked: ['gate-25', 'gate-50', 'gate-75'] } } };
    const reached = { f26: null, f51: null, t26: null };
    let maxUp = 0; let maxDown = 0;
    for (let i = 0; i < FLOORS; i += 1) {
        const before = state.characters[NAME].dims;
        const r = settleFloorText(state, text(i), { random, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: catalog.traits });
        state = r.state;
        const d = state.characters[NAME].dims;
        const gain = d.好感 - before.好感;
        maxUp = Math.max(maxUp, gain); maxDown = Math.min(maxDown, gain);
        if (reached.f26 === null && d.好感 >= 26) reached.f26 = i + 1;
        if (reached.f51 === null && d.好感 >= 51) reached.f51 = i + 1;
        if (reached.t26 === null && d.信任 >= 26) reached.t26 = i + 1;
    }
    return { ...reached, favor: state.characters[NAME].dims.好感, trust: state.characters[NAME].dims.信任, maxUp, maxDown };
}

const avg = (list, key) => {
    const v = list.map((x) => (x[key] === null ? FLOORS + 1 : x[key]));
    return v.reduce((a, b) => a + b, 0) / v.length;
};

function summarize(traitNames) {
    const rs = Array.from({ length: SEEDS }, (_, i) => run(traitNames, 1000 + i));
    return { f26: avg(rs, 'f26'), f51: avg(rs, 'f51'), t26: avg(rs, 't26'), favor: avg(rs, 'favor'), maxUp: Math.max(...rs.map((r) => r.maxUp)), maxDown: Math.min(...rs.map((r) => r.maxDown)) };
}

const base = summarize([]);
// [特质, 型, 看哪一项]：加成型期望少 25%–45%，减弱型期望多 40%–80%。
const CASES = [
    ['恋爱脑', 'boost', 'f51'], ['温柔疏离', 'boost', 'f51'], ['傻白甜', 'boost', 't26'], ['犬系', 'boost', 't26'], ['撒娇精', 'boost', 't26'],
    ['慢热', 'weak', 'f51'], ['蛇系', 'weak', 'f51'], ['猫系', 'weak', 'f51'], ['疑心病', 'weak', 't26'], ['傲娇', 'weak', 'f26'], ['高岭之花', 'weak', 'f51'],
];
console.log(`无特质：好感 26 平均第 ${base.f26.toFixed(1)} 楼，51 平均第 ${base.f51.toFixed(1)} 楼，信任 26 平均第 ${base.t26.toFixed(1)} 楼，30 楼末好感 ${base.favor.toFixed(1)}；单楼最大上升 ${base.maxUp}、最大下降 ${base.maxDown}`);
let bad = 0;
for (const [name, kind, key] of CASES) {
    const s = summarize([name]);
    const ratio = s[key] / base[key];
    const pct = (ratio - 1) * 100;
    const ok = kind === 'boost' ? pct <= -25 && pct >= -45 : pct >= 40 && pct <= 80;
    const capUp = s.maxUp <= base.maxUp * 2 + 0.001;
    if (!ok || !capUp) bad += 1;
    console.log(`${name.padEnd(6)} ${kind === 'boost' ? '加成' : '减弱'} ${key} 平均第 ${s[key].toFixed(1)} 楼（${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%）${ok ? '达标' : '超出范围'}；单楼最大上升 ${s.maxUp}（无特质 ${base.maxUp}，${capUp ? '未超 2 倍' : '超 2 倍'}）、最大下降 ${s.maxDown}`);
}

// 恋爱脑重大失望的下降保护：好感 60 时一次「失望 重大」不超过 −30。
{
    const random = mulberry32(1);
    const catalog = catalogWith(['恋爱脑']);
    const c = createCharacter(1, { nsfw: true });
    const state = { ...createStatsState(), characters: { [NAME]: { ...c, dims: { ...c.dims, 好感: 60 } } } };
    const r = settleFloorText(state, `[igs-stat:favor|${NAME}|失望|重大]`, { random, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: catalog.traits });
    const drop = 60 - r.state.characters[NAME].dims.好感;
    console.log(`恋爱脑 重大失望：好感 60 → ${r.state.characters[NAME].dims.好感}（下降 ${drop}，保护值 30，${drop <= 30 ? '达标' : '超出'}）`);
    if (drop > 30) bad += 1;
}

// 脆弱：30 楼内「压力上升 大」进入极限（压力满 100 且此前低于 70）的次数，超过 2 次则需把「大」档倍率降为 1.5。
{
    let burstTotal = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
        const random = mulberry32(5000 + seed);
        const catalog = catalogWith(['脆弱'], '主角');
        let state = createStatsState();
        let bursts = 0;
        for (let i = 0; i < FLOORS; i += 1) {
            const text = i % 6 === 5 ? '[igs-stat:stress|上升|大]' : i % 2 === 1 ? '[igs-stat:stress|下降|大]' : '[igs-stat:stress|上升|中]';
            const prev = state.protagonist.bars.stress;
            const r = settleFloorText(state, text + (i % 3 === 2 ? '[igs-stat:sleep]' : ''), { random, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, traits: catalog.traits });
            state = r.state;
            if (prev < 70 && state.protagonist.bars.stress >= 100) bursts += 1;
        }
        burstTotal += bursts;
    }
    const mean = burstTotal / SEEDS;
    console.log(`脆弱 前 30 楼「大」档冲顶平均 ${mean.toFixed(2)} 次（>2 次才需降为 ×1.5，${mean > 2 ? '需调' : '无需调'}）`);
    if (mean > 2) bad += 1;
}
console.log(bad ? `有 ${bad} 项超出范围` : '全部达标');
process.exitCode = bad ? 1 : 0;
