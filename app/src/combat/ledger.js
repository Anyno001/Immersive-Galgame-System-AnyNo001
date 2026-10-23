import { COMBAT_RULES, expProgress, validateDeck } from './rules.js';
import { hashString } from './random.js';
import { buildCardCatalog, effectsDamage, ledgerEntryId, normalizeLedgerEntry, normalizeProfile } from './schema.js';
import { combatBodyText, extractGrowthDirectives, scanCombatTags } from '../scene/combat-directives.js';
import { combatReportResult } from '../scene/combat-prompt.js';

// 成长账本：只读归并 shujuku 两张战斗表，按锚点决定哪些条目当前生效；不修改表，写入只经注入的 tables。
// chat 由调用方传入按 messageId 下标排列的消息快照 [{ mes, swipe_id, is_user, is_system }]，combat 不读宿主。
export const PROTAGONIST_ALIASES = Object.freeze(['我', '{{user}}', '主角']);
// deck 条目不来自标签，锚点 tagHash 固定为此值。
export const DECK_TAG_HASH = 'deck';
// reward 条目同样不来自标签。
export const REWARD_TAG_HASH = 'reward';
const TAGLESS_TYPES = new Set(['deck', 'reward']);
const ANCHORLESS_TYPES = new Set(['profile', 'revoke']);
const CHARACTER_KINDS = new Set(['deck-character', 'skill-character']);

const messageText = (m) => String(m?.mes ?? m?.text ?? '');
const swipeOf = (m) => (Number.isInteger(m?.swipe_id) ? m.swipe_id : 0);
// 隐藏楼（is_system）仍算存在：用户常隐藏旧楼节省上下文，不应因此丢失成长。
const isMessage = (m) => Boolean(m) && typeof m === 'object';
// 归并顺序：楼层升序；同楼先记 EXP 再处理职业、技能、奖励与卡组（奖励要核对当时等级），再按 occurrence。
const TYPE_RANK = Object.freeze({ exp: 0, class: 1, learn: 2, upgrade: 3, reward: 4, deck: 5 });
const byAnchor = (a, b) => a.anchor.messageId - b.anchor.messageId || TYPE_RANK[a.type] - TYPE_RANK[b.type]
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
    // 日志里的 profile 条目同样不绑定楼层；档案表已有同 ID 时以档案表为准。
    for (const e of entries) {
        if (e.type === 'profile' && !profiles.has(e.character)) profiles.set(e.character, { version: -1, createdAt: e.createdAt, profile: e.payload });
    }
    return { ok: true, profiles, entries, ids, diagnostics };
}

// 职业按职业名唯一，先登记（createdAt 早）的为准；角色按名字与别名索引，重名时先登记的为准。
export function indexProfiles(profiles, diagnostics = []) {
    const classes = new Map();
    const classByName = new Map();
    const classAlias = new Map();
    const characters = new Map();
    const enemies = new Map();
    const byName = new Map();
    const byNameKey = new Map();
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
        } else if (CHARACTER_KINDS.has(profile.kind)) {
            characters.set(profile.id, profile);
            for (const name of [profile.name, ...(profile.aliases || [])]) {
                if (!byNameKey.has(nameKey(name))) byNameKey.set(nameKey(name), profile.id);
                const owner = byName.get(name);
                if (owner === undefined) byName.set(name, profile.id);
                else if (owner !== profile.id) diagnostics.push({ code: 'combat-name-duplicate', name, id: profile.id, kept: owner });
            }
        } else if (profile.kind === 'enemy') {
            enemies.set(profile.id, profile);
        }
    }
    return { classes, classByName, classAlias, characters, enemies, byName, byNameKey };
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

// 同一标签可能先以名字键、后以档案 ID 记账；两种候选 ID 任一已入库即视为已存在。
function candidateIds(index, kind, name, userName, anchor) {
    const keys = new Set([characterKeyFor(index, name, userName), nameKey(effectiveName(name, userName))]);
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
            const report = user ? combatReportResult(text) : null;
            // 用户自己输入的楼不产生成长；只有程序生成的战报楼才计标签。
            const tags = user && !report ? [] : scanCombatTags(user ? text : combatBodyText(text, { sourceFilter }));
            floor = { swipeId: swipeOf(m), keys: new Set(tags.map((tag) => `${tag.tagHash}#${tag.occurrence}`)), report };
        }
        cache.set(messageId, floor);
        return floor;
    };
}

// 锚点失效原因，有效时返回 null。deck / reward 不来自标签，只核对楼层与 swipe。
function anchorProblem(entry, floorOf) {
    const { anchor } = entry;
    const floor = floorOf(anchor.messageId);
    if (!floor) return 'message-missing';
    if (floor.swipeId !== anchor.swipeId) return 'swipe-changed';
    if (!TAGLESS_TYPES.has(entry.type) && !floor.keys.has(`${anchor.tagHash}#${anchor.occurrence}`)) return 'tag-missing';
    if (entry.type === 'exp' && floor.report?.result === 'lose') return 'defeat-no-exp';
    return null;
}

function ownerOf(index, character) {
    if (index.characters.has(character)) return character;
    return index.byNameKey.get(character) ?? null;
}

// 卡组角色的可变成长状态：图鉴（基础卡 + 历任职业池 + 个人池 + 习得卡）、拥有张数、升级张数、当前卡组、已领奖励等级。
function deckState(profile, classProfile) {
    const owned = new Map();
    for (const id of profile.starterDeck) owned.set(id, (owned.get(id) || 0) + 1);
    return { catalog: buildCardCatalog(profile, classProfile), owned, upgraded: new Map(), deck: [...profile.starterDeck], claimed: new Set() };
}

function initCharacter(index, profile, diagnostics) {
    const base = { id: profile.id, kind: profile.kind, name: profile.name, profile, exp: 0 };
    if (profile.kind === 'skill-character') return { ...base, className: profile.className, skills: [...profile.skills], passives: profile.passives };
    const classProfile = resolveClass(index, profile.classRef);
    if (!classProfile) diagnostics.push({ code: 'combat-class-missing', id: profile.id, classRef: profile.classRef });
    return { ...base, classRef: classProfile?.id ?? profile.classRef, classProfile, ...deckState(profile, classProfile) };
}

// 新得到的卡计入拥有；卡组未满且同名未达上限时一并放进卡组，否则只进收藏。
function addOwned(c, cardId) {
    c.owned.set(cardId, (c.owned.get(cardId) || 0) + 1);
    const copies = c.deck.filter((id) => id === cardId).length;
    if (c.deck.length < COMBAT_RULES.deckMax && copies < COMBAT_RULES.copyLimit) c.deck.push(cardId);
}

const skillOverCap = (skill) => effectsDamage(skill?.effects) > COMBAT_RULES.allySkillDamageCap;

// 每类条目的应用规则；返回诊断码表示拒收（条目不生效），返回 null 表示已生效。
const HANDLERS = Object.freeze({
    exp(c, p) {
        c.exp += p.amount;
        return null;
    },
    // 转职：职业池变更，已有卡牌保留；同名职业以先登记者为准。
    class(c, p, { index }) {
        const cls = resolveClass(index, p.classRef);
        if (!cls) return 'combat-class-missing';
        if (c.kind === 'skill-character') {
            c.className = cls.className;
            return null;
        }
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
        c.catalog.set(p.targetId, { ...p.card, id: p.targetId });
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
            addOwned(c, choice.cardId);
        } else if (choice.kind === 'upgrade') {
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
            if (n >= (c.owned.get(id) || 0) || n >= COMBAT_RULES.copyLimit) continue;
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
});

const tagKey = (owner, e) => [owner, e.type, e.anchor.messageId, e.anchor.swipeId, e.anchor.tagHash, e.anchor.occurrence].join('|');

function characterView(c) {
    const progress = expProgress(c.exp);
    const base = { id: c.id, kind: c.kind, name: c.name, profile: c.profile, exp: c.exp, level: progress.level, into: progress.into, next: progress.next };
    if (c.kind === 'skill-character') return { ...base, className: c.className, skills: c.skills, passives: c.passives };
    const left = new Map(c.upgraded);
    const deckEntries = c.deck.map((cardId) => {
        const n = left.get(cardId) || 0;
        if (n > 0) left.set(cardId, n - 1);
        return { cardId, upgraded: n > 0 };
    });
    const check = validateDeck(c.deck, c.owned);
    const unknown = [...new Set(c.deck.filter((id) => !c.catalog.has(id)))].map((cardId) => ({ path: 'cards', reason: 'unknown-card', cardId }));
    const pendingRewards = [];
    for (let lv = 2; lv <= progress.level; lv += 1) if (!c.claimed.has(lv)) pendingRewards.push(lv);
    return {
        ...base,
        classRef: c.classRef,
        className: c.classProfile?.className ?? '',
        classProfile: c.classProfile,
        hpMax: c.profile.base.hp + (progress.level - 1) * c.profile.growth.hpPerLevel,
        catalog: c.catalog,
        owned: c.owned,
        upgraded: c.upgraded,
        deck: c.deck,
        deckEntries,
        deckRevision: c.deckRevision ?? null,
        deckErrors: [...check.errors, ...unknown],
        deckNeedsAdjust: c.deckNeedsAdjust === true || !check.ok || unknown.length > 0,
        claimedLevels: [...c.claimed].sort((a, b) => a - b),
        pendingRewards,
    };
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
    const seen = new Set();
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
            } else diag(diagnostics, 'combat-character-missing', e);
            continue;
        }
        const reason = HANDLERS[e.type](state.get(owner), e.payload, { index, entry: e, diagnostics });
        if (reason) diag(diagnostics, reason, e);
        else applied.push(e.id);
    }
    const characters = new Map([...state].map(([id, c]) => [id, characterView(c)]));
    return { ok: true, characters, classes: index.classes, enemies: index.enemies, unassignedExp, applied, inactive, diagnostics };
}

const GENERATED_KINDS = new Set(['learn', 'upgrade', 'class']);

function floorAnchor(m, messageId, tag) {
    return { messageId, swipeId: swipeOf(m), tagHash: tag.tagHash, occurrence: tag.occurrence };
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
    const entries = [];
    const pendingGeneration = [];
    const diagnostics = [];
    const known = (kinds, name, anchor) => kinds.some((kind) => candidateIds(index, kind, name, userName, anchor).some((id) => snapshot.ids.has(id)));
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
            if (d.kind === 'exp') {
                if (report?.result === 'lose') {
                    diagnostics.push({ code: 'combat-defeat-no-exp', messageId, character: d.character });
                    continue;
                }
                if (known(['exp'], d.character, anchor)) continue;
                const character = characterKeyFor(index, d.character, userName);
                entries.push({ id: ledgerEntryId('exp', character, anchor), type: 'exp', character, anchor, payload: { amount: d.amount, reason: d.reason }, createdAt: now });
            } else if (GENERATED_KINDS.has(d.kind)) {
                // upgrade 找不到对应项时可能按 learn 入库，两种 ID 都算已处理。
                if (known(d.kind === 'upgrade' ? ['upgrade', 'learn'] : [d.kind], d.character, anchor)) continue;
                const { index: _index, tagHash: _hash, occurrence: _occ, ...fields } = d;
                pendingGeneration.push({ ...fields, characterId: resolveCharacterId(index, d.character, userName), anchor });
            }
        }
    }
    return { ok: true, entries, pendingGeneration, diagnostics };
}

// 卡组保存条目：锚点取当前最新楼层；同楼同 swipe 多次保存时 occurrence 递增，后存的在归并中后生效。
export function buildDeckEntry(snapshot, chat, characterId, cards, now = 0) {
    if (!snapshot || snapshot.ok !== true) return { ok: false, reason: snapshot?.reason || 'combat-ledger-read-failed' };
    const list = Array.isArray(chat) ? chat : [];
    const messageId = list.length - 1;
    if (messageId < 0) return { ok: false, reason: 'combat-deck-no-floor' };
    const swipeId = swipeOf(list[messageId]);
    const mine = snapshot.entries.filter((e) => e.type === 'deck' && e.character === characterId);
    const occurrence = mine.filter((e) => e.anchor.messageId === messageId && e.anchor.swipeId === swipeId).length;
    const revision = mine.reduce((max, e) => Math.max(max, e.payload.revision), 0) + 1;
    const anchor = { messageId, swipeId, tagHash: DECK_TAG_HASH, occurrence };
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
    const occurrence = mine.filter((e) => e.anchor.messageId === messageId && e.anchor.swipeId === swipeId).length;
    const anchor = { messageId, swipeId, tagHash: REWARD_TAG_HASH, occurrence };
    const raw = { id: ledgerEntryId('reward', characterId, anchor), type: 'reward', character: characterId, anchor, payload: { level, choice: { ...choice } }, createdAt: now };
    const n = normalizeLedgerEntry(raw);
    return n.ok ? { ok: true, entry: n.value } : { ok: false, reason: 'combat-entry-invalid', errors: n.errors };
}

// 账本门面。tables 为 data/shujuku/combat-tables 的实例（read / append）；chat 为消息快照数组或返回快照的函数。
// 每次调用都重读表与聊天，不缓存；读失败一律 ok:false，不当作空账本。
export function createCombatLedger({ tables, chat, userName = '', sourceFilter, now = () => Date.now() } = {}) {
    const chatOf = () => (typeof chat === 'function' ? chat() : chat) || [];
    const userOf = () => (typeof userName === 'function' ? userName() : userName);
    const filterOf = () => (typeof sourceFilter === 'function' ? sourceFilter() : sourceFilter);

    async function read() {
        try {
            return normalizeSnapshot(await tables.read());
        } catch (error) {
            return { ok: false, reason: 'combat-ledger-read-failed', detail: String(error?.message || error) };
        }
    }

    async function effectiveState() {
        return computeEffectiveState(await read(), chatOf(), { sourceFilter: filterOf() });
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
        const result = await tables.append('ledger', valid);
        return invalid.length ? { ...result, ok: false, rejected: [...(result.rejected || []), ...invalid] } : result;
    }

    // 生成结束后传 { messageIds: [最新楼] }；打开聊天补扫不传，扫全部楼层。按记录 ID 幂等。
    async function scan({ messageIds } = {}) {
        const snapshot = await read();
        if (!snapshot.ok) return snapshot;
        const found = scanGrowthTags(snapshot, chatOf(), { userName: userOf(), sourceFilter: filterOf(), messageIds, now: now() });
        if (!found.entries.length) return { ...found, write: null };
        const write = await append(found.entries);
        return { ...found, ok: write.ok === true, write };
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
        const view = computeEffectiveState(snapshot, chatOf(), { sourceFilter: filterOf() }).characters?.get(characterId);
        if (!view || view.kind !== 'deck-character' || !view.pendingRewards.includes(level)) return { ok: false, reason: 'combat-reward-unavailable' };
        const built = buildRewardEntry(snapshot, chatOf(), characterId, level, choice, now());
        if (!built.ok) return built;
        const write = await append([built.entry]);
        return { ...write, entry: built.entry };
    }

    return { read, effectiveState, append, scan, saveDeck, claimReward };
}

