// 战斗成长账本（v0.39 战斗存储层，改写版）。
// 账本是 append-only 的记录流：每条记录挂在某一楼某个 swipe 的某个标签上，
// 有效状态 = 把仍然有效的记录按楼层顺序重放一遍（computeEffectiveState）。
// 记录格式、记录 ID 规则、表结构与 v0.39 完全一致，已存数据可直接读回。
//
// 与 v0.39 的差别只有读取性能：
//   - createCombatLedger 的快照读取与有效状态重放按「表版本号 + 导出数据引用 + 楼层集合签名 + 用户名 +
//     来源过滤 + 背包版本 + 难度」记忆化，同一版本同一楼层集合只算一次，并发调用复用同一个 Promise；
//   - 读表只解码账本用到的三种（档案、日志、属性），不解码数值日志。
// 记忆化返回的对象在所有调用方之间共享，一律视为只读：调用方不得原地修改 read()/effectiveState() 的返回值。
// 写入（append/useItem/setGear 等）会使表版本号变化，缓存自动作废。
import { COMBAT_RULES, cardCopyLimit, difficultyRule, expProgress, signatureCardAt, signatureUnlockLevel, validateDeck } from './rules.js';
import { hash32, hashString } from './random.js';
import {
    ABILITY_KEYS, ABILITY_LABELS, ASI_POINTS, DEFAULT_REL_TIER, REL_TIERS, asiCountAt, defaultPrefs, deriveAbilities,
    isAsiLevel, levelCap, normalizePrefs, parseCombatInit, relLevel, relOffset,
} from './abilities.js';
import {
    GEAR_SLOTS, INIT_GEAR_TAG_HASH, buildCardCatalog, effectsDamage, gearIdFor, itemIdFor, ledgerEntryId, normalizeAttributeRecord, normalizeLedgerEntry,
    normalizeProfile, validateStarterDeck,
} from './schema.js';
import { combatBodyText, extractGainDirectives, extractGrowthDirectives, extractLossDirectives, scanCombatTags, scanGainTags, scanLossTags } from '../scene/combat-directives.js';
import { combatReportResult } from '../scene/combat-prompt.js';
import { reportIdFor, reportIdOf } from './report.js';
import { parseChallengeReport } from './challenge-report.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, REROLL_COST, TRAIT_DRAW_COST, sellPrice } from './points.js';
import { passiveAtTier } from './card-templates.js';
import { TRAIT_BASE_SLOTS, TRAIT_SLOT_COSTS, nextTraitSlot, traitFits, traitSwap } from './traits.js';
import { HERO_BASE_ARCHETYPE, characterCombatStats, heroBaseStats, vitalsOf } from './vitals.js';
import { scanStatLifeTags } from '../scene/stats/stat-directives.js';
import { HURT_PCT } from '../scene/stats/stat-vocab.js';
import { heroInventoryView } from './inventory-view.js';
import { STOCK_TYPES, stockPlan } from './inventory-writes.js';

// 正文里「我 / {{user}} / 主角」都指用户本人。
export const PROTAGONIST_ALIASES = Object.freeze(['我', '{{user}}', '主角']);

// 各类记录挂的标签哈希（不对应正文里的标签，是账本自己写的记录）。
export const DECK_TAG_HASH = 'deck';
export const REWARD_TAG_HASH = 'reward';
export const CONSUME_TAG_HASH = 'consume';
export const WOUND_TAG_HASH = 'wound';
export const GEAR_TAG_HASH = 'gear';
export const SELL_TAG_HASH = 'sell';
export const REBUILD_TAG_HASH = 'rebuild';
export const RESPEC_TAG_HASH = 'respec';
export const ASCEND_TAG_HASH = 'ascend';
export const TRAIT_TAG_HASH = 'trait';
export const PANEL_TAG_HASH = 'panel';
export const USE_TAG_HASH = 'use';
export const ALLOC_TAG_HASH = 'alloc';
// 日常挑战圆满后的经验牌：挂在战报楼上，战报是圆满才有效，不对应正文里的标签。
export const CHALLENGE_REWARD_TAG_HASH = 'challenge-reward';

// 不依赖正文标签的记录类型：只要楼层和 swipe 对得上就有效。
const FLOOR_ONLY_TYPES = new Set(['deck', 'reward', 'consume', 'offer', 'sell', 'rebuild', 'respec', 'ascend', 'trait', 'trait-pick', 'trait-slot', 'wound']);
// 不参与重放的记录类型（档案另走索引，撤销只用来标记其他记录）。
const NON_REPLAY_TYPES = new Set(['profile', 'revoke']);
// 有独立卡组的角色档案与只有技能的角色档案。
const ROSTER_KINDS = new Set(['deck-character', 'skill-character']);

const messageText = (floor) => String(floor?.mes ?? floor?.text ?? '');
const swipeOf = (floor) => (Number.isInteger(floor?.swipe_id) ? floor.swipe_id : 0);
const isObject = (value) => !!value && typeof value === 'object';

// 同一楼内各类记录的重放顺序（数字小的先）。
const TYPE_ORDER = Object.freeze({
    exp: 0, class: 1, learn: 2, upgrade: 3, loot: 4, reward: 5, deck: 6, equip: 7, unequip: 8, item: 9, consume: 10, lose: 10.5,
    offer: 11, sell: 12, rebuild: 13, respec: 14, ascend: 15, trait: 16, 'trait-pick': 17, 'trait-slot': 18,
    wound: 19, hurt: 19, heal: 19.5,
});
// 面板操作（卖出、改建、转职等）挂的标签，同一楼内排在所有正文记录之后。
const PANEL_TAG_HASHES = new Set([GEAR_TAG_HASH, SELL_TAG_HASH, REBUILD_TAG_HASH, RESPEC_TAG_HASH, ASCEND_TAG_HASH, TRAIT_TAG_HASH, PANEL_TAG_HASH, USE_TAG_HASH]);
const typeRank = (entry) => (PANEL_TAG_HASHES.has(entry.anchor?.tagHash) ? 20 : TYPE_ORDER[entry.type]);

// 同一楼同一 swipe 上，某角色已有多少条面板记录（新面板记录的 occurrence 取这个数）。
const countPanelEntries = (snapshot, character, messageId, swipeId) => snapshot.entries
    .filter((entry) => PANEL_TAG_HASHES.has(entry.anchor?.tagHash) && entry.character === character
        && entry.anchor.messageId === messageId && entry.anchor.swipeId === swipeId).length;

// 会改变职业/卡池的面板操作。同一楼发生过时，后续的卡组整理改挂 panel 标签以保持顺序。
const TIER_CHANGE_TYPES = new Set(['rebuild', 'respec', 'ascend']);
const hasTierChange = (snapshot, character, messageId, swipeId) => snapshot.entries
    .some((entry) => TIER_CHANGE_TYPES.has(entry.type) && entry.character === character
        && entry.anchor?.messageId === messageId && entry.anchor.swipeId === swipeId);

// 重放顺序：楼层 -> 类型 -> 同标签出现序号 -> 记录 ID。
const compareEntries = (a, b) => a.anchor.messageId - b.anchor.messageId
    || typeRank(a) - typeRank(b)
    || a.anchor.occurrence - b.anchor.occurrence
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// 角色名 -> 稳定的角色键（档案里没有该角色时用它当 ID）。
export const nameKey = (name) => `nm-${hashString(String(name || '').trim().toLowerCase())}`;

const pushDiagnostic = (diagnostics, code, entry, extra = {}) => diagnostics.push({ code, id: entry.id, character: entry.character, ...extra });

// ---------------------------------------------------------------------------
// 快照整理：把表读取结果（档案/日志/属性的已解码记录）校验、去重成账本快照。
// ---------------------------------------------------------------------------
export function normalizeSnapshot(read) {
    if (!read || read.ok !== true) {
        return { ok: false, reason: read?.reason || 'combat-ledger-read-failed', ...(read?.detail ? { detail: read.detail } : {}) };
    }
    if (Array.isArray(read.missing) && read.missing.length) return { ok: false, reason: 'combat-table-missing', missing: read.missing };
    const diagnostics = [...(read.diagnostics || [])];
    // 档案：同一 ID 取版本号最大的一条
    const profiles = new Map();
    for (const row of read.profile || []) {
        const parsed = normalizeProfile(row?.definition);
        if (!parsed.ok || parsed.value.id !== row.id) {
            diagnostics.push({ code: 'combat-profile-invalid', id: row?.id ?? null, errors: (parsed.errors || []).slice(0, 5) });
            continue;
        }
        const version = Number.isInteger(row.version) ? row.version : 0;
        const current = profiles.get(row.id);
        if (!current || version > current.version) profiles.set(row.id, { version, createdAt: Number(row.createdAt) || 0, profile: parsed.value });
    }
    // 日志：校验格式，同一 ID 只留第一条
    const entries = [];
    const ids = new Set();
    for (const row of read.ledger || []) {
        const parsed = normalizeLedgerEntry(row);
        if (!parsed.ok) {
            diagnostics.push({ code: 'combat-entry-invalid', id: row?.id ?? null, errors: parsed.errors.slice(0, 5) });
            continue;
        }
        if (!ids.has(parsed.value.id)) { ids.add(parsed.value.id); entries.push(parsed.value); }
    }
    // 属性：表缺失（optional）时标 missing，不影响其余部分
    const attributes = [];
    const attributeIds = new Set();
    const attributeTable = Array.isArray(read.attribute) ? 'ok' : 'missing';
    for (const row of attributeTable === 'ok' ? read.attribute : []) {
        const parsed = normalizeAttributeRecord(row);
        if (!parsed.ok) {
            diagnostics.push({ code: 'combat-attribute-invalid', id: row?.id ?? null, errors: parsed.errors.slice(0, 5) });
            continue;
        }
        if (!attributeIds.has(parsed.value.id)) { attributeIds.add(parsed.value.id); attributes.push(parsed.value); }
    }
    // 日志里的 profile 记录只在档案表没有该角色时兜底
    for (const entry of entries) {
        if (entry.type === 'profile' && !profiles.has(entry.character)) {
            profiles.set(entry.character, { version: -1, createdAt: entry.createdAt, profile: entry.payload });
        }
    }
    return { ok: true, profiles, entries, ids, attributes, attributeIds, attributeTable, diagnostics };
}

// ---------------------------------------------------------------------------
// 档案索引：职业、角色、敌人、名字解析。
// ---------------------------------------------------------------------------
export function indexProfiles(profiles, diagnostics = []) {
    const classes = new Map();       // 职业 ID -> 职业档案
    const classByName = new Map();   // 职业名 -> 职业档案（重名只留先创建的）
    const classAlias = new Map();    // 被合并的职业 ID -> 保留下来的职业 ID
    const characters = new Map();    // 角色 ID -> 角色档案
    const enemies = new Map();
    const byName = new Map();        // 名字/别名 -> 角色 ID
    const byNameKey = new Map();     // nameKey(名字/别名) -> 角色 ID
    const superseded = new Map();    // 被取代的技能角色 ID -> 取代它的卡组角色 ID
    const rosterCandidates = [];
    const ordered = [...profiles.values()].sort((a, b) => a.createdAt - b.createdAt || (a.profile.id < b.profile.id ? -1 : 1));
    for (const { profile } of ordered) {
        if (profile.kind === 'class') {
            const kept = classByName.get(profile.className);
            if (kept) {
                classAlias.set(profile.id, kept.id);
                diagnostics.push({ code: 'combat-class-duplicate', id: profile.id, className: profile.className, kept: kept.id });
                continue;
            }
            classByName.set(profile.className, profile);
            classes.set(profile.id, profile);
        } else if (ROSTER_KINDS.has(profile.kind)) {
            rosterCandidates.push(profile);
        } else if (profile.kind === 'enemy') {
            enemies.set(profile.id, profile);
        }
    }
    // 卡组角色先登记，技能角色后登记：同名技能角色被卡组角色取代
    const roster = [...rosterCandidates.filter((profile) => profile.kind === 'deck-character'), ...rosterCandidates.filter((profile) => profile.kind !== 'deck-character')];
    for (const profile of roster) {
        const names = [profile.name, ...(profile.aliases || [])];
        const sameNameId = profile.kind === 'skill-character' ? byName.get(profile.name) : undefined;
        if (sameNameId !== undefined && characters.get(sameNameId)?.kind === 'deck-character') {
            superseded.set(profile.id, sameNameId);
            diagnostics.push({ code: 'combat-profile-superseded', id: profile.id, name: profile.name, kept: sameNameId });
            for (const name of names) {
                if (!byNameKey.has(nameKey(name))) byNameKey.set(nameKey(name), sameNameId);
                if (!byName.has(name)) byName.set(name, sameNameId);
            }
            continue;
        }
        characters.set(profile.id, profile);
        for (const name of names) {
            if (!byNameKey.has(nameKey(name))) byNameKey.set(nameKey(name), profile.id);
            const holder = byName.get(name);
            if (holder === undefined) byName.set(name, profile.id);
            else if (holder !== profile.id) diagnostics.push({ code: 'combat-name-duplicate', name, id: profile.id, kept: holder });
        }
    }
    return { classes, classByName, classAlias, characters, enemies, byName, byNameKey, superseded };
}

export function resolveClass(index, classRef) {
    return index.classes.get(classRef) || index.classes.get(index.classAlias.get(classRef)) || null;
}

// 「我 / {{user}} / 主角」换成用户名，其余原样去空白。
function canonicalName(name, userName) {
    const text = String(name || '').trim();
    return userName && PROTAGONIST_ALIASES.includes(text) ? userName : text;
}

export function resolveCharacterId(index, name, userName = '') {
    return index.byName.get(canonicalName(name, userName)) ?? null;
}

// 角色键：档案里有就用档案 ID，没有就用名字哈希。
export function characterKeyFor(index, name, userName = '') {
    return resolveCharacterId(index, name, userName) ?? nameKey(canonicalName(name, userName));
}

// 某条正文标签可能对应的全部记录 ID（含被取代的旧技能角色 ID 与名字哈希），用于判断是否已写过。
function candidateEntryIds(index, kind, name, userName, anchor) {
    const primary = characterKeyFor(index, name, userName);
    const keys = new Set([primary, nameKey(canonicalName(name, userName))]);
    for (const [oldId, keptId] of index.superseded || []) if (keptId === primary) keys.add(oldId);
    return [...keys].map((key) => ledgerEntryId(kind, key, anchor));
}

// ---------------------------------------------------------------------------
// 楼层扫描与记录有效性。
// ---------------------------------------------------------------------------

// 返回 (楼号) -> 该楼扫描结果 的函数，结果按楼号缓存；楼不存在返回 null。
function createFloorScanner(chat, sourceFilter) {
    const cache = new Map();
    return (messageId) => {
        if (cache.has(messageId)) return cache.get(messageId);
        const floor = chat[messageId];
        let scan = null;
        if (isObject(floor)) {
            const text = messageText(floor);
            const isUser = floor.is_user === true;
            const parsedReport = isUser ? combatReportResult(text) : null;
            const report = parsedReport ? { ...parsedReport, reportId: reportIdOf(text) } : null;
            const challenge = isUser && !report ? parseChallengeReport(text) : null;
            const body = isUser ? text : combatBodyText(text, { sourceFilter });
            // 用户楼只有战报才有标签；AI 楼的标签 + 受伤等生活标签
            const tags = isUser && !report ? [] : [...scanCombatTags(body), ...(isUser ? [] : [...scanGainTags(body), ...scanLossTags(body)])];
            const lifeTags = isUser ? [] : scanStatLifeTags(text);
            scan = {
                swipeId: swipeOf(floor),
                keys: new Set([...tags, ...lifeTags].map((tag) => `${tag.tagHash}#${tag.occurrence}`)),
                report,
                challenge,
            };
        }
        cache.set(messageId, scan);
        return scan;
    };
}

// 记录失效的原因；有效返回 null。
function inactiveReason(entry, scanFloor) {
    const { anchor } = entry;
    const floor = scanFloor(anchor.messageId);
    if (!floor) return 'message-missing';
    if (floor.swipeId !== anchor.swipeId) return 'swipe-changed';
    const challengeReward = entry.type === 'learn' && anchor.tagHash === CHALLENGE_REWARD_TAG_HASH;
    const needsTag = !(FLOOR_ONLY_TYPES.has(entry.type) || challengeReward
        || ((entry.type === 'equip' || entry.type === 'unequip') && anchor.tagHash === GEAR_TAG_HASH)
        || (entry.type === 'equip' && anchor.tagHash === INIT_GEAR_TAG_HASH)
        || (entry.type === 'heal' && anchor.tagHash === USE_TAG_HASH));
    if (needsTag && !floor.keys.has(`${anchor.tagHash}#${anchor.occurrence}`)) return 'tag-missing';
    if (challengeReward && floor.challenge?.outcome !== '圆满') return 'challenge-reward-invalid';
    if (entry.type === 'exp' && floor.report?.result === 'lose') return 'defeat-no-exp';
    if (entry.type === 'loot' && (floor.report?.result !== 'win' || floor.report.reportId !== entry.payload.reportId)) return 'loot-report-invalid';
    if (entry.type === 'wound' && floor.report?.reportId !== entry.payload.reportId) return 'wound-report-invalid';
    return null;
}

// 档案 ID / 名字哈希 / 被取代的旧 ID 统一成当前有效的角色 ID，找不到返回 null。
function canonicalCharacterId(index, id) {
    if (index.characters.has(id)) return id;
    if (index.superseded?.has(id)) return index.superseded.get(id);
    return index.byNameKey.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// 撤销与库存记录 ID。
// ---------------------------------------------------------------------------
const RETRY_SUFFIX = /\|r\d+$/;
const revokedTargets = (snapshot) => new Set(snapshot.entries.filter((entry) => entry.type === 'revoke').map((entry) => entry.payload.targetEntryId));

// 未被撤销的记录的「基础 ID」（去掉重试后缀），用来判断某条正文标签是否已写过。
function activeBaseIds(snapshot) {
    const revoked = revokedTargets(snapshot);
    return new Set(snapshot.entries.filter((entry) => !revoked.has(entry.id)).map((entry) => entry.id.replace(RETRY_SUFFIX, '')));
}

// 库存类记录写失败被撤销后可以重写：ID 加 |r1、|r2…后缀，最多重试 50 次。
// 返回 { id }（可写）、{ present }（已有一条有效的）或 { error }。
export function stockEntryId(snapshot, baseId) {
    const revoked = revokedTargets(snapshot);
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const id = attempt ? `${baseId}|r${attempt}` : baseId;
        if (!snapshot.ids.has(id)) return { id };
        if (!revoked.has(id)) return { present: id };
    }
    return { error: 'combat-stock-retry-exhausted' };
}

// ---------------------------------------------------------------------------
// 角色状态与记录重放。
// ---------------------------------------------------------------------------

// 卡组角色的初始卡牌状态：目录、持有数、初始卡组。
function initialDeckState(profile, classProfile) {
    const owned = new Map();
    for (const cardId of profile.starterDeck) owned.set(cardId, (owned.get(cardId) || 0) + 1);
    return { catalog: buildCardCatalog(profile, classProfile), owned, upgraded: new Map(), deck: [...profile.starterDeck], claimed: new Set() };
}

function createCharacterState(index, profile, diagnostics) {
    const base = {
        id: profile.id, kind: profile.kind, name: profile.name, profile, exp: 0,
        gear: { owned: new Map(), slots: {} }, items: new Map(), keepsakes: new Map(),
        points: 0, traits: [], pendingTrait: null, traitDraws: 0, innateDropped: [], slotUnlocks: 0, wound: null,
    };
    if (profile.kind === 'skill-character') return { ...base, className: profile.className, skills: [...profile.skills], passives: profile.passives };
    const classProfile = resolveClass(index, profile.classRef);
    if (!classProfile) diagnostics.push({ code: 'combat-class-missing', id: profile.id, classRef: profile.classRef });
    return {
        ...base, classRef: classProfile?.id ?? profile.classRef, classProfile, classTier: 1, tierName: '', tierCards: [],
        ...initialDeckState(profile, classProfile),
    };
}

// 获得一张牌：持有数 +1，卡组没满且没超出该稀有度的张数上限时顺带放进卡组。
function addCard(state, cardId) {
    state.owned.set(cardId, (state.owned.get(cardId) || 0) + 1);
    const inDeck = state.deck.filter((id) => id === cardId).length;
    if (state.deck.length < COMBAT_RULES.deckMax && inDeck < cardCopyLimit(state.catalog.get(cardId)?.rarity)) state.deck.push(cardId);
}

// 专属卡按等级解锁（v0.39.2）：EXP 记录让卡组角色跨过某槽位的解锁等级时，档案里登记的那张计入拥有（剧情 learn 已提前解锁的不重复计）；
// 档案还没有该槽位的卡时记下跨级的锚点（signatureDue），由成长补扫交副 LLM 生成。EXP 记录失效、等级退回时不再跨级，卡随之锁上。
function unlockSignatures(state, levelBefore, anchor) {
    if (state.kind !== 'deck-character') return;
    const level = expProgress(state.exp).level;
    COMBAT_RULES.signatureUnlockLevels.forEach((need, index) => {
        const slot = index + 1;
        if (levelBefore >= need || level < need) return;
        const card = signatureCardAt(state.profile, slot);
        if (!card) {
            if (!state.signatureDue) state.signatureDue = new Map();
            if (!state.signatureDue.has(slot)) state.signatureDue.set(slot, { ...anchor });
            return;
        }
        // 旧档案预生成的卡（ID 不带「-g<槽位>」）沿用旧规则：只由剧情 learn 解锁，升级不自动给
        if (!/-g\d+$/.test(String(card.id || ''))) return;
        if ((state.owned.get(card.id) || 0) > 0) return;
        if (!state.catalog.has(card.id)) state.catalog.set(card.id, card);
        addCard(state, card.id);
    });
}

// 技能/被动的伤害是否超过盟友技能上限。
const exceedsDamageCap = (skill) => effectsDamage(skill?.effects) > COMBAT_RULES.allySkillDamageCap;
const resetClassTier = (state) => {
    state.classTier = 1;
    state.tierName = '';
    state.tierCards = [];
};
// 主角库存由背包表管理时（heroStock），装备/物品类记录不再写进账本内的库存。
const isHeroStock = (state, context) => context?.heroStock === true && !!context.heroId && state.id === context.heroId;

// 战利品入账。reserveOnly 为 true 表示只验证、不重复入库（库存由背包表管理）。
function applyLootSlot(state, slot, entry, heroStockOwner = false) {
    if (slot.kind === 'card') return handlers.learn(state, { card: slot.card });
    if (heroStockOwner) {
        return slot.kind === 'gear' && effectsDamage(slot.gear.passive?.effects) > COMBAT_RULES.allySkillDamageCap ? 'combat-gear-damage-cap' : null;
    }
    if (slot.kind === 'item') return handlers.item(state, slot.item);
    if (slot.kind === 'gear') {
        if (state.gear.owned.has(slot.gear.gearId)) return 'combat-loot-gear-owned';
        if (effectsDamage(slot.gear.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-gear-damage-cap';
        state.gear.owned.set(slot.gear.gearId, { ...slot.gear, rarity: slot.rarity });
        return null;
    }
    state.keepsakes.set(entry.id, { lootId: entry.id, name: slot.name, origin: slot.origin, rarity: slot.rarity });
    return null;
}

// 各类记录的重放处理函数：(角色状态, 载荷, 上下文) -> 失败原因或 null。
// 上下文含 index（档案索引）、entry（当前记录）、diagnostics、offers、loots、heroId、heroStock。
const handlers = Object.freeze({
    exp(state, payload) {
        state.exp += payload.amount;
        return null;
    },
    class(state, payload, { index }) {
        const classProfile = resolveClass(index, payload.classRef);
        if (!classProfile) return 'combat-class-missing';
        if (state.kind === 'skill-character') { state.className = classProfile.className; return null; }
        if (state.classRef !== classProfile.id) resetClassTier(state);
        state.classRef = classProfile.id;
        state.classProfile = classProfile;
        for (const card of classProfile.classPool) if (!state.catalog.has(card.id)) state.catalog.set(card.id, card);
        return null;
    },
    learn(state, payload) {
        if (state.kind === 'skill-character') {
            if (!payload.skill) return 'combat-learn-kind-mismatch';
            if (state.skills.some((skill) => skill.id === payload.skill.id)) return 'combat-skill-id-collision';
            if (exceedsDamageCap(payload.skill)) return 'combat-skill-damage-cap';
            state.skills.push(payload.skill);
            return null;
        }
        if (!payload.card) return 'combat-learn-kind-mismatch';
        if (payload.card.rarity === 'signature' && !(state.profile.signatureCards || []).some((card) => card.id === payload.card.id)) return 'combat-signature-unknown';
        if (state.catalog.has(payload.card.id)) return 'combat-card-id-collision';
        state.catalog.set(payload.card.id, payload.card);
        addCard(state, payload.card.id);
        return null;
    },
    upgrade(state, payload) {
        if (state.kind === 'skill-character') {
            if (!payload.skill) return 'combat-upgrade-kind-mismatch';
            const at = state.skills.findIndex((skill) => skill.id === payload.targetId);
            if (at < 0) return 'combat-upgrade-target-missing';
            if (exceedsDamageCap(payload.skill)) return 'combat-skill-damage-cap';
            state.skills[at] = { ...payload.skill, id: payload.targetId };
            return null;
        }
        if (!payload.card) return 'combat-upgrade-kind-mismatch';
        if (!state.owned.get(payload.targetId)) return 'combat-upgrade-target-missing';
        const target = state.catalog.get(payload.targetId);
        if (target?.rarity === 'signature' || payload.card.rarity === 'signature') {
            if (target?.rarity !== 'signature' || payload.card.rarity !== 'signature') return 'combat-signature-upgrade-mismatch';
            const ownedCount = state.owned.get(payload.targetId) || 0;
            if (!target.upgraded || (state.upgraded.get(payload.targetId) || 0) >= ownedCount) return 'combat-upgrade-invalid';
            state.upgraded.set(payload.targetId, ownedCount);
            return null;
        }
        state.catalog.set(payload.targetId, { ...payload.card, id: payload.targetId });
        return null;
    },
    equip(state, payload, context = {}) {
        const { entry } = context;
        if (effectsDamage(payload.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-gear-damage-cap';
        if (isHeroStock(state, context)) return null;
        // 面板「装备背包里的装备」只改槽位，不新增装备
        if (entry?.anchor?.tagHash === GEAR_TAG_HASH) {
            const owned = state.gear.owned.get(payload.gearId);
            if (!owned) return 'combat-gear-missing';
            state.gear.slots[owned.slot] = payload.gearId;
            return null;
        }
        const previous = state.lostGear?.get(payload.gearId);
        if (previous) state.lostGear.delete(payload.gearId);
        const gear = previous || {
            gearId: payload.gearId, name: payload.name, slot: payload.slot,
            ...(payload.passive ? { passive: payload.passive } : {}), description: payload.description,
            ...(payload.rarity ? { rarity: payload.rarity } : {}), ...(payload.bonus ? { bonus: payload.bonus } : {}),
        };
        state.gear.owned.set(payload.gearId, gear);
        state.gear.slots[gear.slot] = payload.gearId;
        return null;
    },
    unequip(state, payload, context) {
        if (isHeroStock(state, context)) return null;
        if (!state.gear.owned.has(payload.gearId)) return 'combat-gear-missing';
        for (const [slot, gearId] of Object.entries(state.gear.slots)) if (gearId === payload.gearId) delete state.gear.slots[slot];
        return null;
    },
    item(state, payload, context) {
        if (isHeroStock(state, context)) return null;
        const existing = state.items.get(payload.itemId);
        const definition = existing?.lost ? existing : payload;
        state.items.set(payload.itemId, {
            itemId: payload.itemId, name: payload.name, effects: definition.effects, description: definition.description,
            count: (existing?.count || 0) + payload.count,
        });
        return null;
    },
    keepsake(state, payload, context) {
        if (!isHeroStock(state, context)) {
            const previous = state.lostKeepsakes?.get(itemIdFor(payload.name));
            if (previous) state.lostKeepsakes.delete(itemIdFor(payload.name));
            state.keepsakes.set(context.entry.id, { lootId: context.entry.id, name: payload.name, origin: previous ? previous.origin : payload.origin, rarity: previous ? previous.rarity : (payload.rarity || 'common') });
        }
        return null;
    },
    lose(state, payload, context) {
        if (isHeroStock(state, context)) return null;
        const gearId = gearIdFor(payload.name);
        const gear = state.gear.owned.get(gearId);
        if (gear) {
            state.gear.owned.delete(gearId);
            for (const [slot, id] of Object.entries(state.gear.slots)) if (id === gearId) delete state.gear.slots[slot];
            (state.lostGear ??= new Map()).set(gearId, gear);
            return null;
        }
        const itemId = itemIdFor(payload.name);
        const item = state.items.get(itemId);
        if (item && item.count > 0) {
            const count = payload.all ? 0 : Math.max(0, item.count - payload.count);
            state.items.set(itemId, count > 0 ? { ...item, count } : { ...item, count: 0, lost: true });
            return null;
        }
        const kept = [...state.keepsakes].filter(([, value]) => itemIdFor(value.name) === itemId).map(([id]) => id);
        if (!kept.length) return 'combat-item-missing';
        for (const id of payload.all ? kept : kept.slice(0, payload.count)) {
            (state.lostKeepsakes ??= new Map()).set(itemId, state.keepsakes.get(id));
            state.keepsakes.delete(id);
        }
        return null;
    },
    consume(state, payload, context) {
        if (isHeroStock(state, context)) return null;
        const existing = state.items.get(payload.itemId);
        if (!existing || existing.count < payload.count) return 'combat-item-insufficient';
        existing.count -= payload.count;
        return null;
    },
    wound(state, payload) {
        state.wound = payload.hp >= payload.maxHp && !payload.down ? null : { hp: payload.down ? 0 : payload.hp, maxHp: payload.maxHp, down: payload.down };
        return null;
    },
    heal(state, payload) {
        const wound = state.wound;
        if (!wound) return null;
        const base = payload.mode === 'percent' ? Math.ceil(wound.maxHp * payload.amount / 100) : payload.amount;
        const hp = Math.min(wound.maxHp, wound.hp + Math.max(1, Math.round(base * payload.scale / 100)));
        state.wound = hp >= wound.maxHp ? null : { hp, maxHp: wound.maxHp, down: false };
        return null;
    },
    hurt(state, payload) {
        const wound = state.wound || { hp: payload.maxHp, maxHp: payload.maxHp, down: false };
        const hp = Math.max(0, wound.hp - Math.max(1, Math.round(wound.maxHp * payload.pct / 100)));
        state.wound = { hp, maxHp: wound.maxHp, down: hp <= 0 };
        return null;
    },
    reward(state, payload) {
        if (state.kind !== 'deck-character') return 'combat-reward-kind-mismatch';
        if (expProgress(state.exp).level < payload.level) return 'combat-reward-level-unreached';
        if (state.claimed.has(payload.level)) return 'combat-reward-duplicate';
        const { choice } = payload;
        if (choice.kind === 'card') {
            if (!state.catalog.has(choice.cardId)) return 'combat-reward-card-unknown';
            if (state.catalog.get(choice.cardId).rarity === 'signature') return 'combat-reward-signature';
            addCard(state, choice.cardId);
        } else if (choice.kind === 'upgrade') {
            if (state.catalog.get(choice.targetId)?.rarity === 'signature') return 'combat-reward-signature';
            const ownedCount = state.owned.get(choice.targetId) || 0;
            const upgradedCount = state.upgraded.get(choice.targetId) || 0;
            if (!ownedCount || upgradedCount >= ownedCount || !state.catalog.get(choice.targetId)?.upgraded) return 'combat-reward-upgrade-invalid';
            state.upgraded.set(choice.targetId, upgradedCount + 1);
        }
        state.claimed.add(payload.level);
        return null;
    },
    deck(state, payload, { entry, diagnostics }) {
        if (state.kind !== 'deck-character') return 'combat-deck-kind-mismatch';
        const counts = new Map();
        const kept = [];
        for (const cardId of payload.cards) {
            const used = counts.get(cardId) || 0;
            if (used >= (state.owned.get(cardId) || 0) || used >= cardCopyLimit(state.catalog.get(cardId)?.rarity)) continue;
            counts.set(cardId, used + 1);
            kept.push(cardId);
        }
        const removed = payload.cards.length - kept.length;
        if (removed) pushDiagnostic(diagnostics, 'combat-deck-adjusted', entry, { removed });
        state.deck = kept;
        state.deckNeedsAdjust = removed > 0 || kept.length < COMBAT_RULES.deckMin;
        state.deckRevision = payload.revision;
        return null;
    },
    offer(state, payload, { entry, offers }) {
        if (offers.has(payload.combatId)) return 'combat-offer-duplicate';
        offers.set(payload.combatId, { entryId: entry.id, character: state.id, anchor: { ...entry.anchor }, ...payload });
        return null;
    },
    loot(state, payload, { entry, offers, loots, heroId, heroStock }) {
        if (loots.has(payload.combatId)) return 'combat-loot-duplicate';
        const offer = offers.get(payload.combatId);
        if (!offer) return 'combat-loot-offer-missing';
        if (offer.character !== state.id) return 'combat-loot-owner-mismatch';
        if (reportIdFor(payload.combatId) !== payload.reportId) return 'combat-loot-report-mismatch';
        const slot = (payload.set === 'reserve' ? offer.reserve : offer.slots)?.[payload.slot.index];
        if (!slot || slot.kind !== payload.slot.kind || slot.name !== payload.slot.name || slot.rarity !== payload.slot.rarity) return 'combat-loot-slot-mismatch';
        if ((payload.set === 'reserve') !== (payload.cost > 0)) return 'combat-loot-cost-invalid';
        if (payload.cost > 0 && heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        const failure = applyLootSlot(state, slot, entry, heroStock === true && state.id === heroId);
        if (failure) return failure;
        state.points -= payload.cost;
        loots.set(payload.combatId, { entryId: entry.id, character: state.id, set: payload.set, index: payload.slot.index });
        return null;
    },
    sell(state, payload, context = {}) {
        const { heroId } = context;
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        if (isHeroStock(state, context)) {
            if (!payload.rarity) return 'combat-sell-legacy';
            state.points += sellPrice(payload.rarity, payload.itemId || payload.gearId || payload.lootId);
            return null;
        }
        if (payload.itemId) return 'combat-sell-target-invalid';
        if (payload.gearId) {
            const gear = state.gear.owned.get(payload.gearId);
            if (!gear) return 'combat-gear-missing';
            if (Object.values(state.gear.slots).includes(payload.gearId)) return 'combat-gear-equipped';
            state.gear.owned.delete(payload.gearId);
            state.points += sellPrice(gear.rarity, payload.gearId);
            return null;
        }
        const keepsake = state.keepsakes.get(payload.lootId);
        if (!keepsake) return 'combat-keepsake-missing';
        state.keepsakes.delete(payload.lootId);
        state.points += sellPrice(keepsake.rarity, payload.lootId);
        return null;
    },
    rebuild(state, payload, { heroId }) {
        if (state.kind !== 'deck-character') return 'combat-rebuild-kind-mismatch';
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        if (payload.cost !== REBUILD_COST) return 'combat-rebuild-cost-invalid';
        const rebuilt = { ...state.profile, personalPool: payload.personalPool, starterDeck: payload.starterDeck };
        if (!state.classProfile || !validateStarterDeck({ ...rebuilt, classRef: state.classProfile.id }, state.classProfile).ok) return 'combat-rebuild-invalid';
        const oldPoolIds = new Set((state.profile.personalPool || []).map((card) => card.id));
        if (payload.personalPool.some((card) => state.catalog.has(card.id) && !oldPoolIds.has(card.id))) return 'combat-card-id-collision';
        for (const cardId of state.profile.starterDeck || []) state.owned.set(cardId, (state.owned.get(cardId) || 0) - 1);
        for (const cardId of oldPoolIds) {
            state.catalog.delete(cardId);
            state.owned.delete(cardId);
            state.upgraded.delete(cardId);
        }
        for (const card of payload.personalPool) state.catalog.set(card.id, card);
        for (const cardId of payload.starterDeck) state.owned.set(cardId, (state.owned.get(cardId) || 0) + 1);
        for (const [cardId, count] of [...state.owned]) {
            if (count <= 0) { state.owned.delete(cardId); state.upgraded.delete(cardId); }
            else if ((state.upgraded.get(cardId) || 0) > count) state.upgraded.set(cardId, count);
        }
        state.profile = rebuilt;
        state.deck = [...payload.starterDeck];
        state.deckNeedsAdjust = false;
        state.points -= payload.cost;
        return null;
    },
    respec(state, payload, context) {
        if (state.kind !== 'deck-character') return 'combat-respec-kind-mismatch';
        if (context.heroId && state.id !== context.heroId) return 'combat-points-not-protagonist';
        if (payload.cost !== RESPEC_COST) return 'combat-respec-cost-invalid';
        const classProfile = resolveClass(context.index, payload.classRef);
        if (!classProfile) return 'combat-class-missing';
        if (classProfile.id === state.classRef) return 'combat-respec-same-class';
        handlers.class(state, { classRef: classProfile.id }, context);
        state.points -= payload.cost;
        return null;
    },
    ascend(state, payload, { index, heroId }) {
        if (state.kind !== 'deck-character') return 'combat-ascend-kind-mismatch';
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        const tier = ASCEND_TIERS[payload.tier];
        if (!tier || payload.tier !== state.classTier + 1) return 'combat-ascend-tier-invalid';
        const classProfile = resolveClass(index, payload.classRef);
        if (!classProfile || !state.classProfile || classProfile.id !== state.classProfile.id) return 'combat-ascend-class-mismatch';
        if (payload.cost !== tier.cost) return 'combat-ascend-cost-invalid';
        if (expProgress(state.exp).level < tier.level) return 'combat-ascend-level-unreached';
        if (payload.cards.some((card) => card.rarity !== tier.rarity)) return 'combat-ascend-rarity-invalid';
        if (payload.cards.some((card) => state.catalog.has(card.id))) return 'combat-card-id-collision';
        for (const card of payload.cards) state.catalog.set(card.id, card);
        state.classTier = payload.tier;
        state.tierName = payload.tierName;
        state.tierCards = [...state.tierCards, ...payload.cards];
        state.points -= payload.cost;
        return null;
    },
    trait(state, payload, { heroId }) {
        if (state.kind !== 'deck-character') return 'combat-trait-kind-mismatch';
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        if (payload.cost !== TRAIT_DRAW_COST) return 'combat-trait-cost-invalid';
        if (state.pendingTrait) return 'combat-trait-pending';
        if (state.traits.some((trait) => trait.traitId === payload.traitId)) return 'combat-trait-duplicate';
        if (effectsDamage(payload.passive?.effects) > COMBAT_RULES.allySkillDamageCap) return 'combat-trait-damage-cap';
        const { cost, ...trait } = payload;
        state.traitDraws += 1;
        state.points -= cost;
        // 有空槽直接装上，没有则进入待选
        if (payload.kind ? traitFits(state, payload.kind) : state.traits.length < TRAIT_BASE_SLOTS) state.traits = [...state.traits, trait];
        else state.pendingTrait = trait;
        return null;
    },
    'trait-pick'(state, payload, { heroId }) {
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        const pending = state.pendingTrait;
        if (!pending || pending.traitId !== payload.traitId) return 'combat-trait-pick-invalid';
        if (payload.drop !== pending.traitId) {
            const swapped = traitSwap(state, pending, payload.drop);
            if (!swapped) return 'combat-trait-pick-invalid';
            if (swapped.blocked) return 'combat-trait-pick-blocked';
            state.traits = swapped.traits;
            state.innateDropped = swapped.innateDropped;
        }
        state.pendingTrait = null;
        return null;
    },
    'trait-slot'(state, payload, { heroId }) {
        if (state.kind !== 'deck-character') return 'combat-trait-slot-kind-mismatch';
        if (heroId && state.id !== heroId) return 'combat-points-not-protagonist';
        const next = nextTraitSlot(state);
        if (!next || payload.slot !== next.slot) return 'combat-trait-slot-invalid';
        if (payload.cost !== next.cost) return 'combat-trait-slot-cost-invalid';
        state.points -= payload.cost;
        state.slotUnlocks += 1;
        if (state.pendingTrait && traitFits(state, state.pendingTrait.kind)) {
            state.traits = [...state.traits, state.pendingTrait];
            state.pendingTrait = null;
        }
        return null;
    },
});

// 重放去重键：同一角色同一类型同一标签位置只认一条。
const entryDedupKey = (characterId, entry) => [characterId, entry.type, entry.anchor.messageId, entry.anchor.swipeId, entry.anchor.tagHash, entry.anchor.occurrence].join('|');

// 晋升后的职业档案：被动按阶数换算，卡池追加晋升卡。
function effectiveClassProfile(state) {
    const classProfile = state.classProfile;
    if (!classProfile || !(state.classTier > 1)) return classProfile;
    return { ...classProfile, classPassive: passiveAtTier(classProfile.classPassive, state.classTier), classPool: [...classProfile.classPool, ...state.tierCards] };
}

// 把角色的重放状态整理成对外视图。options: heroId、heroInventory（背包表视图）、attributeContext。
function presentCharacter(state, options = {}) {
    const progress = expProgress(state.exp);
    const stock = options.heroInventory && state.id === options.heroId ? options.heroInventory : null;
    const equippedIds = new Set(Object.values(state.gear.slots));
    const gear = stock
        ? { slots: Object.fromEntries(Object.entries(stock.gear.slots).map(([slot, item]) => [slot, { ...item }])), bag: stock.gear.bag.map((item) => ({ ...item })) }
        : {
            slots: Object.fromEntries(Object.entries(state.gear.slots).map(([slot, gearId]) => [slot, state.gear.owned.get(gearId)])),
            bag: [...state.gear.owned.values()].filter((item) => !equippedIds.has(item.gearId)),
        };
    const items = (stock ? stock.items : [...state.items.values()]).filter((item) => item.count > 0).map((item) => ({ ...item }));
    const gearBonuses = Object.values(gear.slots).map((item) => item?.bonus).filter(Boolean);
    const attributes = computeAttributes({
        key: state.id, name: state.name, protagonist: state.id === options.heroId, exp: state.exp,
        archetype: state.classProfile?.archetype, className: state.classProfile?.className ?? state.className ?? '', gearBonuses,
    }, options.attributeContext || EMPTY_ATTRIBUTE_CONTEXT);
    const collection = (stock ? stock.collection : [...state.keepsakes.values()]).map((item) => ({ ...item }));
    const traits = state.traits.map((trait) => ({ ...trait }));
    const view = {
        id: state.id, kind: state.kind, name: state.name, profile: state.profile, exp: state.exp,
        level: progress.level, into: progress.into, next: progress.next, gear, items, attributes, collection,
        points: state.points, traits, pendingTrait: state.pendingTrait ? { ...state.pendingTrait } : null,
        traitDraws: state.traitDraws, innateDropped: [...state.innateDropped], slotUnlocks: state.slotUnlocks,
        wound: state.wound ? { ...state.wound } : null,
    };
    if (stock) {
        Object.assign(view, {
            others: stock.others.map((item) => ({ ...item })),
            ...(stock.lost?.length ? { lost: stock.lost.map((item) => ({ ...item })) } : {}),
            inventory: stock.ok ? { ok: true } : { ok: false, reason: stock.reason },
        });
    }
    if (state.kind === 'skill-character') return { ...view, className: state.className, skills: state.skills, passives: state.passives };
    // 卡组视图：升级张数按卡组顺序依次分配给前面的同名卡
    const upgradeLeft = new Map(state.upgraded);
    const deckEntries = state.deck.map((cardId) => {
        const left = upgradeLeft.get(cardId) || 0;
        if (left > 0) upgradeLeft.set(cardId, left - 1);
        return { cardId, upgraded: left > 0 };
    });
    const deckCheck = validateDeck(state.deck, state.owned, state.catalog);
    // 待领取的升级奖励：2 级起、非属性点档位、尚未领取（只有主角或未识别主角时才有）
    const pendingRewards = [];
    const eligible = !options.heroId || state.id === options.heroId;
    for (let level = 2; eligible && level <= progress.level; level += 1) {
        if (!state.claimed.has(level) && !isAsiLevel(level, true)) pendingRewards.push(level);
    }
    return {
        ...view, classRef: state.classRef, className: state.classProfile?.className ?? '', classProfile: effectiveClassProfile(state),
        classTier: state.classTier, tierName: state.tierName,
        hpMax: state.profile.base.hp + (progress.level - 1) * state.profile.growth.hpPerLevel,
        catalog: state.catalog, owned: state.owned, upgraded: state.upgraded, deck: state.deck, deckEntries,
        deckRevision: state.deckRevision ?? null, deckErrors: deckCheck.errors,
        deckNeedsAdjust: state.deckNeedsAdjust === true || !deckCheck.ok,
        claimedLevels: [...state.claimed].sort((a, b) => a - b), pendingRewards,
        // 已到解锁等级、档案还没有对应专属卡的槽位（待生成）；没有时不写字段，旧视图形状不变。
        ...(state.signatureDue?.size ? { signatureDue: [...state.signatureDue].map(([slot, anchor]) => ({ slot, level: signatureUnlockLevel(slot), anchor: { ...anchor } })) } : {}),
    };
}

// 专属卡待生成项（v0.39.2）：已到解锁等级、档案还没有对应专属卡的卡组角色每人一项（同时到期的槽位并入同一项、写同一版档案），
// 锚定最早跨级的 EXP 记录；服务层把它并入成长待生成项，交副 LLM 按剧情生成名称与效果。
export function signaturePending(effective) {
    const result = [];
    if (!effective?.ok || !(effective.characters instanceof Map)) return result;
    for (const character of effective.characters.values()) {
        if (!Array.isArray(character?.signatureDue) || !character.signatureDue.length) continue;
        const due = [...character.signatureDue].sort((a, b) => a.slot - b.slot);
        result.push({ kind: 'signature', character: character.name, characterId: character.id, slots: due.map((item) => item.slot), skill: '专属卡', anchor: { ...due[0].anchor } });
    }
    return result;
}

// ---------------------------------------------------------------------------
// 属性系统：初始化(init)、关系档位(rel)、剧情加点(story)、奖励加点(reward)、主角手动分配(alloc)。
// ---------------------------------------------------------------------------
const ARCHETYPES = Object.keys(COMBAT_RULES.archetypes);
const ATTRIBUTE_ORDER = Object.freeze({ rel: 0, story: 1, reward: 2, alloc: 3 });
const compareAttributes = (a, b) => a.anchor.messageId - b.anchor.messageId
    || ATTRIBUTE_ORDER[a.type] - ATTRIBUTE_ORDER[b.type]
    || a.anchor.occurrence - b.anchor.occurrence
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));
const emptyAttributeBucket = () => ({ init: null, rel: [], story: [], reward: [], alloc: [] });
const isProtagonistName = (name, userName) => {
    const text = String(name || '').trim();
    return PROTAGONIST_ALIASES.includes(text) || (!!userName && text === userName);
};

// 属性记录是否仍然有效（alloc 不挂正文标签，只看楼层和 swipe）。
function attributeInactiveReason(record, scanFloor) {
    const { anchor } = record;
    const floor = scanFloor(anchor.messageId);
    if (!floor) return 'message-missing';
    if (floor.swipeId !== anchor.swipeId) return 'swipe-changed';
    if (record.type !== 'alloc' && !floor.keys.has(`${anchor.tagHash}#${anchor.occurrence}`)) return 'tag-missing';
    return null;
}

// 把属性记录按角色分桶：init 取最早一条，其余按类型归桶，失效的记入 inactive。
function foldAttributes(records, index, scanFloor, diagnostics) {
    const fold = new Map();
    const inactive = [];
    const bucketOf = (characterId) => {
        const key = canonicalCharacterId(index, characterId) ?? characterId;
        if (!fold.has(key)) fold.set(key, emptyAttributeBucket());
        return fold.get(key);
    };
    const inits = records.filter((record) => record.type === 'init').sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    for (const record of inits) {
        const bucket = bucketOf(record.character);
        if (bucket.init) diagnostics.push({ code: 'combat-attribute-init-duplicate', id: record.id, character: record.character });
        else bucket.init = record.payload;
    }
    for (const record of records.filter((item) => item.type !== 'init').sort(compareAttributes)) {
        const reason = attributeInactiveReason(record, scanFloor);
        if (reason) inactive.push({ id: record.id, reason });
        else bucketOf(record.character)[record.type].push(record);
    }
    return { fold, inactive };
}

// 没写初始化的角色，按名字哈希在各原型里挑一个，职业带原型时优先职业的。
const defaultRole = (name, archetype) => (ARCHETYPES.includes(archetype) ? archetype : ARCHETYPES[hash32(`role:${name}`) % ARCHETYPES.length]);
const abilityAdjustments = (records) => records.filter((record) => record.payload.ability !== 'free').map((record) => record.payload);
const freePoints = (records) => records.reduce((sum, record) => sum + (record.payload.ability === 'free' ? record.payload.amount : 0), 0);
const EMPTY_ATTRIBUTE_CONTEXT = Object.freeze({ fold: new Map(), heroLevel: 1, table: 'missing' });

// 计算一个角色的六维属性视图。
// 主角等级取自经验，其他角色等级由「关系档位锚定的主角等级 + 偏移」给出。
function computeAttributes({ key, name, protagonist, exp = 0, archetype, className = '', gearBonuses = [], fallbackPrefs = null }, context) {
    const bucket = context.fold.get(key) || emptyAttributeBucket();
    const init = bucket.init;
    const role = init?.role ?? defaultRole(name, archetype);
    const prefs = init ? { major: init.major, minor: init.minor, weak: init.weak } : normalizePrefs(fallbackPrefs) || defaultPrefs(role);
    const latestRel = protagonist ? null : bucket.rel[bucket.rel.length - 1]?.payload ?? null;
    const tier = protagonist ? null : latestRel?.tier ?? DEFAULT_REL_TIER;
    const level = protagonist
        ? expProgress(exp).level
        : latestRel ? clampInt(latestRel.anchorLevel + latestRel.offset, 1, levelCap(false)) : relLevel({ name, tier: DEFAULT_REL_TIER, anchorLevel: context.heroLevel });
    const picks = bucket.alloc.flatMap((record) => record.payload.picks || [record.payload]);
    const adjustments = [...abilityAdjustments(bucket.story), ...abilityAdjustments(bucket.reward), ...picks, ...gearBonuses];
    const derived = deriveAbilities({
        prefs, name, level, protagonist: !!protagonist, tier: tier ?? DEFAULT_REL_TIER, adjustments,
        ...(init?.scores ? { base: init.scores } : {}),
    });
    const spent = picks.reduce((sum, pick) => sum + pick.amount, 0);
    // 主角可手动分配的点数 = 升级赠送的 + 剧情/奖励给的自由点 - 已分配的
    const balance = protagonist ? Math.max(0, asiCountAt(level, true) * ASI_POINTS + freePoints(bucket.story) + freePoints(bucket.reward) - spent) : 0;
    return {
        // 当前职业来自已重放的档案；初始化名称只用于还没有职业档案的角色。
        className: className || init?.className || '', role, prefs, initialized: !!init, protagonist: !!protagonist, tier,
        relTagged: !!latestRel, level, ...derived, balance, table: context.table,
    };
}

// 按名字取属性视图（给没有档案的角色用）。
export function attributeViewFor(state, name, { archetype, protagonist = false, prefs = null } = {}) {
    if (!state || state.ok !== true || !state.attributes) return null;
    const trimmedName = String(name || '').trim();
    const { fold, heroLevel, table } = state.attributes;
    const exp = protagonist && state.unassignedExp?.get(nameKey(trimmedName)) || 0;
    return computeAttributes({
        key: nameKey(trimmedName), name: trimmedName, protagonist, exp, archetype, fallbackPrefs: protagonist ? prefs : null,
    }, { fold, heroLevel, table });
}

// 把文本里的 <user> 换成用户名。
const fillUserName = (text, userName) => String(text || '').replace(/<user>|\{\{user\}\}/gi, (token) => userName || token).trim();

export function abilitiesForName(state, name, userName = '', { heroPrefs = null } = {}) {
    if (!state || state.ok !== true) return null;
    const resolved = canonicalName(fillUserName(name, userName), userName);
    if (!resolved) return null;
    for (const character of state.characters.values()) {
        if (character.name === resolved || (character.profile?.aliases || []).includes(resolved)) return character.attributes || null;
    }
    return attributeViewFor(state, resolved, userName && resolved === userName ? { protagonist: true, prefs: heroPrefs, archetype: HERO_BASE_ARCHETYPE } : {});
}

export function vitalsForName(state, name, userName = '', { heroPrefs = null } = {}) {
    if (!state || state.ok !== true) return null;
    const resolved = canonicalName(fillUserName(name, userName), userName);
    if (!resolved) return null;
    for (const character of state.characters.values()) {
        if (character.name === resolved || (character.profile?.aliases || []).includes(resolved)) return vitalsOf(characterCombatStats(character).hp, character.wound);
    }
    if (!userName || resolved !== userName) return null;
    const view = attributeViewFor(state, resolved, { protagonist: true, prefs: heroPrefs, archetype: HERO_BASE_ARCHETYPE });
    return vitalsOf(heroBaseStats(view).hp, state.looseVitals?.get(nameKey(resolved))?.wound ?? null);
}

// ---------------------------------------------------------------------------
// 有效状态：把快照里仍然有效的记录按顺序重放。纯函数，同一输入同一输出。
// options: sourceFilter（正文来源过滤）、userName、heroInventory（背包表视图，主角库存以它为准）。
// 返回对象里的 Map/数组/角色视图都是本次新建的；记忆化后会被多个调用方共享，调用方只读。
// ---------------------------------------------------------------------------
// 会影响成长播报的记录类型。
const GROWTH_TYPES = new Set(['exp', 'learn', 'upgrade', 'class']);

// 一条成长记录对应的播报：谁、什么变化、升了几级、送了几点属性。
function growthRecord(entry, state, levelBefore, index, heroId = null) {
    const payload = entry.payload;
    const name = entry.type === 'class' ? resolveClass(index, payload.classRef)?.className || '' : (payload.card || payload.skill)?.name || '';
    const levelAfter = expProgress(state.exp).level;
    const asiLevels = state.id === heroId
        ? Array.from({ length: Math.max(0, levelAfter - levelBefore) }, (_, at) => levelBefore + 1 + at).filter((level) => isAsiLevel(level, true))
        : [];
    return {
        id: entry.id, type: entry.type, character: state.id, characterName: state.name, anchor: { ...entry.anchor },
        amount: entry.type === 'exp' ? payload.amount : 0, name, levelBefore, levelAfter,
        ...(asiLevels.length ? { asiPoints: asiLevels.length * ASI_POINTS } : {}),
    };
}

// 主角积分流水的原因（按记录类型）。
const POINT_REASON = { loot: '战利品换取', sell: '出售', rebuild: '重塑牌组', respec: '转职', ascend: '进阶', trait: '抽特质', 'trait-pick': '选特质', 'trait-slot': '解锁特质槽' };
// 主角积分流水挂在有效状态之外（不改状态的字段结构）：按状态对象存，读取用 heroPointLog(state)。
const pointLogs = new WeakMap();
const NO_POINT_LOG = Object.freeze([]);
export const heroPointLog = (state) => (state && pointLogs.get(state)) || NO_POINT_LOG;
export function computeEffectiveState(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return snapshot?.ok === false ? snapshot : { ok: false, reason: 'combat-ledger-read-failed' };
    const diagnostics = [...snapshot.diagnostics];
    const index = indexProfiles(snapshot.profiles, diagnostics);
    const scanFloor = createFloorScanner(Array.isArray(chat) ? chat : [], options.sourceFilter);
    const revoked = new Set(snapshot.entries.filter((entry) => entry.type === 'revoke').map((entry) => entry.payload.targetEntryId));
    const states = new Map();
    for (const profile of index.characters.values()) states.set(profile.id, createCharacterState(index, profile, diagnostics));
    const unassignedExp = new Map();   // 档案里没有的角色累计的经验（主角未建档时用）
    const applied = [];
    const pointLog = [];               // 主角积分进出流水 [{ floor, delta, reason, type, id }]，只读
    const inactive = [];
    const growth = [];
    const seenTags = new Set();
    const offers = new Map();
    const loots = new Map();
    const looseVitals = new Map();     // 没有档案的角色的受伤状态
    let lastParty = null;
    const userName = options.userName || '';
    const heroId = userName ? resolveCharacterId(index, userName, userName) : null;
    const heroStock = !!(heroId && options.heroInventory);
    const ordered = snapshot.entries.filter((entry) => !NON_REPLAY_TYPES.has(entry.type)).sort(compareEntries);
    for (const entry of ordered) {
        const reason = revoked.has(entry.id) ? 'revoked' : inactiveReason(entry, scanFloor);
        if (reason) { inactive.push({ id: entry.id, reason }); continue; }
        const characterId = canonicalCharacterId(index, entry.character);
        if (!FLOOR_ONLY_TYPES.has(entry.type)) {
            const dedupKey = entryDedupKey(characterId ?? entry.character, entry);
            if (seenTags.has(dedupKey)) { pushDiagnostic(diagnostics, 'combat-entry-duplicate-tag', entry); continue; }
            seenTags.add(dedupKey);
        }
        if (!characterId) {
            if (entry.type === 'exp') {
                unassignedExp.set(entry.character, (unassignedExp.get(entry.character) || 0) + entry.payload.amount);
                applied.push(entry.id);
            } else if (entry.type === 'hurt' || entry.type === 'heal') {
                const loose = looseVitals.get(entry.character) || { wound: null };
                handlers[entry.type](loose, entry.payload);
                looseVitals.set(entry.character, loose);
                applied.push(entry.id);
            } else {
                pushDiagnostic(diagnostics, 'combat-character-missing', entry);
            }
            continue;
        }
        if (index.superseded.has(entry.character) && entry.type !== 'exp') {
            pushDiagnostic(diagnostics, 'combat-superseded-entry-skipped', entry, { kept: characterId });
            continue;
        }
        const state = states.get(characterId);
        const levelBefore = expProgress(state.exp).level;
        const pointsBefore = state.points || 0;
        const failure = handlers[entry.type](state, entry.payload, { index, entry, diagnostics, offers, loots, heroId, heroStock });
        if (failure) { pushDiagnostic(diagnostics, failure, entry); continue; }
        if (heroId && characterId === heroId && (state.points || 0) !== pointsBefore) {
            pointLog.push({ floor: entry.anchor.messageId, delta: (state.points || 0) - pointsBefore, reason: POINT_REASON[entry.type] || entry.type, type: entry.type, id: entry.id });
        }
        applied.push(entry.id);
        if (entry.type === 'exp') unlockSignatures(state, levelBefore, entry.anchor);
        if (GROWTH_TYPES.has(entry.type)) growth.push(growthRecord(entry, state, levelBefore, index, heroId));
        if (entry.type === 'wound') {
            // 同一楼的受伤记录归到同一份「上一场队伍」
            if (lastParty?.messageId !== entry.anchor.messageId) lastParty = { messageId: entry.anchor.messageId, reportId: entry.payload.reportId, ids: [] };
            if (!lastParty.ids.includes(characterId)) lastParty.ids.push(characterId);
        }
    }
    const folded = foldAttributes(snapshot.attributes || [], index, scanFloor, diagnostics);
    const heroState = heroId ? states.get(heroId) : null;
    const attributeContext = { fold: folded.fold, heroLevel: heroState ? expProgress(heroState.exp).level : 1, table: snapshot.attributeTable || 'missing' };
    const characters = new Map([...states].map(([id, state]) => [id, presentCharacter(state, {
        heroId, attributeContext, ...(heroStock ? { heroInventory: options.heroInventory } : {}),
    })]));
    const attributes = { table: attributeContext.table, heroId, heroLevel: attributeContext.heroLevel, fold: folded.fold, inactive: folded.inactive };
    const result = {
        ok: true, characters, classes: index.classes, enemies: index.enemies,
        profileMeta: new Map([...snapshot.profiles].map(([id, meta]) => [id, { version: meta.version, createdAt: meta.createdAt }])),
        unassignedExp, applied, inactive, diagnostics, growth, attributes, offers, loots, lastParty, looseVitals,
    };
    pointLogs.set(result, pointLog);
    return result;
}

// ---------------------------------------------------------------------------
// 正文标签扫描：把新出现的成长/属性标签变成待写入的记录。
// ---------------------------------------------------------------------------
// 需要 AI 生成内容（卡/技能/职业/装备/物品）的标签种类，扫描时进 pendingGeneration。
const GENERATION_KINDS = new Set(['learn', 'upgrade', 'class', 'equip', 'item']);

const anchorOf = (floor, messageId, directive) => ({ messageId, swipeId: swipeOf(floor), tagHash: directive.tagHash, occurrence: directive.occurrence });

// 扫描时用到的主角信息：主角 ID、已生效的主角经验记录、各角色的关系档位时间线。
function buildScanContext(snapshot, effective, index, options) {
    const userName = options.userName || '';
    const heroId = userName ? resolveCharacterId(index, userName, userName) : null;
    const appliedIds = new Set(effective.ok ? effective.applied : []);
    const heroExp = heroId && effective.ok
        ? snapshot.entries.filter((entry) => entry.type === 'exp' && appliedIds.has(entry.id) && canonicalCharacterId(index, entry.character) === heroId)
        : [];
    const rels = new Map();
    for (const [characterId, bucket] of effective.ok ? effective.attributes.fold : []) {
        rels.set(characterId, bucket.rel.map((record) => ({ messageId: record.anchor.messageId, tier: record.payload.tier })));
    }
    return { heroId, heroExp, rels };
}

// 角色在某楼之前（含该楼）的关系档位。
function relTierAt(context, characterId, messageId) {
    const timeline = (context.rels.get(characterId) || []).filter((item) => item.messageId <= messageId);
    return timeline.length ? timeline[timeline.length - 1].tier : DEFAULT_REL_TIER;
}

// 主角在某楼时的等级：已生效的经验 + 本次扫描已排队的经验。
function heroLevelAt(context, index, pendingEntries, messageId) {
    if (!context.heroId) return 1;
    const pending = pendingEntries.filter((entry) => entry.type === 'exp' && canonicalCharacterId(index, entry.character) === context.heroId);
    const total = [...context.heroExp, ...pending].filter((entry) => entry.anchor.messageId <= messageId).reduce((sum, entry) => sum + entry.payload.amount, 0);
    return clampInt(expProgress(total).level, 1, COMBAT_RULES.maxLevel);
}

// 处理 rel（关系档位）与 stat（剧情加点）标签，生成属性记录。已写过、无变化或不适用的直接跳过。
function collectAttributeDirective(directive, anchor, messageId, scan) {
    const { index, userName, now, ctx } = scan;
    const isHero = isProtagonistName(directive.character, userName) || (!!ctx.heroId && resolveCharacterId(index, directive.character, userName) === ctx.heroId);
    const key = characterKeyFor(index, directive.character, userName);
    if (directive.kind === 'stat') {
        if (!isHero) {
            scan.diagnostics.push({ code: 'combat-stat-not-protagonist', messageId, character: directive.character });
            return;
        }
        if (scan.knownAttr('story', directive.character, anchor)) return;
        const label = directive.ability === 'free' ? '自由' : ABILITY_LABELS[directive.ability];
        scan.attributes.push({
            id: ledgerEntryId('story', key, anchor), type: 'story', character: key, anchor,
            payload: { ability: directive.ability, amount: directive.amount, reason: directive.reason || '' },
            createdAt: now, change: `${label}+${directive.amount}`,
        });
        return;
    }
    if (isHero) {
        scan.diagnostics.push({ code: 'combat-rel-protagonist', messageId, character: directive.character });
        return;
    }
    if (scan.knownAttr('rel', directive.character, anchor)) return;
    const canonicalId = canonicalCharacterId(index, key) ?? key;
    if (relTierAt(ctx, canonicalId, messageId) === directive.tier) return; // 档位没变不写
    const displayName = index.characters.get(canonicalId)?.name ?? canonicalName(directive.character, userName);
    const anchorLevel = heroLevelAt(ctx, index, scan.entries, messageId);
    const offset = relOffset(displayName, directive.tier);
    scan.attributes.push({
        id: ledgerEntryId('rel', key, anchor), type: 'rel', character: key, anchor,
        payload: { tier: directive.tier, anchorLevel, offset }, createdAt: now, change: `档位：${REL_TIERS[directive.tier]?.label ?? directive.tier}`,
    });
    if (!ctx.rels.has(canonicalId)) ctx.rels.set(canonicalId, []);
    ctx.rels.get(canonicalId).push({ messageId, tier: directive.tier });
}

// 战利品标签 -> 战利品记录。必须是胜利战报、报告号对得上、能找到之前的奖励单和对应槽位。
function buildLootEntry(effective, index, directive, anchor, report, text, userName, now) {
    if (report?.result !== 'win') return { ok: false, reason: 'combat-loot-not-victory' };
    if (reportIdOf(text) !== directive.reportId) return { ok: false, reason: 'combat-loot-report-mismatch' };
    const offer = [...effective.offers.values()].find((item) => reportIdFor(item.combatId) === directive.reportId && item.anchor.messageId < anchor.messageId);
    if (!offer) return { ok: false, reason: 'combat-loot-offer-missing' };
    const key = characterKeyFor(index, directive.character, userName);
    if ((canonicalCharacterId(index, key) ?? key) !== offer.character) return { ok: false, reason: 'combat-loot-owner-mismatch' };
    const slot = (directive.set === 'reserve' ? offer.reserve : offer.slots)?.[directive.slot];
    if (!slot) return { ok: false, reason: 'combat-loot-slot-missing' };
    const payload = {
        combatId: offer.combatId, reportId: directive.reportId, set: directive.set, slot: { ...slot },
        cost: directive.set === 'reserve' ? REROLL_COST : 0,
    };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId('loot', key, anchor), type: 'loot', character: key, anchor, payload, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value } : { ok: false, reason: 'combat-entry-invalid', errors: normalized.errors.slice(0, 5) };
}

// 治疗量缩放：难度的 healScale 取整到 1–100。
const healScalePercent = (healScale) => Math.min(100, Math.max(1, Math.round(100 * (Number(healScale) || 1))));
// 传入空/非法的快照时统一的失败结果。
const invalidSnapshotResult = (snapshot) => (snapshot?.ok === false ? snapshot : { ok: false, reason: 'combat-ledger-read-failed' });

// 扫描聊天里的成长标签（exp/learn/upgrade/class/loot/unequip/heal/keepsake、rel/stat）。
// 返回 { entries（可直接写入的记录）, pendingGeneration（还要 AI 生成内容的标签）, diagnostics, attributes }。
// options.effectiveState：调用方已有同一输入的有效状态时可传入，省去重放（内部用，结果不变）。
export function scanGrowthTags(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return invalidSnapshotResult(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const userName = options.userName || '';
    const index = indexProfiles(snapshot.profiles, []);
    const messageIds = Array.isArray(options.messageIds) ? options.messageIds : floors.map((_, at) => at);
    const now = Number.isInteger(options.now) ? options.now : 0;
    const healScale = healScalePercent(options.healScale);
    const entries = [];
    const pendingGeneration = [];
    const diagnostics = [];
    const activeIds = activeBaseIds(snapshot);
    // 该标签位置是否已有一条未被撤销的同类记录
    const alreadyWritten = (kinds, character, anchor) => kinds.some((kind) => candidateEntryIds(index, kind, character, userName, anchor).some((id) => activeIds.has(id)));
    const attributes = [];
    const knownAttr = (kind, character, anchor) => candidateEntryIds(index, kind, character, userName, anchor).some((id) => snapshot.attributeIds?.has(id) === true);
    const effective = options.effectiveState ?? computeEffectiveState(snapshot, floors, { sourceFilter: options.sourceFilter, userName });
    const scan = { index, userName, now, ctx: buildScanContext(snapshot, effective, index, options), knownAttr, attributes, entries, diagnostics };
    const queueGeneration = (directive, anchor) => {
        const { index: _index, tagHash: _tagHash, occurrence: _occurrence, ...rest } = directive;
        pendingGeneration.push({ ...rest, characterId: resolveCharacterId(index, directive.character, userName), anchor });
    };
    for (const messageId of messageIds) {
        const floor = floors[messageId];
        if (!isObject(floor)) continue;
        const text = messageText(floor);
        const report = floor.is_user === true ? combatReportResult(text) : null;
        if (floor.is_user === true && !report) continue; // 用户楼只认战报
        const parsed = report ? extractGrowthDirectives(text, { raw: true, expCap: false }) : extractGrowthDirectives(text, { sourceFilter: options.sourceFilter });
        diagnostics.push(...parsed.diagnostics.map((item) => ({ ...item, messageId })));
        for (const directive of parsed.directives) {
            const anchor = anchorOf(floor, messageId, directive);
            if (directive.kind === 'rel' || directive.kind === 'stat') {
                if (report) diagnostics.push({ code: 'combat-attribute-tag-in-report', messageId, kind: directive.kind, character: directive.character });
                else collectAttributeDirective(directive, anchor, messageId, scan);
                continue;
            }
            if (options.attributesOnly) continue;
            if (directive.kind === 'loot') {
                if (alreadyWritten(['loot'], directive.character, anchor)) continue;
                const built = buildLootEntry(effective, index, directive, anchor, report, text, userName, now);
                if (built.ok) entries.push(built.entry);
                else diagnostics.push({ code: built.reason, messageId, character: directive.character, reportId: directive.reportId });
                continue;
            }
            if (directive.kind === 'exp') {
                if (report?.result === 'lose') { diagnostics.push({ code: 'combat-defeat-no-exp', messageId, character: directive.character }); continue; }
                if (alreadyWritten(['exp'], directive.character, anchor)) continue;
                const key = characterKeyFor(index, directive.character, userName);
                entries.push({ id: ledgerEntryId('exp', key, anchor), type: 'exp', character: key, anchor, payload: { amount: directive.amount, reason: directive.reason }, createdAt: now });
            } else if (directive.kind === 'unequip') {
                if (alreadyWritten(['unequip'], directive.character, anchor)) continue;
                const key = characterKeyFor(index, directive.character, userName);
                entries.push({ id: ledgerEntryId('unequip', key, anchor), type: 'unequip', character: key, anchor, payload: { gearId: gearIdFor(directive.name) }, createdAt: now });
            } else if (directive.kind === 'heal') {
                if (report) { diagnostics.push({ code: 'combat-heal-tag-in-report', messageId, character: directive.character }); continue; }
                if (alreadyWritten(['heal'], directive.character, anchor)) continue;
                const key = characterKeyFor(index, directive.character, userName);
                entries.push({
                    id: ledgerEntryId('heal', key, anchor), type: 'heal', character: key, anchor,
                    payload: { amount: directive.amount, mode: directive.mode, scale: healScale, reason: directive.reason }, createdAt: now,
                });
            } else if (GENERATION_KINDS.has(directive.kind)) {
                if (alreadyWritten(directive.kind === 'upgrade' ? ['upgrade', 'learn'] : [directive.kind], directive.character, anchor)) continue;
                queueGeneration(directive, anchor);
            }
        }
        if (report || options.attributesOnly) continue;
        // 获得类标签（纪念品等）只在 AI 楼里认
        const gains = extractGainDirectives(text, { sourceFilter: options.sourceFilter });
        diagnostics.push(...gains.diagnostics.map((item) => ({ ...item, messageId })));
        for (const directive of gains.directives) {
            const anchor = anchorOf(floor, messageId, directive);
            if (alreadyWritten([directive.kind], directive.character, anchor)) continue;
            if (directive.kind === 'keepsake') {
                const key = characterKeyFor(index, directive.character, userName);
                entries.push({
                    id: ledgerEntryId('keepsake', key, anchor), type: 'keepsake', character: key, anchor,
                    payload: { itemId: itemIdFor(directive.name), name: directive.name, origin: directive.origin, ...(directive.rarity ? { rarity: directive.rarity } : {}) },
                    createdAt: now,
                });
                continue;
            }
            queueGeneration(directive, anchor);
        }
        const losses = extractLossDirectives(text, { sourceFilter: options.sourceFilter });
        diagnostics.push(...losses.diagnostics.map((item) => ({ ...item, messageId })));
        for (const directive of losses.directives) {
            const anchor = anchorOf(floor, messageId, directive);
            if (alreadyWritten(['lose'], directive.character, anchor)) continue;
            const key = characterKeyFor(index, directive.character, userName);
            entries.push({
                id: ledgerEntryId('lose', key, anchor), type: 'lose', character: key, anchor,
                payload: { name: directive.name, ...(directive.all ? { all: true } : { count: directive.count }), reason: directive.reason },
                createdAt: now,
            });
        }
    }
    return { ok: true, entries, pendingGeneration, diagnostics, attributes };
}

// 扫描聊天里的「生活」标签：战斗/受伤标签 -> hurt 记录，治疗标签 -> heal 记录。需要用户名与主角生命上限。
// options.effectiveState 同 scanGrowthTags。
export function scanLifeTags(snapshot, chat, options = {}) {
    if (!snapshot || snapshot.ok !== true) return invalidSnapshotResult(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const userName = options.userName || '';
    if (!userName) return { ok: false, reason: 'combat-user-missing' };
    const index = indexProfiles(snapshot.profiles, []);
    const messageIds = Array.isArray(options.messageIds) ? options.messageIds : floors.map((_, at) => at);
    const now = Number.isInteger(options.now) ? options.now : 0;
    const healScale = healScalePercent(options.healScale);
    const battleHurts = options.battleHurts instanceof Map ? options.battleHurts : new Map();
    const effective = options.effectiveState ?? computeEffectiveState(snapshot, floors, { sourceFilter: options.sourceFilter, userName });
    if (!effective.ok) return effective;
    const maxHp = vitalsForName(effective, userName, userName, { heroPrefs: options.heroPrefs })?.maxHp;
    if (!(maxHp > 0)) return { ok: false, reason: 'combat-vitals-unavailable' };
    const heroKey = characterKeyFor(index, userName, userName);
    const entries = [];
    const alreadyWritten = (kind, character, anchor) => candidateEntryIds(index, kind, character, userName, anchor)
        .some((id) => snapshot.ids.has(id) || entries.some((entry) => entry.id === id));
    for (const messageId of messageIds) {
        const floor = floors[messageId];
        if (!isObject(floor) || floor.is_user === true) continue;
        const text = messageText(floor);
        let battleSeen = false; // 同一楼只认第一个战斗标签
        for (const tag of scanStatLifeTags(text)) {
            if (tag.kind === 'battle' && battleSeen) continue;
            if (tag.kind === 'battle') battleSeen = true;
            const tier = tag.kind === 'hurt' ? tag.tier : battleHurts.get(messageId);
            if (!Object.hasOwn(HURT_PCT, tier || '')) continue;
            const anchor = anchorOf(floor, messageId, tag);
            if (alreadyWritten('hurt', userName, anchor)) continue;
            entries.push({
                id: ledgerEntryId('hurt', heroKey, anchor), type: 'hurt', character: heroKey, anchor,
                payload: { tier, pct: HURT_PCT[tier], maxHp }, createdAt: now,
            });
        }
        for (const directive of extractGrowthDirectives(text, { sourceFilter: options.sourceFilter }).directives) {
            if (directive.kind !== 'heal') continue;
            const anchor = anchorOf(floor, messageId, directive);
            if (alreadyWritten('heal', directive.character, anchor)) continue;
            const key = characterKeyFor(index, directive.character, userName);
            entries.push({
                id: ledgerEntryId('heal', key, anchor), type: 'heal', character: key, anchor,
                payload: { amount: directive.amount, mode: directive.mode, scale: healScale, reason: directive.reason }, createdAt: now,
            });
        }
    }
    return { ok: true, entries };
}

// ---------------------------------------------------------------------------
// 面板操作生成的记录：卡组、升级奖励、属性分配、装备、出售、主角面板（改建/转职/晋升/特质）。
// 都挂在最后一楼的当前 swipe 上；返回 { ok, entry } 或 { ok:false, reason }。
// ---------------------------------------------------------------------------
const snapshotFailure = (snapshot) => ({ ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' });
const invalidEntry = (normalized) => ({ ok: false, reason: 'combat-entry-invalid', errors: normalized.errors });

// 卡组整理。同一楼发生过改建/转职/晋升后改挂 panel 标签，保证重放顺序。
export function buildDeckEntry(snapshot, chat, character, cards, now = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: 'combat-deck-no-floor' };
    const swipeId = swipeOf(floors[last]);
    const decks = snapshot.entries.filter((entry) => entry.type === 'deck' && entry.character === character);
    const revision = decks.reduce((max, entry) => Math.max(max, entry.payload.revision), 0) + 1;
    const anchor = hasTierChange(snapshot, character, last, swipeId)
        ? { messageId: last, swipeId, tagHash: PANEL_TAG_HASH, occurrence: countPanelEntries(snapshot, character, last, swipeId) }
        : { messageId: last, swipeId, tagHash: DECK_TAG_HASH, occurrence: decks.filter((entry) => entry.anchor.messageId === last && entry.anchor.swipeId === swipeId).length };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId('deck', character, anchor), type: 'deck', character, anchor, payload: { cards: [...cards], revision }, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value } : invalidEntry(normalized);
}

// 升级奖励选择。同一等级只能领一次。
export function buildRewardEntry(snapshot, chat, character, level, choice, now = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: 'combat-reward-no-floor' };
    const rewards = snapshot.entries.filter((entry) => entry.type === 'reward' && entry.character === character);
    if (rewards.some((entry) => entry.payload.level === level)) return { ok: false, reason: 'combat-reward-duplicate' };
    const swipeId = swipeOf(floors[last]);
    const anchor = hasTierChange(snapshot, character, last, swipeId)
        ? { messageId: last, swipeId, tagHash: PANEL_TAG_HASH, occurrence: countPanelEntries(snapshot, character, last, swipeId) }
        : { messageId: last, swipeId, tagHash: REWARD_TAG_HASH, occurrence: rewards.filter((entry) => entry.anchor.messageId === last && entry.anchor.swipeId === swipeId).length };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId('reward', character, anchor), type: 'reward', character, anchor, payload: { level, choice: { ...choice } }, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value } : invalidEntry(normalized);
}

// 主角手动分配属性点。校验：已建属性表、是主角、点数够、不超过上限。同一楼多次分配用 occurrence 区分。
export function buildAllocEntries(snapshot, chat, effective, characterId, picks, now = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    if (snapshot.attributeTable !== 'ok') return { ok: false, reason: 'combat-attribute-table-missing' };
    const character = effective?.ok ? effective.characters.get(characterId) : null;
    if (!character) return { ok: false, reason: 'combat-character-missing' };
    const view = character.attributes;
    if (!view?.protagonist) return { ok: false, reason: 'combat-alloc-not-protagonist' };
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: 'combat-alloc-no-floor' };
    const requested = Array.isArray(picks) ? picks : [];
    if (!requested.length) return { ok: false, reason: 'combat-alloc-empty' };
    const totals = new Map();
    for (const pick of requested) {
        if (!ABILITY_KEYS.includes(pick?.ability) || !Number.isInteger(pick?.amount) || pick.amount < 1 || pick.amount > ASI_POINTS) return { ok: false, reason: 'combat-alloc-invalid' };
        totals.set(pick.ability, (totals.get(pick.ability) || 0) + pick.amount);
    }
    const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
    if (total > view.balance) return { ok: false, reason: 'combat-alloc-over-balance', detail: { balance: view.balance, requested: total } };
    for (const [ability, amount] of totals) {
        if (view.scores[ability] + amount > view.cap) return { ok: false, reason: 'combat-alloc-over-cap', detail: { ability, cap: view.cap } };
    }
    const swipeId = swipeOf(floors[last]);
    const sameFloor = (snapshot.attributes || []).filter((record) => record.type === 'alloc' && record.character === characterId && record.anchor.messageId === last && record.anchor.swipeId === swipeId);
    const occurrence = Math.max(-1, ...sameFloor.map((record) => record.anchor.occurrence)) + 1;
    const anchor = { messageId: last, swipeId, tagHash: ALLOC_TAG_HASH, occurrence };
    const merged = [...totals].map(([ability, amount]) => ({ ability, amount }));
    const normalized = normalizeAttributeRecord({
        id: ledgerEntryId('alloc', characterId, anchor), type: 'alloc', character: characterId, anchor, payload: { picks: merged },
        createdAt: now, change: merged.map((pick) => `${ABILITY_LABELS[pick.ability]}+${pick.amount}`).join('、'),
    });
    return normalized.ok ? { ok: true, entries: [normalized.value] } : { ok: false, reason: 'combat-entry-invalid', errors: normalized.errors };
}

// 装备/卸下背包里的装备（面板操作）。equip 为 true 表示从背包装上，false 表示从槽位卸下。
export function buildGearEntry(snapshot, chat, character, gearId, equip, now = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: 'combat-deck-no-floor' };
    if (!character) return { ok: false, reason: 'combat-character-missing' };
    const slotted = Object.values(character.gear?.slots || {}).find((item) => item?.gearId === gearId);
    const bagged = (character.gear?.bag || []).find((item) => item.gearId === gearId);
    if (equip ? !bagged : !slotted) return { ok: false, reason: 'combat-gear-missing' };
    const swipeId = swipeOf(floors[last]);
    const anchor = { messageId: last, swipeId, tagHash: GEAR_TAG_HASH, occurrence: countPanelEntries(snapshot, character.id, last, swipeId) };
    const type = equip ? 'equip' : 'unequip';
    const payload = equip
        ? {
            gearId, name: bagged.name, slot: bagged.slot, ...(bagged.passive ? { passive: bagged.passive } : {}),
            description: bagged.description || '', ...(bagged.bonus ? { rarity: bagged.rarity, bonus: bagged.bonus } : {}),
        }
        : { gearId };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId(type, character.id, anchor), type, character: character.id, anchor, payload, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value } : invalidEntry(normalized);
}

// 按剧情给的初始装备（profile-gear）：每件一条 equip，锚点 tagHash = INIT_GEAR_TAG_HASH、occurrence 为部位序号，ID 确定、重复写幂等。
// anchor 缺省时取当前最新楼层（同构筑面板换装）；开战准备传开战楼锚点。归并时只核对楼层与 swipe。
export function buildInitialGearEntries(chat, characterId, items, now = 0, anchor = null) {
    const floors = Array.isArray(chat) ? chat : [];
    const base = anchor || (floors.length ? { messageId: floors.length - 1, swipeId: swipeOf(floors[floors.length - 1]) } : null);
    if (!base) return { ok: false, reason: 'combat-deck-no-floor' };
    if (!characterId) return { ok: false, reason: 'combat-character-missing' };
    const entries = [];
    for (const gear of Array.isArray(items) ? items : []) {
        const at = { messageId: base.messageId, swipeId: base.swipeId, tagHash: INIT_GEAR_TAG_HASH, occurrence: GEAR_SLOTS.indexOf(gear?.slot) };
        const normalized = normalizeLedgerEntry({ id: ledgerEntryId('equip', characterId, at), type: 'equip', character: characterId, anchor: at, payload: gear, createdAt: now });
        if (!normalized.ok) return invalidEntry(normalized);
        entries.push(normalized.value);
    }
    return { ok: true, entries };
}

// profile-gear 生成结果落账：按名字解析角色 ID 后经 ledger.grantInitialGear 写入；返回是否尝试过写入（调用方据此重读状态）。
// 找不到角色或写失败只记诊断，不阻断。
export async function grantGeneratedGear(ledgerImpl, generation, ownerOf, { anchor = null, diagnostics = [] } = {}) {
    let wrote = false;
    for (const item of generation?.accepted || []) {
        if (item.kind !== 'profile-gear' || !item.gear?.items?.length) continue;
        const owner = typeof ownerOf === 'function' ? ownerOf(item.gear.name) : null;
        if (!owner) {
            diagnostics.push({ code: 'combat-character-missing', name: item.gear.name });
            continue;
        }
        let result;
        try {
            result = typeof ledgerImpl?.grantInitialGear === 'function'
                ? await ledgerImpl.grantInitialGear(owner, item.gear.items, { anchor })
                : { ok: false, reason: 'combat-gear-unavailable' };
        } catch {
            result = null;
        }
        if (result?.ok !== true) diagnostics.push({ code: result?.reason || 'combat-gear-write-failed', name: item.gear.name });
        wrote = true;
    }
    return wrote;
}

// 出售装备或纪念品换点数，只有主角能卖。target 为字符串时当作 lootId。
// 主角库存由背包表管理时，记录里写 itemId + rarity；否则写 lootId。
export function buildSellEntry(snapshot, chat, effective, target, now = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: 'combat-sell-no-floor' };
    const heroId = effective?.ok ? effective.attributes.heroId : null;
    const hero = heroId ? effective.characters.get(heroId) : null;
    if (!hero) return { ok: false, reason: 'combat-points-not-protagonist' };
    const request = typeof target === 'string' ? { lootId: target } : target || {};
    let payload;
    let price;
    const stocked = !!hero.inventory;
    if (stocked && hero.inventory.ok !== true) return { ok: false, reason: hero.inventory.reason || 'inventory-table-read-failed' };
    if (request.gearId) {
        const gear = (hero.gear?.bag || []).find((item) => item.gearId === request.gearId);
        if (!gear && Object.values(hero.gear?.slots || {}).some((item) => item?.gearId === request.gearId)) return { ok: false, reason: 'combat-gear-equipped' };
        if (!gear) return { ok: false, reason: 'combat-gear-missing' };
        payload = { gearId: request.gearId, ...(stocked ? { rarity: gear.rarity || 'common' } : {}) };
        price = sellPrice(gear.rarity, request.gearId);
    } else {
        const targetId = request.itemId || request.lootId;
        const keepsake = hero.collection.find((item) => (stocked ? item.itemId : item.lootId) === targetId);
        if (!keepsake) return { ok: false, reason: 'combat-keepsake-missing' };
        payload = stocked ? { itemId: targetId, rarity: keepsake.rarity || 'common' } : { lootId: targetId };
        price = sellPrice(keepsake.rarity, targetId);
    }
    const swipeId = swipeOf(floors[last]);
    const anchor = { messageId: last, swipeId, tagHash: SELL_TAG_HASH, occurrence: countPanelEntries(snapshot, heroId, last, swipeId) };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId('sell', heroId, anchor), type: 'sell', character: heroId, anchor, payload, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value, price } : invalidEntry(normalized);
}

// 主角面板操作类型 -> 挂的标签。
const PANEL_ACTION_TAGS = Object.freeze({
    rebuild: REBUILD_TAG_HASH, respec: RESPEC_TAG_HASH, ascend: ASCEND_TAG_HASH, trait: TRAIT_TAG_HASH, 'trait-pick': TRAIT_TAG_HASH, 'trait-slot': TRAIT_TAG_HASH,
});

// 主角面板操作（改建卡组、转职、晋升、抽特质、选特质、解锁特质槽）。只有主角的卡组角色能做，点数要够。
// wallet：随身系统的原始积分，与战斗积分合并成一个余额（战斗净流水可为负，余额判断只在这里做）。
export function buildHeroPanelEntry(snapshot, chat, effective, characterId, action, payload, now = 0, wallet = 0) {
    if (!snapshot || snapshot.ok !== true) return snapshotFailure(snapshot);
    if (!Object.hasOwn(PANEL_ACTION_TAGS, action)) return { ok: false, reason: 'combat-entry-invalid' };
    const floors = Array.isArray(chat) ? chat : [];
    const last = floors.length - 1;
    if (last < 0) return { ok: false, reason: `combat-${action}-no-floor` };
    const heroId = effective?.ok ? effective.attributes.heroId : null;
    const hero = heroId && heroId === characterId ? effective.characters.get(heroId) : null;
    if (!hero) return { ok: false, reason: 'combat-points-not-protagonist' };
    if (hero.kind !== 'deck-character') return { ok: false, reason: `combat-${action}-kind-mismatch` };
    if ((hero.points || 0) + (Number(wallet) || 0) < (payload?.cost ?? 0)) return { ok: false, reason: 'combat-points-insufficient' };
    const swipeId = swipeOf(floors[last]);
    const anchor = { messageId: last, swipeId, tagHash: PANEL_ACTION_TAGS[action], occurrence: countPanelEntries(snapshot, heroId, last, swipeId) };
    const normalized = normalizeLedgerEntry({ id: ledgerEntryId(action, heroId, anchor), type: action, character: heroId, anchor, payload, createdAt: now });
    return normalized.ok ? { ok: true, entry: normalized.value } : { ok: false, reason: 'combat-entry-invalid', errors: normalized.errors };
}

// ---------------------------------------------------------------------------
// 记忆化辅助：楼层集合签名与表戳。
// ---------------------------------------------------------------------------

// 楼层集合签名：会影响重放结果的只有楼层数、每层的正文、swipe_id、是否用户楼。
// 正文直接存字符串引用比较（引用相同时 === 是 O(1)，不同时多数在首个字符就分出结果）。
function floorSignature(floors) {
    const texts = new Array(floors.length);
    const swipes = new Array(floors.length);
    const kinds = new Array(floors.length); // 0 非对象楼，1 AI 楼，2 用户楼
    for (let at = 0; at < floors.length; at += 1) {
        const floor = floors[at];
        if (!isObject(floor)) { texts[at] = ''; swipes[at] = 0; kinds[at] = 0; continue; }
        texts[at] = messageText(floor);
        swipes[at] = swipeOf(floor);
        kinds[at] = floor.is_user === true ? 2 : 1;
    }
    return { texts, swipes, kinds };
}

function sameSignature(a, b) {
    if (a.texts.length !== b.texts.length) return false;
    for (let at = 0; at < a.texts.length; at += 1) {
        if (a.kinds[at] !== b.kinds[at] || a.swipes[at] !== b.swipes[at] || a.texts[at] !== b.texts[at]) return false;
    }
    return true;
}

// 表戳 = (表版本号, 导出数据对象引用)。版本号在每次写入和插件的表更新事件后 +1；
// 导出数据引用额外兜住「缓存过期后重新导出」这种不经过版本号的变化。
// client 没有这两个接口时返回 null，表示这一路不能缓存。
function tableStamp(client) {
    try {
        const version = client?.version?.();
        if (!Number.isInteger(version) || typeof client.readTables !== 'function') return null;
        const read = client.readTables();
        if (!read?.ok || !read.data || typeof read.data !== 'object') return null;
        return { version, data: read.data };
    } catch {
        return null;
    }
}

const sameStamp = (a, b) => !!a && !!b && a.version === b.version && a.data === b.data;
// 账本只用档案、日志、属性三种表，读表时不解码数值日志。
const LEDGER_KINDS = Object.freeze(['profile', 'ledger', 'attribute']);

// 账本入口。
//   tables       combat-tables 的 createCombatTables 返回值（read/append）；
//   chat         聊天楼层数组，或返回它的函数；userName / sourceFilter / difficulty 同样可以是函数；
//   inventory    createInventoryTables 的返回值（可选）。主角库存以背包表为准。
// 记忆化（只在 tables.client 提供 version() 时启用，否则每次照旧读表重放）：
//   - 快照读取：同一表戳只读一次，并发调用共用同一个 Promise；
//   - 有效状态：同一快照 + 楼层集合签名 + 用户名 + 来源过滤 + 背包表戳 + 难度只重放一次。
// read()/effectiveState() 返回的对象在调用方之间共享，必须视为只读，不要原地修改。
export function createCombatLedger({ tables, chat, userName = '', sourceFilter, difficulty, now = () => Date.now(), inventory = null, wallet = 0 } = {}) {
    const getChat = () => (typeof chat === 'function' ? chat() : chat) || [];
    const getUserName = () => (typeof userName === 'function' ? userName() : userName);
    const getSourceFilter = () => (typeof sourceFilter === 'function' ? sourceFilter() : sourceFilter);
    // 随身系统原始积分（同步取值，取不到按 0）；只用于 effectiveState() 的主角余额与主角面板写口的预检。
    const getWallet = () => { try { return Number(typeof wallet === 'function' ? wallet() : wallet) || 0; } catch { return 0; } };
    const getHealScale = () => difficultyRule(typeof difficulty === 'function' ? difficulty() : difficulty).healScale;
    const stats = { tableReads: 0, snapshotHits: 0, stateComputes: 0, stateHits: 0 };

    // 背包表视图；读取抛错按读取失败处理。
    function readInventoryView() {
        let result;
        try {
            result = inventory.read();
        } catch {
            result = { ok: false, reason: 'inventory-table-read-failed' };
        }
        return heroInventoryView(result);
    }
    // 重放选项。withInventory 为 false 时不带背包（扫描、初始化沿用 v0.39 的不带背包算法）。
    function replayOptions(withInventory = true) {
        const base = { sourceFilter: getSourceFilter(), userName: getUserName() };
        if (!withInventory || !inventory || typeof inventory.read !== 'function') return base;
        return { ...base, heroInventory: readInventoryView() };
    }

    // ---- 快照读取（带记忆） ----
    async function readSnapshotUncached() {
        try {
            return normalizeSnapshot(await tables.read({ kinds: LEDGER_KINDS }));
        } catch (error) {
            return { ok: false, reason: 'combat-ledger-read-failed', detail: String(error?.message || error) };
        }
    }

    let snapshotMemo = null; // { stamp, promise }
    function readSnapshot() {
        const stamp = tableStamp(tables?.client);
        if (stamp && snapshotMemo && sameStamp(snapshotMemo.stamp, stamp)) {
            stats.snapshotHits += 1;
            return snapshotMemo.promise;
        }
        stats.tableReads += 1;
        const promise = readSnapshotUncached();
        if (stamp) {
            const memo = { stamp, promise };
            snapshotMemo = memo;
            // 读失败的结果不留缓存，下次重试
            promise.then((snapshot) => { if (!snapshot.ok && snapshotMemo === memo) snapshotMemo = null; });
        }
        return promise;
    }

    // ---- 有效状态（带记忆，同步） ----
    const stateMemos = { with: null, without: null }; // 带背包 / 不带背包各记一份。{ snapshot, signature, userName, sourceFilter, healScale, inventoryStamp, options, state }
    // 返回 { state, options }。options 是这次重放用的选项（带背包时含 heroInventory），供调用方复用。
    function resolveState(snapshot, floors, withInventory = true) {
        const name = getUserName();
        const filter = getSourceFilter();
        const healScale = getHealScale();
        const hasInventory = withInventory && !!inventory && typeof inventory.read === 'function';
        const inventoryStamp = hasInventory ? tableStamp(inventory.client) : null;
        // 带背包但拿不到背包表戳时无法判断背包是否变化，不缓存
        const cacheable = !hasInventory || !!inventoryStamp;
        const signature = floorSignature(floors);
        const memo = hasInventory ? stateMemos.with : stateMemos.without;
        if (cacheable && memo && memo.snapshot === snapshot && memo.userName === name && memo.sourceFilter === filter
            && memo.healScale === healScale && sameSignature(memo.signature, signature)
            && (!hasInventory || sameStamp(memo.inventoryStamp, inventoryStamp))) {
            stats.stateHits += 1;
            return { state: memo.state, options: memo.options };
        }
        const options = { sourceFilter: filter, userName: name, ...(hasInventory ? { heroInventory: readInventoryView() } : {}) };
        stats.stateComputes += 1;
        const state = computeEffectiveState(snapshot, floors, options);
        if (cacheable && state.ok) {
            stateMemos[hasInventory ? 'with' : 'without'] = { snapshot, signature, userName: name, sourceFilter: filter, healScale, inventoryStamp, options, state };
        }
        return { state, options };
    }

    async function read() {
        return readSnapshot();
    }

    // 主角的 points 并入随身系统原始积分（合并余额）；换新对象不改共享的记忆化状态，同一状态与同一金额返回同一对象。
    const walletViews = new WeakMap();
    function withWallet(state) {
        const extra = getWallet();
        if (!extra || !state || state.ok !== true) return state;
        const heroId = state.attributes && state.attributes.heroId;
        const hero = heroId ? state.characters.get(heroId) : null;
        if (!hero) return state;
        const cached = walletViews.get(state);
        if (cached && cached.extra === extra) return cached.view;
        const view = { ...state, characters: new Map(state.characters).set(heroId, { ...hero, points: (hero.points || 0) + extra }) };
        walletViews.set(state, { extra, view });
        return view;
    }

    // raw：只要战斗侧自己的流水（缓存用，避免把会变的随身系统积分缓存进去）。
    async function effectiveState({ raw = false } = {}) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return computeEffectiveState(snapshot, []);
        const state = resolveState(snapshot, getChat(), true).state;
        return raw ? state : withWallet(state);
    }

    // 只读统计（测试用）：读表次数、快照缓存命中、重放次数、重放缓存命中。
    const readStats = () => ({ ...stats });

    // ---- 写入 ----
    async function append(input) {
        const accepted = [];
        const rejected = [];
        for (const raw of Array.isArray(input) ? input : [input]) {
            const normalized = normalizeLedgerEntry(raw);
            if (normalized.ok) accepted.push(normalized.value);
            else rejected.push({ id: raw?.id ?? null, reason: 'combat-entry-invalid', errors: normalized.errors.slice(0, 5) });
        }
        if (!accepted.length) return { ok: rejected.length === 0, written: [], present: [], rejected, pending: [] };
        // 库存类记录（装备/物品/战利品/出售…）要同步改背包表，单独走库存串行队列
        const stockEntries = inventory ? accepted.filter((entry) => STOCK_TYPES.includes(entry.type)) : [];
        const plainEntries = accepted.filter((entry) => !stockEntries.includes(entry));
        let result = plainEntries.length ? await tables.append('ledger', plainEntries) : { ok: true, written: [], present: [], rejected: [], pending: [] };
        if (stockEntries.length) result = mergeResults(result, await appendStockEntries(stockEntries));
        return rejected.length ? { ...result, ok: false, rejected: [...(result.rejected || []), ...rejected] } : result;
    }

    // 合并两段写入结果。
    function mergeResults(first, second) {
        const failure = first.ok === false ? first : second.ok === false ? second : null;
        return {
            ...first, ...(failure?.reason ? { reason: failure.reason } : {}),
            ok: first.ok !== false && second.ok !== false,
            written: [...(first.written || []), ...(second.written || [])],
            present: [...(first.present || []), ...(second.present || [])],
            rejected: [...(first.rejected || []), ...(second.rejected || [])],
            pending: second.pending || first.pending || [],
            stock: [...(first.stock || []), ...(second.stock || [])],
        };
    }

    let stockTail = Promise.resolve();
    function appendStockEntries(entries) {
        const run = stockTail.then(async () => {
            let merged = { ok: true, written: [], present: [], rejected: [], pending: [], stock: [] };
            for (const entry of entries) merged = mergeResults(merged, await appendStockEntry(entry));
            return merged;
        });
        stockTail = run.catch(() => {});
        return run;
    }

    const skippedStock = (entry, reason) => ({ ok: true, written: [], present: [], rejected: [], pending: [], stock: [{ id: entry.id, ok: false, skipped: true, reason }] });
    const failedStock = (entry, reason, extra = {}) => ({
        ok: false, reason, written: [], present: [], rejected: [{ id: entry.id, reason }], pending: [], stock: [{ id: entry.id, ok: false, reason, ...extra }],
    });

    // 一条库存类记录：先写账本，再改背包表；背包表写失败就撤销账本记录。
    // 不是主角的记录、或不需要改背包的记录，直接按普通记录写入。
    async function appendStockEntry(entry) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return failedStock(entry, snapshot.reason || 'combat-ledger-read-failed');
        const index = indexProfiles(snapshot.profiles, []);
        const name = getUserName();
        const heroId = name ? resolveCharacterId(index, name, name) : null;
        if (!heroId || canonicalCharacterId(index, entry.character) !== heroId) return tables.append('ledger', [entry]);
        const ensureFailure = await ensureInventory();
        if (ensureFailure) return failedStock(entry, ensureFailure);
        const floors = getChat();
        const { state, options } = resolveState(snapshot, floors, true);
        if (!state.ok) return failedStock(entry, state.reason || 'combat-ledger-read-failed');
        const hero = state.characters.get(heroId);
        if (hero?.inventory?.ok !== true) return failedStock(entry, hero?.inventory?.reason || 'inventory-table-read-failed');
        const slot = stockEntryId(snapshot, entry.id);
        if (slot.present) return { ok: true, written: [], present: [slot.present], rejected: [], pending: [], stock: [] };
        if (slot.error) return failedStock(entry, slot.error);
        const stockEntry = slot.id === entry.id ? entry : { ...entry, id: slot.id };
        const plan = stockPlan(stockEntry, hero, { panelTag: GEAR_TAG_HASH });
        if (plan === null) return tables.append('ledger', [stockEntry]);
        if (!plan.ok) return skippedStock(stockEntry, plan.reason);
        // 试算：把这条记录加进去重放，看它会不会被判为失效或产生诊断
        const trial = computeEffectiveState({ ...snapshot, entries: [...snapshot.entries, stockEntry] }, floors, options);
        const trialFailure = trial.ok
            ? trial.inactive.find((item) => item.id === stockEntry.id)?.reason || trial.diagnostics.find((item) => item.id === stockEntry.id)?.code
            : trial.reason || 'combat-ledger-read-failed';
        if (trialFailure) return skippedStock(stockEntry, trialFailure);
        let written;
        try {
            written = await tables.append('ledger', [stockEntry]);
        } catch {
            written = { ok: false, reason: 'combat-ledger-insert-failed' };
        }
        if ((written.present || []).includes(stockEntry.id)) return { ...written, stock: [] };
        if (!(written.written || []).includes(stockEntry.id)) {
            const reason = written.reason || 'combat-ledger-insert-failed';
            const revoked = await revokeEntry(stockEntry, reason);
            return { ...written, ok: false, reason, stock: [{ id: stockEntry.id, ok: false, reason, revoked }] };
        }
        let stockFailure;
        try {
            stockFailure = await applyStockPlan(plan);
        } catch {
            stockFailure = 'inventory-write-failed';
        }
        if (stockFailure) {
            const revoked = await revokeEntry(stockEntry, stockFailure);
            return failedStock(stockEntry, revoked ? stockFailure : 'combat-stock-revoke-failed', { detail: stockFailure, revoked });
        }
        return { ...written, stock: [{ id: stockEntry.id, ok: true }] };
    }

    // 确保背包表与装备表存在（缺表缺列时补建）。成功返回 null，失败返回原因。
    async function ensureInventory() {
        if (typeof inventory?.ensure !== 'function') return 'inventory-ensure-unavailable';
        let result;
        try {
            result = await inventory.ensure();
        } catch {
            result = { ok: false, reason: 'inventory-ensure-failed' };
        }
        return result?.ok === true ? null : result?.reason || 'inventory-ensure-failed';
    }

    // 背包写入步骤是否可接受：成功，或只是写后刷新世界书失败。
    const stockStepOk = (result) => result?.ok === true || result?.reason === 'inventory-refresh-failed';

    // 执行库存计划：先写装备定义行，再改数量，最后清理。成功返回 null，失败返回原因。
    async function applyStockPlan(plan) {
        for (const row of plan.rows) {
            const result = await inventory.setGearRow(row.name, row.record);
            if (!stockStepOk(result)) return result?.reason || 'gear-write-failed';
        }
        if (plan.changes.length) {
            const result = await inventory.changeQuantities(plan.changes);
            if (!stockStepOk(result) && (result?.applied?.length || 0) < plan.changes.length) return result?.reason || 'inventory-write-failed';
        }
        for (const row of plan.after) {
            try {
                await inventory.setGearRow(row.name, row.record);
            } catch {
                // 清理步骤失败不影响本次结果
            }
        }
        return null;
    }

    // 撤销一条已写入的账本记录（写一条 revoke 记录指向它）。成功返回 true。
    async function revokeEntry(entry, reason) {
        const normalized = normalizeLedgerEntry({
            id: `revoke|${entry.id}`, type: 'revoke', character: entry.character, anchor: null,
            payload: { targetEntryId: entry.id, reason: String(reason || '').slice(0, 80) }, createdAt: now(),
        });
        if (!normalized.ok) return false;
        try {
            const result = await tables.append('ledger', [normalized.value]);
            return (result.written || []).includes(normalized.value.id) || (result.present || []).includes(normalized.value.id);
        } catch {
            return false;
        }
    }

    // ---- 扫描 ----
    // 属性记录写入属性表。属性表缺失时由调用方决定是否跳过。
    async function appendAttributes(input, options) {
        const accepted = [];
        const rejected = [];
        for (const raw of Array.isArray(input) ? input : [input]) {
            const normalized = normalizeAttributeRecord(raw);
            if (normalized.ok) accepted.push(normalized.value);
            else rejected.push({ id: raw?.id ?? null, reason: 'combat-attribute-invalid', errors: normalized.errors.slice(0, 5) });
        }
        if (!accepted.length) return { ok: rejected.length === 0, written: [], present: [], rejected, pending: [] };
        const result = await tables.append('attribute', accepted, options);
        return rejected.length ? { ...result, ok: false, rejected: [...(result.rejected || []), ...rejected] } : result;
    }

    // 属性表缺失只算「跳过」，不算写入失败。
    const attributeWriteOk = (write) => write === null || write.ok === true || write.reason === 'combat-attribute-table-missing';
    const writeAttributesIfAny = (snapshot, attributes) => {
        if (!attributes.length) return null;
        return snapshot.attributeTable === 'ok'
            ? appendAttributes(attributes)
            : { ok: false, reason: 'combat-attribute-table-missing', skipped: attributes.length };
    };

    async function scan({ messageIds } = {}) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return snapshot;
        const floors = getChat();
        const effectiveState = resolveState(snapshot, floors, false).state;
        const scanned = scanGrowthTags(snapshot, floors, {
            userName: getUserName(), sourceFilter: getSourceFilter(), messageIds, now: now(), healScale: getHealScale(), effectiveState,
        });
        const write = scanned.entries.length ? await append(scanned.entries) : null;
        const attributeWrite = await writeAttributesIfAny(snapshot, scanned.attributes);
        const ok = (write === null || write.ok === true) && attributeWriteOk(attributeWrite);
        return { ...scanned, ok, write, attributeWrite };
    }

    async function scanLife({ messageIds, battleHurts, heroPrefs } = {}) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return snapshot;
        const floors = getChat();
        const effectiveState = resolveState(snapshot, floors, false).state;
        const life = scanLifeTags(snapshot, floors, {
            userName: getUserName(), sourceFilter: getSourceFilter(), messageIds, now: now(), healScale: getHealScale(), battleHurts, heroPrefs, effectiveState,
        });
        if (!life.ok) return life;
        const write = life.entries.length ? await append(life.entries) : null;
        // 属性标签（关系档位、剧情加点）也一并补扫，但不再写成长记录
        const attributeScan = scanGrowthTags(snapshot, floors, {
            userName: getUserName(), sourceFilter: getSourceFilter(), messageIds, now: now(), attributesOnly: true, effectiveState,
        });
        const attributeWrite = attributeScan.ok ? await writeAttributesIfAny(snapshot, attributeScan.attributes) : null;
        const ok = (write === null || write.ok === true) && attributeWriteOk(attributeWrite);
        return { ...life, ok, write, attributeWrite };
    }

    // ---- 面板操作 ----
    // 写入前读最新快照、写入后返回新记录；成功路径统一为 { ...写入结果, entry }。
    const withEntry = async (built, extra = {}) => ({ ...await append([built.entry]), entry: built.entry, ...extra });

    async function saveDeck(characterId, cards) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return snapshot;
        const built = buildDeckEntry(snapshot, getChat(), characterId, cards, now());
        return built.ok ? withEntry(built) : built;
    }

    async function claimReward(characterId, level, choice) {
        const snapshot = await readSnapshot();
        if (!snapshot.ok) return snapshot;
        const floors = getChat();
        const character = resolveState(snapshot, floors, true).state.characters?.get(characterId);
        if (!character || character.kind !== 'deck-character' || !character.pendingRewards.includes(level)) return { ok: false, reason: 'combat-reward-unavailable' };
        const built = buildRewardEntry(snapshot, floors, characterId, level, choice, now());
        return built.ok ? withEntry(built) : built;
    }

    // 属性分配：串行排队，开始前和读表后各检查一次聊天是否还是当初那一楼。
    let allocateTail = Promise.resolve();
    function allocate(characterId, picks, { shouldStart } = {}) {
        const floors = getChat();
        const lastFloor = floors.at(-1);
        const swipeAtStart = swipeOf(lastFloor);
        const stillCurrent = () => getChat() === floors && floors.at(-1) === lastFloor && swipeOf(lastFloor) === swipeAtStart && (!shouldStart || shouldStart() === true);
        const copiedPicks = Array.isArray(picks) ? picks.map((pick) => ({ ...pick })) : [];
        const run = allocateTail.then(async () => {
            if (!stillCurrent()) return { ok: false, reason: 'request-stale' };
            const snapshot = await readSnapshot();
            if (!stillCurrent()) return { ok: false, reason: 'request-stale' };
            if (!snapshot.ok) return snapshot;
            const effective = resolveState(snapshot, floors, true).state;
            const built = buildAllocEntries(snapshot, floors, effective, characterId, copiedPicks, now());
            return built.ok ? { ...await appendAttributes(built.entries, { shouldStart: stillCurrent }), entries: built.entries } : built;
        });
        allocateTail = run.catch(() => {});
        return run;
    }

    // 属性初始化（manual 为 true 表示用户手填，必须带 scores）。已初始化的角色原样返回 unchanged。
    let initTail = Promise.resolve();
    function writeInit(name, init, options = {}) {
        const run = initTail.then(() => writeInitNow(name, init, options));
        initTail = run.catch(() => {});
        return run;
    }
    async function writeInitNow(name, init, { signal, shouldStart, manual = false } = {}) {
        const alive = () => !signal?.aborted && (!shouldStart || shouldStart() === true);
        const stale = () => ({ ok: false, reason: 'request-stale' });
        if (!alive()) return stale();
        if (manual && init?.scores === undefined) return { ok: false, reason: 'combat-init-invalid', field: 'scores', problem: 'required' };
        const parsed = parseCombatInit(init, { allowScores: manual });
        if (!parsed.ok) return { ok: false, reason: 'combat-init-invalid', field: parsed.field, problem: parsed.problem };
        const characterName = String(name || '').trim();
        if (!characterName) return { ok: false, reason: 'combat-init-invalid', field: 'name', problem: 'required' };
        const snapshot = await readSnapshot();
        if (!alive()) return stale();
        if (!snapshot.ok) return snapshot;
        if (snapshot.attributeTable !== 'ok') return { ok: false, reason: 'combat-attribute-table-missing' };
        const user = getUserName();
        const state = resolveState(snapshot, getChat(), false).state;
        if (!state.ok) return state;
        if (abilitiesForName(state, characterName, user)?.initialized) return { ok: true, unchanged: true };
        const key = characterKeyFor(indexProfiles(snapshot.profiles, []), characterName, user);
        const record = { id: ledgerEntryId('init', key), type: 'init', character: key, anchor: null, payload: parsed.value, createdAt: now(), change: '初始化' };
        if (!alive()) return stale();
        let written;
        try {
            written = await appendAttributes([record], { signal, shouldStart: alive });
        } catch {
            return { ok: false, reason: 'combat-init-write-failed' };
        }
        return alive() ? { ...written, record } : stale();
    }

    // 装备/卸下、出售、使用物品、主角面板操作共用一条串行队列。
    let actionTail = Promise.resolve();
    function queueAction(task) {
        const run = actionTail.then(task);
        actionTail = run.catch(() => {});
        return run;
    }

    function setGear(characterId, gearId, equip) {
        return queueAction(async () => {
            const snapshot = await readSnapshot();
            if (!snapshot.ok) return snapshot;
            const floors = getChat();
            const character = resolveState(snapshot, floors, true).state.characters?.get(characterId);
            const built = buildGearEntry(snapshot, floors, character, gearId, equip === true, now());
            return built.ok ? withEntry(built) : built;
        });
    }

    // 初始装备落账（profile-gear）：items 为组装好的 equip 载荷；anchor 缺省取最新楼层。没有装备时不写。
    function grantInitialGear(characterId, items, { anchor = null } = {}) {
        return queueAction(async () => {
            const built = buildInitialGearEntries(getChat(), characterId, items, now(), anchor);
            if (!built.ok) return built;
            if (!built.entries.length) return { ok: true, written: [], present: [], rejected: [], pending: [], entries: [] };
            const written = await append(built.entries);
            return { ...written, entries: built.entries };
        });
    }

    function sell(target) {
        return queueAction(async () => {
            const snapshot = await readSnapshot();
            if (!snapshot.ok) return snapshot;
            const floors = getChat();
            const effective = resolveState(snapshot, floors, true).state;
            const built = buildSellEntry(snapshot, floors, effective, target, now());
            return built.ok ? withEntry(built, { price: built.price }) : built;
        });
    }
    const sellKeepsake = (lootId) => sell({ lootId });
    const sellGear = (gearId) => sell({ gearId });

    // 使用背包里的治疗物品：写一条 heal 记录，再写一条 consume 记录扣物品；扣失败就撤销 heal。
    function useItem(itemId, { messageId } = {}) {
        return queueAction(async () => {
            if (!inventory) return { ok: false, reason: 'combat-use-unavailable' };
            const snapshot = await readSnapshot();
            if (!snapshot.ok) return snapshot;
            const floors = getChat();
            const state = resolveState(snapshot, floors, true).state;
            if (!state.ok) return state;
            const heroId = state.attributes.heroId;
            const hero = heroId ? state.characters.get(heroId) : null;
            if (!hero) return { ok: false, reason: 'combat-points-not-protagonist' };
            if (hero.inventory?.ok !== true) return { ok: false, reason: hero.inventory?.reason || 'inventory-table-read-failed' };
            const item = hero.items.find((candidate) => candidate.itemId === itemId);
            if (!item) return { ok: false, reason: 'combat-item-insufficient' };
            const healAmount = (item.effects || []).filter((effect) => effect.op === 'heal').reduce((sum, effect) => sum + (Number(effect.amount) || 0), 0);
            if (!(healAmount > 0)) return { ok: false, reason: 'combat-use-battle-only' };
            if (!hero.wound) return { ok: false, reason: 'combat-use-full-hp' };
            const floorId = Number.isInteger(messageId) ? messageId : floors.length - 1;
            if (!floors[floorId]) return { ok: false, reason: 'combat-use-no-floor' };
            const swipeId = swipeOf(floors[floorId]);
            const firstOccurrence = countPanelEntries(snapshot, heroId, floorId, swipeId);
            const anchorAt = (occurrence) => ({ messageId: floorId, swipeId, tagHash: USE_TAG_HASH, occurrence });
            const heal = normalizeLedgerEntry({
                id: ledgerEntryId('heal', heroId, anchorAt(firstOccurrence)), type: 'heal', character: heroId, anchor: anchorAt(firstOccurrence),
                payload: { amount: Math.min(9999, healAmount), mode: 'flat', scale: healScalePercent(getHealScale()), reason: `使用${item.name}`.slice(0, 80) }, createdAt: now(),
            });
            const consume = normalizeLedgerEntry({
                id: ledgerEntryId('consume', heroId, anchorAt(firstOccurrence + 1)), type: 'consume', character: heroId, anchor: anchorAt(firstOccurrence + 1),
                payload: { itemId, count: 1, reportId: '' }, createdAt: now(),
            });
            if (!heal.ok || !consume.ok) return { ok: false, reason: 'combat-entry-invalid' };
            let healWrite;
            try {
                healWrite = await tables.append('ledger', [heal.value]);
            } catch {
                healWrite = { ok: false, reason: 'combat-ledger-insert-failed' };
            }
            if (!(healWrite.written || []).includes(heal.value.id)) {
                const reason = healWrite.reason || 'combat-ledger-insert-failed';
                return { ok: false, reason, revoked: await revokeEntry(heal.value, reason) };
            }
            const consumeWrite = await appendStockEntries([consume.value]);
            if (!(consumeWrite.stock || []).some((step) => step.ok === true)) {
                const reason = consumeWrite.stock?.[0]?.reason || consumeWrite.reason || 'combat-use-failed';
                return { ok: false, reason, revoked: await revokeEntry(heal.value, reason) };
            }
            return { ok: true, item: item.name, amount: healAmount, entries: [heal.value, consume.value] };
        });
    }

    // 主角面板操作：先算出记录，再把它加进去试重放，没有被判失效或产生诊断才写入。
    function heroPanelAction(characterId, action, payload) {
        return queueAction(async () => {
            const snapshot = await readSnapshot();
            if (!snapshot.ok) return snapshot;
            const floors = getChat();
            const { state, options } = resolveState(snapshot, floors, true);
            const built = buildHeroPanelEntry(snapshot, floors, state, characterId, action, payload, now(), getWallet());
            if (!built.ok) return built;
            const trial = computeEffectiveState({ ...snapshot, entries: [...snapshot.entries, built.entry] }, floors, options);
            const trialDiagnostic = trial.ok ? trial.diagnostics.find((item) => item.id === built.entry.id) : null;
            if (!trial.ok || trialDiagnostic) return { ok: false, reason: trialDiagnostic?.code || trial.reason || `combat-${action}-invalid` };
            return withEntry(built, built.entry.payload.cost === undefined ? {} : { cost: built.entry.payload.cost });
        });
    }

    const rebuildDeck = (characterId, plan) => heroPanelAction(characterId, 'rebuild', { personalPool: plan?.personalPool, starterDeck: plan?.starterDeck, cost: REBUILD_COST });
    const respecClass = (characterId, classRef) => heroPanelAction(characterId, 'respec', { classRef, cost: RESPEC_COST });
    function ascendClass(characterId, { classRef, tier, tierName, cards } = {}) {
        const rule = ASCEND_TIERS[tier];
        return rule
            ? heroPanelAction(characterId, 'ascend', { classRef, tier, tierName, cards, cost: rule.cost })
            : Promise.resolve({ ok: false, reason: 'combat-ascend-tier-invalid' });
    }
    function drawTrait(characterId, trait = {}) {
        const { traitId, name, origin = '', rarity, kind, passive, skill, link } = trait;
        return heroPanelAction(characterId, 'trait', {
            traitId, name, origin, rarity, ...(kind ? { kind } : {}), passive, ...(skill ? { skill } : {}), ...(link ? { link } : {}), cost: TRAIT_DRAW_COST,
        });
    }
    const pickTrait = (characterId, traitId, drop) => heroPanelAction(characterId, 'trait-pick', { traitId, drop });
    function unlockTraitSlot(characterId, slot) {
        const cost = TRAIT_SLOT_COSTS[slot];
        return cost ? heroPanelAction(characterId, 'trait-slot', { slot, cost }) : Promise.resolve({ ok: false, reason: 'combat-trait-slot-invalid' });
    }

    return {
        read, effectiveState, append, appendAttributes, scan, scanLife, saveDeck, claimReward, setGear, grantInitialGear, allocate, writeInit,
        sellKeepsake, sellGear, useItem, rebuildDeck, respecClass, ascendClass, drawTrait, pickTrait, unlockTraitSlot,
        stats: readStats,
    };
}
