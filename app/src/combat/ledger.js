import { COMBAT_RULES, cardCopyLimit, difficultyRule, expProgress, validateDeck } from './rules.js';
import { hash32, hashString } from './random.js';
import { ABILITY_KEYS, ABILITY_LABELS, ASI_POINTS, DEFAULT_REL_TIER, REL_TIERS, asiCountAt, defaultPrefs, deriveAbilities, isAsiLevel, levelCap, normalizePrefs, parseCombatInit, relLevel, relOffset } from './abilities.js';
import { GEAR_SLOTS, INIT_GEAR_TAG_HASH, buildCardCatalog, effectsDamage, gearIdFor, itemIdFor, ledgerEntryId, normalizeAttributeRecord, normalizeLedgerEntry, normalizeProfile, validateStarterDeck } from './schema.js';
import { combatBodyText, extractGainDirectives, extractGrowthDirectives, scanCombatTags, scanGainTags } from '../scene/combat-directives.js';
import { combatReportResult } from '../scene/combat-prompt.js';
import { reportIdFor, reportIdOf } from './report.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, REROLL_COST, TRAIT_DRAW_COST, sellPrice } from './points.js';
import { passiveAtTier } from './card-templates.js';
import { TRAIT_BASE_SLOTS, TRAIT_SLOT_COSTS, nextTraitSlot, traitFits, traitSwap } from './traits.js';
import { HERO_BASE_ARCHETYPE, characterCombatStats, heroBaseStats, vitalsOf } from './vitals.js';
import { scanStatLifeTags } from '../scene/stats/stat-directives.js';
import { HURT_PCT } from '../scene/stats/stat-vocab.js';
import { heroInventoryView } from './inventory-view.js';
import { STOCK_TYPES, stockPlan } from './inventory-writes.js';

// 成长账本：只读归并 shujuku 两张战斗表，按锚点决定哪些条目当前生效；不修改表，写入只经注入的 tables。
// chat 由调用方传入按 messageId 下标排列的消息快照 [{ mes, swipe_id, is_user, is_system }]，combat 不读宿主。
export const PROTAGONIST_ALIASES = Object.freeze(['我', '{{user}}', '主角']);
// deck 条目不来自标签，锚点 tagHash 固定为此值。
export const DECK_TAG_HASH = 'deck';
// reward 条目同样不来自标签。
export const REWARD_TAG_HASH = 'reward';
// consume 条目由战报落楼后写入，锚定战报用户楼，同样不来自标签。
export const CONSUME_TAG_HASH = 'consume';
// wound 条目（持续伤势）同样由战报落楼后写入、锚定战报用户楼，不来自标签。
export const WOUND_TAG_HASH = 'wound';
// 构筑面板换装写的 equip / unequip 不来自标签，锚点 tagHash 固定为此值，只核对楼层与 swipe。
export const GEAR_TAG_HASH = 'gear';
// 背包卖出（杂物或未装备的装备）写的 sell 不来自标签，锚定卖出时的最新楼层，只核对楼层与 swipe。
export const SELL_TAG_HASH = 'sell';
// 重新生成基础卡组写的 rebuild、转职写的 respec 与职业升阶写的 ascend 同样锚定写入时的最新楼层；同楼在它们之后保存的卡组与领取的奖励改用 PANEL_TAG_HASH，与面板操作同序归并。
export const REBUILD_TAG_HASH = 'rebuild';
export const RESPEC_TAG_HASH = 'respec';
export const ASCEND_TAG_HASH = 'ascend';
// 抽人物特性写的 trait 与已满时决定替换或放弃写的 trait-pick 同样锚定写入时的最新楼层，与面板操作同序归并。
export const TRAIT_TAG_HASH = 'trait';
export const PANEL_TAG_HASH = 'panel';
// 背包场外使用道具（P7c）：consume 与回血 heal 锚定写入说明的最新 AI 楼，只核对楼层与 swipe，与面板操作同序归并。
export const USE_TAG_HASH = 'use';
// offer 条目锚定开战楼（开战标签锚点），只核对楼层与 swipe：开战楼换 swipe 或删楼即作废。
const TAGLESS_TYPES = new Set(['deck', 'reward', 'consume', 'offer', 'sell', 'rebuild', 'respec', 'ascend', 'trait', 'trait-pick', 'trait-slot', 'wound']);
const ANCHORLESS_TYPES = new Set(['profile', 'revoke']);
const CHARACTER_KINDS = new Set(['deck-character', 'skill-character']);

const messageText = (m) => String(m?.mes ?? m?.text ?? '');
const swipeOf = (m) => (Number.isInteger(m?.swipe_id) ? m.swipe_id : 0);
// 隐藏楼（is_system）仍算存在：用户常隐藏旧楼节省上下文，不应因此丢失成长。
const isMessage = (m) => Boolean(m) && typeof m === 'object';
// 归并顺序：楼层升序；同楼先记 EXP 再处理职业、技能、奖励与卡组（奖励要核对当时等级），再按 occurrence。
// 装备与道具排在卡组之后：同楼先取得、再卸下，战报楼的消耗最后结算。
// 战报楼的战利品排在奖励与卡组之前（同楼保存的卡组可以带上新卡）。
// 同楼生命条目先记伤势（战后 wound、剧情 hurt）再记回血：hurt 与 heal 的锚点来自两套标签，occurrence 不可比，按类型定序。
const TYPE_RANK = Object.freeze({ exp: 0, class: 1, learn: 2, upgrade: 3, loot: 4, reward: 5, deck: 6, equip: 7, unequip: 8, item: 9, consume: 10, offer: 11, sell: 12, rebuild: 13, respec: 14, ascend: 15, trait: 16, 'trait-pick': 17, 'trait-slot': 18, wound: 19, hurt: 19, heal: 19.5 });
// 构筑面板换装、背包卖出、重新生成基础卡组、转职、职业升阶及同楼在其后的卡组保存与奖励（tagHash = GEAR / SELL / REBUILD / RESPEC / ASCEND / PANEL）是用户在该楼之后的操作：
// 同楼排在全部标签条目（含战利品）之后，彼此共用一个 occurrence 序列、按写入先后归并（同楼先卸下再卖出、先卖出再重新生成或转职、先升阶再领取追加卡才成立）。
const PANEL_TAGS = new Set([GEAR_TAG_HASH, SELL_TAG_HASH, REBUILD_TAG_HASH, RESPEC_TAG_HASH, ASCEND_TAG_HASH, TRAIT_TAG_HASH, PANEL_TAG_HASH, USE_TAG_HASH]);
const rankOf = (e) => (PANEL_TAGS.has(e.anchor?.tagHash) ? 20 : TYPE_RANK[e.type]);
const panelOccurrence = (snapshot, characterId, messageId, swipeId) => snapshot.entries.filter((e) => PANEL_TAGS.has(e.anchor?.tagHash)
    && e.character === characterId && e.anchor.messageId === messageId && e.anchor.swipeId === swipeId).length;
// 同楼已有会改变卡组或职业池的面板操作（重新生成、转职、升阶）时，之后写的卡组与奖励要排在它们之后。
const PANEL_RESET_TYPES = new Set(['rebuild', 'respec', 'ascend']);
const afterPanelReset = (snapshot, characterId, messageId, swipeId) => snapshot.entries.some((e) => PANEL_RESET_TYPES.has(e.type) && e.character === characterId
    && e.anchor?.messageId === messageId && e.anchor.swipeId === swipeId);
const byAnchor = (a, b) => a.anchor.messageId - b.anchor.messageId || rankOf(a) - rankOf(b)
    || a.anchor.occurrence - b.anchor.occurrence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// 尚无档案的角色以名字键记账（只用于剧情 EXP），档案登记后按名字与别名归并。
export const nameKey = (name) => `nm-${hashString(String(name || '').trim().toLowerCase())}`;
const diag = (diagnostics, code, entry, extra = {}) => diagnostics.push({ code, id: entry.id, character: entry.character, ...extra });

// tables.read() 的结果归一化：每条记录过 schema，非法记录只记诊断；读取失败或缺表返回 ok:false，不当作空账本。
export function normalizeSnapshot(read) {
    if (!read || read.ok !== true) return { ok: false, reason: read?.reason || 'combat-ledger-read-failed', ...(read?.detail ? { detail: read.detail } : {}) };
    if (Array.isArray(read.missing) && read.missing.length) return { ok: false, reason: 'combat-table-missing', missing: read.missing };
    const diagnostics = [...(read.diagnostics || [])];
    const profiles = new Map();
    for (const rec of read.profile || []) {
        const n = normalizeProfile(rec?.definition);
        if (!n.ok || n.value.id !== rec.id) {
            diagnostics.push({ code: 'combat-profile-invalid', id: rec?.id ?? null, errors: (n.errors || []).slice(0, 5) });
            continue;
        }
        const version = Number.isInteger(rec.version) ? rec.version : 0;
        const prev = profiles.get(rec.id);
        if (!prev || version > prev.version) profiles.set(rec.id, { version, createdAt: Number(rec.createdAt) || 0, profile: n.value });
    }
    const entries = [];
    const ids = new Set();
    for (const rec of read.ledger || []) {
        const n = normalizeLedgerEntry(rec);
        if (!n.ok) {
            diagnostics.push({ code: 'combat-entry-invalid', id: rec?.id ?? null, errors: n.errors.slice(0, 5) });
            continue;
        }
        if (ids.has(n.value.id)) continue;
        ids.add(n.value.id);
        entries.push(n.value);
    }
    // 属性表为可选表：缺表时 attributeTable 为 'missing'，属性按默认值推导，不阻断档案与日志。
    const attributes = [];
    const attributeIds = new Set();
    const attributeTable = Array.isArray(read.attribute) ? 'ok' : 'missing';
    for (const rec of attributeTable === 'ok' ? read.attribute : []) {
        const n = normalizeAttributeRecord(rec);
        if (!n.ok) {
            diagnostics.push({ code: 'combat-attribute-invalid', id: rec?.id ?? null, errors: n.errors.slice(0, 5) });
            continue;
        }
        if (attributeIds.has(n.value.id)) continue;
        attributeIds.add(n.value.id);
        attributes.push(n.value);
    }
    // 日志里的 profile 条目同样不绑定楼层；档案表已有同 ID 时以档案表为准。
    for (const e of entries) {
        if (e.type === 'profile' && !profiles.has(e.character)) profiles.set(e.character, { version: -1, createdAt: e.createdAt, profile: e.payload });
    }
    return { ok: true, profiles, entries, ids, attributes, attributeIds, attributeTable, diagnostics };
}

// 职业按职业名唯一，先登记（createdAt 早）的为准；角色按名字与别名索引，同类重名时先登记的为准。
// 同名时卡组档案优先：技能档案的名字已归卡组档案时整份让位（superseded），档案仍留在表里，其 EXP 条目归并到卡组档案。
export function indexProfiles(profiles, diagnostics = []) {
    const classes = new Map();
    const classByName = new Map();
    const classAlias = new Map();
    const characters = new Map();
    const enemies = new Map();
    const byName = new Map();
    const byNameKey = new Map();
    const superseded = new Map();
    const people = [];
    const sorted = [...profiles.values()].sort((a, b) => a.createdAt - b.createdAt || (a.profile.id < b.profile.id ? -1 : 1));
    for (const { profile } of sorted) {
        if (profile.kind === 'class') {
            const kept = classByName.get(profile.className);
            if (kept) {
                // 同名职业后登记者不生效，引用它的角色改用先登记的职业。
                classAlias.set(profile.id, kept.id);
                diagnostics.push({ code: 'combat-class-duplicate', id: profile.id, className: profile.className, kept: kept.id });
                continue;
            }
            classByName.set(profile.className, profile);
            classes.set(profile.id, profile);
        } else if (CHARACTER_KINDS.has(profile.kind)) people.push(profile);
        else if (profile.kind === 'enemy') {
            enemies.set(profile.id, profile);
        }
    }
    const ordered = [...people.filter((p) => p.kind === 'deck-character'), ...people.filter((p) => p.kind !== 'deck-character')];
    for (const profile of ordered) {
        const names = [profile.name, ...(profile.aliases || [])];
        const holder = profile.kind === 'skill-character' ? byName.get(profile.name) : undefined;
        if (holder !== undefined && characters.get(holder)?.kind === 'deck-character') {
            superseded.set(profile.id, holder);
            diagnostics.push({ code: 'combat-profile-superseded', id: profile.id, name: profile.name, kept: holder });
            // 让位档案的别名仍指向接替它的卡组档案，按名字暂记的 EXP 照常归并。
            for (const name of names) {
                if (!byNameKey.has(nameKey(name))) byNameKey.set(nameKey(name), holder);
                if (!byName.has(name)) byName.set(name, holder);
            }
            continue;
        }
        characters.set(profile.id, profile);
        for (const name of names) {
            if (!byNameKey.has(nameKey(name))) byNameKey.set(nameKey(name), profile.id);
            const owner = byName.get(name);
            if (owner === undefined) byName.set(name, profile.id);
            else if (owner !== profile.id) diagnostics.push({ code: 'combat-name-duplicate', name, id: profile.id, kept: owner });
        }
    }
    return { classes, classByName, classAlias, characters, enemies, byName, byNameKey, superseded };
}

export function resolveClass(index, classId) {
    return index.classes.get(classId) || index.classes.get(index.classAlias.get(classId)) || null;
}

export function resolveCharacterId(index, name, userName = '') {
    return index.byName.get(effectiveName(name, userName)) ?? null;
}

function effectiveName(name, userName) {
    const raw = String(name || '').trim();
    return userName && PROTAGONIST_ALIASES.includes(raw) ? userName : raw;
}

// 标签里的角色名 → 日志 character：已登记档案用档案 ID，否则用名字键。
export function characterKeyFor(index, name, userName = '') {
    return resolveCharacterId(index, name, userName) ?? nameKey(effectiveName(name, userName));
}

// 同一标签可能先以名字键、后以档案 ID 记账，或记在已让位的技能档案上；任一候选 ID 已入库即视为已存在。
function candidateIds(index, kind, name, userName, anchor) {
    const id = characterKeyFor(index, name, userName);
    const keys = new Set([id, nameKey(effectiveName(name, userName))]);
    for (const [old, holder] of index.superseded || []) if (holder === id) keys.add(old);
    return [...keys].map((key) => ledgerEntryId(kind, key, anchor));
}

// 楼层读取：按 messageId 缓存当前 swipe 与正文标签位置。用户楼只有战报会带标签，直接扫原文。
function floorReader(chat, sourceFilter) {
    const cache = new Map();
    return (messageId) => {
        if (cache.has(messageId)) return cache.get(messageId);
        const m = chat[messageId];
        let floor = null;
        if (isMessage(m)) {
            const text = messageText(m);
            const user = m.is_user === true;
            const result = user ? combatReportResult(text) : null;
            const report = result ? { ...result, reportId: reportIdOf(text) } : null;
            // 用户自己输入的楼不产生成长；只有程序生成的战报楼才计标签。
            const body = user ? text : combatBodyText(text, { sourceFilter });
            // 统一获得物标签（P7d）只在 AI 楼正文里，同样作为锚点。
            const tags = user && !report ? [] : [...scanCombatTags(body), ...(user ? [] : scanGainTags(body))];
            // 数值标签里会改生命的（剧情受伤、整场速算）同样作为锚点；与数值结算一样读原文，用户楼不扫。
            const life = user ? [] : scanStatLifeTags(text);
            floor = { swipeId: swipeOf(m), keys: new Set([...tags, ...life].map((tag) => `${tag.tagHash}#${tag.occurrence}`)), report };
        }
        cache.set(messageId, floor);
        return floor;
    };
}

// 锚点失效原因，有效时返回 null。deck / reward 不来自标签，只核对楼层与 swipe。
// 按剧情给的初始装备（equip，tagHash = INIT_GEAR_TAG_HASH）锚定开战楼，同样只核对楼层与 swipe；occurrence 为部位序号。
function anchorProblem(entry, floorOf) {
    const { anchor } = entry;
    const floor = floorOf(anchor.messageId);
    if (!floor) return 'message-missing';
    if (floor.swipeId !== anchor.swipeId) return 'swipe-changed';
    const tagless = TAGLESS_TYPES.has(entry.type) || ((entry.type === 'equip' || entry.type === 'unequip') && anchor.tagHash === GEAR_TAG_HASH)
        || (entry.type === 'equip' && anchor.tagHash === INIT_GEAR_TAG_HASH)
        || (entry.type === 'heal' && anchor.tagHash === USE_TAG_HASH);
    if (!tagless && !floor.keys.has(`${anchor.tagHash}#${anchor.occurrence}`)) return 'tag-missing';
    if (entry.type === 'exp' && floor.report?.result === 'lose') return 'defeat-no-exp';
    // loot 只认胜利战报楼，且楼里战报块的 ID 与条目一致。
    if (entry.type === 'loot' && (floor.report?.result !== 'win' || floor.report.reportId !== entry.payload.reportId)) return 'loot-report-invalid';
    // wound 只认战报楼（胜、败、撤退都算），且楼里战报块的 ID 与条目一致。
    if (entry.type === 'wound' && floor.report?.reportId !== entry.payload.reportId) return 'wound-report-invalid';
    return null;
}

function ownerOf(index, character) {
    if (index.characters.has(character)) return character;
    if (index.superseded?.has(character)) return index.superseded.get(character);
    return index.byNameKey.get(character) ?? null;
}

// 被 revoke 撤销的条目 ID（P7b：主角背包写入失败时撤销已入账标记）；已入账 ID 按基础 ID 计（去掉重试后缀「|rN」），撤销的不算。
const RETRY_SUFFIX_RE = /\|r\d+$/;
const revokedIds = (snapshot) => new Set(snapshot.entries.filter((e) => e.type === 'revoke').map((e) => e.payload.targetEntryId));
function liveEntryIds(snapshot) {
    const revoked = revokedIds(snapshot);
    return new Set(snapshot.entries.filter((e) => !revoked.has(e.id)).map((e) => e.id.replace(RETRY_SUFFIX_RE, '')));
}

// 主角背包条目的写入 ID：基础 ID 未用过时用它；已用且被撤销时依次取「基础ID|r1」「|r2」…；已用且未撤销视为已入账（present）。
export function stockEntryId(snapshot, id) {
    const revoked = revokedIds(snapshot);
    for (let n = 0; n < 50; n += 1) {
        const v = n ? `${id}|r${n}` : id;
        if (!snapshot.ids.has(v)) return { id: v };
        if (!revoked.has(v)) return { present: v };
    }
    return { error: 'combat-stock-retry-exhausted' };
}

// 卡组角色的可变成长状态：图鉴（基础卡 + 历任职业池 + 个人池 + 习得卡）、拥有张数、升级张数、当前卡组、已领奖励等级。
function deckState(profile, classProfile) {
    const owned = new Map();
    for (const id of profile.starterDeck) owned.set(id, (owned.get(id) || 0) + 1);
    return { catalog: buildCardCatalog(profile, classProfile), owned, upgraded: new Map(), deck: [...profile.starterDeck], claimed: new Set() };
}

function initCharacter(index, profile, diagnostics) {
    // gear：拥有的装备（含背包）与各部位当前装备；items：一次性道具余量；keepsakes：收藏的杂物（键为 loot 条目 ID）。卡组角色与技能角色都可持有。
    // points：积分余额，只有主角有收支。
    // traits：装着的抽到的人物特性；pendingTrait：装不下时抽到、尚未决定替换或放弃的特性；traitDraws：已生效的抽取次数。
    // innateDropped：被玩家替换掉的固有特性种类（active 人物技能 / passive 个人被动，traits.js），永久不再出现；slotUnlocks：已解锁的额外特性槽数（trait-slot 条目）。
    // wound：持续伤势，最近一场战后的生命 { hp, maxHp, down }（满血为 null），由 wound 条目写入、heal 条目恢复。
    const base = { id: profile.id, kind: profile.kind, name: profile.name, profile, exp: 0, gear: { owned: new Map(), slots: {} }, items: new Map(), keepsakes: new Map(), points: 0, traits: [], pendingTrait: null, traitDraws: 0, innateDropped: [], slotUnlocks: 0, wound: null };
    if (profile.kind === 'skill-character') return { ...base, className: profile.className, skills: [...profile.skills], passives: profile.passives };
    const classProfile = resolveClass(index, profile.classRef);
    if (!classProfile) diagnostics.push({ code: 'combat-class-missing', id: profile.id, classRef: profile.classRef });
    // classTier / tierName / tierCards：职业阶数（一阶起）、阶名与升阶追加的职业卡；换到另一个职业时回到一阶。
    return { ...base, classRef: classProfile?.id ?? profile.classRef, classProfile, classTier: 1, tierName: '', tierCards: [], ...deckState(profile, classProfile) };
}

// 新得到的卡计入拥有；卡组未满且同名未达上限时一并放进卡组，否则只进收藏。
function addOwned(c, cardId) {
    c.owned.set(cardId, (c.owned.get(cardId) || 0) + 1);
    const copies = c.deck.filter((id) => id === cardId).length;
    if (c.deck.length < COMBAT_RULES.deckMax && copies < cardCopyLimit(c.catalog.get(cardId)?.rarity)) c.deck.push(cardId);
}

const skillOverCap = (skill) => effectsDamage(skill?.effects) > COMBAT_RULES.allySkillDamageCap;
// 换到另一个职业时阶数回到一阶；升阶追加的卡已进图鉴，按「已有卡牌保留」留下。
const resetTier = (c) => { c.classTier = 1; c.tierName = ''; c.tierCards = []; };
// 主角背包投影是否生效（computeEffectiveState 注入 heroStock，P7b）：生效时主角的装备 / 道具 / 杂物条目只作已入账标记，数量与定义在物品表与装配表。
const stockOf = (c, ctx) => ctx?.heroStock === true && Boolean(ctx.heroId) && c.id === ctx.heroId;

// 战利品落到角色身上：卡牌按领悟进图鉴与卡组；装备只进背包、不自动穿上（带上槽位稀有度，卖出按它计价），已有同名装备时拒收；道具累加；杂物进背包，键为 loot 条目 ID（卖出时按它找）。
// stock 为真时装备、道具与杂物只核对伤害上限，由写口写进物品表与装配表。
function grantLoot(c, slot, entry, stock = false) {
    if (slot.kind === 'card') return HANDLERS.learn(c, { card: slot.card });
    if (stock) return slot.kind === 'gear' && effectsDamage(slot.gear.passive?.effects) > COMBAT_RULES.allySkillDamageCap ? 'combat-gear-damage-cap' : null;
    if (slot.kind === 'item') return HANDLERS.item(c, slot.item);
    if (slot.kind === 'gear') {
        if (c.gear.owned.has(slot.gear.gearId)) return 'combat-loot-gear-owned';
        if (effectsDamage(slot.gear.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-gear-damage-cap';
        c.gear.owned.set(slot.gear.gearId, { ...slot.gear, rarity: slot.rarity });
        return null;
    }
    c.keepsakes.set(entry.id, { lootId: entry.id, name: slot.name, origin: slot.origin, rarity: slot.rarity });
    return null;
}

// 每类条目的应用规则；返回诊断码表示拒收（条目不生效），返回 null 表示已生效。
const HANDLERS = Object.freeze({
    exp(c, p) {
        c.exp += p.amount;
        return null;
    },
    // 转职：职业池变更，已有卡牌保留；同名职业以先登记者为准。换到另一个职业时阶数回到一阶。
    class(c, p, { index }) {
        const cls = resolveClass(index, p.classRef);
        if (!cls) return 'combat-class-missing';
        if (c.kind === 'skill-character') {
            c.className = cls.className;
            return null;
        }
        if (c.classRef !== cls.id) resetTier(c);
        c.classRef = cls.id;
        c.classProfile = cls;
        for (const card of cls.classPool) if (!c.catalog.has(card.id)) c.catalog.set(card.id, card);
        return null;
    },
    learn(c, p) {
        if (c.kind === 'skill-character') {
            if (!p.skill) return 'combat-learn-kind-mismatch';
            if (c.skills.some((s) => s.id === p.skill.id)) return 'combat-skill-id-collision';
            if (skillOverCap(p.skill)) return 'combat-skill-damage-cap';
            c.skills.push(p.skill);
            return null;
        }
        if (!p.card) return 'combat-learn-kind-mismatch';
        // 专属卡只认档案里登记过的那几张，防止日志里出现伪造的 signature 卡。
        if (p.card.rarity === 'signature' && !(c.profile.signatureCards || []).some((s) => s.id === p.card.id)) return 'combat-signature-unknown';
        if (c.catalog.has(p.card.id)) return 'combat-card-id-collision';
        c.catalog.set(p.card.id, p.card);
        addOwned(c, p.card.id);
        return null;
    },
    upgrade(c, p) {
        if (c.kind === 'skill-character') {
            if (!p.skill) return 'combat-upgrade-kind-mismatch';
            const i = c.skills.findIndex((s) => s.id === p.targetId);
            if (i < 0) return 'combat-upgrade-target-missing';
            if (skillOverCap(p.skill)) return 'combat-skill-damage-cap';
            c.skills[i] = { ...p.skill, id: p.targetId };
            return null;
        }
        if (!p.card) return 'combat-upgrade-kind-mismatch';
        if (!c.owned.get(p.targetId)) return 'combat-upgrade-target-missing';
        // 专属卡精进：不替换卡面，只把已持有的副本标为升级形态。
        const target = c.catalog.get(p.targetId);
        if (target?.rarity === 'signature' || p.card.rarity === 'signature') {
            if (target?.rarity !== 'signature' || p.card.rarity !== 'signature') return 'combat-signature-upgrade-mismatch';
            const have = c.owned.get(p.targetId) || 0;
            if (!target.upgraded || (c.upgraded.get(p.targetId) || 0) >= have) return 'combat-upgrade-invalid';
            c.upgraded.set(p.targetId, have);
            return null;
        }
        c.catalog.set(p.targetId, { ...p.card, id: p.targetId });
        return null;
    },
    // 装备：同部位已有装备时顶替，旧装备留在 owned 里（即背包），可在构筑面板换回。
    // 构筑面板换装（tagHash = GEAR_TAG_HASH）只能装上已拥有的装备，不改写装备记录：来源标签楼换 swipe / 删楼后，面板条目不能把装备重新带回。
    equip(c, p, ctx = {}) {
        const { entry } = ctx;
        if (effectsDamage(p.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-gear-damage-cap';
        if (stockOf(c, ctx)) return null;
        if (entry?.anchor?.tagHash === GEAR_TAG_HASH) {
            const owned = c.gear.owned.get(p.gearId);
            if (!owned) return 'combat-gear-missing';
            c.gear.slots[owned.slot] = p.gearId;
            return null;
        }
        // 带稀有度的装备（D7）可能没有被动，并带 rarity 与六维加成 bonus；旧装备记录形状不变。
        c.gear.owned.set(p.gearId, { gearId: p.gearId, name: p.name, slot: p.slot, ...(p.passive ? { passive: p.passive } : {}), description: p.description,
            ...(p.rarity ? { rarity: p.rarity } : {}), ...(p.bonus ? { bonus: p.bonus } : {}) });
        c.gear.slots[p.slot] = p.gearId;
        return null;
    },
    unequip(c, p, ctx) {
        if (stockOf(c, ctx)) return null;
        if (!c.gear.owned.has(p.gearId)) return 'combat-gear-missing';
        for (const [slot, id] of Object.entries(c.gear.slots)) if (id === p.gearId) delete c.gear.slots[slot];
        return null;
    },
    item(c, p, ctx) {
        if (stockOf(c, ctx)) return null;
        const cur = c.items.get(p.itemId);
        c.items.set(p.itemId, { itemId: p.itemId, name: p.name, effects: p.effects, description: p.description, count: (cur?.count || 0) + p.count });
        return null;
    },
    // 剧情获得的杂物（P7d）：主角背包投影生效时只作已入账标记；否则记进收藏，键为条目 ID。
    keepsake(c, p, ctx) {
        if (stockOf(c, ctx)) return null;
        c.keepsakes.set(ctx.entry.id, { lootId: ctx.entry.id, name: p.name, origin: p.origin, rarity: p.rarity || 'common' });
        return null;
    },
    // 消耗超过余量时整条拒收，不扣成负数。
    consume(c, p, ctx) {
        if (stockOf(c, ctx)) return null;
        const cur = c.items.get(p.itemId);
        if (!cur || cur.count < p.count) return 'combat-item-insufficient';
        cur.count -= p.count;
        return null;
    },
    // 持续伤势：wound 覆盖为最近一场的战后生命，满血且没倒下时清空；倒下记 0 点。
    wound(c, p) {
        c.wound = p.hp >= p.maxHp && !p.down ? null : { hp: p.down ? 0 : p.hp, maxHp: p.maxHp, down: p.down };
        return null;
    },
    // 剧情回血：点数或按记录上限的百分比，乘写入时的难度倍率，至少 1 点；没有伤势时不起作用；回血后不再算倒下，回满时清空。
    heal(c, p) {
        const w = c.wound;
        if (!w) return null;
        const raw = p.mode === 'percent' ? Math.ceil((w.maxHp * p.amount) / 100) : p.amount;
        const hp = Math.min(w.maxHp, w.hp + Math.max(1, Math.round((raw * p.scale) / 100)));
        c.wound = hp >= w.maxHp ? null : { hp, maxHp: w.maxHp, down: false };
        return null;
    },
    // 剧情受伤（合并计划 N3）：按伤势记录的上限（没有伤势时按写入时的生命上限）扣 pct%，至少 1 点，可以扣到 0；扣到 0 记为倒下，回血后恢复。
    hurt(c, p) {
        const w = c.wound || { hp: p.maxHp, maxHp: p.maxHp, down: false };
        const hp = Math.max(0, w.hp - Math.max(1, Math.round((w.maxHp * p.pct) / 100)));
        c.wound = { hp, maxHp: w.maxHp, down: hp <= 0 };
        return null;
    },
    // 升级奖励：只能领取已达到的等级，每级一次；新卡须在图鉴里，升级须有未升级的副本且卡有升级形态。
    reward(c, p) {
        if (c.kind !== 'deck-character') return 'combat-reward-kind-mismatch';
        if (expProgress(c.exp).level < p.level) return 'combat-reward-level-unreached';
        if (c.claimed.has(p.level)) return 'combat-reward-duplicate';
        const { choice } = p;
        if (choice.kind === 'card') {
            if (!c.catalog.has(choice.cardId)) return 'combat-reward-card-unknown';
            if (c.catalog.get(choice.cardId).rarity === 'signature') return 'combat-reward-signature';
            addOwned(c, choice.cardId);
        } else if (choice.kind === 'upgrade') {
            if (c.catalog.get(choice.targetId)?.rarity === 'signature') return 'combat-reward-signature';
            const have = c.owned.get(choice.targetId) || 0;
            const done = c.upgraded.get(choice.targetId) || 0;
            if (!have || done >= have || !c.catalog.get(choice.targetId)?.upgraded) return 'combat-reward-upgrade-invalid';
            c.upgraded.set(choice.targetId, done + 1);
        }
        c.claimed.add(p.level);
        return null;
    },
    // 卡组：只保留当前仍拥有的卡（同名不超过拥有数与上限），剔除时标记「卡组需调整」，不自动补卡。
    deck(c, p, { entry, diagnostics }) {
        if (c.kind !== 'deck-character') return 'combat-deck-kind-mismatch';
        const used = new Map();
        const kept = [];
        for (const id of p.cards) {
            const n = used.get(id) || 0;
            if (n >= (c.owned.get(id) || 0) || n >= cardCopyLimit(c.catalog.get(id)?.rarity)) continue;
            used.set(id, n + 1);
            kept.push(id);
        }
        const removed = p.cards.length - kept.length;
        if (removed) diag(diagnostics, 'combat-deck-adjusted', entry, { removed });
        c.deck = kept;
        c.deckNeedsAdjust = removed > 0 || kept.length < COMBAT_RULES.deckMin;
        c.deckRevision = p.revision;
        return null;
    },
    // 准备阶段奖励：按 combatId 归并，同一场只认最先生效的一条；不改角色状态，兑现由战报楼 loot 条目负责。
    offer(c, p, { entry, offers }) {
        if (offers.has(p.combatId)) return 'combat-offer-duplicate';
        offers.set(p.combatId, { entryId: entry.id, character: c.id, anchor: { ...entry.anchor }, ...p });
        return null;
    },
    // 翻牌兑现：每场只认最先生效的一条；开战楼 offer 须仍有效、属于同一角色，槽位与 offer 一致，发放的奖励以 offer 为准。
    // 备用套（cost > 0）由主角积分支付，余额不足整条拒收；主套不花分。奖励发放失败时不扣分。
    loot(c, p, { entry, offers, loots, heroId, heroStock }) {
        if (loots.has(p.combatId)) return 'combat-loot-duplicate';
        const offer = offers.get(p.combatId);
        if (!offer) return 'combat-loot-offer-missing';
        if (offer.character !== c.id) return 'combat-loot-owner-mismatch';
        if (reportIdFor(p.combatId) !== p.reportId) return 'combat-loot-report-mismatch';
        const slot = (p.set === 'reserve' ? offer.reserve : offer.slots)?.[p.slot.index];
        if (!slot || slot.kind !== p.slot.kind || slot.name !== p.slot.name || slot.rarity !== p.slot.rarity) return 'combat-loot-slot-mismatch';
        if ((p.set === 'reserve') !== (p.cost > 0)) return 'combat-loot-cost-invalid';
        if (p.cost > 0 && heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        if (c.points < p.cost) return 'combat-points-insufficient';
        const reason = grantLoot(c, slot, entry, heroStock === true && c.id === heroId);
        if (reason) return reason;
        c.points -= p.cost;
        loots.set(p.combatId, { entryId: entry.id, character: c.id, set: p.set, index: p.slot.index });
        return null;
    },
    // 背包卖出：只主角。杂物须仍在背包里（对应 loot 已失效或已卖出时拒收）；装备须仍拥有且未装备（穿戴中拒收，须先卸下）。
    // 售价按稀有度基准与物品身份确定性浮动（points.js 的 sellPrice），不写进载荷。
    sell(c, p, ctx = {}) {
        const { heroId } = ctx;
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        // 主角背包（P7b）：物品已由写口从物品表扣掉，条目带卖出时的稀有度，按它与物品身份计价；不带稀有度的旧条目对应的旧背包已丢弃，拒收。
        if (stockOf(c, ctx)) {
            if (!p.rarity) return 'combat-sell-legacy';
            c.points += sellPrice(p.rarity, p.itemId || p.gearId || p.lootId);
            return null;
        }
        if (p.itemId) return 'combat-sell-target-invalid';
        if (p.gearId) {
            const gear = c.gear.owned.get(p.gearId);
            if (!gear) return 'combat-gear-missing';
            if (Object.values(c.gear.slots).includes(p.gearId)) return 'combat-gear-equipped';
            c.gear.owned.delete(p.gearId);
            c.points += sellPrice(gear.rarity, p.gearId);
            return null;
        }
        const keepsake = c.keepsakes.get(p.lootId);
        if (!keepsake) return 'combat-keepsake-missing';
        c.keepsakes.delete(p.lootId);
        c.points += sellPrice(keepsake.rarity, p.lootId);
        return null;
    },
    // 重新生成基础卡组：只主角，花 cost（须为 REBUILD_COST，余额不足整条拒收）。职业不变，换掉个人卡池与起始卡组：旧起始卡组计入的拥有张数扣回、
    // 旧个人池的卡移出图鉴 / 拥有 / 升级，再按新起始卡组计入；领悟、翻牌与奖励得到的卡保留；卡组重置为新起始卡组。新起始卡组须按当前职业合规、新卡 ID 不与现有卡相撞。
    rebuild(c, p, { heroId }) {
        if (c.kind !== 'deck-character') return 'combat-rebuild-kind-mismatch';
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        if (p.cost !== REBUILD_COST) return 'combat-rebuild-cost-invalid';
        if (c.points < p.cost) return 'combat-points-insufficient';
        const profile = { ...c.profile, personalPool: p.personalPool, starterDeck: p.starterDeck };
        if (!c.classProfile || !validateStarterDeck({ ...profile, classRef: c.classProfile.id }, c.classProfile).ok) return 'combat-rebuild-invalid';
        const oldPersonal = new Set((c.profile.personalPool || []).map((card) => card.id));
        if (p.personalPool.some((card) => c.catalog.has(card.id) && !oldPersonal.has(card.id))) return 'combat-card-id-collision';
        for (const id of c.profile.starterDeck || []) c.owned.set(id, (c.owned.get(id) || 0) - 1);
        for (const id of oldPersonal) { c.catalog.delete(id); c.owned.delete(id); c.upgraded.delete(id); }
        for (const card of p.personalPool) c.catalog.set(card.id, card);
        for (const id of p.starterDeck) c.owned.set(id, (c.owned.get(id) || 0) + 1);
        for (const [id, n] of [...c.owned]) {
            if (n <= 0) { c.owned.delete(id); c.upgraded.delete(id); } else if ((c.upgraded.get(id) || 0) > n) c.upgraded.set(id, n);
        }
        c.profile = profile;
        c.deck = [...p.starterDeck];
        c.deckNeedsAdjust = false;
        c.points -= p.cost;
        return null;
    },
    // 转职（花积分）：只主角，cost 须为 RESPEC_COST、余额足够，换到与当前不同的已登记职业；职业池按 class 规则变更（已有卡牌保留），阶数回到一阶。
    respec(c, p, ctx) {
        if (c.kind !== 'deck-character') return 'combat-respec-kind-mismatch';
        if (ctx.heroId && c.id !== ctx.heroId) return 'combat-points-not-protagonist';
        if (p.cost !== RESPEC_COST) return 'combat-respec-cost-invalid';
        if (c.points < p.cost) return 'combat-points-insufficient';
        const cls = resolveClass(ctx.index, p.classRef);
        if (!cls) return 'combat-class-missing';
        if (cls.id === c.classRef) return 'combat-respec-same-class';
        HANDLERS.class(c, { classRef: cls.id }, ctx);
        c.points -= p.cost;
        return null;
    },
    // 职业升阶：只主角，逐阶升到当前阶 +1（最高三阶）；须仍是当前职业、达到该阶等级门槛、cost 与 3 张追加卡的稀有度合该阶规则（ASCEND_TIERS）、
    // 卡牌 ID 不与现有卡相撞、余额足够。追加卡进图鉴（职业池的一部分，可在升级三选一中出现），不直接计入拥有；被动由角色视图按阶加强。
    ascend(c, p, { index, heroId }) {
        if (c.kind !== 'deck-character') return 'combat-ascend-kind-mismatch';
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        const rule = ASCEND_TIERS[p.tier];
        if (!rule || p.tier !== c.classTier + 1) return 'combat-ascend-tier-invalid';
        const cls = resolveClass(index, p.classRef);
        if (!cls || !c.classProfile || cls.id !== c.classProfile.id) return 'combat-ascend-class-mismatch';
        if (p.cost !== rule.cost) return 'combat-ascend-cost-invalid';
        if (expProgress(c.exp).level < rule.level) return 'combat-ascend-level-unreached';
        if (p.cards.some((card) => card.rarity !== rule.rarity)) return 'combat-ascend-rarity-invalid';
        if (p.cards.some((card) => c.catalog.has(card.id))) return 'combat-card-id-collision';
        if (c.points < p.cost) return 'combat-points-insufficient';
        for (const card of p.cards) c.catalog.set(card.id, card);
        c.classTier = p.tier;
        c.tierName = p.tierName;
        c.tierCards = [...c.tierCards, ...p.cards];
        c.points -= p.cost;
        return null;
    },
    // 人物特性（P-d）：只主角（卡组角色），cost 须为 TRAIT_DRAW_COST、余额足够；有待定特性（装不下时还没决定替换或放弃）时不能再抽。被动受队友技能伤害上限约束。
    // v4 条目（带 kind）装得下（traitFits：有空槽且主动不超上限）时直接装上，否则待定，由 trait-pick 决定；旧条目（没有 kind）照旧只数抽到的特性，满 TRAIT_BASE_SLOTS 个才待定。
    trait(c, p, { heroId }) {
        if (c.kind !== 'deck-character') return 'combat-trait-kind-mismatch';
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        if (p.cost !== TRAIT_DRAW_COST) return 'combat-trait-cost-invalid';
        if (c.points < p.cost) return 'combat-points-insufficient';
        if (c.pendingTrait) return 'combat-trait-pending';
        if (c.traits.some((t) => t.traitId === p.traitId)) return 'combat-trait-duplicate';
        if (effectsDamage(p.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-trait-damage-cap';
        const { cost, ...trait } = p;
        c.traitDraws += 1;
        c.points -= cost;
        if (p.kind ? traitFits(c, p.kind) : c.traits.length < TRAIT_BASE_SLOTS) c.traits = [...c.traits, trait];
        else c.pendingTrait = trait;
        return null;
    },
    // 装不下时的决定：drop 为被替换的已装特性（待定特性装上）、保留着的固有特性（人物技能或个人被动的 ID，记入 innateDropped）或待定特性自己（放弃）；被 drop 的永久消失，积分不退。
    // 替换不能让其他保留着的固有特性暂停，主动特性不能超过 TRAIT_ACTIVE_MAX，否则拒收（combat-trait-pick-blocked）。
    'trait-pick'(c, p, { heroId }) {
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        const pending = c.pendingTrait;
        if (!pending || pending.traitId !== p.traitId) return 'combat-trait-pick-invalid';
        if (p.drop !== pending.traitId) {
            const next = traitSwap(c, pending, p.drop);
            if (!next) return 'combat-trait-pick-invalid';
            if (next.blocked) return 'combat-trait-pick-blocked';
            c.traits = next.traits;
            c.innateDropped = next.innateDropped;
        }
        c.pendingTrait = null;
        return null;
    },
    // 解锁特性槽（v4，助手 10-28）：只主角，slot 须为下一个可解锁的槽（nextTraitSlot）、cost 须为该槽价格、余额足够；永久生效，随楼层回退。
    // 暂停的固有特性随之按序回来；之后仍装得下待定特性时，待定特性直接装上。
    'trait-slot'(c, p, { heroId }) {
        if (c.kind !== 'deck-character') return 'combat-trait-slot-kind-mismatch';
        if (heroId && c.id !== heroId) return 'combat-points-not-protagonist';
        const next = nextTraitSlot(c);
        if (!next || p.slot !== next.slot) return 'combat-trait-slot-invalid';
        if (p.cost !== next.cost) return 'combat-trait-slot-cost-invalid';
        if (c.points < p.cost) return 'combat-points-insufficient';
        c.points -= p.cost;
        c.slotUnlocks += 1;
        if (c.pendingTrait && traitFits(c, c.pendingTrait.kind)) {
            c.traits = [...c.traits, c.pendingTrait];
            c.pendingTrait = null;
        }
        return null;
    },
});

const tagKey = (owner, e) => [owner, e.type, e.anchor.messageId, e.anchor.swipeId, e.anchor.tagHash, e.anchor.occurrence].join('|');

// 角色视图里的职业档案按阶派生：被动按阶加强（passiveAtTier），职业池追加升阶卡；一阶或职业缺失时原样返回登记的档案。
function tieredClass(c) {
    const cls = c.classProfile;
    if (!cls || !(c.classTier > 1)) return cls;
    return { ...cls, classPassive: passiveAtTier(cls.classPassive, c.classTier), classPool: [...cls.classPool, ...c.tierCards] };
}

function characterView(c, opts = {}) {
    const progress = expProgress(c.exp);
    // 主角背包（P7b）：注入物品表投影时，主角的装备、道具与杂物取自物品表与装配表（inventory-view.js），账本条目只作已入账标记。
    const inv = opts.heroInventory && c.id === opts.heroId ? opts.heroInventory : null;
    const equipped = new Set(Object.values(c.gear.slots));
    const gear = inv ? { slots: Object.fromEntries(Object.entries(inv.gear.slots).map(([slot, g]) => [slot, { ...g }])), bag: inv.gear.bag.map((g) => ({ ...g })) } : {
        slots: Object.fromEntries(Object.entries(c.gear.slots).map(([slot, id]) => [slot, c.gear.owned.get(id)])),
        bag: [...c.gear.owned.values()].filter((g) => !equipped.has(g.gearId)),
    };
    const items = (inv ? inv.items : [...c.items.values()]).filter((i) => i.count > 0).map((i) => ({ ...i }));
    // 装着的装备六维加成（D7）计入属性视图：检定、卡牌属性换算与开战快照都读这里；卸下即不再计入。
    const gearBonuses = Object.values(gear.slots).map((g) => g?.bonus).filter(Boolean);
    const attributes = attributeView({ key: c.id, name: c.name, protagonist: c.id === opts.heroId, exp: c.exp, archetype: c.classProfile?.archetype, className: c.classProfile?.className ?? c.className ?? '', gearBonuses }, opts.actx || EMPTY_ATTR_CTX);
    // collection：收藏的杂物 { lootId, name, origin, rarity }；points：积分余额（只主角有收支）。
    // 主角背包投影下杂物为 { itemId, name, origin, rarity, count }（同名叠数量）。
    const collection = (inv ? inv.collection : [...c.keepsakes.values()]).map((k) => ({ ...k }));
    // traits / pendingTrait：装着的与待定的人物特性（拷贝）；traitDraws：已生效的抽取次数（稀有度种子用）；slotUnlocks：已解锁的额外特性槽数。
    // wound：持续伤势（拷贝），没有伤势时为 null。
    const traits = c.traits.map((t) => ({ ...t }));
    const base = { id: c.id, kind: c.kind, name: c.name, profile: c.profile, exp: c.exp, level: progress.level, into: progress.into, next: progress.next, gear, items, attributes, collection, points: c.points, traits, pendingTrait: c.pendingTrait ? { ...c.pendingTrait } : null, traitDraws: c.traitDraws, innateDropped: [...c.innateDropped], slotUnlocks: c.slotUnlocks, wound: c.wound ? { ...c.wound } : null };
    // others：物品表里没有装配定义的剧情物品（只显示、不可卖）；inventory：物品表读取状态，失败时写口 fail-closed。
    if (inv) Object.assign(base, { others: inv.others.map((o) => ({ ...o })), inventory: inv.ok ? { ok: true } : { ok: false, reason: inv.reason } });
    if (c.kind === 'skill-character') return { ...base, className: c.className, skills: c.skills, passives: c.passives };
    const left = new Map(c.upgraded);
    const deckEntries = c.deck.map((cardId) => {
        const n = left.get(cardId) || 0;
        if (n > 0) left.set(cardId, n - 1);
        return { cardId, upgraded: n > 0 };
    });
    const check = validateDeck(c.deck, c.owned, c.catalog);
    const pendingRewards = [];
    // 只有主角有三选一；属性提升等级改发属性提升点，不产生待领奖励。未识别主角（未传 userName）时对全部卡组角色照旧计算。
    const chooser = !opts.heroId || c.id === opts.heroId;
    for (let lv = 2; chooser && lv <= progress.level; lv += 1) if (!c.claimed.has(lv) && !isAsiLevel(lv, true)) pendingRewards.push(lv);
    return {
        ...base,
        classRef: c.classRef,
        className: c.classProfile?.className ?? '',
        classProfile: tieredClass(c),
        classTier: c.classTier,
        tierName: c.tierName,
        hpMax: c.profile.base.hp + (progress.level - 1) * c.profile.growth.hpPerLevel,
        catalog: c.catalog,
        owned: c.owned,
        upgraded: c.upgraded,
        deck: c.deck,
        deckEntries,
        deckRevision: c.deckRevision ?? null,
        deckErrors: check.errors,
        deckNeedsAdjust: c.deckNeedsAdjust === true || !check.ok,
        claimedLevels: [...c.claimed].sort((a, b) => a - b),
        pendingRewards,
    };
}

// ---- 属性表折叠 ----
// alloc 不来自标签，锚点 tagHash 固定为此值，只核对楼层与 swipe。
export const ALLOC_TAG_HASH = 'alloc';
const ROLE_KEYS = Object.keys(COMBAT_RULES.archetypes);
const ATTR_RANK = Object.freeze({ rel: 0, story: 1, reward: 2, alloc: 3 });
const byAttrAnchor = (a, b) => a.anchor.messageId - b.anchor.messageId || ATTR_RANK[a.type] - ATTR_RANK[b.type]
    || a.anchor.occurrence - b.anchor.occurrence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(n) || 0)));
const emptyFold = () => ({ init: null, rel: [], story: [], reward: [], alloc: [] });
const isHeroName = (name, userName) => {
    const raw = String(name || '').trim();
    return PROTAGONIST_ALIASES.includes(raw) || (Boolean(userName) && raw === userName);
};

function attributeAnchorProblem(rec, floorOf) {
    const { anchor } = rec;
    const floor = floorOf(anchor.messageId);
    if (!floor) return 'message-missing';
    if (floor.swipeId !== anchor.swipeId) return 'swipe-changed';
    if (rec.type !== 'alloc' && !floor.keys.has(`${anchor.tagHash}#${anchor.occurrence}`)) return 'tag-missing';
    return null;
}

// init 每角色以最早写入的为准（名字键与档案 ID 归并到同一角色）；有锚点的记录按楼层与 swipe 核对，失效列入 inactive。
function foldAttributes(records, index, floorOf, diagnostics) {
    const fold = new Map();
    const inactive = [];
    const slot = (character) => {
        const key = ownerOf(index, character) ?? character;
        if (!fold.has(key)) fold.set(key, emptyFold());
        return fold.get(key);
    };
    const inits = records.filter((r) => r.type === 'init').sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    for (const r of inits) {
        const f = slot(r.character);
        if (f.init) diagnostics.push({ code: 'combat-attribute-init-duplicate', id: r.id, character: r.character });
        else f.init = r.payload;
    }
    for (const r of records.filter((x) => x.type !== 'init').sort(byAttrAnchor)) {
        const problem = attributeAnchorProblem(r, floorOf);
        if (problem) inactive.push({ id: r.id, reason: problem });
        else slot(r.character)[r.type].push(r);
    }
    return { fold, inactive };
}

const fallbackRole = (name, archetype) => (ROLE_KEYS.includes(archetype) ? archetype : ROLE_KEYS[hash32(`role:${name}`) % ROLE_KEYS.length]);
const pointsOf = (list) => list.filter((r) => r.payload.ability !== 'free').map((r) => r.payload);
const freeOf = (list) => list.reduce((sum, r) => sum + (r.payload.ability === 'free' ? r.payload.amount : 0), 0);
const EMPTY_ATTR_CTX = Object.freeze({ fold: new Map(), heroLevel: 1, table: 'missing' });

// 角色属性视图：有 init 时取其职业名、定位与倾向；缺 init 时定位取职业原型或按名字散列，倾向用默认。
// 主角等级由 EXP 决定；非主角取最近一条有效 rel（档位生效楼的主角等级 + 偏移），从未打档按「相当」跟随主角当前等级。
// fallbackPrefs：没有 init 时的倾向（只开数值系统时主角建卡选的主擅长 / 次擅长 / 短板，合并计划 N1）。
function attributeView({ key, name, protagonist, exp = 0, archetype, className = '', gearBonuses = [], fallbackPrefs = null }, ctx) {
    const f = ctx.fold.get(key) || emptyFold();
    const init = f.init;
    const role = init?.role ?? fallbackRole(name, archetype);
    const prefs = init ? { major: init.major, minor: init.minor, weak: init.weak } : normalizePrefs(fallbackPrefs) || defaultPrefs(role);
    const rel = protagonist ? null : (f.rel[f.rel.length - 1]?.payload ?? null);
    const tier = protagonist ? null : (rel?.tier ?? DEFAULT_REL_TIER);
    const level = protagonist ? expProgress(exp).level
        : rel ? clampInt(rel.anchorLevel + rel.offset, 1, levelCap(false))
            : relLevel({ name, tier: DEFAULT_REL_TIER, anchorLevel: ctx.heroLevel });
    const allocations = f.alloc.flatMap(r => r.payload.picks || [r.payload]);
    // 装备加成与其他调整同样受属性上限约束（abilities.js）。
    const adjustments = [...pointsOf(f.story), ...pointsOf(f.reward), ...allocations, ...gearBonuses];
    // 手动建档（P8c）的 init 带六项分值时以其为底分；旧 init 只有倾向，按标准数组。
    const derived = deriveAbilities({ prefs, name, level, protagonist: Boolean(protagonist), tier: tier ?? DEFAULT_REL_TIER, adjustments, ...(init?.scores ? { base: init.scores } : {}) });
    const spent = allocations.reduce((sum, pick) => sum + pick.amount, 0);
    const balance = protagonist ? Math.max(0, asiCountAt(level, true) * ASI_POINTS + freeOf(f.story) + freeOf(f.reward) - spent) : 0;
    return { className: init?.className || className, role, prefs, initialized: Boolean(init), protagonist: Boolean(protagonist), tier, relTagged: Boolean(rel), level, ...derived, balance, table: ctx.table };
}

// 未登记为角色档案的人物（敌人、路人、尚无档案的主角）按名字键取属性；state 为 computeEffectiveState 的结果。
// protagonist：尚无档案的主角（等级取名字键上的剧情 EXP），prefs 为没有 init 时的倾向。
export function attributeViewFor(state, name, { archetype, protagonist = false, prefs = null } = {}) {
    if (!state || state.ok !== true || !state.attributes) return null;
    const clean = String(name || '').trim();
    const { fold, heroLevel, table } = state.attributes;
    const exp = protagonist ? state.unassignedExp?.get(nameKey(clean)) || 0 : 0;
    return attributeView({ key: nameKey(clean), name: clean, protagonist, exp, archetype, fallbackPrefs: protagonist ? prefs : null }, { fold, heroLevel, table });
}

// 按名字取属性视图（检定用）：主角别名与 <user> 归到 userName；已登记角色取档案视图，其余按名字键推导。
// heroPrefs：主角尚无档案也没有 init 时的倾向（合并计划 N1）。
export function abilitiesForName(state, name, userName = '', { heroPrefs = null } = {}) {
    if (!state || state.ok !== true) return null;
    const raw = String(name || '').replace(/<user>|\{\{user\}\}/gi, (m) => userName || m).trim();
    const clean = effectiveName(raw, userName);
    if (!clean) return null;
    for (const c of state.characters.values()) {
        if (c.name === clean || (c.profile?.aliases || []).includes(clean)) return c.attributes || null;
    }
    return attributeViewFor(state, clean, userName && clean === userName ? { protagonist: true, prefs: heroPrefs, archetype: HERO_BASE_ARCHETYPE } : {});
}

// 按名字取生命视图 { hp, maxHp, down }（合并计划 Q4 / N2）：已登记角色按开战换算的上限与持续伤势；
// 尚无档案的主角按默认职业原型（战士）生命基数与六维换算，伤势取名字键上的剧情受伤 / 回血；其余人物返回 null。
export function vitalsForName(state, name, userName = '', { heroPrefs = null } = {}) {
    if (!state || state.ok !== true) return null;
    const raw = String(name || '').replace(/<user>|\{\{user\}\}/gi, (m) => userName || m).trim();
    const clean = effectiveName(raw, userName);
    if (!clean) return null;
    for (const c of state.characters.values()) {
        if (c.name === clean || (c.profile?.aliases || []).includes(clean)) return vitalsOf(characterCombatStats(c).hp, c.wound);
    }
    if (!userName || clean !== userName) return null;
    const attributes = attributeViewFor(state, clean, { protagonist: true, prefs: heroPrefs, archetype: HERO_BASE_ARCHETYPE });
    return vitalsOf(heroBaseStats(attributes).hp, state.looseVitals?.get(nameKey(clean))?.wound ?? null);
}


// 归并：只读计算，不修改表。读取失败原样返回 ok:false；失效条目列入 inactive（切回原 swipe 后自然恢复），拒收条目只记诊断。
export function computeEffectiveState(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return snapshot?.ok === false ? snapshot : { ok: false, reason: 'combat-ledger-read-failed' };
    const diagnostics = [...snapshot.diagnostics];
    const index = indexProfiles(snapshot.profiles, diagnostics);
    const floorOf = floorReader(Array.isArray(chat) ? chat : [], options.sourceFilter);
    const revoked = new Set(snapshot.entries.filter((e) => e.type === 'revoke').map((e) => e.payload.targetEntryId));
    const state = new Map();
    for (const profile of index.characters.values()) state.set(profile.id, initCharacter(index, profile, diagnostics));
    const unassignedExp = new Map();
    const applied = [];
    const inactive = [];
    const growth = [];
    const seen = new Set();
    const offers = new Map();
    const loots = new Map();
    // 尚无档案的人物（只开数值系统时的主角）的生命：按名字键记 hurt / heal，档案登记后由 ownerOf 归到档案。
    const looseVitals = new Map();
    // 最近一场战斗的我方成员：最后一批生效的 wound 条目（同一战报楼）的角色，按写入顺序；正文注入主角团状态用（计划 5.8）。
    let lastParty = null;
    // 主角按 userName 识别：成长演出标记属性提升等级，属性视图据此区分主角。
    const userName = options.userName || '';
    const heroId = userName ? resolveCharacterId(index, userName, userName) : null;
    // 主角背包投影（P7b）：注入时主角的装备、道具与杂物取自物品表与装配表，账本条目只作已入账标记。
    const heroStock = Boolean(heroId && options.heroInventory);
    const timeline = snapshot.entries.filter((e) => !ANCHORLESS_TYPES.has(e.type)).sort(byAnchor);
    for (const e of timeline) {
        const problem = revoked.has(e.id) ? 'revoked' : anchorProblem(e, floorOf);
        if (problem) {
            inactive.push({ id: e.id, reason: problem });
            continue;
        }
        const owner = ownerOf(index, e.character);
        // 同一标签先以名字键、后以档案 ID 各记一次时只计一次。
        if (!TAGLESS_TYPES.has(e.type)) {
            const key = tagKey(owner ?? e.character, e);
            if (seen.has(key)) {
                diag(diagnostics, 'combat-entry-duplicate-tag', e);
                continue;
            }
            seen.add(key);
        }
        if (!owner) {
            if (e.type === 'exp') {
                unassignedExp.set(e.character, (unassignedExp.get(e.character) || 0) + e.payload.amount);
                applied.push(e.id);
            } else if (e.type === 'hurt' || e.type === 'heal') {
                const loose = looseVitals.get(e.character) || { wound: null };
                HANDLERS[e.type](loose, e.payload);
                looseVitals.set(e.character, loose);
                applied.push(e.id);
            } else diag(diagnostics, 'combat-character-missing', e);
            continue;
        }
        // 让位档案只把 EXP 交给接替的卡组档案；技能、职业等条目属于旧的技能形态，不套用到卡组角色上。
        if (index.superseded.has(e.character) && e.type !== 'exp') {
            diag(diagnostics, 'combat-superseded-entry-skipped', e, { kept: owner });
            continue;
        }
        const c = state.get(owner);
        const levelBefore = expProgress(c.exp).level;
        const reason = HANDLERS[e.type](c, e.payload, { index, entry: e, diagnostics, offers, loots, heroId, heroStock });
        if (reason) diag(diagnostics, reason, e);
        else {
            applied.push(e.id);
            if (GROWTH_FX_TYPES.has(e.type)) growth.push(growthEvent(e, c, levelBefore, index, heroId));
            if (e.type === 'wound') {
                if (lastParty?.messageId !== e.anchor.messageId) lastParty = { messageId: e.anchor.messageId, reportId: e.payload.reportId, ids: [] };
                if (!lastParty.ids.includes(owner)) lastParty.ids.push(owner);
            }
        }
    }
    // 属性：主角按 userName 识别；属性表缺失时按默认推导（table: 'missing'），不阻断。
    const folded = foldAttributes(snapshot.attributes || [], index, floorOf, diagnostics);
    const hero = heroId ? state.get(heroId) : null;
    const actx = { fold: folded.fold, heroLevel: hero ? expProgress(hero.exp).level : 1, table: snapshot.attributeTable || 'missing' };
    const characters = new Map([...state].map(([id, c]) => [id, characterView(c, { heroId, actx, ...(heroStock ? { heroInventory: options.heroInventory } : {}) })]));
    const attributes = { table: actx.table, heroId, heroLevel: actx.heroLevel, fold: folded.fold, inactive: folded.inactive };
    // profileMeta：档案 ID → { version 档案表当前最高版本（日志里的 profile 条目为 -1）, createdAt 登记时间 }，供补技能写新版本档案时沿用登记时间（名字归属按登记先后）。
    return { ok: true, characters, classes: index.classes, enemies: index.enemies, profileMeta: new Map([...snapshot.profiles].map(([id, r]) => [id, { version: r.version, createdAt: r.createdAt }])), unassignedExp, applied, inactive, diagnostics, growth, attributes, offers, loots, lastParty, looseVitals };
}

// 成长演出只读的事件：已生效的标签类成长条目，带接手角色、楼层锚点与条目生效前后的等级。
const GROWTH_FX_TYPES = new Set(['exp', 'learn', 'upgrade', 'class']);

function growthEvent(e, c, levelBefore, index, heroId = null) {
    const p = e.payload;
    const name = e.type === 'class' ? resolveClass(index, p.classRef)?.className || '' : (p.card || p.skill)?.name || '';
    const levelAfter = expProgress(c.exp).level;
    // 主角跨过的属性提升等级（每级 +2 点）；非主角与未跨级时不带字段，旧事件形状不变。
    const asiLevels = c.id === heroId ? Array.from({ length: Math.max(0, levelAfter - levelBefore) }, (_, i) => levelBefore + 1 + i).filter((lv) => isAsiLevel(lv, true)) : [];
    return {
        id: e.id, type: e.type, character: c.id, characterName: c.name, anchor: { ...e.anchor },
        amount: e.type === 'exp' ? p.amount : 0, name, levelBefore, levelAfter,
        ...(asiLevels.length ? { asiPoints: asiLevels.length * ASI_POINTS } : {}),
    };
}

// equip / item 需要副 LLM 生成被动或道具效果；unequip 不需要生成，扫描时直接落账。
const GENERATED_KINDS = new Set(['learn', 'upgrade', 'class', 'equip', 'item']);

function floorAnchor(m, messageId, tag) {
    return { messageId, swipeId: swipeOf(m), tagHash: tag.tagHash, occurrence: tag.occurrence };
}

// 属性标签扫描上下文（state 为扫描开始时的归并结果）：当前有效 rel 档位（按角色、按楼层）与主角已生效的 EXP 条目，用于判断档位是否变化、取档位生效楼的主角等级。
function attributeScanContext(snapshot, state, index, options) {
    const userName = options.userName || '';
    const heroId = userName ? resolveCharacterId(index, userName, userName) : null;
    const applied = new Set(state.ok ? state.applied : []);
    const heroExp = heroId && state.ok ? snapshot.entries.filter((e) => e.type === 'exp' && applied.has(e.id) && ownerOf(index, e.character) === heroId) : [];
    const rels = new Map();
    for (const [key, f] of state.ok ? state.attributes.fold : []) rels.set(key, f.rel.map((r) => ({ messageId: r.anchor.messageId, tier: r.payload.tier })));
    return { heroId, heroExp, rels };
}

function tierBefore(ctx, key, messageId) {
    const list = (ctx.rels.get(key) || []).filter((r) => r.messageId <= messageId);
    return list.length ? list[list.length - 1].tier : DEFAULT_REL_TIER;
}

function heroLevelAt(ctx, index, entries, messageId) {
    if (!ctx.heroId) return 1;
    const fresh = entries.filter((e) => e.type === 'exp' && ownerOf(index, e.character) === ctx.heroId);
    const exp = [...ctx.heroExp, ...fresh].filter((e) => e.anchor.messageId <= messageId).reduce((sum, e) => sum + e.payload.amount, 0);
    return clampInt(expProgress(exp).level, 1, COMBAT_RULES.maxLevel);
}

// rel：只给非主角，档位与该角色此前有效档位（从未打档按「相当」）相同则不写；stat：只给主角，其他角色只记诊断。
function scanAttributeDirective(d, anchor, messageId, s) {
    const { index, userName, now, ctx } = s;
    const hero = isHeroName(d.character, userName) || (Boolean(ctx.heroId) && resolveCharacterId(index, d.character, userName) === ctx.heroId);
    const character = characterKeyFor(index, d.character, userName);
    if (d.kind === 'stat') {
        if (!hero) {
            s.diagnostics.push({ code: 'combat-stat-not-protagonist', messageId, character: d.character });
            return;
        }
        if (s.knownAttr('story', d.character, anchor)) return;
        const label = d.ability === 'free' ? '自由' : ABILITY_LABELS[d.ability];
        s.attributes.push({ id: ledgerEntryId('story', character, anchor), type: 'story', character, anchor, payload: { ability: d.ability, amount: d.amount, reason: d.reason || '' }, createdAt: now, change: `${label}+${d.amount}` });
        return;
    }
    if (hero) {
        s.diagnostics.push({ code: 'combat-rel-protagonist', messageId, character: d.character });
        return;
    }
    if (s.knownAttr('rel', d.character, anchor)) return;
    const key = ownerOf(index, character) ?? character;
    if (tierBefore(ctx, key, messageId) === d.tier) return;
    const name = index.characters.get(key)?.name ?? effectiveName(d.character, userName);
    const anchorLevel = heroLevelAt(ctx, index, s.entries, messageId);
    const offset = relOffset(name, d.tier);
    s.attributes.push({ id: ledgerEntryId('rel', character, anchor), type: 'rel', character, anchor, payload: { tier: d.tier, anchorLevel, offset }, createdAt: now, change: `档位：${REL_TIERS[d.tier]?.label ?? d.tier}` });
    if (!ctx.rels.has(key)) ctx.rels.set(key, []);
    ctx.rels.get(key).push({ messageId, tier: d.tier });
}

// loot 标签 → 日志条目：只认胜利战报楼里、战报 ID 与本楼战报块一致的标签；槽位内容从开战楼 offer（已生效、早于本楼、同一角色）整份拷入，
// 备用套记入重抽花费。offer 暂时读不到时不写、只记诊断，之后补扫再入账。
function buildLootEntry(state, index, d, anchor, report, text, userName, now) {
    if (report?.result !== 'win') return { ok: false, reason: 'combat-loot-not-victory' };
    if (reportIdOf(text) !== d.reportId) return { ok: false, reason: 'combat-loot-report-mismatch' };
    const offer = [...state.offers.values()].find((o) => reportIdFor(o.combatId) === d.reportId && o.anchor.messageId < anchor.messageId);
    if (!offer) return { ok: false, reason: 'combat-loot-offer-missing' };
    const character = characterKeyFor(index, d.character, userName);
    if ((ownerOf(index, character) ?? character) !== offer.character) return { ok: false, reason: 'combat-loot-owner-mismatch' };
    const slot = (d.set === 'reserve' ? offer.reserve : offer.slots)?.[d.slot];
    if (!slot) return { ok: false, reason: 'combat-loot-slot-missing' };
    const payload = { combatId: offer.combatId, reportId: d.reportId, set: d.set, slot: { ...slot }, cost: d.set === 'reserve' ? REROLL_COST : 0 };
    const n = normalizeLedgerEntry({ id: ledgerEntryId('loot', character, anchor), type: 'loot', character, anchor, payload, createdAt: now });
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors.slice(0, 5) };
}

// 正文扫描：只读，不写表。AI 楼按剧情规则（EXP 封顶），战报用户楼扫原文且不封顶，失败战报不产生 EXP；
// 普通用户楼不扫。已有记录 ID（含名字键与档案 ID 两种写法）的标签跳过；需要副 LLM 的标签进入 pendingGeneration。
export function scanGrowthTags(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return snapshot?.ok === false ? snapshot : { ok: false, reason: 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const userName = options.userName || '';
    const index = indexProfiles(snapshot.profiles, []);
    const ids = Array.isArray(options.messageIds) ? options.messageIds : list.map((_, i) => i);
    const now = Number.isInteger(options.now) ? options.now : 0;
    // 剧情回血倍率按扫描时的难度记进条目（百分比），之后改难度不影响已记的回血。
    const healScale = Math.min(100, Math.max(1, Math.round(100 * (Number(options.healScale) || 1))));
    const entries = [];
    const pendingGeneration = [];
    const diagnostics = [];
    // 已入账：条目在日志里且未被撤销；重试条目按基础 ID 计（P7b）。
    const live = liveEntryIds(snapshot);
    const known = (kinds, name, anchor) => kinds.some((kind) => candidateIds(index, kind, name, userName, anchor).some((id) => live.has(id)));
    const attributes = [];
    const knownAttr = (kind, name, anchor) => candidateIds(index, kind, name, userName, anchor).some((id) => snapshot.attributeIds?.has(id) === true);
    const state = computeEffectiveState(snapshot, list, { sourceFilter: options.sourceFilter, userName });
    const attrScan = { index, userName, now, ctx: attributeScanContext(snapshot, state, index, options), knownAttr, attributes, entries, diagnostics };
    for (const messageId of ids) {
        const m = list[messageId];
        if (!isMessage(m)) continue;
        const text = messageText(m);
        const report = m.is_user === true ? combatReportResult(text) : null;
        if (m.is_user === true && !report) continue;
        const parsed = report
            ? extractGrowthDirectives(text, { raw: true, expCap: false })
            : extractGrowthDirectives(text, { sourceFilter: options.sourceFilter });
        diagnostics.push(...parsed.diagnostics.map((d) => ({ ...d, messageId })));
        for (const d of parsed.directives) {
            const anchor = floorAnchor(m, messageId, d);
            if (d.kind === 'rel' || d.kind === 'stat') {
                // 战报续写段禁写属性标签；出现时只记诊断。
                if (report) diagnostics.push({ code: 'combat-attribute-tag-in-report', messageId, kind: d.kind, character: d.character });
                else scanAttributeDirective(d, anchor, messageId, attrScan);
                continue;
            }
            // 只扫属性标签（数值系统单开时，合并计划 P2：stat / rel 为数值系统常驻标签）。
            if (options.attributesOnly) continue;
            if (d.kind === 'loot') {
                if (known(['loot'], d.character, anchor)) continue;
                const built = buildLootEntry(state, index, d, anchor, report, text, userName, now);
                if (built.ok) entries.push(built.entry);
                else diagnostics.push({ code: built.reason, messageId, character: d.character, reportId: d.reportId });
                continue;
            }
            if (d.kind === 'exp') {
                if (report?.result === 'lose') {
                    diagnostics.push({ code: 'combat-defeat-no-exp', messageId, character: d.character });
                    continue;
                }
                if (known(['exp'], d.character, anchor)) continue;
                const character = characterKeyFor(index, d.character, userName);
                entries.push({ id: ledgerEntryId('exp', character, anchor), type: 'exp', character, anchor, payload: { amount: d.amount, reason: d.reason }, createdAt: now });
            } else if (d.kind === 'unequip') {
                if (known(['unequip'], d.character, anchor)) continue;
                const character = characterKeyFor(index, d.character, userName);
                entries.push({ id: ledgerEntryId('unequip', character, anchor), type: 'unequip', character, anchor, payload: { gearId: gearIdFor(d.name) }, createdAt: now });
            } else if (d.kind === 'heal') {
                // 战报续写段不回血；出现时只记诊断。
                if (report) {
                    diagnostics.push({ code: 'combat-heal-tag-in-report', messageId, character: d.character });
                    continue;
                }
                if (known(['heal'], d.character, anchor)) continue;
                const character = characterKeyFor(index, d.character, userName);
                entries.push({ id: ledgerEntryId('heal', character, anchor), type: 'heal', character, anchor, payload: { amount: d.amount, mode: d.mode, scale: healScale, reason: d.reason }, createdAt: now });
            } else if (GENERATED_KINDS.has(d.kind)) {
                // upgrade 找不到对应项时可能按 learn 入库，两种 ID 都算已处理。
                if (known(d.kind === 'upgrade' ? ['upgrade', 'learn'] : [d.kind], d.character, anchor)) continue;
                const { index: _index, tagHash: _hash, occurrence: _occ, ...fields } = d;
                pendingGeneration.push({ ...fields, characterId: resolveCharacterId(index, d.character, userName), anchor });
            }
        }
        // 统一获得物（P7d）：战报楼与只扫属性时不扫；装备 / 道具进待生成队列，杂物直接入账。
        if (report || options.attributesOnly) continue;
        const gains = extractGainDirectives(text, { sourceFilter: options.sourceFilter });
        diagnostics.push(...gains.diagnostics.map((d) => ({ ...d, messageId })));
        for (const d of gains.directives) {
            const anchor = floorAnchor(m, messageId, d);
            if (known([d.kind], d.character, anchor)) continue;
            if (d.kind === 'keepsake') {
                const character = characterKeyFor(index, d.character, userName);
                entries.push({ id: ledgerEntryId('keepsake', character, anchor), type: 'keepsake', character, anchor, payload: { itemId: itemIdFor(d.name), name: d.name, origin: d.origin, ...(d.rarity ? { rarity: d.rarity } : {}) }, createdAt: now });
                continue;
            }
            const { index: _index, tagHash: _hash, occurrence: _occ, ...fields } = d;
            pendingGeneration.push({ ...fields, characterId: resolveCharacterId(index, d.character, userName), anchor });
        }
    }
    return { ok: true, entries, pendingGeneration, diagnostics, attributes };
}

// 生命条目扫描（合并计划 Q4 / N3）：只读，不写表，数值系统单开时也用。AI 楼的 [igs-stat:hurt] 与「受伤」体力事件按档位记主角 hurt；
// [igs-stat:battle] 只在数值结算给出该楼速算伤势（battleHurts：messageId → 档位）时记 hurt；heal 标签与成长扫描同一 ID，已入库的跳过。
// maxHp 取扫描时主角的生命上限（heroPrefs：主角尚无档案也没有 init 时的倾向）。
export function scanLifeTags(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return snapshot?.ok === false ? snapshot : { ok: false, reason: 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const userName = options.userName || '';
    if (!userName) return { ok: false, reason: 'combat-user-missing' };
    const index = indexProfiles(snapshot.profiles, []);
    const ids = Array.isArray(options.messageIds) ? options.messageIds : list.map((_, i) => i);
    const now = Number.isInteger(options.now) ? options.now : 0;
    const healScale = Math.min(100, Math.max(1, Math.round(100 * (Number(options.healScale) || 1))));
    const battleHurts = options.battleHurts instanceof Map ? options.battleHurts : new Map();
    const state = computeEffectiveState(snapshot, list, { sourceFilter: options.sourceFilter, userName });
    if (!state.ok) return state;
    const maxHp = vitalsForName(state, userName, userName, { heroPrefs: options.heroPrefs })?.maxHp;
    if (!(maxHp > 0)) return { ok: false, reason: 'combat-vitals-unavailable' };
    const hero = characterKeyFor(index, userName, userName);
    const entries = [];
    const known = (kind, name, anchor) => candidateIds(index, kind, name, userName, anchor).some((id) => snapshot.ids.has(id) || entries.some((e) => e.id === id));
    for (const messageId of ids) {
        const m = list[messageId];
        if (!isMessage(m) || m.is_user === true) continue;
        const text = messageText(m);
        // 一楼最多结算一场速算（与 settleCombat 一致），只有第一个 battle 标签记伤势。
        let battleSeen = false;
        for (const tag of scanStatLifeTags(text)) {
            if (tag.kind === 'battle' && battleSeen) continue;
            if (tag.kind === 'battle') battleSeen = true;
            const tier = tag.kind === 'hurt' ? tag.tier : battleHurts.get(messageId);
            if (!Object.hasOwn(HURT_PCT, tier || '')) continue;
            const anchor = floorAnchor(m, messageId, tag);
            if (known('hurt', userName, anchor)) continue;
            entries.push({ id: ledgerEntryId('hurt', hero, anchor), type: 'hurt', character: hero, anchor, payload: { tier, pct: HURT_PCT[tier], maxHp }, createdAt: now });
        }
        for (const d of extractGrowthDirectives(text, { sourceFilter: options.sourceFilter }).directives) {
            if (d.kind !== 'heal') continue;
            const anchor = floorAnchor(m, messageId, d);
            if (known('heal', d.character, anchor)) continue;
            const character = characterKeyFor(index, d.character, userName);
            entries.push({ id: ledgerEntryId('heal', character, anchor), type: 'heal', character, anchor, payload: { amount: d.amount, mode: d.mode, scale: healScale, reason: d.reason }, createdAt: now });
        }
    }
    return { ok: true, entries };
}

// 卡组保存条目：锚点取当前最新楼层；同楼同 swipe 多次保存时 occurrence 递增，后存的在归并中后生效。
export function buildDeckEntry(snapshot, chat, characterId, cards, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-deck-no-floor' };
    const swipeId = swipeOf(list[messageId]);
    const mine = snapshot.entries.filter((e) => e.type === 'deck' && e.character === characterId);
    const revision = mine.reduce((max, e) => Math.max(max, e.payload.revision), 0) + 1;
    // 同楼已有重新生成 / 转职 / 升阶时，这次保存改用 PANEL_TAG_HASH 排在它之后（否则归并时会被重置回新起始卡组，或引用尚未追加的职业卡）。
    const anchor = afterPanelReset(snapshot, characterId, messageId, swipeId)
        ? { messageId, swipeId, tagHash: PANEL_TAG_HASH, occurrence: panelOccurrence(snapshot, characterId, messageId, swipeId) }
        : { messageId, swipeId, tagHash: DECK_TAG_HASH, occurrence: mine.filter((e) => e.anchor.messageId === messageId && e.anchor.swipeId === swipeId).length };
    const raw = { id: ledgerEntryId('deck', characterId, anchor), type: 'deck', character: characterId, anchor, payload: { cards: [...cards], revision }, createdAt: now };
    const n = normalizeLedgerEntry(raw);
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 升级奖励条目：锚点取当前最新楼层（与卡组保存相同）；同一等级只能领一次，已领时直接拒绝，不写表。
export function buildRewardEntry(snapshot, chat, characterId, level, choice, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-reward-no-floor' };
    const mine = snapshot.entries.filter((e) => e.type === 'reward' && e.character === characterId);
    if (mine.some((e) => e.payload.level === level)) return { ok: false, reason: 'combat-reward-duplicate' };
    const swipeId = swipeOf(list[messageId]);
    const anchor = afterPanelReset(snapshot, characterId, messageId, swipeId)
        ? { messageId, swipeId, tagHash: PANEL_TAG_HASH, occurrence: panelOccurrence(snapshot, characterId, messageId, swipeId) }
        : { messageId, swipeId, tagHash: REWARD_TAG_HASH, occurrence: mine.filter((e) => e.anchor.messageId === messageId && e.anchor.swipeId === swipeId).length };
    const raw = { id: ledgerEntryId('reward', characterId, anchor), type: 'reward', character: characterId, anchor, payload: { level, choice: { ...choice } }, createdAt: now };
    const n = normalizeLedgerEntry(raw);
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 主角属性提升分配：picks 为 [{ ability, amount }]；校验属性表存在、主角、余额与上限；锚点取当前最新楼层，同楼同 swipe 多次分配 occurrence 递增。
export function buildAllocEntries(snapshot, chat, state, characterId, picks, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    if (snapshot.attributeTable !== 'ok') return { ok: false, reason: 'combat-attribute-table-missing' };
    const view = state?.ok ? state.characters.get(characterId) : null;
    if (!view) return { ok: false, reason: 'combat-character-missing' };
    const attr = view.attributes;
    if (!attr?.protagonist) return { ok: false, reason: 'combat-alloc-not-protagonist' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-alloc-no-floor' };
    const items = Array.isArray(picks) ? picks : [];
    if (!items.length) return { ok: false, reason: 'combat-alloc-empty' };
    const sums = new Map();
    for (const p of items) {
        if (!ABILITY_KEYS.includes(p?.ability) || !Number.isInteger(p?.amount) || p.amount < 1 || p.amount > ASI_POINTS) return { ok: false, reason: 'combat-alloc-invalid' };
        sums.set(p.ability, (sums.get(p.ability) || 0) + p.amount);
    }
    const total = [...sums.values()].reduce((a, b) => a + b, 0);
    if (total > attr.balance) return { ok: false, reason: 'combat-alloc-over-balance', detail: { balance: attr.balance, requested: total } };
    for (const [k, add] of sums) if (attr.scores[k] + add > attr.cap) return { ok: false, reason: 'combat-alloc-over-cap', detail: { ability: k, cap: attr.cap } };
    const swipeId = swipeOf(list[messageId]);
    const previous = (snapshot.attributes || []).filter(r => r.type === 'alloc' && r.character === characterId && r.anchor.messageId === messageId && r.anchor.swipeId === swipeId);
    const occurrence = Math.max(-1, ...previous.map(r => r.anchor.occurrence)) + 1;
    const anchor = { messageId, swipeId, tagHash: ALLOC_TAG_HASH, occurrence };
    const grouped = [...sums].map(([ability, amount]) => ({ ability, amount }));
    const n = normalizeAttributeRecord({ id: ledgerEntryId('alloc', characterId, anchor), type: 'alloc', character: characterId,
        anchor, payload: { picks: grouped }, createdAt: now,
        change: grouped.map(p => `${ABILITY_LABELS[p.ability]}+${p.amount}`).join('、') });
    return n.ok ? { ok: true, entries: [n.value] } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 账本门面。tables 为 data/shujuku/combat-tables 的实例（read / append）；chat 为消息快照数组或返回快照的函数。
// 换装条目：锚点取当前最新楼层（同卡组保存）；装备只能从背包装上，卸下只能卸当前已装备的。
export function buildGearEntry(snapshot, chat, view, gearId, equip, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-deck-no-floor' };
    if (!view) return { ok: false, reason: 'combat-character-missing' };
    const worn = Object.values(view.gear?.slots || {}).find((g) => g?.gearId === gearId);
    const bag = (view.gear?.bag || []).find((g) => g.gearId === gearId);
    if (equip ? !bag : !worn) return { ok: false, reason: 'combat-gear-missing' };
    const swipeId = swipeOf(list[messageId]);
    const occurrence = panelOccurrence(snapshot, view.id, messageId, swipeId);
    const anchor = { messageId, swipeId, tagHash: GEAR_TAG_HASH, occurrence };
    const type = equip ? 'equip' : 'unequip';
    const payload = equip ? { gearId, name: bag.name, slot: bag.slot, ...(bag.passive ? { passive: bag.passive } : {}), description: bag.description || '',
        ...(bag.bonus ? { rarity: bag.rarity, bonus: bag.bonus } : {}) } : { gearId };
    const n = normalizeLedgerEntry({ id: ledgerEntryId(type, view.id, anchor), type, character: view.id, anchor, payload, createdAt: now });
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 按剧情给的初始装备（profile-gear，助手 10-31）：每件一条 equip，锚点 tagHash = INIT_GEAR_TAG_HASH、occurrence 为部位序号，ID 确定、重复写幂等。
// anchor 缺省时取当前最新楼层（同构筑面板换装）；开战准备传开战楼锚点。归并时只核对楼层与 swipe（anchorProblem）。
export function buildInitialGearEntries(chat, characterId, items, now = 0, anchor = null) {
    const list = Array.isArray(chat) ? chat : [];
    const base = anchor || (list.length ? { messageId: list.length - 1, swipeId: swipeOf(list[list.length - 1]) } : null);
    if (!base) return { ok: false, reason: 'combat-deck-no-floor' };
    if (!characterId) return { ok: false, reason: 'combat-character-missing' };
    const entries = [];
    for (const g of Array.isArray(items) ? items : []) {
        const at = { messageId: base.messageId, swipeId: base.swipeId, tagHash: INIT_GEAR_TAG_HASH, occurrence: GEAR_SLOTS.indexOf(g?.slot) };
        const n = normalizeLedgerEntry({ id: ledgerEntryId('equip', characterId, at), type: 'equip', character: characterId, anchor: at, payload: g, createdAt: now });
        if (!n.ok) return { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
        entries.push(n.value);
    }
    return { ok: true, entries };
}

// profile-gear 生成结果落账（助手 10-31）：按名字解析角色 ID 后经 ledger.grantInitialGear 写入；返回是否尝试过写入（调用方据此重读状态）。找不到角色或写失败只记诊断，不阻断。
export async function grantGeneratedGear(ledgerImpl, generation, ownerOf, { anchor = null, diagnostics = [] } = {}) {
    let wrote = false;
    for (const item of generation?.accepted || []) {
        if (item.kind !== 'profile-gear' || !item.gear?.items?.length) continue;
        const owner = typeof ownerOf === 'function' ? ownerOf(item.gear.name) : null;
        if (!owner) { diagnostics.push({ code: 'combat-character-missing', name: item.gear.name }); continue; }
        let r;
        try { r = typeof ledgerImpl?.grantInitialGear === 'function' ? await ledgerImpl.grantInitialGear(owner, item.gear.items, { anchor }) : { ok: false, reason: 'combat-gear-unavailable' }; } catch (error) { r = null; }
        if (r?.ok !== true) diagnostics.push({ code: r?.reason || 'combat-gear-write-failed', name: item.gear.name });
        wrote = true;
    }
    return wrote;
}

// 背包卖出条目：锚点取当前最新楼层（同卡组保存）；target 为 { lootId }（杂物）或 { gearId }（装备），传字符串按 lootId。
// 只能卖主角背包里现有的杂物与未装备的装备；积分不写进载荷，归并时按 sellPrice 计算，price 为本次所得。
export function buildSellEntry(snapshot, chat, state, target, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-sell-no-floor' };
    const heroId = state?.ok ? state.attributes.heroId : null;
    const view = heroId ? state.characters.get(heroId) : null;
    if (!view) return { ok: false, reason: 'combat-points-not-protagonist' };
    const t = typeof target === 'string' ? { lootId: target } : target || {};
    let payload;
    let price;
    // 主角背包投影（P7b）：装备按背包里的那件计价（穿着一件、背包另有同名时可卖背包的），杂物按 itemId 找；载荷带稀有度。
    const stock = Boolean(view.inventory);
    if (stock && view.inventory.ok !== true) return { ok: false, reason: view.inventory.reason || 'inventory-table-read-failed' };
    if (t.gearId) {
        const gear = (view.gear?.bag || []).find((g) => g.gearId === t.gearId);
        if (!gear && Object.values(view.gear?.slots || {}).some((g) => g?.gearId === t.gearId)) return { ok: false, reason: 'combat-gear-equipped' };
        if (!gear) return { ok: false, reason: 'combat-gear-missing' };
        payload = { gearId: t.gearId, ...(stock ? { rarity: gear.rarity || 'common' } : {}) };
        price = sellPrice(gear.rarity, t.gearId);
    } else {
        const id = t.itemId || t.lootId;
        const keepsake = view.collection.find((k) => (stock ? k.itemId : k.lootId) === id);
        if (!keepsake) return { ok: false, reason: 'combat-keepsake-missing' };
        payload = stock ? { itemId: id, rarity: keepsake.rarity || 'common' } : { lootId: id };
        price = sellPrice(keepsake.rarity, id);
    }
    const swipeId = swipeOf(list[messageId]);
    const anchor = { messageId, swipeId, tagHash: SELL_TAG_HASH, occurrence: panelOccurrence(snapshot, heroId, messageId, swipeId) };
    const n = normalizeLedgerEntry({ id: ledgerEntryId('sell', heroId, anchor), type: 'sell', character: heroId, anchor, payload, createdAt: now });
    return n.ok ? { ok: true, entry: n.value, price } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 主角付费面板操作（重新生成 rebuild / 转职 respec / 职业升阶 ascend）的条目：锚点取当前最新楼层，tagHash 为该类型的面板标记，与换装、卖出共用 occurrence 序列；
// 只主角（卡组角色），余额须够载荷里的 cost。载荷整份写入，合规性由归并核对。
// 抽人物特性 trait、装不下时的决定 trait-pick 与解锁特性槽 trait-slot 同走此口；trait-pick 没有 cost。
const HERO_PANEL_TAGS = Object.freeze({ rebuild: REBUILD_TAG_HASH, respec: RESPEC_TAG_HASH, ascend: ASCEND_TAG_HASH, trait: TRAIT_TAG_HASH, 'trait-pick': TRAIT_TAG_HASH, 'trait-slot': TRAIT_TAG_HASH });
export function buildHeroPanelEntry(snapshot, chat, state, characterId, type, payload, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    if (!Object.hasOwn(HERO_PANEL_TAGS, type)) return { ok: false, reason: 'combat-entry-invalid' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: `combat-${type}-no-floor` };
    const heroId = state?.ok ? state.attributes.heroId : null;
    const view = heroId && heroId === characterId ? state.characters.get(heroId) : null;
    if (!view) return { ok: false, reason: 'combat-points-not-protagonist' };
    if (view.kind !== 'deck-character') return { ok: false, reason: `combat-${type}-kind-mismatch` };
    if ((view.points || 0) < (payload?.cost ?? 0)) return { ok: false, reason: 'combat-points-insufficient' };
    const swipeId = swipeOf(list[messageId]);
    const anchor = { messageId, swipeId, tagHash: HERO_PANEL_TAGS[type], occurrence: panelOccurrence(snapshot, heroId, messageId, swipeId) };
    const n = normalizeLedgerEntry({ id: ledgerEntryId(type, heroId, anchor), type, character: heroId, anchor, payload, createdAt: now });
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 每次调用都重读表与聊天，不缓存；读失败一律 ok:false，不当作空账本。
// difficulty：当前难度键（值或函数），只用于扫描时给剧情回血条目记下难度倍率。
// inventory（可选，P7b）：data/shujuku/inventory-tables 的实例；注入时主角的装备、道具与杂物由物品表与装配表投影（inventory-view.js），未注入时账本行为不变。
export function createCombatLedger({ tables, chat, userName = '', sourceFilter, difficulty, now = () => Date.now(), inventory = null } = {}) {
    const chatOf = () => (typeof chat === 'function' ? chat() : chat) || [];
    const userOf = () => (typeof userName === 'function' ? userName() : userName);
    const filterOf = () => (typeof sourceFilter === 'function' ? sourceFilter() : sourceFilter);
    // 归并参数：每次归并都重读物品表（同步读，不缓存）；读失败时投影 ok:false，主角视图带 inventory.ok=false，写口据此 fail-closed。
    const stateOpts = () => {
        const base = { sourceFilter: filterOf(), userName: userOf() };
        if (!inventory || typeof inventory.read !== 'function') return base;
        let read;
        try { read = inventory.read(); } catch { read = { ok: false, reason: 'inventory-table-read-failed' }; }
        return { ...base, heroInventory: heroInventoryView(read) };
    };
    const healScaleOf = () => difficultyRule(typeof difficulty === 'function' ? difficulty() : difficulty).healScale;

    async function read() {
        try {
            return normalizeSnapshot(await tables.read());
        } catch (error) {
            return { ok: false, reason: 'combat-ledger-read-failed', detail: String(error?.message || error) };
        }
    }

    async function effectiveState() {
        return computeEffectiveState(await read(), chatOf(), stateOpts());
    }

    // 只追加通过 schema 的条目；全部非法时不调用写入。写入结果原样透传（written / present / rejected / pending）。
    async function append(entries) {
        const valid = [];
        const invalid = [];
        for (const raw of Array.isArray(entries) ? entries : [entries]) {
            const n = normalizeLedgerEntry(raw);
            if (n.ok) valid.push(n.value);
            else invalid.push({ id: raw?.id ?? null, reason: 'combat-entry-invalid', errors: n.errors.slice(0, 5) });
        }
        if (!valid.length) return { ok: invalid.length === 0, written: [], present: [], rejected: invalid, pending: [] };
        // 注入物品表时（P7b）主角的装备 / 道具 / 杂物条目逐条走 appendStock；其余条目照旧一次写入。
        const stock = inventory ? valid.filter((e) => STOCK_TYPES.includes(e.type)) : [];
        const plain = valid.filter((e) => !stock.includes(e));
        let result = plain.length ? await tables.append('ledger', plain) : { ok: true, written: [], present: [], rejected: [], pending: [] };
        if (stock.length) result = mergeWrites(result, await appendStock(stock));
        return invalid.length ? { ...result, ok: false, rejected: [...(result.rejected || []), ...invalid] } : result;
    }

    // 写入结果合并：失败原因取先失败的一方；stock 为主角背包条目的逐条结果（含跳过原因）。
    function mergeWrites(a, b) {
        const failed = a.ok === false ? a : b.ok === false ? b : null;
        return { ...a, ...(failed?.reason ? { reason: failed.reason } : {}), ok: a.ok !== false && b.ok !== false,
            written: [...(a.written || []), ...(b.written || [])], present: [...(a.present || []), ...(b.present || [])],
            rejected: [...(a.rejected || []), ...(b.rejected || [])], pending: b.pending || a.pending || [], stock: [...(a.stock || []), ...(b.stock || [])] };
    }

    // 主角背包条目（P7b）：串行逐条处理。每条先按「当前状态 + 本条」试归并，拒收（锚点失效、offer 不符、积分不够等）或背包计划不成立时跳过、不写；
    // 通过后先写日志标记（已入账），再写装配行与物品表数量；标记未写成或数量写失败时写 revoke 撤销标记，补扫按「基础ID|rN」重试。
    // 跳过只记在 stock 里，不判整批失败（同一标签下次补扫照样再试）；读写失败判失败。
    let stockWrite = Promise.resolve();
    function appendStock(list) {
        const run = stockWrite.then(async () => {
            let out = { ok: true, written: [], present: [], rejected: [], pending: [], stock: [] };
            for (const e of list) out = mergeWrites(out, await appendStockOne(e));
            return out;
        });
        stockWrite = run.catch(() => {});
        return run;
    }

    const skipStock = (entry, reason) => ({ ok: true, written: [], present: [], rejected: [], pending: [], stock: [{ id: entry.id, ok: false, skipped: true, reason }] });
    const failStock = (entry, reason, extra = {}) => ({ ok: false, reason, written: [], present: [], rejected: [{ id: entry.id, reason }], pending: [], stock: [{ id: entry.id, ok: false, reason, ...extra }] });

    async function appendStockOne(entry) {
        const snapshot = await read();
        if (!snapshot.ok) return failStock(entry, snapshot.reason || 'combat-ledger-read-failed');
        const index = indexProfiles(snapshot.profiles, []);
        const user = userOf();
        const heroId = user ? resolveCharacterId(index, user, user) : null;
        // 队友（及尚无档案的角色）的装备与道具照旧记在账本角色状态里，不进背包。
        if (!heroId || ownerOf(index, entry.character) !== heroId) return tables.append('ledger', [entry]);
        const ensured = await ensureStock();
        if (ensured) return failStock(entry, ensured);
        const chat = chatOf();
        const opts = stateOpts();
        const state = computeEffectiveState(snapshot, chat, opts);
        if (!state.ok) return failStock(entry, state.reason || 'combat-ledger-read-failed');
        const view = state.characters.get(heroId);
        if (view?.inventory?.ok !== true) return failStock(entry, view?.inventory?.reason || 'inventory-table-read-failed');
        const slot = stockEntryId(snapshot, entry.id);
        if (slot.present) return { ok: true, written: [], present: [slot.present], rejected: [], pending: [], stock: [] };
        if (slot.error) return failStock(entry, slot.error);
        const e = slot.id === entry.id ? entry : { ...entry, id: slot.id };
        const plan = stockPlan(e, view, { panelTag: GEAR_TAG_HASH });
        if (plan === null) return tables.append('ledger', [e]);
        if (!plan.ok) return skipStock(e, plan.reason);
        const trial = computeEffectiveState({ ...snapshot, entries: [...snapshot.entries, e] }, chat, opts);
        const problem = trial.ok ? (trial.inactive.find((x) => x.id === e.id)?.reason || trial.diagnostics.find((d) => d.id === e.id)?.code) : (trial.reason || 'combat-ledger-read-failed');
        if (problem) return skipStock(e, problem);
        let marked;
        try { marked = await tables.append('ledger', [e]); } catch { marked = { ok: false, reason: 'combat-ledger-insert-failed' }; }
        if ((marked.present || []).includes(e.id)) return { ...marked, stock: [] };
        if (!(marked.written || []).includes(e.id)) {
            // 标记可能仍留在待写队列里稍后写成：同队列后面追加撤销，二者按序落表，不会出现没改表的已入账标记。
            const reason = marked.reason || 'combat-ledger-insert-failed';
            const revoked = await revokeStock(e, reason);
            return { ...marked, ok: false, reason, stock: [{ id: e.id, ok: false, reason, revoked }] };
        }
        let failed;
        try { failed = await applyStock(plan); } catch { failed = 'inventory-write-failed'; }
        if (failed) {
            const revoked = await revokeStock(e, failed);
            return failStock(e, revoked ? failed : 'combat-stock-revoke-failed', { detail: failed, revoked });
        }
        return { ...marked, stock: [{ id: e.id, ok: true }] };
    }

    // 主角背包写入前先确认当前聊天的物品表由程序维护（inventory.ensure：缺表补建；物品表未接管时经宿主模板导入改为 updateFrequency 0、增删改节点「禁止。」，
    // 关闭数据库自动填表；已接管时不导入）。接管或补建失败时不写标记、不改表（fail-closed），避免与自动填表双写数量。
    async function ensureStock() {
        if (typeof inventory?.ensure !== 'function') return 'inventory-ensure-unavailable';
        let made;
        try { made = await inventory.ensure(); } catch { made = { ok: false, reason: 'inventory-ensure-failed' }; }
        return made?.ok === true ? null : made?.reason || 'inventory-ensure-failed';
    }

    // 背包计划执行：rows（本物品的装配定义）→ changes（物品表数量）→ after（被顶替的装备卸下、用尽删行）。
    // 只刷新世界书失败不算写入失败；after 写失败不撤销已改的数量（视图按部位冲突与孤儿行诊断兜底）。
    const written = (r) => r?.ok === true || r?.reason === 'inventory-refresh-failed';
    async function applyStock(plan) {
        for (const r of plan.rows) {
            const w = await inventory.setGearRow(r.name, r.record);
            if (!written(w)) return w?.reason || 'gear-write-failed';
        }
        if (plan.changes.length) {
            const c = await inventory.changeQuantities(plan.changes);
            if (!written(c) && (c?.applied?.length || 0) < plan.changes.length) return c?.reason || 'inventory-write-failed';
        }
        for (const r of plan.after) {
            try { await inventory.setGearRow(r.name, r.record); } catch { /* 视图诊断兜底 */ }
        }
        return null;
    }

    // 撤销已入账标记：revoke 条目不绑定楼层，ID 为「revoke|目标ID」，按记录 ID 幂等。
    async function revokeStock(e, reason) {
        const n = normalizeLedgerEntry({ id: `revoke|${e.id}`, type: 'revoke', character: e.character, anchor: null, payload: { targetEntryId: e.id, reason: String(reason || '').slice(0, 80) }, createdAt: now() });
        if (!n.ok) return false;
        try {
            const w = await tables.append('ledger', [n.value]);
            return (w.written || []).includes(n.value.id) || (w.present || []).includes(n.value.id);
        } catch { return false; }
    }

    // 生成结束后传 { messageIds: [最新楼] }；打开聊天补扫不传，扫全部楼层。按记录 ID 幂等。
    async function scan({ messageIds } = {}) {
        const snapshot = await read();
        if (!snapshot.ok) return snapshot;
        const found = scanGrowthTags(snapshot, chatOf(), { userName: userOf(), sourceFilter: filterOf(), messageIds, now: now(), healScale: healScaleOf() });
        const write = found.entries.length ? await append(found.entries) : null;
        // 属性表缺失时属性记录不写、不判失败（建表后补扫入库）。
        let attributeWrite = null;
        if (found.attributes.length) {
            attributeWrite = snapshot.attributeTable === 'ok'
                ? await appendAttributes(found.attributes)
                : { ok: false, reason: 'combat-attribute-table-missing', skipped: found.attributes.length };
        }
        const ok = (write === null || write.ok === true) && (attributeWrite === null || attributeWrite.ok === true || attributeWrite.reason === 'combat-attribute-table-missing');
        return { ...found, ok, write, attributeWrite };
    }

    // 生命条目补扫（合并计划 Q4 / N3）：剧情受伤、速算伤势（battleHurts）与回血入库，按记录 ID 幂等；只开数值系统时也调用。
    async function scanLife({ messageIds, battleHurts, heroPrefs } = {}) {
        const snapshot = await read();
        if (!snapshot.ok) return snapshot;
        const found = scanLifeTags(snapshot, chatOf(), { userName: userOf(), sourceFilter: filterOf(), messageIds, now: now(), healScale: healScaleOf(), battleHurts, heroPrefs });
        if (!found.ok) return found;
        const write = found.entries.length ? await append(found.entries) : null;
        // stat / rel 属性标签同样入属性表（按记录 ID 幂等；属性表缺失时不写、不判失败，与成长补扫一致）。
        const attrs = scanGrowthTags(snapshot, chatOf(), { userName: userOf(), sourceFilter: filterOf(), messageIds, now: now(), attributesOnly: true });
        let attributeWrite = null;
        if (attrs.ok && attrs.attributes.length) {
            attributeWrite = snapshot.attributeTable === 'ok'
                ? await appendAttributes(attrs.attributes)
                : { ok: false, reason: 'combat-attribute-table-missing', skipped: attrs.attributes.length };
        }
        const attrOk = attributeWrite === null || attributeWrite.ok === true || attributeWrite.reason === 'combat-attribute-table-missing';
        return { ...found, ok: (write === null || write.ok === true) && attrOk, write, attributeWrite };
    }

    // 属性表写入：只追加通过 schema 的记录；全部非法时不调用写入。
    async function appendAttributes(records, options) {
        const valid = [];
        const invalid = [];
        for (const raw of Array.isArray(records) ? records : [records]) {
            const n = normalizeAttributeRecord(raw);
            if (n.ok) valid.push(n.value);
            else invalid.push({ id: raw?.id ?? null, reason: 'combat-attribute-invalid', errors: n.errors.slice(0, 5) });
        }
        if (!valid.length) return { ok: invalid.length === 0, written: [], present: [], rejected: invalid, pending: [] };
        const result = await tables.append('attribute', valid, options);
        return invalid.length ? { ...result, ok: false, rejected: [...(result.rejected || []), ...invalid] } : result;
    }

    // 主角属性提升分配：按当前归并状态核对余额与上限，写 alloc 记录。
    let allocationWrite = Promise.resolve();
    function allocate(characterId, picks, { shouldStart } = {}) {
        const chat = chatOf(), floor = chat.at(-1), swipe = swipeOf(floor);
        const current = () => chatOf() === chat && chat.at(-1) === floor && swipeOf(floor) === swipe
            && (!shouldStart || shouldStart() === true);
        const items = Array.isArray(picks) ? picks.map(p => ({ ...p })) : [];
        const run = allocationWrite.then(async () => {
            if (!current()) return { ok: false, reason: 'request-stale' };
            const snapshot = await read();
            if (!current()) return { ok: false, reason: 'request-stale' };
            if (!snapshot.ok) return snapshot;
            const state = computeEffectiveState(snapshot, chat, stateOpts());
            const built = buildAllocEntries(snapshot, chat, state, characterId, items, now());
            if (!built.ok) return built;
            const write = await appendAttributes(built.entries, { shouldStart: current });
            return { ...write, entries: built.entries };
        });
        allocationWrite = run.catch(() => {});
        return run;
    }

    // 初始化（职业名 / 定位 / 倾向）：字段非法返回 combat-init-invalid；属性表缺失拒绝写入；该角色已有 init 时不写（首写为准）。
    let initWrite = Promise.resolve();
    function writeInit(name, raw, options = {}) {
        const run = initWrite.then(() => writeInitOnce(name, raw, options));
        initWrite = run.catch(() => {});
        return run;
    }

    // manual（P8c 手动建档）：必须带六项分值，擅长项由分值推导；其余调用不收 scores，与旧版一致。首写为准的规则相同。
    async function writeInitOnce(name, raw, { signal, shouldStart, manual = false } = {}) {
        const current = () => !signal?.aborted && (!shouldStart || shouldStart() === true);
        const stale = () => ({ ok: false, reason: 'request-stale' });
        if (!current()) return stale();
        if (manual && raw?.scores === undefined) return { ok: false, reason: 'combat-init-invalid', field: 'scores', problem: 'required' };
        const parsed = parseCombatInit(raw, { allowScores: manual });
        if (!parsed.ok) return { ok: false, reason: 'combat-init-invalid', field: parsed.field, problem: parsed.problem };
        const clean = String(name || '').trim();
        if (!clean) return { ok: false, reason: 'combat-init-invalid', field: 'name', problem: 'required' };
        const snapshot = await read();
        if (!current()) return stale();
        if (!snapshot.ok) return snapshot;
        if (snapshot.attributeTable !== 'ok') return { ok: false, reason: 'combat-attribute-table-missing' };
        const user = userOf();
        const state = computeEffectiveState(snapshot, chatOf(), { sourceFilter: filterOf(), userName: user });
        if (!state.ok) return state;
        if (abilitiesForName(state, clean, user)?.initialized) return { ok: true, unchanged: true };
        const character = characterKeyFor(indexProfiles(snapshot.profiles, []), clean, user);
        const record = { id: ledgerEntryId('init', character), type: 'init', character, anchor: null, payload: parsed.value, createdAt: now(), change: '初始化' };
        if (!current()) return stale();
        let write;
        try { write = await appendAttributes([record], { signal, shouldStart: current }); }
        catch { return { ok: false, reason: 'combat-init-write-failed' }; }
        if (!current()) return stale();
        return { ...write, record };
    }

    async function saveDeck(characterId, cards) {
        const snapshot = await read();
        if (!snapshot.ok) return snapshot;
        const built = buildDeckEntry(snapshot, chatOf(), characterId, cards, now());
        if (!built.ok) return built;
        const write = await append([built.entry]);
        return { ...write, entry: built.entry };
    }

    // 领取升级奖励：先按当前归并状态核对等级已达到、未领取，再写一条 reward 条目。
    async function claimReward(characterId, level, choice) {
        const snapshot = await read();
        if (!snapshot.ok) return snapshot;
        const view = computeEffectiveState(snapshot, chatOf(), stateOpts()).characters?.get(characterId);
        if (!view || view.kind !== 'deck-character' || !view.pendingRewards.includes(level)) return { ok: false, reason: 'combat-reward-unavailable' };
        const built = buildRewardEntry(snapshot, chatOf(), characterId, level, choice, now());
        if (!built.ok) return built;
        const write = await append([built.entry]);
        return { ...write, entry: built.entry };
    }

    // 面板写入（换装与背包卖出）串行执行：后一笔读到前一笔的写入后再定 occurrence，同楼连续操作不撞 ID。
    let panelWrite = Promise.resolve();
    function serialPanel(task) {
        const run = panelWrite.then(task);
        panelWrite = run.catch(() => {});
        return run;
    }

    // 构筑面板换装：按当前归并状态核对后写一条 equip / unequip。
    function setGear(characterId, gearId, equip) {
        return serialPanel(async () => {
            const snapshot = await read();
            if (!snapshot.ok) return snapshot;
            const chat = chatOf();
            const view = computeEffectiveState(snapshot, chat, stateOpts()).characters?.get(characterId);
            const built = buildGearEntry(snapshot, chat, view, gearId, equip === true, now());
            if (!built.ok) return built;
            const write = await append([built.entry]);
            return { ...write, entry: built.entry };
        });
    }

    // 初始装备落账（profile-gear，助手 10-31）：items 为组装好的 equip 载荷；anchor 缺省取最新楼层。没有装备时不写。
    function grantInitialGear(characterId, items, { anchor = null } = {}) {
        return serialPanel(async () => {
            const built = buildInitialGearEntries(chatOf(), characterId, items, now(), anchor);
            if (!built.ok) return built;
            if (!built.entries.length) return { ok: true, written: [], present: [], rejected: [], pending: [], entries: [] };
            const write = await append(built.entries);
            return { ...write, entries: built.entries };
        });
    }

    // 背包卖出：target 为 { lootId }（杂物）或 { gearId }（装备）；price 为本次所得积分。
    function sellFromBag(target) {
        return serialPanel(async () => {
            const snapshot = await read();
            if (!snapshot.ok) return snapshot;
            const chat = chatOf();
            const state = computeEffectiveState(snapshot, chat, stateOpts());
            const built = buildSellEntry(snapshot, chat, state, target, now());
            if (!built.ok) return built;
            const write = await append([built.entry]);
            return { ...write, entry: built.entry, price: built.price };
        });
    }
    const sellKeepsake = (lootId) => sellFromBag({ lootId });
    const sellGear = (gearId) => sellFromBag({ gearId });

    // 背包场外使用（P7c，助手 1B）：只限带回复效果的道具（纯战斗道具记 combat-use-battle-only），主角没有伤势时记 combat-use-full-hp。
    // 写 heal（回复量为道具各回复效果之和，乘写入时难度倍率）与 consume（经主角背包写口从物品表减一），锚定 messageId 楼（写说明的最新 AI 楼，缺省为最后一楼）、tagHash = USE_TAG_HASH；
    // heal 先写，consume 未生效或 heal 未写成时写 revoke 撤销 heal，不白得回复。
    function useItem(itemId, { messageId } = {}) {
        return serialPanel(async () => {
            if (!inventory) return { ok: false, reason: 'combat-use-unavailable' };
            const snapshot = await read();
            if (!snapshot.ok) return snapshot;
            const chat = chatOf();
            const state = computeEffectiveState(snapshot, chat, stateOpts());
            if (!state.ok) return state;
            const heroId = state.attributes.heroId;
            const view = heroId ? state.characters.get(heroId) : null;
            if (!view) return { ok: false, reason: 'combat-points-not-protagonist' };
            if (view.inventory?.ok !== true) return { ok: false, reason: view.inventory?.reason || 'inventory-table-read-failed' };
            const item = view.items.find((i) => i.itemId === itemId);
            if (!item) return { ok: false, reason: 'combat-item-insufficient' };
            const amount = (item.effects || []).filter((e) => e.op === 'heal').reduce((s, e) => s + (Number(e.amount) || 0), 0);
            if (!(amount > 0)) return { ok: false, reason: 'combat-use-battle-only' };
            if (!view.wound) return { ok: false, reason: 'combat-use-full-hp' };
            const at = Number.isInteger(messageId) ? messageId : chat.length - 1;
            if (!chat[at]) return { ok: false, reason: 'combat-use-no-floor' };
            const swipeId = swipeOf(chat[at]);
            const occ = panelOccurrence(snapshot, heroId, at, swipeId);
            const anchorAt = (occurrence) => ({ messageId: at, swipeId, tagHash: USE_TAG_HASH, occurrence });
            const scale = Math.min(100, Math.max(1, Math.round(100 * (Number(healScaleOf()) || 1))));
            const heal = normalizeLedgerEntry({ id: ledgerEntryId('heal', heroId, anchorAt(occ)), type: 'heal', character: heroId, anchor: anchorAt(occ),
                payload: { amount: Math.min(9999, amount), mode: 'flat', scale, reason: `使用${item.name}`.slice(0, 80) }, createdAt: now() });
            const consume = normalizeLedgerEntry({ id: ledgerEntryId('consume', heroId, anchorAt(occ + 1)), type: 'consume', character: heroId, anchor: anchorAt(occ + 1),
                payload: { itemId, count: 1, reportId: '' }, createdAt: now() });
            if (!heal.ok || !consume.ok) return { ok: false, reason: 'combat-entry-invalid' };
            let healed;
            try { healed = await tables.append('ledger', [heal.value]); } catch { healed = { ok: false, reason: 'combat-ledger-insert-failed' }; }
            if (!(healed.written || []).includes(heal.value.id)) {
                const reason = healed.reason || 'combat-ledger-insert-failed';
                return { ok: false, reason, revoked: await revokeStock(heal.value, reason) };
            }
            const used = await appendStock([consume.value]);
            if (!(used.stock || []).some((s) => s.ok === true)) {
                const reason = used.stock?.[0]?.reason || used.reason || 'combat-use-failed';
                return { ok: false, reason, revoked: await revokeStock(heal.value, reason) };
            }
            return { ok: true, item: item.name, amount, entries: [heal.value, consume.value] };
        });
    }

    // 主角付费面板操作（重新生成 / 转职 / 升阶）：写前按「当前状态 + 本条」试归并，本条会被拒收（不合规、ID 相撞、积分不够、等级未到等）时不写表、返回原因（不扣分）；cost 为本次花费。
    function writeHeroPanel(characterId, type, payload) {
        return serialPanel(async () => {
            const snapshot = await read();
            if (!snapshot.ok) return snapshot;
            const chat = chatOf();
            const opts = stateOpts();
            const state = computeEffectiveState(snapshot, chat, opts);
            const built = buildHeroPanelEntry(snapshot, chat, state, characterId, type, payload, now());
            if (!built.ok) return built;
            const trial = computeEffectiveState({ ...snapshot, entries: [...snapshot.entries, built.entry] }, chat, opts);
            const rejected = trial.ok ? trial.diagnostics.find((d) => d.id === built.entry.id) : null;
            if (!trial.ok || rejected) return { ok: false, reason: rejected?.code || trial.reason || `combat-${type}-invalid` };
            const write = await append([built.entry]);
            return { ...write, entry: built.entry, ...(built.entry.payload.cost === undefined ? {} : { cost: built.entry.payload.cost }) };
        });
    }
    const rebuildDeck = (characterId, deck) => writeHeroPanel(characterId, 'rebuild', { personalPool: deck?.personalPool, starterDeck: deck?.starterDeck, cost: REBUILD_COST });
    // 转职：classRef 为换到的已登记职业。
    const respecClass = (characterId, classRef) => writeHeroPanel(characterId, 'respec', { classRef, cost: RESPEC_COST });
    // 职业升阶：tier 为要升到的阶（须为当前阶 +1，由归并核对），tierName 与 3 张追加卡由副 LLM 生成；未登记的阶直接拒绝、不读表。
    function ascendClass(characterId, { classRef, tier, tierName, cards } = {}) {
        const rule = ASCEND_TIERS[tier];
        if (!rule) return Promise.resolve({ ok: false, reason: 'combat-ascend-tier-invalid' });
        return writeHeroPanel(characterId, 'ascend', { classRef, tier, tierName, cards, cost: rule.cost });
    }
    // 人物特性（P-d）：trait 为生成好的 { traitId, name, origin, rarity, kind?, passive | skill, link? }，扣 TRAIT_DRAW_COST；已满时新特性待定，再用 pickTrait 决定 drop。
    function drawTrait(characterId, trait = {}) {
        const { traitId, name, origin = '', rarity, kind, passive, skill, link } = trait;
        return writeHeroPanel(characterId, 'trait', { traitId, name, origin, rarity, ...(kind ? { kind } : {}), passive, ...(skill ? { skill } : {}), ...(link ? { link } : {}), cost: TRAIT_DRAW_COST });
    }
    // 已满时的决定：drop 为被替换的已装特性 ID（新特性装上）或新特性自己的 ID（放弃）；被 drop 的永久消失，积分不退。
    const pickTrait = (characterId, traitId, drop) => writeHeroPanel(characterId, 'trait-pick', { traitId, drop });
    // 解锁特性槽（v4）：slot 为下一个可解锁的槽（traits.js 的 nextTraitSlot），扣 TRAIT_SLOT_COSTS[slot]；没有价格的槽直接拒绝、不读表。
    function unlockTraitSlot(characterId, slot) {
        const cost = TRAIT_SLOT_COSTS[slot];
        if (!cost) return Promise.resolve({ ok: false, reason: 'combat-trait-slot-invalid' });
        return writeHeroPanel(characterId, 'trait-slot', { slot, cost });
    }

    return { read, effectiveState, append, appendAttributes, scan, scanLife, saveDeck, claimReward, setGear, grantInitialGear, allocate, writeInit, sellKeepsake, sellGear, useItem, rebuildDeck, respecClass, ascendClass, drawTrait, pickTrait, unlockTraitSlot };
}

