// 主角的声望条（STATS_CROWD_IDOL_PLAN 一）：群体对主角的态度，只属于主角，不为群体建档。
// 每个聊天最多开 FAME_BAR_MAX 条，开条时选性质（FAME_KINDS）并起条名；性质决定两端注入文案、每日自然变化与满格、归零时的强制事项。
// 「组合热度」性质（CP 粉）按搭档分别记热度。只对 strengthRev ≥ 2 的楼生效；没开声望的聊天不注入、不结算。
import { clamp } from './stat-state.js';

export const FAME_BAR_MAX = 10;
export const FAME_PAIR_MAX = 8;
export const FAME_NAME_MAX = 8;
export const FAME_STRENGTHS = Object.freeze(['小', '中', '大']);
export const FAME_STEP = Object.freeze({ 小: 2, 中: 5, 大: 10 });
export const FAME_PAIR_KIND = '组合热度';
// 每日自然变化（一天的量）：缓降、每天减少、每天增加、无。
export const FAME_DAILY = Object.freeze({ 缓降: -2, 每天减少: -5, 每天增加: 5, 无: 0 });
// 档位：低于 LOW 为「较低」，高于 HIGH 为「较高」，归零与满格用性质自己的叫法。
const FAME_LOW = 33;
const FAME_HIGH = 66;
const TIER_WORDS = Object.freeze(['较低', '一般', '较高']);

const pair = (fn) => fn;
// watcher：谁在看；zero / full：归零与满格时的叫法；daily：每日自然变化；start：开条初值；
// low / high：偏低、偏高时注入的描写；zeroMandate / fullMandate：刚归零、刚满格时的强制事项。组合热度的文案带搭档名，写成函数。
export const FAME_KINDS = Object.freeze({
    名气: { watcher: '大众', zero: '过气', full: '顶流', daily: '缓降', start: 30,
        low: '知道主角的人不多，出门很少被认出。', high: '主角很有名气，走到哪里都有人认出，关注和邀约不断。',
        zeroMandate: '主角已经过气，写出邀约中断、旁人淡忘的情形', fullMandate: '主角成为顶流，写出被追捧、被围观的场面' },
    名誉: { watcher: '社会', zero: '声名狼藉', full: '德高望重', daily: '无', start: 50,
        low: '主角名声不好，旁人提起时多有非议，不愿与主角来往。', high: '主角名声很好，旁人敬重主角，说话有分量。',
        zeroMandate: '主角声名狼藉，写出旁人当面冷遇、避之不及的情形', fullMandate: '主角德高望重，写出众人敬重、登门求助的情形' },
    恶名: { watcher: '敌人与平民', zero: '无人畏惧', full: '闻风丧胆', daily: '无', start: 20,
        low: '主角的名号毫无威慑力，敌人不把主角放在眼里。', high: '主角恶名在外，敌人忌惮，平民见了绕道走。',
        zeroMandate: '主角已无人畏惧，写出敌人轻视、当面挑衅的情形', fullMandate: '主角令人闻风丧胆，写出敌人望风而逃、平民噤若寒蝉的情形' },
    信仰: { watcher: '信众', zero: '信众离散', full: '被奉为神使', daily: '无', start: 30,
        low: '信众稀少，信仰动摇，有人开始怀疑主角。', high: '信众虔诚，对主角的话深信不疑。',
        zeroMandate: '信众离散，写出信众离去、圣所冷清的情形', fullMandate: '主角被奉为神使，写出信众跪拜、争相追随的场面' },
    香火: { watcher: '信众', zero: '神力衰竭', full: '神力鼎盛', daily: '每天减少', start: 50,
        low: '香火稀薄，主角神力不济，施展神通十分吃力。', high: '香火旺盛，主角神力充沛。',
        zeroMandate: '主角神力衰竭，写出身形虚弱、渐渐消散的迹象', fullMandate: '主角神力鼎盛，写出神迹显现、信众惊叹的场面' },
    宠爱: { watcher: '君王、主人或金主', zero: '失宠', full: '专宠', daily: '缓降', start: 30,
        low: '主角不受宠，对方态度冷淡，旁人也敢怠慢主角。', high: '主角深受宠爱，对方有求必应，旁人不敢怠慢。',
        zeroMandate: '主角失宠，写出对方冷落、旁人落井下石的情形', fullMandate: '主角受到专宠，写出对方偏爱、旁人眼红的情形' },
    通缉: { watcher: '官府与追兵', zero: '安全', full: '天罗地网', daily: '缓降', start: 10,
        low: '追查并不紧，主角行动尚算自由。', high: '追捕严密，主角处处受到盘查，只能躲藏行事。',
        zeroMandate: '追捕已经停止，写出主角终于摆脱追兵的情形', fullMandate: '主角陷入天罗地网，写出关卡封锁、追兵围捕的场面' },
    契约债务: { watcher: '契约方', zero: '契约结清', full: '被收走灵魂', daily: '每天增加', start: 20,
        low: '契约债务不多，契约方暂时没有催讨。', high: '契约债务沉重，契约方频频催讨，期限迫在眉睫。',
        zeroMandate: '契约已经结清，写出契约印记消退、契约方离去的情形', fullMandate: '契约到期，写出契约方前来收走主角灵魂的情节' },
    民心: { watcher: '子民', zero: '被推翻', full: '万民归心', daily: '无', start: 50,
        low: '民心不稳，子民怨声载道，暗中有人煽动。', high: '民心归附，子民拥戴主角。',
        zeroMandate: '民心尽失，写出子民起义、主角被推翻的情节', fullMandate: '主角万民归心，写出子民夹道欢迎、自发拥护的场面' },
    粉丝狂热: { watcher: '私生饭与狂信徒', zero: '理智追随', full: '暴走', daily: '缓降', start: 20,
        low: '追随者大多理智，与主角保持应有的距离。', high: '追随者越来越狂热，有人跟踪、守候，不顾主角的意愿。',
        zeroMandate: '追随者恢复理智，写出狂热退去、不再纠缠的情形', fullMandate: '追随者暴走，写出跟踪、围堵乃至献祭的极端举动' },
    [FAME_PAIR_KIND]: { watcher: 'CP粉', zero: '无人问津', full: '国民CP', daily: '缓降', start: 20, pair: true,
        low: pair((p) => `主角与${p}的组合少有人提起。`), high: pair((p) => `主角与${p}的组合人气很高，两人同框就会引来热议。`),
        zeroMandate: pair((p) => `主角与${p}的组合已无人再提，写出热度退去的情形`), fullMandate: pair((p) => `主角与${p}成为国民CP，写出同框引发轰动的场面`) },
});
export const FAME_KIND_NAMES = Object.freeze(Object.keys(FAME_KINDS));

const textOf = (value, partner) => (typeof value === 'function' ? value(partner) : value);

// 条名：1–8 字，不含数字与分隔符。
export function validFameName(raw) {
    const text = String(raw ?? '').trim();
    return text && Array.from(text).length <= FAME_NAME_MAX && !/[0-9０-９|｜:：\[\]【】{}<>]/.test(text) ? text : null;
}

// 聊天级配置：[{ name, kind }]，最多 FAME_BAR_MAX 条，条名不重复，性质不在表里的丢弃。
export function sanitizeFameBars(raw) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const name = item && validFameName(item.name);
        if (!name || !Object.hasOwn(FAME_KINDS, item.kind) || out.some((b) => b.name === name)) continue;
        out.push({ name, kind: item.kind });
        if (out.length >= FAME_BAR_MAX) break;
    }
    return out;
}

export const fameOn = (bars) => Array.isArray(bars) && bars.length > 0;
const isPairBar = (bar) => Boolean(bar && FAME_KINDS[bar.kind] && FAME_KINDS[bar.kind].pair);

// 当前值：没记录过的条按性质初值；组合热度返回 { 搭档: 值 }。
export function fameValue(state, bar) {
    const own = state && state.protagonist && state.protagonist.fame;
    const raw = own && typeof own === 'object' ? own[bar.name] : undefined;
    if (isPairBar(bar)) return raw && typeof raw === 'object' ? { ...raw } : {};
    const v = Number(raw);
    return Number.isFinite(v) ? clamp(Math.round(v), 0, 100) : FAME_KINDS[bar.kind].start;
}

export function fameTier(kind, value) {
    const preset = FAME_KINDS[kind];
    const v = Math.round(Number(value) || 0);
    if (v <= 0) return preset.zero;
    if (v >= 100) return preset.full;
    return TIER_WORDS[v <= FAME_LOW ? 0 : v < FAME_HIGH ? 1 : 2];
}

function withFame(state, fame) {
    return { ...state, protagonist: { ...state.protagonist, fame } };
}

// 组合热度按热度从高到低排；同热度按搭档名。
export function famePairs(state, bar) {
    return Object.entries(fameValue(state, bar)).map(([partner, v]) => ({ partner, value: clamp(Math.round(Number(v) || 0), 0, 100) }))
        .sort((a, b) => b.value - a.value || (a.partner < b.partner ? -1 : a.partner > b.partner ? 1 : 0));
}

// 本楼标签结算：条名省略时只开一条才认；同条（同一对）一楼只留强度最大的一条。resolve 把搭档名归到已登记角色。
// 返回新状态；变动写进 changes，丢弃的记 diagnostics。
export function settleFameTags(state, directives, bars, { changes = [], diagnostics = [], resolve = null } = {}) {
    if (!fameOn(bars)) return state;
    const slot = new Map();
    for (const d of directives) {
        if (d.kind !== 'fame') continue;
        const bar = d.bar ? bars.find((b) => b.name === d.bar) : bars.length === 1 ? bars[0] : null;
        if (!bar) { diagnostics.push({ code: 'stat-fame-unknown', name: d.bar || '' }); continue; }
        let partner = null;
        if (isPairBar(bar)) {
            if (!d.partner) { diagnostics.push({ code: 'stat-fame-no-partner', name: bar.name }); continue; }
            partner = (typeof resolve === 'function' && resolve(d.partner)) || d.partner;
        }
        const key = `${bar.name}|${partner || ''}`;
        const step = FAME_STEP[d.strength || '小'] * (d.value === '下降' ? -1 : 1);
        const cur = slot.get(key);
        if (!cur || Math.abs(step) > Math.abs(cur.step)) slot.set(key, { bar, partner, step, note: `${d.value}${d.strength || '小'}` });
    }
    let fame = state.protagonist.fame && typeof state.protagonist.fame === 'object' ? state.protagonist.fame : {};
    const start = fame;
    for (const { bar, partner, step, note } of slot.values()) {
        if (partner) {
            const pairs = fameValue({ protagonist: { fame } }, bar);
            if (!Object.hasOwn(pairs, partner) && Object.keys(pairs).length >= FAME_PAIR_MAX) { diagnostics.push({ code: 'stat-fame-pair-max', name: partner }); continue; }
            const from = Object.hasOwn(pairs, partner) ? clamp(Math.round(Number(pairs[partner]) || 0), 0, 100) : FAME_KINDS[bar.kind].start;
            const to = clamp(from + step, 0, 100);
            changes.push({ source: 'tag', target: '主角', key: `${bar.name}·${partner}`, from, to, note });
            fame = { ...fame, [bar.name]: { ...pairs, [partner]: to } };
            continue;
        }
        const from = fameValue({ protagonist: { fame } }, bar);
        const to = clamp(from + step, 0, 100);
        if (to !== from) changes.push({ source: 'tag', target: '主角', key: bar.name, from, to, note });
        fame = { ...fame, [bar.name]: to };
    }
    return fame === start ? state : withFame(state, fame);
}

// 每日自然变化：days 天一次算完；组合热度每一对各自变化。
export function driftFame(state, bars, days = 1, changes = [], note = '日结算') {
    if (!fameOn(bars) || !(days > 0)) return state;
    let fame = state.protagonist.fame && typeof state.protagonist.fame === 'object' ? state.protagonist.fame : {};
    const start = fame;
    for (const bar of bars) {
        const delta = FAME_DAILY[FAME_KINDS[bar.kind].daily] * days;
        if (!delta) continue;
        if (isPairBar(bar)) {
            const pairs = fameValue({ protagonist: { fame } }, bar);
            let changed = false;
            for (const [partner, raw] of Object.entries(pairs)) {
                const from = clamp(Math.round(Number(raw) || 0), 0, 100);
                const to = clamp(from + delta, 0, 100);
                if (to === from) continue;
                changes.push({ source: 'daily', target: '主角', key: `${bar.name}·${partner}`, from, to, note });
                pairs[partner] = to;
                changed = true;
            }
            if (changed) fame = { ...fame, [bar.name]: pairs };
            continue;
        }
        const from = fameValue({ protagonist: { fame } }, bar);
        const to = clamp(from + delta, 0, 100);
        if (to === from) continue;
        changes.push({ source: 'daily', target: '主角', key: bar.name, from, to, note });
        fame = { ...fame, [bar.name]: to };
    }
    return fame === start ? state : withFame(state, fame);
}

// 本楼前后对比：刚归零或刚满格的条（组合热度按对）给出强制事项文案。
export function fameMandates(before, after, bars) {
    const out = [];
    if (!fameOn(bars)) return out;
    for (const bar of bars) {
        const preset = FAME_KINDS[bar.kind];
        const hit = (from, to, partner) => {
            if (to <= 0 && from > 0) out.push(textOf(preset.zeroMandate, partner));
            else if (to >= 100 && from < 100) out.push(textOf(preset.fullMandate, partner));
        };
        if (isPairBar(bar)) {
            const was = fameValue(before, bar);
            for (const [partner, v] of Object.entries(fameValue(after, bar))) hit(Object.hasOwn(was, partner) ? Number(was[partner]) || 0 : preset.start, Number(v) || 0, partner);
        } else hit(fameValue(before, bar), fameValue(after, bar), null);
    }
    return out;
}

// 注入用的各条描写：普通条一行；组合热度只写热度最高的两对与本楼在场搭档那一对。
export function fameLines(state, bars, { present = [] } = {}) {
    if (!fameOn(bars)) return [];
    const lines = [];
    const band = (preset, v, partner) => (v <= FAME_LOW ? textOf(preset.low, partner) : v >= FAME_HIGH ? textOf(preset.high, partner) : '');
    for (const bar of bars) {
        const preset = FAME_KINDS[bar.kind];
        if (isPairBar(bar)) {
            const pairs = famePairs(state, bar);
            const shown = pairs.slice(0, 2);
            for (const p of pairs.slice(2)) if (present.includes(p.partner)) shown.push(p);
            if (!shown.length) continue;
            lines.push(`${bar.name}（${preset.watcher}）：${shown.map((p) => `与${p.partner}的组合${fameTier(bar.kind, p.value)}。${band(preset, p.value, p.partner)}`).join('')}`);
            continue;
        }
        const v = fameValue(state, bar);
        lines.push(`${bar.name}（${preset.watcher}）：${fameTier(bar.kind, v)}。${band(preset, v, null)}`);
    }
    return lines;
}

// 标签说明行：开了声望才出现；只开一条时条名可省；有组合热度条时追加按搭档写的一行。
export function fameTagLines(bars) {
    if (!fameOn(bars)) return [];
    const plain = bars.filter((b) => !isPairBar(b));
    const pairBars = bars.filter(isPairBar);
    const lines = [];
    if (plain.length) {
        const names = plain.map((b) => b.name).join('/');
        lines.push(`[igs-stat:fame|${names}|上升/下降|${FAME_STRENGTHS.join('/')}]（群体对主角的看法有变化时写，如演出成功、丑闻曝光；${bars.length === 1 ? '条名可省，' : ''}强度省略时按小）`);
    }
    for (const bar of pairBars) {
        lines.push(`[igs-stat:fame|${bar.name}|搭档名|上升/下降|${FAME_STRENGTHS.join('/')}]（主角与某位搭档的组合热度有变化时写；多位搭档的热度变化不同时，各写一条）`);
    }
    return lines;
}

// 状态栏：只开声望时一行汇总（各条名称与档位），开细项后每条、组合热度每一对各自成条。档位不写数字。
export function fameHudMetrics(state, bars, { detail = false } = {}) {
    if (!fameOn(bars)) return [];
    const rows = [];
    for (const bar of bars) {
        if (isPairBar(bar)) {
            const pairs = famePairs(state, bar);
            if (detail) for (const p of pairs) rows.push({ label: `${bar.name}·${p.partner}`, value: p.value, tier: fameTier(bar.kind, p.value) });
            else if (pairs.length) rows.push({ label: bar.name, value: pairs[0].value, tier: fameTier(bar.kind, pairs[0].value) });
            continue;
        }
        const v = fameValue(state, bar);
        rows.push({ label: bar.name, value: v, tier: fameTier(bar.kind, v) });
    }
    if (!rows.length) return [];
    const metric = (label, percent, display) => ({ label, percent, display, colorKey: 'slot-6', sourceUid: 'igs-stats' });
    if (detail) return rows.map((r) => metric(r.label, r.value, r.tier));
    const avg = Math.round(rows.reduce((sum, r) => sum + r.value, 0) / rows.length);
    return [metric('声望', avg, rows.map((r) => `${r.label}${r.tier}`).join(' · '))];
}

// 设置页「我的角色」用：每条的名称、性质、档位；组合热度附各对。
export function fameRows(state, bars) {
    return (fameOn(bars) ? bars : []).map((bar) => isPairBar(bar)
        ? { name: bar.name, kind: bar.kind, pairs: famePairs(state, bar).map((p) => ({ partner: p.partner, tier: fameTier(bar.kind, p.value) })) }
        : { name: bar.name, kind: bar.kind, tier: fameTier(bar.kind, fameValue(state, bar)) });
}
