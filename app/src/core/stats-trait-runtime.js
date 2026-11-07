// 特质接线的纯逻辑（供 stats-runtime.js 调用，不碰宿主与存储）：合成刷新、成就授予、通知文案、图鉴输入。
// 所有函数不原地修改传入的 catalog，只复制被改动的路径。
import { ACHIEVEMENT_DEFS, RELATION_STATE_DEFS, TRAIT_DEFS, applyTraitChange, getTraitByName, getTraitDef, isComboKey, listTraits } from '../scene/stats/stat-traits.js';
import { TRAIT_RECIPES, comboNoticeText, diffCombos, relationStateNames, resolveCombos } from '../scene/stats/stat-trait-recipes.js';
import { normalizeCodex, syncCodex } from '../scene/stats/stat-trait-codex.js';
import { ACHIEVEMENT_GRANTS, checkAchievements, updateAchievementCounters } from '../scene/stats/stat-trait-rules-body.js';
import { RICH_FROM } from '../scene/stats/stat-trait-rules-extreme.js';

const HERO = '主角';
const STATE_NAMES = new Set(RELATION_STATE_DEFS.map((d) => d.name));
const sentence = (text) => { const t = String(text || '').trim(); return !t || /[。！？]$/.test(t) ? t : `${t}。`; };

// 单条特质通知（书面语）：获得 / 失去 / 替换。
export function traitNoticeText(n) {
    const name = (id) => { const d = getTraitDef(id); return d ? d.name : String(id); };
    const who = n.charName === HERO ? '主角' : n.charName;
    if (n.type === 'replace') return `${who}获得特质「${name(n.id)}」，替换了「${name(n.replacedId)}」。`;
    if (n.type === 'lose') return `${who}失去特质「${name(n.id)}」。`;
    const d = getTraitDef(n.id);
    return `${who}获得特质「${name(n.id)}」${d && d.desc ? `：${sentence(d.desc)}` : '。'}`;
}

// 某角色当前的特质名与关系状态名（合成占位不算特质）。
function partsOf(catalog, state, name) {
    const ids = listTraits(catalog, name).filter((t) => !isComboKey(t.id) && t.src !== 'achieve').map((t) => t.id);
    const rels = state && state.characters && state.characters[name] && state.characters[name].relStates;
    return { ids, states: relationStateNames(rels) };
}

const nameOfId = (id) => { const d = getTraitDef(id); return d ? d.name : id; };

// 重算某角色的合成：成立的写成 combo:名 占位（存 parts），不再成立的摘掉。prev 为变化前的 { catalog, state }（给合成 / 拆分通知用）。
// 返回 { catalog, notices }，notices 为 diffCombos 的 combo / split 条目。
export function refreshCombos(catalog, state, name, prev = null) {
    const { ids, states } = partsOf(catalog, state, name);
    const names = ids.map(nameOfId);
    const resolved = resolveCombos(names, { defs: TRAIT_DEFS, states, protagonist: name === HERO });
    const want = new Map(resolved.combos.map((c) => [`combo:${c.name}`, c]));
    const own = (catalog.traits && catalog.traits[name]) || {};
    const have = Object.keys(own).filter(isComboKey);
    if (have.length === want.size && have.every((k) => want.has(k))) return { catalog, notices: [] };
    const nextOwn = Object.fromEntries(Object.entries(own).filter(([k]) => !isComboKey(k)));
    for (const [key, c] of want) {
        const parts = c.parts.map((p) => (getTraitByName(p) ? getTraitByName(p).id : p)).filter((p) => getTraitDef(p) || STATE_NAMES.has(p));
        nextOwn[key] = { on: true, src: 'auto', parts };
    }
    const traits = { ...(catalog.traits || {}) };
    if (Object.keys(nextOwn).length) traits[name] = nextOwn; else delete traits[name];
    const old = prev ? partsOf(prev.catalog, prev.state, name) : { ids: [], states: [] };
    const notices = diffCombos({ traits: old.ids.map(nameOfId), states: old.states }, { traits: names, states }, { charName: name, defs: TRAIT_DEFS, protagonist: name === HERO });
    return { catalog: { ...catalog, traits }, notices };
}

export const comboNotices = (list) => list.map(comboNoticeText);

// 成就：推进计数、授予新成就（含衔接特质）。state 为本楼结算后；entry 为楼层记录（取 flags 与前后压力转换）。
// 返回 { catalog, notices: [traitNotice...] }；计数写在 catalog.counters（新对象）。
export function achievementPass(catalog, state, entry, romanceSeen = []) {
    const flags = (entry && entry.meta && entry.meta.flags) || {};
    let counters = updateAchievementCounters(catalog.counters, state, { flags, romanceSeen });
    // 富裕：金钱首次达到「富裕」线；劫后余生：压力转换「崩溃」之后恢复为普通压力。
    if ((Number(state.protagonist.bars.money) || 0) >= RICH_FROM) counters = { ...counters, rich: Math.max(1, Number(counters.rich) || 0) };
    const was = entry && entry.before && entry.before.protagonist && entry.before.protagonist.bars && entry.before.protagonist.bars.strain;
    const now = state.protagonist.bars.strain;
    if (was && was.type === '崩溃' && !now) counters = { ...counters, brokenRecovered: (Number(counters.brokenRecovered) || 0) + 1 };
    let next = JSON.stringify(counters) === JSON.stringify(catalog.counters) ? catalog : { ...catalog, counters };
    const notices = [];
    const owned = listTraits(next, HERO).filter((t) => t.src === 'achieve').map((t) => t.id);
    for (const id of checkAchievements(next.counters, owned)) {
        const res = applyTraitChange(state, next, HERO, id, true, 'achieve');
        if (!res.notices.length) continue;
        next = res.catalog;
        notices.push(...res.notices);
        const grant = ACHIEVEMENT_GRANTS[id];
        if (grant && grant.gain) {
            const gained = getTraitByName(grant.gain);
            if (gained) {
                const g = applyTraitChange(state, next, HERO, gained.id, true, 'story');
                next = g.catalog;
                notices.push(...g.notices);
            }
        }
    }
    return { catalog: next, notices };
}

// 图鉴同步输入：当前聊天各角色 [{ charName, traits: id[], states, protagonist }]；成就也一并点亮。
export function charsTraitsOf(catalog, state) {
    return Object.keys(catalog.traits || {}).map((name) => {
        const own = listTraits(catalog, name).filter((t) => !isComboKey(t.id));
        const { states } = partsOf(catalog, state, name);
        return { charName: name, traits: own.map((t) => t.id), states, protagonist: name === HERO };
    });
}

export const CODEX_DEFS = Object.freeze([...TRAIT_DEFS, ...ACHIEVEMENT_DEFS]);

// ---- 全局图鉴存储（跨聊天、跨角色卡，存 localStorage 一个键，写法同角色卡沿用库）----
export const TRAIT_CODEX_KEY = 'igs-trait-codex-v1';

export function createTraitCodexStore(getStorage, write) {
    const storage = () => { try { return getStorage(); } catch (error) { return null; } };
    let cache = null;
    return {
        get() {
            if (cache) return cache;
            const s = storage();
            let raw = null;
            try { raw = s ? JSON.parse(s.getItem(TRAIT_CODEX_KEY) || 'null') : null; } catch (error) { raw = null; }
            cache = normalizeCodex(raw);
            return cache;
        },
        set(next) {
            cache = normalizeCodex(next);
            const s = storage();
            if (!s) return { ok: false, reason: 'trait-codex-unavailable' };
            const text = JSON.stringify(cache);
            try {
                if (typeof write === 'function') return write(s, TRAIT_CODEX_KEY, text);
                s.setItem(TRAIT_CODEX_KEY, text);
                return { ok: true };
            } catch (error) { return { ok: false, reason: 'trait-codex-write-failed' }; }
        },
    };
}

// 点亮：把当前各角色的特质与合成写进图鉴。返回新存储或 null（没有新点亮）。nsfwOn 关闭时不点亮 NSFW 项。
export function lightCodex(store, catalog, state, { cardName = '', nsfwOn = false } = {}) {
    const defs = nsfwOn ? CODEX_DEFS : CODEX_DEFS.filter((d) => !d.nsfw);
    const chars = charsTraitsOf(catalog, state).map((c) => ({ ...c, traits: c.traits.filter((id) => defs.some((d) => d.id === id)) }));
    const res = syncCodex(store, chars, defs, TRAIT_RECIPES.filter((r) => nsfwOn || !r.nsfw), { cardName });
    return res.newTraits.length || res.newCombos.length ? res.store : null;
}
