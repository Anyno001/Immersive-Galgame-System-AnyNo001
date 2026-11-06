// 检定引擎（数值 v2 §2、§4、§5）：所有掷骰都从这里进，按设置取规则体系；底数只读不改。
// actor 为 PROTAGONIST 时读主角存档，其余读聊天级 NPC 角色卡（没有卡按战斗侧推导）。纯函数，random 由调用方给。
// 六维取自战斗 abilities（分数 3–30），引擎内统一折成百分制（分数 × 5）：D&D 再除回去，CoC 直接当目标值。
import { getRuleset } from './rulesets/index.js';
import { BUILTIN_SKILLS, COMBAT_SKILLS, baseValueOf, createSkillRegistry, guessAttribute, normalizeAttribute } from './stat-registry.js';
import { BASE_ATTRIBUTES, SKILL_MAX, clamp, withSkills } from './stat-state.js';

const BASE_ATTRIBUTE_SET = new Set(BASE_ATTRIBUTES);
import { stageOf } from './stat-favor.js';
import { checkModifiers } from './stat-bars.js';
import { ABILITY_KEYS, ABILITY_LABELS, deriveAbilities } from '../../combat/abilities.js';

export const PROTAGONIST = '主角';
export const DIFFICULTIES = Object.freeze(['简单', '普通', '困难', '极难']);
export const RANKS = Object.freeze(['普通人', '老手', '精英', '大师', '传奇']);
export const GROWTH_RANK_AT = Object.freeze([0, 10, 25, 45, 70]);
// CoC第七版的理智值（SAN）：第七项属性，百分制；其余规则体系下「理智」归一成智力。
export const SAN_ATTRIBUTE = '理智';
const SAN_ENTRY = Object.freeze({ kind: 'attribute', attribute: SAN_ATTRIBUTE, category: 'general', aliases: Object.freeze([]), origin: 'builtin' });
const WILL_ATTRIBUTE = '感知';
const FAVOR_EDGE = Object.freeze({ 深爱: 1, 强烈在意: 1, 厌烦排斥: -1, 强烈反感: -1, 仇恨: -2 });
const SOCIAL_SKILLS = new Set(['话术', '魅惑', '恐吓', '魅力']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角|我|user)$/i;

const EMPTY = Object.freeze({});
const readerOf = (fn) => (typeof fn === 'function' ? fn : null);

function buildEngine(catalog, settings, ruleset, readers) {
    const { readAbilities = null, readVitals = null, readBonus = null, userName = '' } = readers || {};
    return {
        ruleset: getRuleset(ruleset),
        registry: createSkillRegistry(catalog),
        sheets: catalog.sheets && typeof catalog.sheets === 'object' ? catalog.sheets : {},
        protagonistBase: catalog.protagonistBase && typeof catalog.protagonistBase === 'object' ? catalog.protagonistBase : {},
        protagonistEdit: catalog.protagonistEdit && typeof catalog.protagonistEdit === 'object' ? catalog.protagonistEdit : {},
        // 自然 20 / 1 常开（v0.39 起不再有开关）。
        natural: true,
        readAbilities: readerOf(readAbilities),
        readVitals: readerOf(readVitals),
        readBonus: readerOf(readBonus),
        userName: String(userName || ''),
    };
}

// catalog：{ story, merged, sheets, protagonistBase }。settings：normalizeStatsSettings 的结果。
// readers：{ readAbilities(name), readVitals(name), userName }，缺省时六维按名字与偏好推导、生命按「未知」。
export function createEngine(catalog = {}, settings = {}, ruleset = settings.ruleset, readers = {}) {
    return buildEngine(catalog || EMPTY, settings || EMPTY, ruleset, readers);
}

// 引擎缓存：catalog 引用 → settings 引用 → 规则体系+用户名。配置与目录共享只读，引用不变即复用；
// readers 在运行时是稳定闭包，换了闭包才重建。返回的引擎不得原地修改。
const ENGINE_CACHE = new WeakMap();

export function engineFor(catalog, settings, ruleset, readers = {}) {
    const cat = catalog && typeof catalog === 'object' ? catalog : EMPTY;
    const set = settings && typeof settings === 'object' ? settings : EMPTY;
    let bySettings = ENGINE_CACHE.get(cat);
    if (!bySettings) { bySettings = new WeakMap(); ENGINE_CACHE.set(cat, bySettings); }
    let byKey = bySettings.get(set);
    if (!byKey) { byKey = new Map(); bySettings.set(set, byKey); }
    const id = getRuleset(ruleset === undefined ? set.ruleset : ruleset).ID;
    const key = `${id}|${(readers && readers.userName) || ''}`;
    const found = byKey.get(key);
    const readAbilities = readerOf(readers && readers.readAbilities);
    const readVitals = readerOf(readers && readers.readVitals);
    const readBonus = readerOf(readers && readers.readBonus);
    if (found && found.readAbilities === readAbilities && found.readVitals === readVitals && found.readBonus === readBonus) return found;
    const engine = buildEngine(cat, set, id, readers);
    byKey.set(key, engine);
    return engine;
}

function memoizeByName(fn) {
    if (!fn) return null;
    const cache = new Map();
    return (name, ...rest) => {
        if (rest.length) return fn(name, ...rest);
        if (!cache.has(name)) cache.set(name, fn(name));
        return cache.get(name);
    };
}

// 一次注入或结算内用：返回浅拷贝引擎，readAbilities / readVitals 按名字记忆化；缓存引擎本身不动。
export function withAbilityMemo(engine) {
    if (!engine || engine.memoized) return engine;
    return { ...engine, readAbilities: memoizeByName(engine.readAbilities), readVitals: memoizeByName(engine.readVitals), memoized: true };
}

// CoC下的属性清单：六维加理智；其余体系只有六维。
export function attributeNamesOf(engine) {
    return engine && engine.ruleset && engine.ruleset.ID === 'coc7' ? [...BASE_ATTRIBUTES, SAN_ATTRIBUTE] : [...BASE_ATTRIBUTES];
}

function isSan(engine, skill) {
    return skill === SAN_ATTRIBUTE && engine.ruleset.ID === 'coc7';
}

// 主角技能的生效值，优先级：玩家手改 > 账本值 > 批量分配的底数；三者都没有返回 null（走注册表基础值）。
// 手改覆盖层 catalog.protagonistEdit[技能] = { value, from }：value 为玩家填的数，from 为改动当时账本里的值（没有为 0）。
// 之后账本值每高出 from 一点，生效值就在 value 上加一点（成长叠加在手改值上，不被覆盖）；账本值低于 from（楼层回退）时不扣，
// 回到 from 之下仍是 value。清除手改后回到账本值或底数。
// 未学技能手改时，from 记为不含手改的值（seed：底数或注册表基础值）；首次成功登记进账本的也是 seed，所以登记本身不算成长。
export function heroSkillLevel(engine, owned, skill) {
    // 手改两种骰子都生效（11-07 起；此前只在 CoC 下生效）。
    const edit = engine && engine.protagonistEdit && engine.protagonistEdit[skill];
    const own = Number(owned && owned.value) || 0;
    if (edit && Number(edit.value) > 0) return clamp(Math.round(Number(edit.value) + Math.max(0, own - (Number(edit.from) || 0))), 1, 99);
    if (own > 0) return own;
    const base = Number(engine && engine.protagonistBase && engine.protagonistBase[skill]);
    return base > 0 ? base : null;
}

// 随身系统同名属性加成（百分制）：readers.readBonus() 返回 [{ name, val }] 或 null，只读。
// 名字对应：旧六维名与别名先归一（健康→体质、观察→感知，CoC 下理智保留），再查技能注册表（含别名）；都对不上返回 null。
function bonusKeyOf(engine, raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (BASE_ATTRIBUTE_SET.has(text) || isSan(engine, text)) return text;
    return normalizeAttribute(text) || engine.registry.resolve(text) || null;
}
export const heroBonusKey = bonusKeyOf;
function bonusList(engine) {
    if (!engine || !engine.readBonus) return null;
    try {
        const list = engine.readBonus();
        return Array.isArray(list) && list.length ? list : null;
    } catch {
        return null;
    }
}
// 主角某属性或技能的随身系统加成合计；没有为 0。
export function heroBonusOf(engine, rawSkill) {
    const list = bonusList(engine);
    if (!list) return 0;
    const want = bonusKeyOf(engine, rawSkill);
    if (!want) return 0;
    let sum = 0;
    for (const item of list) if (bonusKeyOf(engine, item && item.name) === want) sum += Number(item.val) || 0;
    return sum;
}
// 带加成的技能名（不含六维与理智）：这些技能即使 IGS 账本里没有，也要列出。
export function heroBonusSkillNames(engine) {
    const list = bonusList(engine);
    const out = new Set();
    if (!list) return out;
    for (const item of list) {
        const key = bonusKeyOf(engine, item && item.name);
        if (key && !BASE_ATTRIBUTE_SET.has(key) && !isSan(engine, key) && (Number(item.val) || 0) !== 0) out.add(key);
    }
    return out;
}
// 把生效值减掉随身系统加成（用户在界面或表格里手改的是生效值，存回 IGS 的是不含加成的值）。
export function withoutHeroBonus(engine, rawSkill, shown) {
    const bonus = heroBonusOf(engine, rawSkill);
    return bonus ? clamp(Math.round(Number(shown) - bonus), 1, 99) : shown;
}
// 六维叠加随身系统加成（没有加成时原样返回）。
function withAttributeBonus(engine, attrs) {
    if (!bonusList(engine)) return attrs;
    return Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, Math.max(1, value + heroBonusOf(engine, name))]));
}

export function isProtagonist(actor) {
    return !actor || actor === PROTAGONIST || USER_NAME.test(String(actor));
}

export function rankOfGrowth(growth) {
    const g = Number(growth) || 0;
    let rank = RANKS[0];
    GROWTH_RANK_AT.forEach((at, i) => { if (g >= at) rank = RANKS[i]; });
    return rank;
}

// 主角自定义技能不在注册表里：按名字猜属性，类别算通用。
function entryOf(engine, skill) {
    if (isSan(engine, skill)) return SAN_ENTRY;
    const found = engine.registry.get(skill);
    if (found) return found;
    return { kind: 'skill', attribute: guessAttribute(skill) || '敏捷', category: 'general', aliases: [], origin: 'custom' };
}

function safeRead(fn, name) {
    if (!fn) return null;
    try {
        return fn(name) || null;
    } catch {
        return null;
    }
}

// 战斗六维（分数）折成百分制：分数 × 5。缺项按 10 分（普通）。
function percentOf(scores) {
    return Object.fromEntries(ABILITY_KEYS.map((key) => [ABILITY_LABELS[key], (Number(scores && scores[key]) || 10) * 5]));
}

// 主角六维：读战斗侧 → 按建卡偏好推导。
function protagonistAttributes(engine, state) {
    const name = engine.userName || PROTAGONIST;
    const read = safeRead(engine.readAbilities, name);
    if (read && read.scores) return percentOf(read.scores);
    const prefs = (state && state.protagonist && state.protagonist.prefs) || null;
    return percentOf(deriveAbilities({ prefs, name, protagonist: true }).scores);
}

// NPC 六维优先序：属性档（scale:'score' 且六维齐全）→ 战斗侧读取 → 按名字推导。
function npcAttributes(engine, sheet, actor) {
    const own = sheet && sheet.scale === 'score' && sheet.attributes;
    if (own && BASE_ATTRIBUTES.every((name) => Number(own[name]) > 0)) return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Number(own[name]) * 5]));
    const read = safeRead(engine.readAbilities, actor);
    if (read && read.scores) return percentOf(read.scores);
    return percentOf(deriveAbilities({ name: actor, protagonist: false }).scores);
}

// CoC理智值（百分制）：主角取存档里成长过的理智，没有取 感知 × 5 的初值；NPC 取角色卡 san。
function sanOf(attrs, owned, sheet) {
    const stored = Number(owned && owned.value);
    if (stored > 0) return stored;
    const san = Number(sheet && sheet.san);
    return san > 0 ? san : attrs[WILL_ATTRIBUTE];
}

// 没有该技能的 NPC 按所属属性估临时值（§6.2 第一层）：属性很高给「熟练」中值，较高给「入门」中值。
export function provisionalSkillValue(attributeValue, base) {
    const a = Number(attributeValue) || 0;
    if (a >= 75) return 60;
    if (a >= 60) return 35;
    return base;
}

// NPC 成长：角色卡里的技能值是初次登记时冻结的底数，成长另记在 state.characters[名].skillGrowth[技能] = { bonus, marked, tagDay }，随楼层回退。
export function npcGrowthBonus(state, actor, skill) {
    const entry = state && state.characters && state.characters[actor] && state.characters[actor].skillGrowth && state.characters[actor].skillGrowth[skill];
    return Number(entry && entry.bonus) || 0;
}

export const grownValue = (base, bonus) => (bonus > 0 ? Math.min(Math.max(SKILL_MAX, base), base + bonus) : base);

// 返回 { skill, kind, value, learned, attributeValue, rank, entry, provisional }。
export function profileOf(engine, state, actor, rawSkill) {
    // 旧属性名（健康 / 观察，D&D 下的理智）先归一成六维，否则会被当成未登记的自定义技能。
    const skill = BASE_ATTRIBUTE_SET.has(rawSkill) || isSan(engine, rawSkill) ? rawSkill : (normalizeAttribute(rawSkill) || rawSkill);
    const entry = entryOf(engine, skill);
    const san = isSan(engine, skill);
    if (isProtagonist(actor)) {
        // plain：IGS 自己的六维；attrs：叠加随身系统加成后的生效六维。seed、理智初值只用 plain，加成不进账本。
        const plainAttrs = protagonistAttributes(engine, state);
        const attrs = withAttributeBonus(engine, plainAttrs);
        const owned = state && state.protagonist && state.protagonist.skills[skill];
        const rank = rankOfGrowth(state && state.protagonist && state.protagonist.growth);
        const bonus = heroBonusOf(engine, skill);
        if (san) { const value = bonus ? Math.max(1, sanOf(plainAttrs, owned, null) + bonus) : sanOf(plainAttrs, owned, null); return { skill, kind: 'attribute', value, learned: true, attributeValue: value, rank, entry }; }
        if (entry.kind === 'attribute') return { skill, kind: 'attribute', value: attrs[skill], learned: true, attributeValue: attrs[skill], rank, entry };
        const level = heroSkillLevel(engine, owned, skill);
        const own = level === null && owned ? 0 : level !== null ? level : baseValueOf(entry, attrs);
        const value = bonus ? clamp(Math.round(own + bonus), 1, 99) : own;
        // seed：不含手改的值，未学技能首次成功时按它登记进账本（见 markGrowth）。
        const plain = heroSkillLevel({ ...engine, protagonistEdit: null }, owned, skill);
        const seed = plain === null && owned ? 0 : plain !== null ? plain : baseValueOf(entry, plainAttrs);
        return { skill, kind: 'skill', value, seed, learned: Boolean(owned) || level !== null || bonus > 0, attributeValue: attrs[entry.attribute], rank, entry };
    }
    const sheet = engine.sheets[actor] || null;
    const attrs = npcAttributes(engine, sheet, actor);
    const rank = (sheet && sheet.rank) || RANKS[0];
    if (san) { const value = sanOf(attrs, null, sheet); return { skill, kind: 'attribute', value, learned: true, attributeValue: value, rank, entry }; }
    if (entry.kind === 'attribute') return { skill, kind: 'attribute', value: attrs[skill], learned: true, attributeValue: attrs[skill], rank, entry };
    const own = sheet && sheet.skills && Number(sheet.skills[skill]);
    const grown = (base) => grownValue(base, npcGrowthBonus(state, actor, skill));
    if (own > 0) return { skill, kind: 'skill', value: grown(own), learned: true, attributeValue: attrs[entry.attribute], rank, entry, provisional: Boolean(sheet.provisional && sheet.provisional[skill]) };
    const base = baseValueOf(entry, attrs);
    const value = grown(provisionalSkillValue(attrs[entry.attribute], base));
    return { skill, kind: 'skill', value, learned: value !== base, attributeValue: attrs[entry.attribute], rank, entry, provisional: true };
}

export function isSocialSkill(engine, skill) {
    const entry = engine.registry.get(skill);
    return Boolean(entry && entry.social) || SOCIAL_SKILLS.has(skill);
}

// 主角生命（战斗侧 vitals：{ hp, maxHp, down }）；读不到或没有上限时为 null。
export function protagonistVitals(engine) {
    const vitals = safeRead(engine.readVitals, engine.userName || PROTAGONIST);
    return vitals && Number(vitals.maxHp) > 0 ? vitals : null;
}

// 修正（§4.6）：生活条惩罚、队友、好感、额外修正合成净优势值；压力折成 shift。D&D 只看符号。
export function modifiersOf(engine, state, { actor, skill, toward, ally, edge = 0 } = {}) {
    const notes = [];
    let net = Number(edge) || 0;
    let shift = 0;
    if (isProtagonist(actor) && state && state.protagonist) {
        const mods = checkModifiers(state.protagonist.bars, protagonistVitals(engine));
        if (mods.penalty) {
            net -= engine.ruleset.EDGE_MAX > 1 ? mods.penalty : 1;
            notes.push('状态不佳');
        }
        shift += mods.targetShift;
    }
    if (ally) { net += 1; notes.push('队友协助'); }
    const target = toward && state && state.characters ? state.characters[toward] : null;
    if (target && isSocialSkill(engine, skill)) {
        const favorEdge = FAVOR_EDGE[stageOf(target.dims && target.dims.好感).name] || 0;
        if (favorEdge) { net += favorEdge; notes.push(favorEdge > 0 ? '关系亲近' : '关系恶劣'); }
    }
    const max = engine.ruleset.EDGE_MAX || 1;
    return { edge: clamp(net, -max, max), shift, notes };
}

function rawFor(engine, random, edge, difficulty) {
    const extra = engine.ruleset.ID === 'coc7' ? engine.ruleset.rawNeed(difficulty, edge) : 0;
    return engine.ruleset.rawRoll(random, extra);
}

// request：{ actor, skill, difficulty, against, opposedSkill, toward, ally, edge, raw, source }
// against：对抗的 NPC（按对方被动值定难度 / DC）；toward：只取好感修正、不对抗（关键事件）。
export function resolveCheck(engine, state, request, random) {
    const actor = isProtagonist(request.actor) ? PROTAGONIST : request.actor;
    const skill = request.skill;
    const profile = profileOf(engine, state, actor, skill);
    const toward = request.against || request.toward || null;
    const mods = modifiersOf(engine, state, { actor, skill, toward, ally: request.ally, edge: request.edge });
    const opts = { difficulty: DIFFICULTIES.includes(request.difficulty) ? request.difficulty : '普通', edge: mods.edge, shift: mods.shift, natural: engine.natural };
    let opposed = null;
    if (request.against) {
        const opposedSkill = request.opposedSkill || (profile.entry && profile.entry.opposedBy) || skill;
        const other = profileOf(engine, state, request.against, opposedSkill);
        Object.assign(opts, engine.ruleset.passiveOpposition(other));
        opposed = { actor: request.against, skill: opposedSkill, value: other.value };
    }
    const raw = request.raw || rawFor(engine, random, opts.edge, opts.difficulty);
    const r = engine.ruleset.resolve(profile, opts, raw);
    return {
        ...r,
        actor, skill, kind: profile.kind, value: profile.value, ...(profile.seed !== undefined && profile.seed !== profile.value ? { seed: profile.seed } : {}), learned: profile.learned,
        difficulty: request.difficulty && DIFFICULTIES.includes(request.difficulty) ? request.difficulty : (opposed ? '对抗' : '普通'),
        against: request.against || null, opposed, toward: toward || null,
        social: isSocialSkill(engine, skill), notes: mods.notes, raw, source: request.source || '',
    };
}

// 双方主动对抗（选项骰子「对抗」、战斗）：各掷一次比结果。
export function contestCheck(engine, state, left, right, random, { tieWinner = '' } = {}) {
    const a = resolveCheck(engine, state, { ...left, difficulty: '普通', against: null }, random);
    const b = resolveCheck(engine, state, { ...right, difficulty: '普通', against: null }, random);
    return { left: a, right: b, winner: engine.ruleset.contest(a, b, { tieWinner }) };
}

export function chanceOf(engine, state, request) {
    const actor = isProtagonist(request.actor) ? PROTAGONIST : request.actor;
    const profile = profileOf(engine, state, actor, request.skill);
    const mods = modifiersOf(engine, state, { actor, skill: request.skill, toward: request.against || request.toward, ally: request.ally, edge: request.edge });
    const opts = { difficulty: DIFFICULTIES.includes(request.difficulty) ? request.difficulty : '普通', edge: mods.edge, shift: mods.shift, natural: engine.natural };
    if (request.against) {
        const other = profileOf(engine, state, request.against, request.opposedSkill || (profile.entry && profile.entry.opposedBy) || request.skill);
        Object.assign(opts, engine.ruleset.passiveOpposition(other));
    }
    return engine.ruleset.chance(profile, opts);
}

// 主角检定成功打成长勾；未学技能成功后登记进存档（「用过就会」），起点为当时的检定底数（§6.1）。
export function markGrowth(state, check) {
    if (!check || !check.success || !isProtagonist(check.actor) || !state || !state.protagonist) return state;
    const skills = state.protagonist.skills;
    const own = skills[check.skill];
    if (own) return own.marked ? state : withSkills(state, { ...skills, [check.skill]: { ...own, marked: true } });
    if (check.kind === 'attribute') return state;
    // 手改过的技能按不含手改的 seed 登记，否则手改值会被当成账本成长再叠加一次。
    const value = clamp(Math.round(Number(check.seed ?? check.value) || 1), 1, 99);
    return withSkills(state, { ...skills, [check.skill]: { value, marked: true } });
}

// NPC 参与检定（对抗的对手、正文检定的一方）时，用到的技能打成长勾；只收已登记角色的非属性技能。
export function markNpcGrowth(state, actor, skill) {
    const name = String(actor || '').trim();
    const character = state && state.characters && state.characters[name];
    if (!character || isProtagonist(name) || !skill || BASE_ATTRIBUTE_SET.has(skill) || skill === SAN_ATTRIBUTE) return state;
    const growth = character.skillGrowth || {};
    const own = growth[skill] || {};
    if (own.marked) return state;
    return { ...state, characters: { ...state.characters, [name]: { ...character, skillGrowth: { ...growth, [skill]: { ...own, bonus: Number(own.bonus) || 0, marked: true } } } } };
}

export function markCheckOpponents(state, check) {
    if (!check || !check.opposed || !check.opposed.actor || isProtagonist(check.opposed.actor)) return state;
    return markNpcGrowth(state, check.opposed.actor, check.opposed.skill);
}

// 战斗技能：已学的里取最高；属性始终可用。
export function bestCombatSkill(engine, state, names = COMBAT_SKILLS) {
    let best = null;
    for (const name of names) {
        const entry = BUILTIN_SKILLS[name] || engine.registry.get(name);
        const owned = state.protagonist.skills[name];
        // D&D 沿用原规则（只看账本）；CoC 下 AI 分配与手改的技能也参选。
        if (entry && entry.kind !== 'attribute' && !owned && (engine.ruleset.ID !== 'coc7' || heroSkillLevel(engine, null, name) === null)) continue;
        const p = profileOf(engine, state, PROTAGONIST, name);
        const score = engine.ruleset.ID === 'dnd5e' ? engine.ruleset.bonusOf(p) : p.value;
        if (!best || score > best.score) best = { name, score, value: p.value };
    }
    return best || { name: '力量', score: 0, value: 50 };
}

// 选项骰子命令（§5.1）：dice-check 解析结果 → 引擎检定；主角之外的角色读 NPC 角色卡。
const LEVEL_DIFFICULTY = Object.freeze({ 0: '普通', 1: '困难', 2: '极难' });

function actorKey(engine, state, name, resolveCharacter) {
    if (isProtagonist(name)) return PROTAGONIST;
    const resolved = typeof resolveCharacter === 'function' ? resolveCharacter(name) : null;
    return resolved || String(name || '').trim();
}

function skillKey(engine, raw) {
    if (isSan(engine, String(raw || '').trim())) return SAN_ATTRIBUTE;
    return engine.registry.resolve(raw) || String(raw || '').trim();
}

export function resolveDiceRequest(engine, state, command, { resolveCharacter } = {}) {
    if (!command || (command.kind !== 'check' && command.kind !== 'contest')) return null;
    const edge = (Number(command.bonus) || 0) - (Number(command.penalty) || 0);
    if (command.kind === 'check') {
        return { kind: 'check', actor: actorKey(engine, state, command.name, resolveCharacter), skill: skillKey(engine, command.attribute), difficulty: LEVEL_DIFFICULTY[command.difficulty] || '普通', edge };
    }
    return {
        kind: 'contest',
        left: { actor: actorKey(engine, state, command.left.name, resolveCharacter), skill: skillKey(engine, command.left.attribute), edge },
        right: { actor: actorKey(engine, state, command.right.name, resolveCharacter), skill: skillKey(engine, command.right.attribute) },
        tieRule: command.tieRule,
    };
}

export function displayActor(actor, userName = '') {
    return isProtagonist(actor) ? (userName || '主角') : actor;
}

// 与 dice-check 的元叙事格式一致，AI 侧格式不变。
export function checkLine(check, userName = '') {
    const who = displayActor(check.actor, userName);
    const diff = check.difficulty && check.difficulty !== '普通' ? `（${check.difficulty}）` : '';
    return `元叙事：${who}发起了【${check.skill}】检定${diff}，${check.detail}，【${check.outcome}】。`;
}

export function contestLine(result, userName = '') {
    const l = result.left;
    const r = result.right;
    const ln = displayActor(l.actor, userName);
    const rn = displayActor(r.actor, userName);
    const verdict = result.winner === 'left' ? `${ln}胜出` : result.winner === 'right' ? `${rn}胜出` : '双方僵持';
    return `元叙事：${ln}以【${l.skill}】对抗${rn}的【${r.skill}】，${l.detail} / ${r.detail}，结果：${verdict}（${l.outcome} vs ${r.outcome}）。`;
}

// 掷骰卡明细（fx-result-model 的 check / contest 结构）。
export function checkFxDetail(check, userName = '') {
    return {
        kind: 'check', actor: displayActor(check.actor, userName), attribute: check.skill, roll: check.roll, target: check.target,
        threshold: check.threshold, tier: check.ladder === 'crit' ? '大成功' : check.ladder === 'fumble' ? '大失败' : check.tier,
        outcome: check.outcome, success: check.success, die: check.die, sub: check.sub,
    };
}

export function contestFxDetail(result, userName = '') {
    // 主动对抗不比 DC：D&D 显示合计，CoC 显示目标值与成功等级。
    const side = (c) => ({
        name: displayActor(c.actor, userName), attribute: c.skill, roll: c.roll, target: c.target, tier: c.tier, die: c.die,
        sub: c.die === 20 ? `合计${c.total}` : `目标${c.target} · ${c.tier}`,
    });
    const ln = displayActor(result.left.actor, userName);
    const rn = displayActor(result.right.actor, userName);
    return {
        kind: 'contest', left: side(result.left), right: side(result.right), winner: result.winner,
        verdict: result.winner === 'left' ? `${ln}胜出` : result.winner === 'right' ? `${rn}胜出` : '双方僵持',
    };
}
