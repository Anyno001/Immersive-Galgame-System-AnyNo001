import { COMBAT_RULES, cardCopyLimit, signatureCardAt, signatureUnlockLevel, validateDeck } from '../../combat/rules.js';
import { cardFaceView } from '../../combat/battle-state.js';
import { createAttributePolicy } from '../../combat/attribute-policy.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD, MANUAL_TOTAL, REL_TIERS, abilityMod, normalizeManualScores, prefsFromScores } from '../../combat/abilities.js';
import { characterCombatStats, deckCardLoadout, vitalsOf } from '../../combat/session.js';
import { injuryLevel } from '../../combat/report.js';
import { INSCRIPTION_TIPS, attributeNumberOptions, describeEffectParts, describeEffects, describeKeywordParts, describeTrigger } from './combat-card-art.js';
import { INSCRIPTION_LABELS } from '../../combat/mechanics/inscription.js';
import { sellPrice } from '../../combat/points.js';
import { defaultHeroSkill } from '../../combat/card-templates.js';
import { TRAIT_SLOT_COSTS, TRAIT_SLOT_MAX, innateTraitIds, keptInnateKinds, traitSlots, traitSwap } from '../../combat/traits.js';
import { TREASURE_SLOT_MAX, slotGearList } from '../../combat/gear-slots.js';
import { fixedCardGroup } from '../../combat/fixed-cards/index.js';
import { relicText, resolveRelic } from '../../combat/relics/draw.js';
import { upgradableRows } from '../../combat/ledger.js';

function facePresentation(card) {
    const options = attributeNumberOptions(card);
    const keywords = describeKeywordParts(card, options);
    const effects = describeEffectParts(card?.effects, undefined, undefined, options);
    const textParts = [...keywords, ...(keywords.length && effects.length ? [{ text: '。' }] : []), ...effects];
    return { cost: card?.cost ?? '', text: textParts.map(part => part.text).join(''), textParts };
}

function cardPreview(card, character, entry = {}) {
    if (!card) return facePresentation(null);
    const { catalog, deck } = deckCardLoadout({ ...character, catalog: new Map([[card.id, card]]), deckEntries: [{ cardId: card.id, ...entry }] });
    const policy = createAttributePolicy(character);
    const owner = policy ? { attributePolicy: policy } : {};
    const preview = cardFaceView(catalog[card.id], deck[0], owner, 6);
    const after = card.upgraded ? facePresentation(cardFaceView(catalog[card.id], { ...deck[0], upgraded: true }, owner, 6)) : null;
    return { ...facePresentation(preview), ...(after ? {
        upgradedText: after.text, upgradedTextParts: after.textParts, upgradedCost: after.cost,
    } : {}) };
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
const gearText = (g) => [gearBonusText(g), g?.passive?.description || ''].filter(Boolean).join('；');
function gearView(view) {
    const slots = view.gear?.slots || {};
    const itemOf = (g) => (g ? { gearId: g.gearId, name: g.name, text: gearText(g) } : null);
    // 宝物部位最多 4 件（规则 v6）：已装的每件一行，没满时补一行空位；其余部位一行。
    const rowsOf = (slot, label) => (slot === 'treasure'
        ? [...slotGearList(slots[slot]).map((g) => ({ slot, label, item: itemOf(g) })), ...(slotGearList(slots[slot]).length < TREASURE_SLOT_MAX ? [{ slot, label, item: null }] : [])]
        : [{ slot, label, item: itemOf(slots[slot]) }]);
    return {
        slots: Object.entries(GEAR_SLOT_LABELS).flatMap(([slot, label]) => rowsOf(slot, label)),
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
        freeRewards: (v.freeDraws?.length || 0) + (v.freeUpgrades?.length || 0),
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
    return { ok: errors.length === 0, size: cards.length, min: COMBAT_RULES.deckMin, max: COMBAT_RULES.deckSanityMax, errors, byCard };
}

// 人物特性（P-d）：名称、稀有度、来历、联动与效果说明（被动数值已按稀有度加强）；v4 主动特性（kind: 'active'）另给费用，说明取技能效果。
// 规则 v6 战斗外遗物特性不带被动，说明取遗物表的用途描述，与普通特性同样呈现。
const passiveText = (p) => [describeTrigger(p.trigger, p.cardType), describeEffects(p.effects)].filter(Boolean).join('：');
const traitView = (t) => ({ traitId: t.traitId, name: t.name, rarity: t.rarity, origin: t.origin || '', link: t.link || null,
    ...(t.kind === 'active' && t.skill ? { kind: 'active', cost: t.skill.cost } : {}),
    text: t.passive ? passiveText(t.passive) : t.skill ? describeEffects(t.skill.effects) : relicText(t.relic) });
// 规则 v6 积分抽卡：未翻时 3 张背面朝上，只给张数、不透露牌面；翻开一张后给出全部牌面与翻开的位置（flipped），再决定加入卡组或放弃。
const drawCardView = (card, character) => ({ cardId: card.id, name: card.name || card.id, type: card.type || '', rarity: card.rarity || '', ...cardPreview(card, character) });
const pendingDrawView = (pending, character) => {
    if (!pending) return null;
    const base = { drawId: pending.drawId, count: (pending.choices || []).length };
    return Number.isInteger(pending.flipped) ? { ...base, flipped: pending.flipped, choices: pending.choices.map((card) => drawCardView(card, character)) } : base;
};

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

// 规则 v6 御印：账本挂起的遗物刻印与可选副本（账本已按未刻印、牌型、可刻筛过）；每张副本给刻印前后的费用与说明，同名副本按序号区分。
function relicInscribeView(view) {
    const rows = new Map([...(view.deckEntries || []), ...(view.copies || [])].map((row) => [row.copyId, row]));
    return (view.relicInscribe || []).map((item) => {
        const relic = resolveRelic(item.relic?.relicId, item.relic?.model);
        const seen = new Map();
        const copies = (item.copies || []).map((copyId) => {
            const row = rows.get(copyId);
            const card = row ? view.catalog?.get(row.cardId) : null;
            if (!card) return null;
            const face = cardPreview(card, view, row);
            const after = cardPreview(card, view, { ...row, inscription: item.inscription });
            const nth = (seen.get(row.cardId) || 0) + 1;
            seen.set(row.cardId, nth);
            const label = [row.upgraded ? '已升级' : '', row.bonus?.damage ? `伤害 +${row.bonus.damage}` : '', row.bonus?.block ? `格挡 +${row.bonus.block}` : ''].filter(Boolean).join(' · ');
            return { copyId, cardId: row.cardId, name: card.name || row.cardId, type: card.type || '', rarity: card.rarity || '', nth, label,
                cost: face.cost, text: face.text, textParts: face.textParts, after: { cost: after.cost, text: after.text, textParts: after.textParts } };
        }).filter(Boolean);
        const twins = new Set(copies.filter((c) => c.nth > 1).map((c) => c.cardId));
        return { key: `${item.relic.relicId}|${item.relic.model}`, relicId: item.relic.relicId, model: item.relic.model, name: relic?.name || item.relic.relicId,
            inscription: item.inscription, label: INSCRIPTION_LABELS[item.inscription] || item.inscription, tip: INSCRIPTION_TIPS[item.inscription] || '',
            copies: copies.map((c) => ({ ...c, nth: twins.has(c.cardId) ? c.nth : 0 })) };
    });
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
        collection: (view.collection || []).map((k) => ({ ...k, key: k.lootId || k.itemId, price: sellPrice(k.rarity, k.lootId || k.itemId, { junk: k.junk === true }) })), points: view.points ?? 0, canSell: view.attributes?.protagonist === true,
        pendingDraw: pendingDrawView(view.pendingDraw, view),
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
    // 规则 v5 P5：同名牌里带成长或刻印的副本按差异分行列出；草稿未保存时副本去向未定，只计拥有张数。
    const deckCopyIds = new Set(draft ? [] : (view.deckEntries || []).map((e) => e.copyId).filter(Boolean));
    const variants = new Map();
    for (const row of view.copies || []) {
        const inscribed = Object.hasOwn(INSCRIPTION_LABELS, row.inscription || '');
        if (!inscribed && !row.bonus) continue;
        const label = [row.upgraded ? '已升级' : '', row.bonus?.damage ? `伤害 +${row.bonus.damage}` : '', row.bonus?.block ? `格挡 +${row.bonus.block}` : '',
            inscribed ? `刻印·${INSCRIPTION_LABELS[row.inscription]}` : ''].filter(Boolean).join(' · ');
        const list = variants.get(row.cardId) || new Map();
        const item = list.get(label) || { label, tip: inscribed ? INSCRIPTION_TIPS[row.inscription] : '', owned: 0, inDeck: draft ? null : 0,
            ...cardPreview(view.catalog.get(row.cardId), view, row) };
        item.owned += 1;
        if (deckCopyIds.has(row.copyId)) item.inDeck += 1;
        list.set(label, item);
        variants.set(row.cardId, list);
    }
    // X 费排在 3 费之后（Number('X') 为 NaN，会打乱排序）。
    const costRank = (c) => (c === 'X' ? 4 : Number(c));
    const personalIds = new Set((view.profile?.personalPool || []).map((c) => c.id));
    const classIds = new Set((view.classProfile?.classPool || []).map((c) => c.id));
    // 规则 v6：本职业固定卡也按职业牌显示来源。
    const archetype = view.classProfile?.archetype;
    const isClassCard = (id) => classIds.has(id) || (archetype !== undefined && fixedCardGroup(id) === archetype);
    const cardView = (id, n) => {
        const card = view.catalog.get(id);
        return { cardId: id, name: card?.name || id, type: card?.type || '', cost: card?.cost ?? '', rarity: card?.rarity || '', owned: n,
            source: personalIds.has(id) ? '个人牌' : isClassCard(id) ? '职业牌' : card?.rarity === 'basic' ? '基础牌' : card?.rarity === 'signature' ? '专属牌' : '其他已持有',
            upgraded: view.upgraded.get(id) || 0, inDeck: inDeck.get(id) || 0, errors: check.byCard.get(id) || [],
            variants: [...(variants.get(id)?.values() || [])],
            canAdd: (inDeck.get(id) || 0) < n && cardCopyLimit(card?.rarity) > 0, ...cardPreview(card, view) };
    };
    const sortCards = (a, b) => (a.cost === b.cost ? a.name.localeCompare(b.name, 'zh') : costRank(a.cost) - costRank(b.cost));
    const owned = [...view.owned.entries()].filter(([, n]) => n > 0).map(([id, n]) => cardView(id, n)).sort(sortCards);
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
        relicInscribe: base.canSell ? relicInscribeView(view) : [],
        freeDraws: [...(view.freeDraws || [])], freeUpgrades: [...(view.freeUpgrades || [])],
        upgradeCards: upgradableRows(view).map((row, index) => {
            const card = view.catalog.get(row.cardId);
            const preview = cardPreview(card, view, row);
            return { copyId: row.copyId, name: card.name, nth: index + 1,
                cost: preview.cost, text: preview.text, textParts: preview.textParts,
                after: { cost: preview.upgradedCost, text: preview.upgradedText, textParts: preview.upgradedTextParts } };
        }),
        // 职业阶（P-c）：classTier 一阶起，tierName 为阶名；expLevel 为按 EXP 推导的等级，升阶门槛按它判断（与账本归并一致）。
        classRef: view.classRef ?? null, classTier: view.classTier || 1, tierName: view.tierName || '', expLevel: view.level ?? 1,
        classPassive: view.classProfile?.classPassive ? { name: view.classProfile.classPassive.name, text: describeEffects(view.classProfile.classPassive.effects) } : null,
        personalPassive: profile.personalPassive ? { name: profile.personalPassive.name, text: describeEffects(profile.personalPassive.effects) } : null,
        owned, signature, deck: cards, check, dirty: Boolean(draft) && draft.join('|') !== view.deck.join('|'),
        // 规则 v6 卡组即持有：只有旧档案卡组需要调整时才开放加入 / 移出 / 保存。
        deckEditable: view.deckNeedsAdjust === true,
    };
}

// 手动生成卡组档案的职业选项：已登记职业可沿用（不再请求职业部分），也可请副 LLM 新建职业。
export function classChoices(state) {
    if (!state?.ok || !state.classes) return [];
    return [...state.classes.values()].map((c) => ({ id: c.id, name: c.className }));
}
