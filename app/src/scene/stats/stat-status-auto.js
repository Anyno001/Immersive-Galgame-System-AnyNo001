// E1：系统自动挂摘的状态（src:'system'）与状态数值效果读取。纯函数，输入的 cat 只读。
// 调用点：stat-settle.js 在本楼状态标签结算之后调用 autoStatuses；效果由 statusScale 供结算读取。
import { PROTAGONIST } from './stat-engine.js';
import { STATUS_EFFECT } from './stat-status-defs.js';
import { applyStatusChange, statusesOf } from './stat-status.js';
import { getTraitDef, hasTrait, isFoodGift, traitCatalogOf } from './stat-traits.js';

// 阈值（写在常量里，改这里即可）。
export const MOOD_STRESS_MAX = 25;     // 心情很好：压力不高于此值
export const BROKE_BELOW = 20;         // 囊中羞涩：钱包余额低于此值挂上
export const BROKE_CLEAR = 100;        // 囊中羞涩：余额回到此值以上摘下
export const ADDICT_DAYS = 3;          // 犯瘾：连续未碰天数
const MOOD_EVENTS = ['约会', '告白', '共患难', '交心', '托付', '立誓'];
const DRUNK_WORDS = /喝醉|醉酒|烂醉|酩酊|喝多了|醉倒|醉醺醺/;

// 成瘾特质 → 关键词（按特质名；特质表里插入的三行）。
export const ADDICTIONS = Object.freeze({
    咖啡成瘾: /咖啡|拿铁|美式|摩卡|卡布奇诺/,
    烟瘾: /香烟|抽烟|吸烟|雪茄|烟斗|点了根烟|点燃了烟/,
    甜食控: /甜点|蛋糕|巧克力|冰淇淋|奶茶|点心|糖果|布丁|马卡龙/,
});
export const TOUCH_KEY = (name) => `瘾:${name}`;

// 状态数值效果：同类连乘。kind：'stressUp' 压力上升倍率；'staminaRecover' 过天体力恢复倍率。没有返回 1。
export function statusScale(cat, name, kind) {
    let scale = 1;
    const own = statusesOf(cat, name);
    for (const key of Object.keys(own)) {
        // 抑制剂：发情期、易感期的压力倍率暂停。
        if (kind === 'stressUp' && own.抑制剂 && (key === '发情期' || key === '易感期')) continue;
        const eff = STATUS_EFFECT[key];
        if (eff && eff[0] === kind) scale *= eff[1];
    }
    return scale;
}

const put = (box, name, key, on, opts, changes) => {
    const r = applyStatusChange(box.cat, name, key, { on, src: 'system', ...opts });
    if (r.reason) return false;
    box.cat = r.catalog;
    changes.push(...r.changes);
    return true;
};
const systemOwned = (cat, name, key) => { const e = statusesOf(cat, name)[key]; return Boolean(e) && e.src === 'system' && !e.manualLock; };

// state：本楼结算后的账本状态；box：{ cat }（整体替换）；ctx：{ day, floor, narration, directives, walletExtra, resolve, changes, traitCat }
// 返回 { touch }：成瘾最近接触日更新（交运行时写 counters）。
export function autoStatuses(state, box, ctx = {}) {
    const { day = 0, floor = null, narration = '', directives = [], changes = [] } = ctx;
    const text = String(narration || '');
    const hero = state.protagonist;
    // 醉酒：叙述里出现醉酒词（主角），或把酒送给某角色（该角色）。
    const drinkers = new Set();
    if (DRUNK_WORDS.test(text)) drinkers.add(PROTAGONIST);
    for (const d of directives) if (d.kind === 'gift' && d.target && /酒/.test(String(d.value || ''))) drinkers.add(d.target);
    for (const n of drinkers) if (!statusesOf(box.cat, n).醉酒) put(box, n, '醉酒', true, { day, floor }, changes);
    // 宿醉：醉酒挂上后过了天（挂上日早于当前日）→ 摘醉酒、挂宿醉。
    for (const n of [PROTAGONIST, ...Object.keys(state.characters)]) {
        const e = statusesOf(box.cat, n).醉酒;
        if (!e || drinkers.has(n) || !(Number(e.since) < day)) continue;
        if (e.manualLock) continue;
        put(box, n, '醉酒', false, {}, changes);
        put(box, n, '宿醉', true, { day, floor }, changes);
    }
    // 心情很好：压力低，且本楼有正向好感或约会类事件。
    const good = new Set();
    for (const d of directives) {
        if (d.kind === 'event' && MOOD_EVENTS.includes(d.value)) good.add(d.target || PROTAGONIST);
        if (d.kind === 'favor' && d.target && (d.value === '上升' || ['开心', '感动', '心动'].includes(d.value))) good.add(d.target);
    }
    for (const n of good) {
        const own = n === PROTAGONIST ? hero : state.characters[n];
        const stress = Number(own && own.bars && own.bars.stress);
        if (own && Number.isFinite(stress) && stress <= MOOD_STRESS_MAX && !statusesOf(box.cat, n).心情很好) put(box, n, '心情很好', true, { day, floor }, changes);
    }
    // 囊中羞涩（仅主角有钱包）：低于 BROKE_BELOW 挂上，回到 BROKE_CLEAR 以上摘下（只摘系统挂的）。
    const wallet = (Number(hero.bars.money) || 0) + (Number(ctx.walletExtra) || 0);
    const broke = statusesOf(box.cat, PROTAGONIST).囊中羞涩;
    if (wallet < BROKE_BELOW && !broke) put(box, PROTAGONIST, '囊中羞涩', true, { day, floor }, changes);
    else if (wallet >= BROKE_CLEAR && !ctx.keepBroke && broke && systemOwned(box.cat, PROTAGONIST, '囊中羞涩')) put(box, PROTAGONIST, '囊中羞涩', false, {}, changes);
    // 信物：非食物的礼物送出，收礼者对送礼者挂关系状态「信物」（toward 主角）。
    for (const d of directives) {
        if (d.kind !== 'gift' || !d.target || d.target === PROTAGONIST || isFoodGift(d.value) || /酒/.test(String(d.value || ''))) continue;
        put(box, d.target, '信物', true, { day, floor, toward: PROTAGONIST }, changes);
    }
    // 成瘾：有成瘾特质的角色，叙述碰到对应物品（主角，或叙述里点了名的角色）就记接触日并摘犯瘾；连续 ADDICT_DAYS 天没碰挂犯瘾。
    const touch = {};
    const traitCat = ctx.traitCat || traitCatalogOf(box.cat && box.cat.traits);
    const counters = (box.cat && box.cat.counters) || {};
    for (const n of [PROTAGONIST, ...Object.keys(state.characters)]) {
        for (const [trait, re] of Object.entries(ADDICTIONS)) {
            if (!getTraitDef(trait) || !hasTrait(state, traitCat, n, trait)) continue;
            const key = TOUCH_KEY(n);
            if (key.length > 24) continue;
            const seen = Number.isFinite(Number(counters[key])) && counters[key] !== undefined ? Number(counters[key]) : null;
            const touched = re.test(text) && (n === PROTAGONIST || text.includes(n));
            if (touched || seen === null) touch[key] = day;
            const last = touched || seen === null ? day : seen;
            const has = statusesOf(box.cat, n).犯瘾;
            if (touched) { if (has && systemOwned(box.cat, n, '犯瘾')) put(box, n, '犯瘾', false, {}, changes); }
            else if (day - last >= ADDICT_DAYS && !has) put(box, n, '犯瘾', true, { day, floor }, changes);
        }
    }
    return { touch };
}
