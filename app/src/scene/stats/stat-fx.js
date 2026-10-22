// 数值系统演出数据（§10、P5）：从一楼的结算变化里取出好感飘字、成长掷骰结果与吃醋信号。
// 纯函数，只产出数据；播放由 visual 层的现有演出（数值提示堆叠栏、fx-result、修罗场）负责。

const FAVOR_SOURCES = new Set(['tag', 'battle']);

// 好感飘字：显示阶段名时只出心形，不出数字（§10）。同一角色一楼合并成一条。
export function favorToasts(changes, { hudLabel = 'stage' } = {}) {
    const byTarget = new Map();
    for (const c of changes || []) {
        if (!c || c.key !== '好感' || !FAVOR_SOURCES.has(c.source)) continue;
        const delta = (Number(c.to) || 0) - (Number(c.from) || 0);
        if (!delta) continue;
        byTarget.set(c.target, (byTarget.get(c.target) || 0) + delta);
    }
    return [...byTarget].filter(([, delta]) => delta).map(([target, delta]) => ({
        target,
        delta,
        up: delta > 0,
        text: hudLabel === 'stage' ? (delta > 0 ? '♥' : '♡') : `${delta > 0 ? '♥ +' : '♡ '}${delta}`,
    }));
}

// 成长掷骰结果：日结算里通过的技能（§6）。交给 fx-result 作「成长」卡片。
export function growthResults(changes) {
    return (changes || [])
        .filter((c) => c && c.source === 'daily' && c.note === '成长')
        .map((c) => ({ skill: c.key, from: c.from, to: c.to, gain: c.to - c.from }));
}

// 吃醋信号：只把扣过分的吃醋标签传给修罗场（§5.3）；是否算「当过对象」由修罗场现有规则判断。
export function jealousySignals(changes) {
    const out = [];
    for (const c of changes || []) {
        if (c && c.source === 'tag' && c.key === '好感' && c.note === '吃醋' && c.to < c.from && !out.includes(c.target)) out.push(c.target);
    }
    return out;
}

// 一楼的演出汇总；没有任何内容时返回 null，调用方直接跳过。
export function statsFxOf(entry, opts = {}) {
    const changes = entry && entry.changes;
    const toasts = favorToasts(changes, opts);
    const growth = growthResults(changes);
    const jealous = jealousySignals(changes);
    const events = (entry && entry.meta && entry.meta.events) || [];
    const battle = events.find((e) => e && e.kind === 'battle') || null;
    if (!toasts.length && !growth.length && !jealous.length && !battle) return null;
    return { toasts, growth, jealous, battle };
}

// 轻量提示文案（§10：不弹窗、不挡画面）：成长与战斗结果各一行；好感另走状态栏「数值提示」，这里不重复。
export function statsNoticeLines(fx) {
    if (!fx) return [];
    const lines = [];
    for (const g of fx.growth || []) lines.push(`${g.skill}成长 +${g.gain}（${g.from}→${g.to}）`);
    if (fx.battle && fx.battle.outcome) lines.push(`战斗结果：${fx.battle.outcome}`);
    return lines;
}
