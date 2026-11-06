// 数值系统演出数据（§10、P5）：从一楼的结算变化里取出好感飘字、成长掷骰结果与吃醋信号。
// 纯函数，只产出数据；播放由 visual 层的现有演出（数值提示堆叠栏、fx-result、修罗场）负责。

import { HEART_BURST_NOTE, stageOf } from './stat-favor.js';

const FAVOR_SOURCES = new Set(['tag', 'battle']);

// 好感飘字：显示阶段名时只出心形，不出数字（§10）。同一角色一楼合并成一条。
export function favorToasts(changes, { hudLabel = 'number' } = {}) {
    const byTarget = new Map();
    const bursts = new Set();
    for (const c of changes || []) {
        if (!c || c.key !== '好感' || !FAVOR_SOURCES.has(c.source)) continue;
        const delta = (Number(c.to) || 0) - (Number(c.from) || 0);
        if (!delta) continue;
        byTarget.set(c.target, (byTarget.get(c.target) || 0) + delta);
        if (String(c.note || '').startsWith(HEART_BURST_NOTE)) bursts.add(c.target);
    }
    return [...byTarget].filter(([, delta]) => delta).map(([target, delta]) => ({
        target,
        delta,
        up: delta > 0,
        ...(bursts.has(target) ? { burst: true } : {}),
        text: hudLabel === 'stage' ? (delta > 0 ? '♥' : '♡') : `${delta > 0 ? '♥ +' : '♡ '}${delta}`,
    }));
}

// 成长结果：日结算里通过的技能（§6）与剧情成长标签；NPC 的成长带 target。交给 fx-result 作「成长」卡片。
export function growthResults(changes) {
    return (changes || [])
        .filter((c) => c && (c.source === 'daily' || c.source === 'tag') && c.note === '成长')
        .map((c) => ({ skill: c.key, from: c.from, to: c.to, gain: c.to - c.from, ...(c.target && c.target !== '主角' ? { target: c.target } : {}) }));
}

// 吃醋信号：本楼有吃醋标签即触发，好感或芥蒂任一变动带「吃醋」备注就算（§8）；是否算「当过对象」由修罗场现有规则判断。
// 旧楼的吃醋只扣好感，备注同样是「吃醋」，行为不变。
export function jealousySignals(changes) {
    const out = [];
    for (const c of changes || []) {
        if (c && c.source === 'tag' && (c.key === '好感' || c.key === '芥蒂') && c.note === '吃醋' && !out.includes(c.target)) out.push(c.target);
    }
    return out;
}

// 关系阶段变化（v2 §9.2）：状态栏只给当前说话人飘字，其他角色的阶段跨越在细线里提示一次。
export function stageShifts(changes) {
    const out = [];
    for (const c of changes || []) {
        if (!c || c.key !== '好感' || !FAVOR_SOURCES.has(c.source)) continue;
        const from = stageOf(c.from).name;
        const to = stageOf(c.to).name;
        if (from !== to) out.push({ target: c.target, from, to });
    }
    return out;
}

// 关键事件（突破关口的魅力检定）结果。
function keyEvents(events) {
    return (events || []).filter((e) => e && e.event && e.gate != null).map((e) => ({ target: e.target, event: e.event, success: e.success }));
}

// 一楼的演出汇总；没有任何内容时返回 null，调用方直接跳过。
export function statsFxOf(entry, opts = {}) {
    const changes = entry && entry.changes;
    const toasts = favorToasts(changes, opts);
    const growth = growthResults(changes);
    const jealous = jealousySignals(changes);
    const events = (entry && entry.meta && entry.meta.events) || [];
    const battle = events.find((e) => e && e.kind === 'battle') || null;
    const stages = stageShifts(changes);
    const keys = keyEvents(events);
    if (!toasts.length && !growth.length && !jealous.length && !battle && !stages.length && !keys.length) return null;
    return { toasts, growth, jealous, battle, stages, keys };
}

// 轻量提示文案（§10：不弹窗、不挡画面）：成长、战斗、关键事件、关系阶段变化各一行。
export function statsNoticeLines(fx) {
    if (!fx) return [];
    const lines = [];
    for (const g of fx.growth || []) lines.push(`${g.target ? `${g.target}的` : ''}${g.skill}成长 +${g.gain}（${g.from}→${g.to}）`);
    if (fx.battle && fx.battle.outcome) lines.push(`战斗结果：${fx.battle.outcome}`);
    for (const k of fx.keys || []) lines.push(`${k.target}·${k.event}：${k.success ? '关系更进一步' : '时机未到'}`);
    for (const s of fx.stages || []) lines.push(`${s.target}：${s.from} → ${s.to}`);
    return lines;
}
