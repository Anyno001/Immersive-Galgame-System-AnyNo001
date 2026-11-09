import { COMBAT_RULES, cardCopyLimit, signatureCardAt, signatureUnlockLevel, validateDeck } from '../../combat/rules.js';
import { scaleCard } from '../../combat/card-scaling.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD, MANUAL_TOTAL, REL_TIERS, abilityMod, normalizeManualScores, prefsFromScores } from '../../combat/abilities.js';
import { characterCombatStats, vitalsOf } from '../../combat/session.js';
import { injuryLevel } from '../../combat/report.js';
import { describeEffects, describeKeywords, describeTrigger } from './combat-card-art.js';
import { sellPrice } from '../../combat/points.js';
import { defaultHeroSkill } from '../../combat/card-templates.js';
import { TRAIT_SLOT_COSTS, TRAIT_SLOT_MAX, innateTraitIds, keptInnateKinds, traitSlots, traitSwap } from '../../combat/traits.js';

// 复用战斗换算与说明，预览普通版和升级版；固定卡不带倍率。
function cardPreview(card, attr) {
    const preview = scaleCard(card, attr);
    const s = preview?.scaling;
    const text = (c) => [describeKeywords(c), describeEffects(c?.effects)].filter(Boolean).join('。');
    return { text: text(preview), upgradedText: preview?.upgraded ? text({ ...preview, ...preview.upgraded }) : '',
        upgradedCost: preview?.upgraded?.cost ?? preview?.cost,
        ...(s ? { scaling: { ability: s.ability, label: ABILITY_LABELS[s.ability] || s.ability, required: s.required, multiplier: s.multiplier } } : {}) };
}

// 卡组构筑面板的纯视图模型：账本归并状态 → 角色列表 / 详情 / 构筑草稿校验；不操作 DOM、不写表。
export const DECK_KIND_LABELS = Object.freeze({ 'deck-character': '卡组', 'skill-character': '技能' });
export const GEAR_SLOT_LABELS = Object.freeze({ weapon: '武器', armor: '防具', accessory: '饰品', treasure: '宝物' });
// 人物状态面板的四页：状态、加点、装备、卡组（技能角色为技能）。背包与卖出统一在阅读器背包页（v0.39.2）。
export const DECK_PAGES = Object.freeze(['status', 'alloc', 'gear', 'deck']);
export const DECK_PAGE_LABELS = Object.freeze({ status: '状态', alloc: '加点', gear: '装备', deck: '卡组' });
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// 六维与加点：attr 为角色属性视图，picks 为加点草稿（属性 → 点数）。可编辑 = 主角 + 属性表已建 + 不在战斗中；
// 每行给出计入草稿后的属性值、调整值与能否再加 / 减（剩余点数、属性上限）。没有属性视图时返回 null。
export function allocView(attr, picks = null, { readonly = false } = {}) {
    if (!attr?.scores) return null;
    const draft = picks || {};
    const used = ABILITY_KEYS.reduce((sum, k) => sum + (draft[k] || 0), 0);
    const balance = attr.balance || 0;
    const left = Math.max(0, balance - used);
    const editable = attr.protagonist === true && attr.table === 'ok' && !readonly;
    const rows = ABILITY_KEYS.map((key) => {
        const add = draft[key] || 0;
        const score = attr.scores[key] + add;
        const mod = add ? abilityMod(score) : attr.mods?.[key] ?? abilityMod(score);
        return { key, label: ABILITY_LABELS[key] || key, score, add, modText: signed(mod), canAdd: editable && left > 0 && score < attr.cap, canRemove: editable && add > 0 };
    });
    return { protagonist: attr.protagonist === true, table: attr.table, balance, used, left, cap: attr.cap, editable, dirty: used > 0, rows };
}

// 手动建档（P8c）：尚无 init 的角色逐项分配六维（底分 8、总分不超过 72、单项 3–18），选定位与职业名；擅长项按分值推导（同分按六维键序）。
// draft 为 { className, role, scores }；已建档或没有属性视图时返回 null。
export function manualBuildView(attr, draft, { readonly = false } = {}) {
    if (!attr || attr.initialized) return null;
    const d = draft || {};
    const scores = Object.fromEntries(ABILITY_KEYS.map((k) => [k, Number.isInteger(d.scores?.[k]) ? d.scores[k] : MANUAL_BUILD.base]));
    const total = ABILITY_KEYS.reduce((sum, k) => sum + scores[k], 0);
    const left = MANUAL_TOTAL - total;
    const role = Object.hasOwn(COMBAT_RULES.archetypes, d.role) ? d.role : attr.role;
    const editable = !readonly && attr.table === 'ok';
    const prefs = prefsFromScores(scores);
    const rows = ABILITY_KEYS.map((key) => ({ key, label: ABILITY_LABELS[key] || key, score: scores[key], add: scores[key] - MANUAL_BUILD.base, modText: signed(abilityMod(scores[key])),
        canAdd: editable && left > 0 && scores[key] < MANUAL_BUILD.max, canRemove: editable && scores[key] > MANUAL_BUILD.min }));
    return { editable, table: attr.table, left, total, max: MANUAL_TOTAL, role, className: String(d.className ?? attr.className ?? ''), scores, rows, dirty: Boolean(draft),
        roles: Object.entries(COMBAT_RULES.archetypes).map(([key, a]) => ({ key, label: a.label || key })),
        prefLabels: { major: ABILITY_LABELS[prefs.major], minor: ABILITY_LABELS[prefs.minor], weak: ABILITY_LABELS[prefs.weak] },
        ok: editable && Boolean(normalizeManualScores(scores)) };
}

// 装备栏、背包与道具：四个部位按固定顺序列出（空部位也列出），背包为已拥有未装备的装备（带稀有度与售价，在背包页列出）。
// 装备说明：六维加成（带稀有度的装备，D7）在前，被动说明在后；没有被动的装备只显示加成。
export const gearBonusText = (g) => (g?.bonus ? `${ABILITY_LABELS[g.bonus.ability] || g.bonus.ability} +${g.bonus.amount}` : '');
const passiveText = (p) => [describeTrigger(p.trigger, p.cardType), describeEffects(p.effects)].filter(Boolean).join('：');
const gearText = (g) => [gearBonusText(g), g?.passive ? passiveText(g.passive) : ''].filter(Boolean).join('；');
function gearView(view) {
    const slots = view.gear?.slots || {};
    return {
        slots: Object.entries(GEAR_SLOT_LABELS).map(([slot, label]) => ({ slot, label, item: slots[slot] ? { gearId: slots[slot].gearId, name: slots[slot].name, text: gearText(slots[slot]) } : null })),
        bag: (view.gear?.bag || []).map((g) => ({ gearId: g.gearId, name: g.name, slot: g.slot, slotLabel: GEAR_SLOT_LABELS[g.slot] || g.slot,
            rarity: g.rarity || '', price: sellPrice(g.rarity, g.gearId), text: gearText(g) })),
        items: (view.items || []).map((i) => ({ itemId: i.itemId, name: i.name, count: i.count })),
    };
}
// 会话处于这些状态时战斗仍在进行，构筑面板只读。
const BUSY_SESSION = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);

export function isCombatBusy(sessionState) {
    return BUSY_SESSION.includes(sessionState?.status);
}

export function deckRosterView(state) {
    if (!state?.ok) return [];
    const list = [...state.characters.values()].map((v) => ({
        id: v.id, kind: v.kind, kindLabel: DECK_KIND_LABELS[v.kind] || v.kind, name: v.name, level: v.attributes?.level ?? v.level,
        exp: v.exp, into: v.into, next: v.next, className: v.attributes?.className || v.className || '',
        protagonist: v.attributes?.protagonist === true,
        deckSize: v.kind === 'deck-character' ? v.deck.length : 0,
        needsAdjust: v.kind === 'deck-character' && v.deckNeedsAdjust === true,
        pendingRewards: v.kind === 'deck-character' ? v.pendingRewards.length : 0,
    }));
    // 卡组角色在前，同类按名字排序，保证列表顺序稳定。
    return list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh') : a.kind === 'deck-character' ? -1 : 1));
}

// 构筑草稿校验：张数、同名上限、拥有数与未知卡；返回按卡归并的错误，供界面在对应卡上标错。
export function validateDraft(view, draft) {
    const cards = Array.isArray(draft) ? draft : [];
    const check = validateDeck(cards, view.owned, view.catalog);
    const errors = check.errors;
    const byCard = new Map();
    for (const e of errors) if (e.cardId) byCard.set(e.cardId, [...(byCard.get(e.cardId) || []), e.reason]);
    return { ok: errors.length === 0, size: cards.length, min: COMBAT_RULES.deckMin, max: COMBAT_RULES.deckMax, errors, byCard };
}

// 人物特性（P-d）：名称、稀有度、来历、联动与效果说明（被动数值已按稀有度加强）；v4 主动特性（kind: 'active'）另给费用，说明取技能效果。
const traitView = (t) => ({ traitId: t.traitId, name: t.name, rarity: t.rarity, origin: t.origin || '', link: t.link || null,
    ...(t.kind === 'active' && t.skill ? { kind: 'active', cost: t.skill.cost } : {}),
    text: t.passive ? passiveText(t.passive) : t.skill ? describeEffects(t.skill.effects) : '' });

// v4 特性槽（助手 10-28，只主角）：slots 为当前槽数、max 为上限；innate 为保留着的固有特性（人物技能 / 个人被动，可被替换）；
// locked 为未解锁的槽与价格（第一个即下一个可解锁的）；有待定特性时 replaceable 列出替换后不挤掉其他固有特性、主动不超上限的特性 ID。
function traitSlotView(view) {
    const kept = keptInnateKinds(view);
    const ids = innateTraitIds(view.profile, view.id);
    const skill = view.profile?.heroSkill || defaultHeroSkill(view.classProfile?.archetype, view.id);
    const own = view.profile?.personalPassive;
    const innate = kept.map((k) => (k === 'active'
        ? { traitId: ids.active, name: skill.name, kind: 'active', innate: true, cost: COMBAT_RULES.heroSkillCost, text: describeEffects(skill.effects) }
        : { traitId: ids.passive, name: own.name, kind: 'passive', innate: true, text: passiveText(own) }));
    const slots = traitSlots(view);
    const locked = [];
    for (let slot = slots + 1; slot <= TRAIT_SLOT_MAX; slot += 1) locked.push({ slot, cost: TRAIT_SLOT_COSTS[slot] });
    const pending = view.pendingTrait;
    const ownIds = [...innate.map((t) => t.traitId), ...(view.traits || []).map((t) => t.traitId)];
    const replaceable = pending ? ownIds.filter((id) => traitSwap(view, pending, id)?.blocked === false) : [];
    return { slots, max: TRAIT_SLOT_MAX, innate, locked, replaceable };
}

export function deckDetailView(view, draft) {
    if (!view) return null;
    // 开战换算加持续伤势：当前生命 / 上限与伤势词（倒下、无伤、轻伤、重创、濒死）；没有伤势记录时为满血。
    const stats = characterCombatStats(view);
    const vitals = vitalsOf(stats.hp, view.wound);
    const combat = { ...stats, current: vitals.hp, injury: injuryLevel({ alive: !vitals.down, hp: vitals.hp, maxHp: vitals.maxHp }) };
    const base = { id: view.id, kind: view.kind, name: view.name, level: view.attributes?.level ?? view.level,
        exp: view.exp, into: view.into, next: view.next, attributes: view.attributes,
        combat, traits: (view.traits || []).map(traitView), pendingTrait: view.pendingTrait ? traitView(view.pendingTrait) : null,
        // 杂物键：账本背包为 lootId；主角背包投影（P7b）为 itemId（同名叠数量）。
        collection: (view.collection || []).map((k) => ({ ...k, key: k.lootId || k.itemId, price: sellPrice(k.rarity, k.lootId || k.itemId) })), points: view.points ?? 0, canSell: view.attributes?.protagonist === true,
        relLabel: REL_TIERS[view.attributes?.tier]?.label || '',
        abilities: allocView(view.attributes)?.rows || [] };
    if (view.kind === 'skill-character') {
        const tier = Object.hasOwn(COMBAT_RULES.allyTiers, view.profile?.tier) ? view.profile.tier : COMBAT_RULES.defaultAllyTier;
        return { ...base, gear: gearView(view), className: view.attributes?.className || view.className || '', tier, tierLabel: COMBAT_RULES.allyTiers[tier].label,
            tiers: Object.entries(COMBAT_RULES.allyTiers).map(([key, t]) => ({ key, label: t.label })),
            skills: view.skills.map((s) => ({ id: s.id, name: s.name, intent: s.intent })),
            passives: (view.passives || []).map((p) => ({ id: p.id, name: p.name })) };
    }
    const cards = draft || view.deck;
    const check = validateDraft(view, cards);
    const inDeck = new Map();
    for (const id of cards) inDeck.set(id, (inDeck.get(id) || 0) + 1);
    // X 费排在 3 费之后（Number('X') 为 NaN，会打乱排序）。
    const costRank = (c) => (c === 'X' ? 4 : Number(c));
    const personalIds = new Set((view.profile?.personalPool || []).map((c) => c.id));
    const classIds = new Set((view.classProfile?.classPool || []).map((c) => c.id));
    const cardView = (id, n) => {
        const card = view.catalog.get(id);
        return { cardId: id, name: card?.name || id, type: card?.type || '', cost: card?.cost ?? '', rarity: card?.rarity || '', owned: n,
            source: personalIds.has(id) ? '个人牌' : classIds.has(id) ? '职业牌' : card?.rarity === 'basic' ? '基础牌' : card?.rarity === 'signature' ? '专属牌' : '其他已持有',
            upgraded: view.upgraded.get(id) || 0, inDeck: inDeck.get(id) || 0, errors: check.byCard.get(id) || [],
            canAdd: (inDeck.get(id) || 0) < Math.min(n, cardCopyLimit(card?.rarity)), ...cardPreview(card, view.attributes) };
    };
    const sortCards = (a, b) => (a.cost === b.cost ? a.name.localeCompare(b.name, 'zh') : costRank(a.cost) - costRank(b.cost));
    const owned = [...view.owned.entries()].filter(([, n]) => n > 0).map(([id, n]) => cardView(id, n)).sort(sortCards);
    // 职业池只供预览，拥有数为零的牌不能在此直接加入卡组；含升阶追加卡，不含锁定专属。
    const classCandidates = [...classIds].filter((id) => !(view.owned.get(id) > 0)).map((id) => cardView(id, 0)).sort(sortCards);
    const profile = view.profile || {};
    // 专属卡（v0.39.2）：按槽位列出，第 i 张在 signatureUnlockLevels[i] 级解锁；未解锁的不透露名称与效果，只给解锁等级。
    const signature = COMBAT_RULES.signatureUnlockLevels.map((level, i) => {
        const slot = i + 1;
        const card = signatureCardAt(profile, slot);
        const unlocked = Boolean(card) && (view.owned.get(card.id) || 0) > 0;
        return unlocked ? { slot, level: signatureUnlockLevel(slot), unlocked, cardId: card.id, name: card.name, cost: card.cost, type: card.type } : { slot, level: signatureUnlockLevel(slot), unlocked };
    });
    return {
        ...base, gear: gearView(view), className: view.attributes?.className || view.className || '', hpMax: view.hpMax,
        traitSlots: base.canSell ? traitSlotView(view) : null,
        // 职业阶（P-c）：classTier 一阶起，tierName 为阶名；expLevel 为按 EXP 推导的等级，升阶门槛按它判断（与账本归并一致）。
        classRef: view.classRef ?? null, classTier: view.classTier || 1, tierName: view.tierName || '', expLevel: view.level ?? 1,
        classPassive: view.classProfile?.classPassive ? { name: view.classProfile.classPassive.name, text: passiveText(view.classProfile.classPassive) } : null,
        personalPassive: profile.personalPassive ? { name: profile.personalPassive.name, text: passiveText(profile.personalPassive) } : null,
        owned, classCandidates, signature, deck: cards, check, dirty: Boolean(draft) && draft.join('|') !== view.deck.join('|'),
        pendingRewards: [...view.pendingRewards],
    };
}

// 手动生成卡组档案的职业选项：已登记职业可沿用（不再请求职业部分），也可请副 LLM 新建职业。
export function classChoices(state) {
    if (!state?.ok || !state.classes) return [];
    return [...state.classes.values()].map((c) => ({ id: c.id, name: c.className }));
}
