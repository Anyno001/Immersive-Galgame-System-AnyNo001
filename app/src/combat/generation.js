import { COMBAT_RULES, combatSpeedFor } from './rules.js';
import { hashString } from './random.js';
import { REWARD_ORIGIN_MAX, effectsDamage, ledgerEntryId, normalizeCard, normalizeLedgerEntry, normalizeProfile, normalizeSkill, profileIdFor, validateStarterDeck } from './schema.js';
import { templateCatalogText } from './card-templates.js';
import { enemyArtCatalogText } from './enemy-art.js';
import { CARD_COST_SLOTS, assembleClass, assembleClassTier, assembleDeck, assembleEnemy, assembleGear, assembleGrowth, assembleItem, assembleReward, assembleSkillCharacter, assembleTrait, costSlotsFor } from './generation-assembly.js';
import { parseCombatInit } from './abilities.js';
import { planRewardSlots } from './rewards.js';

// 副 LLM 生成：程序构造请求、解析 JSON、逐实体校验；不合格实体最多定向修正 MAX_FIX_ROUNDS 轮，已通过的不再提交。
// request 与 llm 配置由调用方注入（createSecondaryLlm().request），combat 不读宿主、不落账。
// 这条链路只证明解析与校验正确，不证明模型生成质量。
export const GENERATION_KINDS = Object.freeze(['class', 'profile-deck', 'profile-skill', 'profile-init', 'enemy', 'skill-to-card', 'equip-to-passive', 'item-to-consumable', 'battle-reward', 'class-tier', 'trait']);
export const MAX_FIX_ROUNDS = 2;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const err = (path, reason, detail) => (detail === undefined ? { path, reason } : { path, reason, detail });

// 严格就绪：选了独立 API 却缺地址或模型时直接报错，不悄悄改走酒馆。llm 为已归一化的副 LLM 配置。
export function resolveCombatLlm(llmSettings) {
    const llm = isObj(llmSettings) ? llmSettings : {};
    if (llm.source === 'openai') {
        const missing = ['endpoint', 'model'].filter((key) => !String(llm[key] || '').trim());
        if (missing.length) return { ok: false, reason: 'combat-llm-config-incomplete', missing };
        return { ok: true, llm: { ...llm } };
    }
    return { ok: true, llm: { ...llm, source: 'tavern' } };
}

// 允许外层包代码块或前后多一句说明，内容必须是严格 JSON。
export function readGenerationJson(raw) {
    const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const attempt = (s) => {
        try { return { ok: true, value: JSON.parse(s) }; } catch { return null; }
    };
    const whole = attempt(text);
    if (whole) return whole;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return (start >= 0 && end > start && attempt(text.slice(start, end + 1))) || { ok: false, reason: unreadableReason(text) };
}

// 无法解析时细分：回复为空、疑似截断（括号或字符串未闭合）、其他非 JSON。不回显回复正文。
function unreadableReason(text) {
    if (!text) return 'combat-reply-empty';
    const start = text.search(/[{[]/);
    if (start < 0) return 'combat-reply-not-json';
    let depth = 0, quoted = false, escaped = false;
    for (const ch of text.slice(start)) {
        if (quoted) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === '{' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ']') depth -= 1;
    }
    return quoted || depth > 0 ? 'combat-reply-truncated' : 'combat-reply-not-json';
}

// 敌人档案 ID 按 名称+档位 推导：同名同档位复用，同名不同档位分开。
export const enemyIdFor = (name, tier) => profileIdFor('enemy', `${tier}:${String(name || '').trim()}`);
// 习得的卡牌/技能 ID 由角色、技能名与来源锚点推导，同一标签重试得到同一 ID。
export const learnedIdFor = (characterId, skill, anchor) => `lc-${hashString([characterId, skill, anchor?.messageId, anchor?.swipeId, anchor?.tagHash, anchor?.occurrence].join('|'))}`;

// 副 LLM 只选模板与起名：效果、数值、ID、升级版和起始卡组都由程序组装（generation-assembly.js），回复短小、不易截断。
export const GENERATION_SYSTEM = [
    '你负责为卡牌战斗系统挑选模板并起名。只返回 JSON：{"entities":[{"key":"请求里的 key","value":{...}}]}。请求 entities 中的每个 key 恰好出现一次（标注 optional 的可以省略），不输出请求以外的 key，不写注释或解释。',
    '效果、数值、ID、升级版和起始卡组都由程序按模板生成；你只填下列字段，模板键必须从目录中选择。',
    templateCatalogText(),
    '人物特性（trait）与装备被动（equip-to-passive、battle-reward 的 gear 槽）的模板键可取被动模板或华而不实被动模板；职业特性、个人被动、技能角色与敌人的被动只能取被动模板。',
    '卡牌写成 ["卡名","卡牌模板键"]：费用由程序按卡牌在列表中的位置固定——class 与 profile-deck 的 cards 第 i 张的费用是 input.costSlots[i]（超出长度后从头循环），signature 第 i 张是 input.signatureSlots[i]；按该位置的费用挑选合适的模板，费用为 0 的位置只能用「0 费槽可用」的模板；skill-to-card 仍可写第三项费用 0–3。profile-skill 与 enemy 的 skills 写成 ["技能名","技能模板键"]；被动写成 ["被动名","被动模板键"]。名称不超过 20 字，贴合角色与剧情；复合效果模板优先。',
    'input.lore 存在时是该角色的设定参考（用户人设 / 角色卡）：人物技能、个人被动、技能与卡牌名称都依据其中的性格、能力与经历设计；没有 lore 时按名字与剧情推断。',
    'context.story 存在时是最近的剧情节选，context.worldInfo 存在时是按剧情触发的世界书条目：职业名、人物技能、卡牌与敌人招式的名称和模板选择都贴合其中的世界观、势力、能力体系与正在发生的事件，不照抄原文，不与之矛盾。',
    '各 kind 的 value：',
    `- class：{"className":"职业名，≤12 字，按本故事的世界观起名，不照搬原型名；input.className 存在时照用，不得与 existingClasses 同名","archetype":"${Object.keys(COMBAT_RULES.archetypes).join('|')}","passive":职业特性（被动，同职业的人共享）,"cards":[恰好 11 张卡牌]}；稀有度由程序独立分配，模型不选择。`,
    '- profile-deck：{"classRef"?:"没有 input.classRef 时可选 existingClasses 中合适职业的 id；省略则使用同一请求里本角色的 class","aliases"?:[≤5 个称呼],"hp"?:所用职业原型在 input.archetypeHp 中的范围,"passive":个人被动,"skill":["人物技能名","卡牌模板键"]——人物技能，第二项必须取自卡牌模板目录（技能模板键在这里无效）；按这个角色本人的设定、性格与招式设计，每人不同，不要与职业特性重复；战斗中每回合可主动用一次,"cards":[4–6 张个人卡牌],"signature"?:[0–2 张专属卡]——这个角色最具代表性的绝技或成名招式，名称就是剧情里会出现的招式名，开局不持有，剧情中习得同名技能时解锁；主角与重要角色应给 2 张}',
    '- profile-skill：{"aliases"?:[≤5 个称呼],"className"?:"≤12 字","hp"?:20–120,"tier"?:"support|peer|ace|legend——按该角色在剧情中的实力地位相对主角选择：support 弱于主角、peer 相当、ace 明显强于主角（可靠的强力同伴）、legend 碾压级；拿不准时选 peer","skills":[3–5 个技能],"passives":[1–2 个被动]}',
    `- enemy：{"art"?:"外观格位键，按敌人名称与剧情形象选最接近的一格。${enemyArtCatalogText()}","hp"?:input.hpRange 范围内,"skills":[2–4 个技能],"passives"?:[0–2 个被动]}；input.tier 为 boss 时可另给 "enrage":技能，半血后加入。`,
    '- skill-to-card：{"name"?:"默认 input.skill","template":"input.output 为 card 时填卡牌模板键，为 skill 时填技能模板键","cost"?:卡牌费用 0–3}；input.mode 为 upgrade 时另填 "targetId"：从 input.candidates 选出被精进的那一项，找不到时填 ""。',
    '- equip-to-passive：{"template":"被动模板键"}——按 input.name、input.slot（weapon 武器 / armor 防具 / accessory 饰品 / treasure 宝物）与 input.description 选最贴合这件装备的被动；名称与数值由程序给定。',
    '- item-to-consumable：{"template":"道具模板键"}——按 input.name 与 input.description 选最贴合这件一次性道具的效果；名称、数量与数值由程序给定。',
    `- battle-reward：{"slots":[按 input.slots 的顺序每槽一项 ["名称","模板键","来历"]],"reserve":[按 input.reserve 的顺序同样每槽一项]}——slots、reserve 的项数分别与 input.slots、input.reserve 相同；reserve 是翻牌重抽时换上的备用一套，名称不与 slots 重复。来历 ≤${REWARD_ORIGIN_MAX} 字，写这件东西从哪来，贴合 input.encounter、input.enemies 与剧情（context.story、context.worldInfo）。按该槽的 kind 填模板键：card 填卡牌模板键（费用为该槽的 cost，0 费只能用「0 费槽可用」的模板）；gear 填被动模板键，名称贴合该槽的 gearSlot（weapon 武器 / armor 防具 / accessory 饰品 / treasure 宝物）；item 是一次性道具，填道具模板键；keepsake 是没有战斗效果的杂物（如褪色的发绳、半块桂花糕），模板键填 null。每槽都必须起名，名称与来历的品相贴合该槽的 rarity（common 普通、uncommon 罕见、rare 稀有、epic 史诗、mythic 神话）。稀有度、数值与数量由程序给定。`,
    '- class-tier：{"tierName":"职业 input.className 第 input.tier 阶的阶名，≤12 字，按本故事的世界观起名，与 input.className 及 input.previousTierName（存在时）衔接、不重复","cards":[恰好 3 张卡牌]}——升阶后追加进该职业池的卡，第 i 张的费用是 input.costSlots[i]，体现职业原型 input.archetype 的进阶招式，名称不与 existingClasses 里该职业已有的卡重名；稀有度（input.rarity）、数值与 ID 由程序给定。',
    `input.combatInit 为 true 时，在 value 中另附 init：{"className":"自由职业显示名，最多12字，可空","role":"${Object.keys(COMBAT_RULES.archetypes).join('|')}","major":"主擅长六维键","minor":"次擅长六维键","weak":"短板六维键"}；六维键为 str/dex/con/int/wis/cha，三项互异，依据角色设定与剧情，不输出属性数值。profile-init 只返回 {"init":{...}}，不重写档案；这组字段可整组省略。`,
    `- trait：{"name":"人物特性名，≤20 字","template":"被动模板键","origin":"来历，≤${REWARD_ORIGIN_MAX} 字"}——角色 input.name 的人物特性：名称与来历依据 input.lore（存在时）、剧情与世界书（context.story、context.worldInfo），写这个人为何有这种特质；品相贴合 input.rarity（common 普通、uncommon 罕见、rare 稀有、epic 史诗、mythic 神话）；不与 input.existing（存在时）里已有的特性重名。稀有度、数值与 ID 由程序给定。`,
    '带 previousErrors 的实体上一轮被拒收：按其中的字段路径（指向你上一轮的回复）和原因修改 previous，其余保持不变。',
].join('\n');


const ARCHETYPE_HP = Object.freeze(Object.fromEntries(Object.entries(COMBAT_RULES.archetypes).map(([key, a]) => [key, [...a.hp]])));
const valuesOf = (m) => (m instanceof Map ? [...m.values()] : Array.isArray(m) ? m : []);
const classSummary = (cls) => ({ id: cls.id, className: cls.className, archetype: cls.archetype, classPool: cls.classPool.map((c) => ({ id: c.id, name: c.name, type: c.type, cost: c.cost })) });

// 有卡组角色：职业已登记（classRef，或 className 与已有职业同名）时只请求个人档案；否则附带一个职业实体，
// 已有职业可供复用且未指定职业名时该实体可省略。role 为 protagonist / ally。
export function deckProfileEntities({ name, id = profileIdFor('deck-character', name), role = 'ally', classRef = null, className = '', classes } = {}) {
    const named = className ? valuesOf(classes).find((c) => c.className === className) : null;
    const ref = classRef || named?.id || null;
    const entities = [];
    let classKey = null;
    if (!ref) {
        classKey = `class:${id}`;
        const optional = !className && valuesOf(classes).length > 0;
        const fixed = className ? { className } : {};
        entities.push({ key: classKey, kind: 'class', role, owner: id, ...(optional ? { optional: true } : {}), input: { ...fixed, costSlots: costSlotsFor('class', id) }, fixed });
    }
    entities.push({
        key: `deck:${id}`, kind: 'profile-deck', role, owner: id,
        input: { name, archetypeHp: ARCHETYPE_HP, costSlots: costSlotsFor('personal', id), signatureSlots: [...CARD_COST_SLOTS.signature], ...(ref ? { classRef: ref } : {}) },
        fixed: { kind: 'deck-character', id, name, ...(ref ? { classRef: ref } : {}) },
        ...(classKey ? { classKey } : {}),
    });
    return entities;
}

// 转职（P-c）按剧情新生成职业：职业名由副 LLM 按世界观起，不得与已登记职业同名；不附成长条目（转职由账本 respec 条目落账）。
export function respecClassEntity({ id, name }) {
    return { key: `class:${id}:respec`, kind: 'class', role: 'respec', owner: id, input: { characterName: name, costSlots: costSlotsFor('class', id) }, fixed: {} };
}

// 职业升阶（P-c）：请求第 tier 阶的阶名与 3 张追加职业卡。卡牌 ID 由职业 ID、阶与本次标记 mark 推导，转职离开后再升阶不与旧升阶卡相撞。
export function classTierEntity({ character, cls, tier, rarity, tierName = '', mark = '' }) {
    const cardIds = [1, 2, 3].map((i) => `${cls.id}-t${tier}${mark ? `-${mark}` : ''}-${i}`);
    return {
        key: `class-tier:${character.id}:${tier}`, kind: 'class-tier', role: 'ascend', owner: character.id,
        input: {
            characterName: character.name, className: cls.className, archetype: cls.archetype, tier, rarity,
            costSlots: [...CARD_COST_SLOTS.tier], ...(tierName ? { previousTierName: tierName } : {}),
        },
        fixed: { classRef: cls.id, tier, cardIds },
    };
}

// 人物特性（P-d）：traitId 与稀有度由程序给定（稀有度按主角 ID 与已生效抽取次数确定）；模型只起名、选被动模板、写来历。existing 为已装与待定特性，避免重名。
export function traitEntity({ character, rarity, traitId, existing = [] }) {
    const names = existing.map((t) => t?.name).filter(Boolean);
    return {
        key: `trait:${character.id}`, kind: 'trait', role: 'trait', owner: character.id,
        input: { name: character.name, rarity, ...(names.length ? { existing: names } : {}) },
        fixed: { traitId, rarity },
    };
}

// 同一次准备请求补齐初始化；已有档案只加可选资料实体，不重建职业、卡组或技能。
export function withCombatInitialization(entities, names) {
    const missing = new Set(names);
    const list = entities.map(entity => {
        if (!['profile-deck', 'profile-skill', 'enemy'].includes(entity.kind) || !missing.has(entity.input?.name)) return entity;
        missing.delete(entity.input.name);
        return { ...entity, input: { ...entity.input, combatInit: true } };
    });
    for (const name of missing) list.push({ key: `init:${profileIdFor('skill-character', name)}`,
        kind: 'profile-init', role: 'initialization', optional: true, input: { name, combatInit: true } });
    return list;
}

// 角色设定参考：read 由调用方注入（宿主的 readCharacterLore），combat 只调用、不直接读宿主。
// 只给 profile-deck / profile-skill / profile-init / trait 附 input.lore，读到内容才加字段；读取失败或为空时实体保持原样。
export async function withCharacterLore(entities, read) {
    const list = Array.isArray(entities) ? entities : [];
    const names = [...new Set(list.filter((e) => ['profile-deck', 'profile-skill', 'profile-init', 'trait'].includes(e.kind)).map((e) => e.input?.name).filter(Boolean))];
    if (typeof read !== 'function' || !names.length) return list;
    let lore = [];
    try { lore = await read(names); } catch (error) { lore = []; }
    const byName = new Map((Array.isArray(lore) ? lore : []).filter((l) => l && typeof l.text === 'string' && l.text.trim()).map((l) => [l.name, l.text.trim()]));
    if (!byName.size) return list;
    return list.map((e) => (['profile-deck', 'profile-skill', 'profile-init', 'trait'].includes(e.kind) && byName.has(e.input?.name)
        ? { ...e, input: { ...e.input, lore: byName.get(e.input.name) } } : e));
}

// 剧情与世界书参考：read 由调用方注入（宿主的 combat-story-context，世界书经原生扫描器按剧情触发），combat 只调用、不直接读宿主。
// 只在读到非空内容时给 context 加 story / worldInfo；未注入、读取失败或为空时 context 原样返回，请求形状与旧版一致。
export async function withStoryContext(context, read, { names = [], signal } = {}) {
    const base = isObj(context) ? context : {};
    if (typeof read !== 'function') return base;
    let got = null;
    try { got = await read({ names, signal }); } catch (error) { got = null; }
    const story = typeof got?.story === 'string' ? got.story.trim() : '';
    const worldInfo = typeof got?.worldInfo === 'string' ? got.worldInfo.trim() : '';
    if (!story && !worldInfo) return base;
    return { ...base, ...(story ? { story } : {}), ...(worldInfo ? { worldInfo } : {}) };
}

export function skillProfileEntity({ name, id = profileIdFor('skill-character', name), role = 'ally' } = {}) {
    return { key: `skill:${id}`, kind: 'profile-skill', role, owner: id, input: { name }, fixed: { kind: 'skill-character', id, name } };
}

// 敌人：同名同档位复用已有档案，批量杂兵共享一份。返回 { entities, reused }。
export function enemyEntities({ enemies, tier = 'normal', existing, partyLevel = 1 } = {}) {
    const rule = COMBAT_RULES.tiers[tier];
    if (!rule) return { entities: [], reused: [], error: 'combat-tier-unknown' };
    const have = existing instanceof Map ? existing : new Map(valuesOf(existing).map((p) => [p.id, p]));
    const entities = [];
    const reused = [];
    const seen = new Set();
    for (const { name } of Array.isArray(enemies) ? enemies : []) {
        const id = enemyIdFor(name, tier);
        if (seen.has(id)) continue;
        seen.add(id);
        if (have.has(id)) {
            reused.push(id);
            continue;
        }
        entities.push({
            key: `enemy:${id}`, kind: 'enemy', role: 'enemy', owner: id,
            input: { name, tier, hpRange: [Math.round(rule.hp * 0.5), Math.round(rule.hp * 1.5)], damageCap: rule.damageCap, partyLevel },
            fixed: { kind: 'enemy', id, name, tier },
        });
    }
    return { entities, reused };
}

// 胜利翻牌奖励（v3 §5.1）：程序先定 EXP 与槽位，模型只给名称、模板键与来历；通过后为锚定开战楼的 offer 条目。
// character 为领取奖励的角色视图（默认主角）；links 为准备时的翻牌联动（第 12 步接入）。返回 { entity, plan }。
// 主套 slots 与备用套 reserve（翻牌花积分重抽时换上）在同一实体里一次生成，两套同成同败。
export function rewardEntity({ combatId, anchor, tier, enemyTiers = [], enemies = [], encounter = '', character, links } = {}) {
    if (!combatId || !anchor || !character?.id) return { error: 'combat-reward-input-missing' };
    const plan = planRewardSlots({ combatId, tier, enemyTiers, character, links });
    // 模型只需类别、稀有度与命名线索（费用、部位）；数量留在 fixed 里由程序组装。
    const hints = (list) => list.map(({ index, count, ...hint }) => hint);
    const names = [...new Set((Array.isArray(enemies) ? enemies : []).map((e) => String(e?.name || '').trim()).filter(Boolean))];
    return {
        plan,
        entity: {
            key: `reward:${combatId}`, kind: 'battle-reward', role: 'reward', owner: character.id, anchor: { ...anchor },
            input: { characterName: character.name, tier: plan.tier, enemies: names, ...(encounter ? { encounter: String(encounter).slice(0, 40) } : {}), slots: hints(plan.slots), reserve: hints(plan.reserve) },
            fixed: { combatId, tier: plan.tier, exp: plan.exp, reveal: plan.links.reveal, seed: plan.seed, slots: plan.slots, reserve: plan.reserve },
        },
    };
}
// 成长标签（账本 pendingGeneration 的一项）→ 生成实体或可直接落账的条目。character 为账本 effectiveState 中的角色视图。
// class 标签：职业已登记时直接给出 class 条目，不请求；learn / upgrade：有卡组角色生成卡牌，无卡组角色生成技能。
export function growthEntity(pending, character, { classes, now = 0 } = {}) {
    if (!character) return { error: 'combat-character-missing' };
    const { anchor } = pending;
    const key = `growth:${ledgerEntryId(pending.kind, character.id, anchor)}`;
    // 装备与道具走各自的生成类型，模型只选被动 / 道具模板键，不落到卡牌生成路径。
    if (pending.kind === 'equip' || pending.kind === 'item') {
        const equip = pending.kind === 'equip';
        const input = { characterName: character.name, name: pending.name, description: pending.description || '', ...(equip ? { slot: pending.slot } : { count: pending.count }) };
        return { entity: { key, kind: equip ? 'equip-to-passive' : 'item-to-consumable', role: 'growth', owner: character.id, anchor, input } };
    }
    if (pending.kind === 'class') {
        const existing = valuesOf(classes).find((c) => c.className === pending.className);
        if (existing) {
            return { entry: { id: ledgerEntryId('class', character.id, anchor), type: 'class', character: character.id, anchor, payload: { classRef: existing.id }, createdAt: now } };
        }
        const fixed = { className: pending.className };
        return { entity: { key, kind: 'class', role: 'growth', owner: character.id, anchor, input: { ...fixed, characterName: character.name, costSlots: costSlotsFor('class', character.id) }, fixed } };
    }
    const output = character.kind === 'deck-character' ? 'card' : 'skill';
    // 专属卡：learn / upgrade 的技能名与档案专属卡同名时不请求副 LLM——未持有则解锁，已持有则视为精进。
    const signature = output === 'card' ? signatureMatch(character, pending.skill) : null;
    if (signature) {
        const owned = (character.owned?.get(signature.id) || 0) > 0;
        const type = owned ? 'upgrade' : 'learn';
        const payload = owned ? { targetId: signature.id, card: signature } : { card: signature };
        return { entry: { id: ledgerEntryId(type, character.id, anchor), type, character: character.id, anchor, payload, createdAt: now } };
    }
    // 专属卡只能经同名标签精进，不交给副 LLM 选作升级目标（否则会被普通卡替换）。
    const candidates = output === 'card'
        ? [...character.owned.keys()].filter((id) => character.catalog.get(id)?.rarity !== 'signature').map((id) => ({ id, name: character.catalog.get(id)?.name ?? id }))
        : character.skills.map((s) => ({ id: s.id, name: s.name }));
    return {
        entity: {
            key, kind: 'skill-to-card', role: 'growth', owner: character.id, anchor,
            learnedId: learnedIdFor(character.id, pending.skill, anchor),
            input: { characterName: character.name, skill: pending.skill, description: pending.description || '', mode: pending.kind, output, ...(pending.kind === 'upgrade' ? { candidates } : {}) },
        },
    };
}

const nameNorm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
function signatureMatch(character, skill) {
    const want = nameNorm(skill);
    return want ? (character.profile?.signatureCards || []).find((c) => nameNorm(c.name) === want) || null : null;
}

// 修正耗尽时的模板敌人：只用规则表数值，标记 generated:false，战前界面据此标注「模板敌人」。
export function templateEnemy(name, tier = 'normal') {
    const rule = COMBAT_RULES.tiers[tier] || COMBAT_RULES.tiers.normal;
    const key = COMBAT_RULES.tiers[tier] ? tier : 'normal';
    const id = enemyIdFor(name, key);
    const profile = {
        kind: 'enemy', id, name: String(name || '敌人').trim().slice(0, 20) || '敌人', tier: key, generated: false,
        base: { hp: rule.hp, speed: combatSpeedFor({ tier: key, id }) },
        skills: [
            { id: 't-strike', name: '猛击', intent: 'attack', effects: [{ op: 'damage', amount: Math.round(rule.damageCap * 0.6) }], weight: 3 },
            { id: 't-guard', name: '防备', intent: 'defend', effects: [{ op: 'block', amount: 6 }], weight: 1 },
        ],
        ...(key === 'boss' ? { phases: [{ hpBelowPct: 50, addSkills: [{ id: 't-fury', name: '狂怒', intent: 'buff', effects: [{ op: 'status', status: 'strength', stacks: 2 }], weight: 1, cooldown: 2 }] }] } : {}),
    };
    return normalizeProfile(profile).value;
}

// 请求：每轮只含仍待处理的实体；被拒收的实体附上一轮回复与字段路径错误，供定向修正。
export function buildGenerationRequest(slots, { context = {}, classes = [] } = {}) {
    const payload = {
        context,
        existingClasses: valuesOf(classes).map(classSummary),
        entities: slots.map((slot) => {
            const { entity, previous, errors } = slot.entity ? slot : { entity: slot };
            return {
                key: entity.key, kind: entity.kind, ...(entity.optional ? { optional: true } : {}), input: entity.input,
                ...(errors && previous !== undefined ? { previous } : {}), ...(errors ? { previousErrors: errors } : {}),
            };
        }),
    };
    return { system: GENERATION_SYSTEM, user: JSON.stringify(payload) };
}

export function profileRecord(profile, { version = 1, createdAt = 0, className } = {}) {
    return { id: profile.id, name: profile.name || profile.className, kind: profile.kind, className: className ?? profile.className ?? '', version, createdAt, definition: profile };
}
// 已登记职业 + 本批已通过的职业。
const knownClasses = (ctx) => [...ctx.classes, ...[...ctx.accepted.values()].map((r) => r?.profile).filter((p) => p?.kind === 'class')];

// 组装结果再过档案 schema；组装阶段的错误路径指向紧凑回复字段，供定向修正。
function normalizedProfile(built) {
    if (built.errors) return { ok: false, errors: built.errors };
    const n = normalizeProfile(built.profile);
    return n.ok ? { ok: true, profile: n.value, diagnostics: built.diagnostics } : { ok: false, errors: n.errors };
}

function withInitResult(entity, value, checked) {
    if (!checked.ok || !entity.input?.combatInit) return checked;
    const init = parseCombatInit(value?.init);
    if (init.ok) return { ...checked, result: { ...checked.result, init: { name: entity.input.name, value: init.value } } };
    return { ...checked, diagnostics: [...(checked.diagnostics || []), {
        code: 'combat-init-invalid', key: entity.key, field: init.field,
        problem: value?.init === undefined ? 'missing' : init.problem,
    }] };
}

// 单个实体校验。返回 { ok:true, result, diagnostics } / { ok:false, errors } / { deferred:true }（等同批职业先有结论）。
function validateEntity(entity, value, ctx) {
    if (entity.kind === 'profile-init') return withInitResult(entity, value, { ok: true, result: {} });
    if (!isObj(value)) return { ok: false, errors: [err('', 'expected-object')] };
    const opts = { key: entity.key, owner: entity.owner, fixed: entity.fixed, input: entity.input };
    if (entity.kind === 'class') {
        const n = normalizedProfile(assembleClass(value, opts));
        if (!n.ok) return n;
        if (knownClasses(ctx).some((c) => c.className === n.profile.className)) return { ok: false, errors: [err('className', 'class-name-exists')] };
        const entry = entity.role === 'growth' ? { entry: growthEntry(entity, 'class', { classRef: n.profile.id }, ctx.now) } : {};
        return { ok: true, result: { profile: n.profile, ...entry }, diagnostics: n.diagnostics };
    }
    if (entity.kind === 'profile-deck') {
        const batchClass = entity.classKey ? ctx.accepted.get(entity.classKey)?.profile : null;
        const classRef = entity.fixed.classRef ?? batchClass?.id ?? value.classRef;
        // 同批职业还没有结论时先挂起，不把缺少职业当作卡组本身的错误去修正。
        const waiting = Boolean(entity.classKey) && !ctx.settled.has(entity.classKey);
        const cls = batchClass || knownClasses(ctx).find((c) => c.id === classRef) || null;
        if (!cls) return waiting ? { deferred: true } : { ok: false, errors: [err('classRef', 'class-unknown')] };
        const n = normalizedProfile(assembleDeck(value, { ...opts, cls }));
        if (!n.ok) return n;
        const shape = validateStarterDeck(n.profile, cls);
        return shape.ok ? withInitResult(entity, value, { ok: true, result: { profile: n.profile }, diagnostics: n.diagnostics }) : { ok: false, errors: shape.errors };
    }
    if (entity.kind === 'profile-skill' || entity.kind === 'enemy') {
        const n = normalizedProfile(entity.kind === 'enemy' ? assembleEnemy(value, opts) : assembleSkillCharacter(value, opts));
        return n.ok ? withInitResult(entity, value, { ok: true, result: { profile: n.profile }, diagnostics: n.diagnostics }) : n;
    }
    if (entity.kind === 'equip-to-passive' || entity.kind === 'item-to-consumable') {
        const equip = entity.kind === 'equip-to-passive';
        const built = equip ? assembleGear(value, opts) : assembleItem(value, opts);
        if (built.errors) return { ok: false, errors: built.errors };
        const n = normalizeLedgerEntry(growthEntry(entity, equip ? 'equip' : 'item', built.value, ctx.now));
        if (!n.ok) return { ok: false, errors: n.errors.map((e) => ({ ...e, path: String(e.path || '').replace(/^payload\.?/, '') })) };
        if (equip && effectsDamage(n.value.payload.passive.effects) > COMBAT_RULES.allySkillDamageCap) return { ok: false, errors: [err('template', 'damage-cap')] };
        return { ok: true, result: { entry: n.value }, diagnostics: built.diagnostics };
    }
    if (entity.kind === 'battle-reward') return validateReward(entity, value, ctx);
    // 职业升阶：组装后逐张过卡牌 schema（含预算）；错误路径指向回复的 cards[i]。
    if (entity.kind === 'class-tier') {
        const built = assembleClassTier(value, opts);
        if (built.errors) return { ok: false, errors: built.errors };
        const errors = [];
        const cards = built.value.cards.map((card, i) => {
            const n = normalizeCard(card);
            if (!n.ok) errors.push(...n.errors.map((e) => ({ ...e, path: e.path ? `cards[${i}].${e.path}` : `cards[${i}]` })));
            return n.value;
        });
        if (errors.length) return { ok: false, errors };
        return { ok: true, result: { tier: { classRef: entity.fixed.classRef, tier: entity.fixed.tier, tierName: built.value.tierName, cards } }, diagnostics: built.diagnostics };
    }
    // 人物特性：组装后核对被动伤害上限（与装备同一上限）；错误路径指向回复的 template。
    if (entity.kind === 'trait') {
        const built = assembleTrait(value, opts);
        if (built.errors) return { ok: false, errors: built.errors };
        if (effectsDamage(built.value.passive.effects) > COMBAT_RULES.allySkillDamageCap) return { ok: false, errors: [err('template', 'damage-cap')] };
        return { ok: true, result: { trait: built.value }, diagnostics: built.diagnostics };
    }
    const built = assembleGrowth(value, { key: entity.key, input: entity.input });
    if (built.errors) return { ok: false, errors: built.errors };
    const checked = validateGrowth(entity, built.value, ctx);
    return checked.ok ? { ...checked, diagnostics: [...built.diagnostics, ...(checked.diagnostics || [])] } : checked;
}


function growthEntry(entity, type, payload, now) {
    return { id: ledgerEntryId(type, entity.owner, entity.anchor), type, character: entity.owner, anchor: entity.anchor, payload, createdAt: now };
}

// battle-reward → offer 条目（锚定开战楼，ID 与锚点一一对应）；主套与备用套一起组装、校验；装备被动同样受队友技能伤害上限约束。
function validateReward(entity, value, ctx) {
    const { combatId, tier, exp, reveal, seed, slots, reserve } = entity.fixed;
    const built = assembleReward(value, { key: entity.key, input: { seed, slots, reserve } });
    if (built.errors) return { ok: false, errors: built.errors };
    const payload = { combatId, tier, exp, reveal, slots: built.value.slots, ...(built.value.reserve ? { reserve: built.value.reserve } : {}) };
    const n = normalizeLedgerEntry(growthEntry(entity, 'offer', payload, ctx.now));
    if (!n.ok) return { ok: false, errors: n.errors.map((e) => ({ ...e, path: String(e.path || '').replace(/^payload\.?/, '') })) };
    for (const set of ['slots', 'reserve']) {
        const over = (n.value.payload[set] || []).findIndex((s) => Boolean(s.gear?.passive) && effectsDamage(s.gear.passive.effects) > COMBAT_RULES.allySkillDamageCap);
        if (over >= 0) return { ok: false, errors: [err(`${set}[${over}][1]`, 'damage-cap')] };
    }
    return { ok: true, result: { entry: n.value }, diagnostics: built.diagnostics };
}

// skill-to-card：卡牌 / 技能 ID 由程序分配；upgrade 找不到目标时转为 learn 并记诊断。
function validateGrowth(entity, value, ctx) {
    const { input } = entity;
    const field = input.output;
    const raw = value[field];
    if (!isObj(raw)) return { ok: false, errors: [err(field, 'expected-object')] };
    let mode = input.mode;
    const diagnostics = [];
    if (mode === 'upgrade' && !(input.candidates || []).some((c) => c.id === value.targetId)) {
        mode = 'learn';
        diagnostics.push({ code: 'combat-upgrade-as-learn', key: entity.key, targetId: value.targetId ?? null });
    }
    const id = mode === 'upgrade' ? value.targetId : entity.learnedId;
    const n = field === 'card' ? normalizeCard({ ...raw, id }) : normalizeSkill({ ...raw, id });
    if (!n.ok) return { ok: false, errors: n.errors.map((e) => ({ ...e, path: e.path ? `${field}.${e.path}` : field })) };
    if (field === 'skill' && effectsDamage(n.value.effects) > COMBAT_RULES.allySkillDamageCap) {
        return { ok: false, errors: [err('skill.effects', 'damage-cap', { cap: COMBAT_RULES.allySkillDamageCap })] };
    }
    const payload = mode === 'upgrade' ? { targetId: id, [field]: n.value } : { [field]: n.value };
    return { ok: true, result: { entry: growthEntry(entity, mode, payload, ctx.now) }, diagnostics };
}
const KIND_ORDER = Object.freeze({ class: 0, 'profile-deck': 1, 'profile-skill': 2, enemy: 3, 'profile-init': 4, 'skill-to-card': 5, 'equip-to-passive': 6, 'item-to-consumable': 7, 'battle-reward': 8, 'class-tier': 9, trait: 10 });
const cancelled = (accepted) => ({ ok: false, reason: 'request-stale', accepted: [], rejected: [], diagnostics: [], discarded: accepted.size });

// 本轮回复 → key 到 value；重复 key 只认第一次，请求以外的 key 只记诊断。
function replyValues(raw, keys, diagnostics) {
    const parsed = readGenerationJson(raw);
    if (!parsed.ok || !Array.isArray(parsed.value?.entities)) return { error: parsed.ok ? 'combat-reply-shape' : parsed.reason };
    const values = new Map();
    for (const item of parsed.value.entities) {
        const key = isObj(item) ? item.key : undefined;
        if (!keys.has(key)) diagnostics.push({ code: 'combat-reply-unknown-key', key: typeof key === 'string' ? key.slice(0, 80) : null });
        else if (values.has(key)) diagnostics.push({ code: 'combat-reply-duplicate-key', key });
        else values.set(key, item.value);
    }
    return { values };
}

function rejection(entity, errors) {
    const out = { key: entity.key, kind: entity.kind, role: entity.role, owner: entity.owner, errors: errors.slice(0, 8) };
    // 敌人修正耗尽改用模板敌人（不入库）；主角进入 blocked；队友本次不参战。
    if (entity.kind === 'enemy') out.fallback = { kind: 'template-enemy', profile: templateEnemy(entity.fixed.name, entity.fixed.tier) };
    else if (entity.role === 'protagonist') out.fallback = { kind: 'blocked' };
    else if (entity.role === 'ally') out.fallback = { kind: 'skip' };
    return out;
}

// 生成主流程：首轮提交全部实体，之后每轮只提交仍未通过的实体（附上一轮回复与错误），最多修正 maxRounds 轮。
// request(req, llm) 为注入的副 LLM 调用；signal 中止或迟到的结果一律返回 request-stale，已通过的实体也不交付。
export async function generateEntities(entities, { request, llm = {}, signal, context = {}, classes = [], now = 0, maxRounds = MAX_FIX_ROUNDS } = {}) {
    const ready = resolveCombatLlm(llm);
    if (!ready.ok) return { ok: false, reason: ready.reason, missing: ready.missing, accepted: [], rejected: [], diagnostics: [] };
    if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable', accepted: [], rejected: [], diagnostics: [] };
    const list = [...(Array.isArray(entities) ? entities : [])].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const ctx = { classes: valuesOf(classes), accepted: new Map(), settled: new Set(), now };
    const diagnostics = [];
    const rejected = [];
    const held = new Map();
    let active = list.map((entity) => ({ entity }));
    let requests = 0;
    // 请求本身失败（非回复格式问题）时记下受控原因与 HTTP 状态，供调用方判断能否自动重试；不含上游正文。
    let requestFailure = null;

    const settle = (entity, value) => {
        const checked = validateEntity(entity, value, ctx);
        if (checked.deferred) return { deferred: true };
        if (checked.ok) {
            ctx.accepted.set(entity.key, checked.result);
            ctx.settled.add(entity.key);
            diagnostics.push(...(checked.diagnostics || []));
            return { ok: true };
        }
        return { ok: false, errors: checked.errors };
    };

    for (let round = 0; round <= maxRounds && (active.length || held.size); round += 1) {
        const next = [];
        if (active.length) {
            if (signal?.aborted) return cancelled(ctx.accepted);
            let raw;
            try {
                requests += 1;
                raw = await request(buildGenerationRequest(active, { context, classes: ctx.classes }), { ...ready.llm, ...(signal ? { signal } : {}) });
            } catch (error) {
                if (signal?.aborted || error?.reason === 'request-stale') return cancelled(ctx.accepted);
                const detail = String(error?.message || error).slice(0, 160);
                requestFailure = { reason: typeof error?.reason === 'string' ? error.reason : 'request-failed', ...(Number.isInteger(error?.status) ? { status: error.status } : {}) };
                for (const slot of [...active, ...held.values()]) rejected.push(rejection(slot.entity, [err('', 'combat-llm-request-failed', { detail })]));
                active = [];
                held.clear();
                break;
            }
            if (signal?.aborted) return cancelled(ctx.accepted);
            const reply = replyValues(raw, new Set(active.map((s) => s.entity.key)), diagnostics);
            for (const slot of active) {
                const { entity } = slot;
                if (reply.error) {
                    next.push({ entity, previous: slot.previous, errors: [err('', reply.error)] });
                    continue;
                }
                if (!reply.values.has(entity.key)) {
                    if (entity.optional) ctx.settled.add(entity.key);
                    else next.push({ entity, previous: slot.previous, errors: [err('', 'entity-missing')] });
                    continue;
                }
                const value = reply.values.get(entity.key);
                const outcome = settle(entity, value);
                if (outcome.deferred) held.set(entity.key, { entity, value });
                else if (!outcome.ok) next.push({ entity, previous: value, errors: outcome.errors });
            }
        }
        // 等职业结论的卡组角色：职业已通过或已无法通过时重核，不重新提交尚未被拒的回复。
        const lastRound = round === maxRounds;
        for (const [key, slot] of [...held]) {
            const classKey = slot.entity.classKey;
            if (lastRound && !ctx.settled.has(classKey)) ctx.settled.add(classKey);
            const outcome = settle(slot.entity, slot.value);
            if (outcome.deferred) continue;
            held.delete(key);
            if (!outcome.ok) next.push({ entity: slot.entity, previous: slot.value, errors: outcome.errors });
        }
        if (lastRound) {
            for (const slot of next) rejected.push(rejection(slot.entity, slot.errors));
            active = [];
        } else active = next;
    }
    for (const slot of held.values()) rejected.push(rejection(slot.entity, [err('classRef', 'class-unknown')]));

    const accepted = list.filter((e) => ctx.accepted.has(e.key))
        .map((e) => ({ key: e.key, kind: e.kind, role: e.role, owner: e.owner, ...ctx.accepted.get(e.key) }));
    return {
        ok: rejected.length === 0,
        accepted,
        rejected,
        diagnostics,
        requests,
        blocked: rejected.some((r) => r.fallback?.kind === 'blocked'),
        ...(requestFailure ? { requestFailure } : {}),
    };
}

// 待落账内容：通过的档案进档案表，成长条目进日志表；模板敌人不入库，由会话在内存中使用。
export function generationWrites(result, { createdAt = 0 } = {}) {
    const profiles = [];
    const entries = [];
    for (const item of result?.accepted || []) {
        if (item.profile) profiles.push(profileRecord(item.profile, { createdAt }));
        if (item.entry) entries.push(item.entry);
    }
    return { profiles, entries };
}





