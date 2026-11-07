// 特质图鉴：纯逻辑。全局存储对象由参数传入，不直接碰 localStorage / 文件；
// 所有写入函数返回新对象（浅拷贝），不原地修改传入的存储。
import { TRAIT_RECIPES, toTraitName, resolveCombos } from './stat-trait-recipes.js';

// 存储形态：{ traits: {[特质id]: 记录}, combos: {[合成id]: 记录} }；记录 { char, card, date }
export function emptyCodex() {
  return { traits: {}, combos: {} };
}

export function normalizeCodex(store) {
  const s = store && typeof store === 'object' ? store : {};
  return {
    traits: s.traits && typeof s.traits === 'object' ? s.traits : {},
    combos: s.combos && typeof s.combos === 'object' ? s.combos : {},
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeRecord(meta = {}) {
  return { char: String(meta.charName ?? ''), card: String(meta.cardName ?? ''), date: meta.date || today() };
}

function light(store, bucket, id, meta) {
  const s = normalizeCodex(store);
  if (!id || s[bucket][id]) return { store: s, isNew: false };
  return { store: { ...s, [bucket]: { ...s[bucket], [id]: makeRecord(meta) } }, isNew: true };
}

/** 点亮单个特质（首次出现才记录）。meta：{ charName, cardName, date? }。返回 { store, isNew } */
export function lightTrait(store, traitId, meta) {
  return light(store, 'traits', traitId, meta);
}

/** 点亮合成（首次合成才记录）。返回 { store, isNew } */
export function lightCombo(store, comboId, meta) {
  return light(store, 'combos', comboId, meta);
}

/** 清空图鉴 */
export function clearCodex() {
  return emptyCodex();
}

/**
 * 一次性同步：把当前各角色身上的特质与合成全部点亮。
 * charsTraits：[{ charName, traits: 名称或 id[], states?: 关系状态名[], protagonist? }]
 * 返回 { store, newTraits: [{id,name,charName}], newCombos: [{id,name,charName}] }
 */
export function syncCodex(store, charsTraits, defs, recipes = TRAIT_RECIPES, meta = {}) {
  let s = normalizeCodex(store);
  const newTraits = [];
  const newCombos = [];
  const byName = new Map((defs || []).map((d) => [d.name, d]));
  for (const c of charsTraits || []) {
    for (const t of c.traits || []) {
      const def = byName.get(toTraitName(t, defs));
      if (!def) continue;
      const r = lightTrait(s, def.id, { ...meta, charName: c.charName });
      s = r.store;
      if (r.isNew) newTraits.push({ id: def.id, name: def.name, charName: c.charName });
    }
    const { combos } = resolveCombos(c.traits || [], { defs, recipes, states: c.states || [], protagonist: !!c.protagonist });
    for (const cb of combos) {
      const r = lightCombo(s, cb.id, { ...meta, charName: c.charName });
      s = r.store;
      if (r.isNew) newCombos.push({ id: cb.id, name: cb.name, charName: c.charName });
    }
  }
  return { store: s, newTraits, newCombos };
}

/**
 * 图鉴视图。
 * @param store 全局图鉴存储
 * @param currentCharsTraits 当前聊天各角色：[{ charName, traits, states? }]（用于快合成提示）
 * @param defs 特质登记表数组（TRAIT_DEFS）
 * @param recipes 配方表（缺省 TRAIT_RECIPES）
 * @param opts { nsfwOn: 是否显示 nsfw 项（默认 false）, groups: 分组顺序数组 }
 * @returns { groups:[{group, items, lit, total}], combos:{items, lit, total}, progress:{lit,total} }
 *   特质项：{ id, name, realName, group, nsfw, lit, record, desc }（未点亮时 name 为「？？？」、desc 为空）
 *   合成项：{ id, name, realName, nsfw, lit, record, parts, effect, hints }
 *     未点亮：name 为「？？？」，parts 为 null；hints 为快合成提示 [{ charName, parts:[已有名或「？」] }]
 */
export function codexView(store, currentCharsTraits, defs, recipes = TRAIT_RECIPES, opts = {}) {
  const { nsfwOn = false } = opts;
  const s = normalizeCodex(store);
  const list = (defs || []).filter((d) => nsfwOn || !d.nsfw);
  const order = opts.groups || [...new Set(list.map((d) => d.group))];
  const groups = order.map((g) => {
    const items = list.filter((d) => d.group === g).map((d) => {
      const rec = s.traits[d.id] || null;
      return { id: d.id, name: rec ? d.name : '？？？', realName: d.name, group: g, nsfw: !!d.nsfw, lit: !!rec, record: rec, desc: rec ? d.desc || '' : '' };
    });
    return { group: g, items, lit: items.filter((i) => i.lit).length, total: items.length };
  }).filter((g) => g.total > 0);

  const byName = new Map((defs || []).map((d) => [d.name, d]));
  const recipeNsfw = (r) => !!r.nsfw || r.parts.some((p) => byName.get(p)?.nsfw);
  const chars = (currentCharsTraits || []).map((c) => ({
    charName: c.charName,
    have: new Set([...(c.traits || []).map((t) => toTraitName(t, defs)), ...(c.states || [])]),
  }));
  const comboItems = recipes.filter((r) => nsfwOn || !recipeNsfw(r)).map((r) => {
    const rec = s.combos[r.id] || null;
    const hints = [];
    if (!rec) {
      for (const c of chars) {
        const present = r.parts.filter((p) => c.have.has(p));
        if (present.length === r.parts.length - 1 && present.length > 0) {
          hints.push({ charName: c.charName, parts: r.parts.map((p) => (c.have.has(p) ? p : '？')) });
        }
      }
    }
    return {
      id: r.id, name: rec ? r.name : '？？？', realName: r.name, nsfw: recipeNsfw(r), lit: !!rec, record: rec,
      parts: rec ? r.parts.slice() : null, effect: rec ? r.effect : null, hints,
    };
  });
  const combos = { items: comboItems, lit: comboItems.filter((i) => i.lit).length, total: comboItems.length };
  const lit = groups.reduce((n, g) => n + g.lit, 0) + combos.lit;
  const total = groups.reduce((n, g) => n + g.total, 0) + combos.total;
  return { groups, combos, progress: { lit, total } };
}
