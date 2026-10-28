import { scanCombatTags } from '../../scene/combat-directives.js';

// 成长演出的纯模型：只读账本已入库的成长事件，按「楼层 + swipe + 本页标签」挑出本页要播的条目；不操作 DOM、不写表。
export const GROWTH_FX_PAGE_MAX = 3;
// equip / item 在副 LLM 生成前作为「整理中」显示；unequip 直接落账，不播成长演出。
const GROWTH_KINDS = new Set(['exp', 'learn', 'upgrade', 'class', 'equip', 'item']);
const KIND_RANK = Object.freeze({ level: 0, class: 1, learn: 2, upgrade: 3, exp: 4, pending: 5 });

const tagKey = (tagHash, occurrence) => `${tagHash}#${occurrence}`;

// 本楼成长标签按页归位：与演出标签同规则，标签偏移落在 (上一页偏移, 本页偏移] 内即归本页；
// 落在最后一页偏移之后（常见于正文末尾的成长标签）归最后一个有效页。offsets 为各页的 fxOffset；偏移无效（-1）的页不收标签。
export function growthTagsByPage(source, offsets) {
    const list = Array.isArray(offsets) ? offsets : [];
    const pages = list.map(() => new Set());
    const tags = scanCombatTags(String(source || '')).filter((t) => GROWTH_KINDS.has(t.kind));
    let last = -1;
    for (let i = 0; i < list.length; i += 1) if (Number.isFinite(Number(list[i])) && Number(list[i]) >= 0) last = i;
    for (const tag of tags) {
        let prev = -1;
        let placed = false;
        for (let i = 0; i < list.length; i += 1) {
            const at = Number(list[i]);
            if (Number.isFinite(at) && at >= 0) {
                if (tag.index > prev && tag.index <= at) { pages[i].add(tagKey(tag.tagHash, tag.occurrence)); placed = true; break; }
                prev = at;
            }
        }
        if (!placed && last >= 0) pages[last].add(tagKey(tag.tagHash, tag.occurrence));
    }
    return pages;
}

export function growthFxIdentity({ chatId, messageId, swipeId, page } = {}) {
    return [chatId, messageId, Number(swipeId) || 0, page].map((v) => String(v == null ? '' : v)).join('|');
}

// growth：effectiveState().growth；pending：扫描得到的待生成项（learn / upgrade / class，尚未入库）。
// 同一角色本页 EXP 合并为一条；升级跨过的等级单列一条；超出上限的只计数。
export function planGrowthFx({ growth, pending, messageId, swipeId = 0, keys, identity } = {}) {
    const empty = { items: [], overflow: 0, identity: null };
    const page = keys instanceof Set ? keys : new Set();
    if (!page.size || !Number.isInteger(messageId)) return empty;
    const onPage = (anchor) => anchor && anchor.messageId === messageId && (Number(anchor.swipeId) || 0) === (Number(swipeId) || 0)
        && page.has(tagKey(anchor.tagHash, anchor.occurrence));
    const items = [];
    const exp = new Map();
    for (const g of Array.isArray(growth) ? growth : []) {
        if (!onPage(g.anchor)) continue;
        if (g.type === 'exp') {
            const prev = exp.get(g.character);
            if (prev) { prev.amount += g.amount; prev.ids.push(g.id); prev.levelAfter = g.levelAfter; prev.asiPoints += g.asiPoints || 0; }
            else exp.set(g.character, { kind: 'exp', ids: [g.id], character: g.character, name: g.characterName, amount: g.amount, levelBefore: g.levelBefore, levelAfter: g.levelAfter, asiPoints: g.asiPoints || 0 });
        } else items.push({ kind: g.type, ids: [g.id], character: g.character, name: g.characterName, skill: g.name });
    }
    for (const e of exp.values()) {
        items.push({ kind: 'exp', ids: e.ids, character: e.character, name: e.name, amount: e.amount });
        // 主角跨过属性提升等级时升级条目带 asiPoints；没有时条目形状与旧版一致。
        if (e.levelAfter > e.levelBefore) items.push({ kind: 'level', ids: e.ids.map((id) => `level|${id}`), character: e.character, name: e.name, level: e.levelAfter, ...(e.asiPoints ? { asiPoints: e.asiPoints } : {}) });
    }
    for (const p of Array.isArray(pending) ? pending : []) {
        if (!onPage(p.anchor)) continue;
        items.push({ kind: 'pending', ids: [`pending|${p.kind}|${p.anchor.tagHash}|${p.anchor.occurrence}`], name: p.character || '', skill: p.skill || p.className || p.name || '' });
    }
    if (!items.length) return empty;
    items.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
    return { items: items.slice(0, GROWTH_FX_PAGE_MAX), overflow: Math.max(0, items.length - GROWTH_FX_PAGE_MAX), identity: identity ? { ...identity } : null };
}

const KIND_TEXT = Object.freeze({ learn: '习得', upgrade: '精进', class: '转职' });

export function growthItemText(item) {
    if (item.kind === 'exp') return { cap: 'EXP', line: `${item.name} +${item.amount}` };
    if (item.kind === 'level') return { cap: '升级', line: `${item.name} Lv${item.level}${item.asiPoints ? ` · 属性提升 +${item.asiPoints}` : ''}` };
    if (item.kind === 'pending') return { cap: '整理中', line: `${item.name}${item.skill ? ` · ${item.skill}` : ''}` };
    return { cap: KIND_TEXT[item.kind] || item.kind, line: `${item.name}${item.skill ? ` · ${item.skill}` : ''}` };
}
