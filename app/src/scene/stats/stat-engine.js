// 检定引擎（数值 v2 §2、§4、§5）：所有掷骰都从这里进，按设置取规则体系；底数只读不改。
// actor 为 PROTAGONIST 时读主角存档，其余读聊天级 NPC 角色卡（没有卡按普通人默认）。纯函数，random 由调用方给。
import { getRuleset } from './rulesets/index.js';
import { BUILTIN_SKILLS, COMBAT_SKILLS, CATEGORY_BASE, baseValueOf, createSkillRegistry, guessAttribute } from './stat-registry.js';
import { BASE_ATTRIBUTES, clamp, withSkills } from './stat-state.js';
import { stageOf } from './stat-favor.js';
import { checkModifiers } from './stat-bars.js';

export const PROTAGONIST = '主角';
export const DIFFICULTIES = Object.freeze(['简单', '普通', '困难', '极难']);
export const RANKS = Object.freeze(['普通人', '老手', '精英', '大师', '传奇']);
export const GROWTH_RANK_AT = Object.freeze([0, 10, 25, 45, 70]);
const NPC_DEFAULT_ATTRIBUTE = 50;
const FAVOR_EDGE = Object.freeze({ 深爱: 1, 强烈在意: 1, 厌烦排斥: -1, 强烈反感: -1, 仇恨: -2 });
const SOCIAL_SKILLS = new Set(['话术', '魅惑', '恐吓', '魅力']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角|我|user)$/i;

// catalog：{ story, merged, sheets, protagonistBase }。settings：normalizeStatsSettings 的结果。
export function createEngine(catalog = {}, settings = {}, ruleset = settings.ruleset) {
    return {
        ruleset: getRuleset(ruleset),
        registry: createSkillRegistry(catalog),
        sheets: catalog.sheets && typeof catalog.sheets === 'object' ? catalog.sheets : {},
        protagonistBase: catalog.protagonistBase && typeof catalog.protagonistBase === 'object' ? catalog.protagonistBase : {},
        natural: Boolean(settings.dndNatural),
    };
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
    const found = engine.registry.get(skill);
    if (found) return found;
    return { kind: 'skill', attribute: guessAttribute(skill) || '敏捷', category: 'general', aliases: [], origin: 'custom' };
}

function protagonistAttributes(state) {
    const skills = (state && state.protagonist && state.protagonist.skills) || {};
    return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Number(skills[name] && skills[name].value) || 50]));
}

function npcAttributes(sheet) {
    const own = (sheet && sheet.attributes) || {};
    return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Number(own[name]) || NPC_DEFAULT_ATTRIBUTE]));
}

// 没有该技能的 NPC 按所属属性估临时值（§6.2 第一层）：属性很高给「熟练」中值，较高给「入门」中值。
export function provisionalSkillValue(attributeValue, base) {
    const a = Number(attributeValue) || 0;
    if (a >= 75) return 60;
    if (a >= 60) return 35;
    return base;
}

// 返回 { skill, kind, value, learned, attributeValue, rank, entry, provisional }。
export function profileOf(engine, state, actor, skill) {
    const entry = entryOf(engine, skill);
    if (isProtagonist(actor)) {
        const attrs = protagonistAttributes(state);
        const owned = state && state.protagonist && state.protagonist.skills[skill];
        const rank = rankOfGrowth(state && state.protagonist && state.protagonist.growth);
        if (entry.kind === 'attribute') return { skill, kind: 'attribute', value: attrs[skill], learned: true, attributeValue: attrs[skill], rank, entry };
        const backfilled = Number(engine.protagonistBase[skill]);
        const value = owned ? Number(owned.value) || 0 : (Number.isFinite(backfilled) && backfilled > 0 ? backfilled : baseValueOf(entry, attrs));
        return { skill, kind: 'skill', value, learned: Boolean(owned) || backfilled > 0, attributeValue: attrs[entry.attribute], rank, entry };
    }
    const sheet = engine.sheets[actor] || null;
    const attrs = npcAttributes(sheet);
    const rank = (sheet && sheet.rank) || RANKS[0];
    if (entry.kind === 'attribute') return { skill, kind: 'attribute', value: attrs[skill], learned: true, attributeValue: attrs[skill], rank, entry };
    const own = sheet && sheet.skills && Number(sheet.skills[skill]);
    if (own > 0) return { skill, kind: 'skill', value: own, learned: true, attributeValue: attrs[entry.attribute], rank, entry, provisional: Boolean(sheet.provisional && sheet.provisional[skill]) };
    const base = baseValueOf(entry, attrs);
    const value = provisionalSkillValue(attrs[entry.attribute], base);
    return { skill, kind: 'skill', value, learned: value !== base, attributeValue: attrs[entry.attribute], rank, entry, provisional: true };
}

export function isSocialSkill(engine, skill) {
    const entry = engine.registry.get(skill);
    return Boolean(entry && entry.social) || SOCIAL_SKILLS.has(skill);
}

// 修正（§4.6）：生活条惩罚、队友、好感、额外修正合成净优势值；压力折成 shift。D&D 只看符号。
export function modifiersOf(engine, state, { actor, skill, toward, ally, edge = 0 } = {}) {
    const notes = [];
    let net = Number(edge) || 0;
    let shift = 0;
    if (isProtagonist(actor) && state && state.protagonist) {
        const mods = checkModifiers(state.protagonist.bars);
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
        actor, skill, kind: profile.kind, value: profile.value, learned: profile.learned,
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

// 预掷（§5.2）：生成开始时掷一颗骰，存原始骰面；结算时按标签用同一颗骰重算。
export function rollPreroll(engine, random) {
    return { ruleset: engine.ruleset.ID, raw: engine.ruleset.rawRoll(random, engine.ruleset.EDGE_MAX || 0) };
}

function passTier(engine, state, request, raw) {
    for (const difficulty of ['极难', '困难', '普通', '简单']) {
        if (resolveCheck(engine, state, { ...request, difficulty, raw }, null).success) return difficulty;
    }
    return null;
}

const TIER_LINE = Object.freeze({ 极难: '能过到极难', 困难: '能过到困难', 普通: '能过普通', 简单: '只能过简单' });

// 预掷结果表：只给结论不给骰面。present：在场已登记角色（最多 3 个）。
export function prerollTable(engine, state, preroll, { present = [] } = {}) {
    if (!preroll || preroll.ruleset !== engine.ruleset.ID) return null;
    const raw = preroll.raw;
    const groups = { 极难: [], 困难: [], 普通: [], 简单: [], 失败: [] };
    const owned = Object.keys((state && state.protagonist && state.protagonist.skills) || {});
    for (const skill of owned) groups[passTier(engine, state, { actor: PROTAGONIST, skill }, raw) || '失败'].push(skill);
    const lines = [];
    for (const key of ['极难', '困难', '普通', '简单']) if (groups[key].length) lines.push(`${TIER_LINE[key]}：${groups[key].join('、')}`);
    if (groups.失败.length) lines.push(`失败：${groups.失败.join('、')}`);
    if (engine.ruleset.ID === 'coc7') {
        const parts = [];
        for (const category of ['daily', 'general', 'pro']) {
            const probe = { kind: 'skill', attribute: '敏捷', category, aliases: [] };
            const value = CATEGORY_BASE[category];
            const r = engine.ruleset.resolve({ kind: 'skill', value, learned: false, attributeValue: 50, rank: RANKS[0], entry: probe }, { difficulty: '普通', edge: 0 }, raw);
            const easy = engine.ruleset.resolve({ kind: 'skill', value, learned: false, attributeValue: 50, rank: RANKS[0], entry: probe }, { difficulty: '简单', edge: 0 }, raw);
            parts.push(`${{ daily: '日常类', general: '通用类', pro: '专业类' }[category]}${r.success ? '能过普通' : easy.success ? '只能过简单' : '失败'}`);
        }
        lines.push(`未学的技能：${parts.join('，')}`);
    } else {
        lines.push('未学的技能：按所属属性那一项算');
    }
    for (const name of present.slice(0, 3)) {
        const offense = [];
        for (const skill of ['话术', '魅惑', '潜行']) {
            const r = resolveCheck(engine, state, { actor: PROTAGONIST, skill, against: name, raw }, null);
            offense.push(`${skill}${r.success ? '成功' : '失败'}`);
        }
        const see = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '心理学', against: name, opposedSkill: '话术', raw }, null);
        const dodge = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '闪避', against: name, opposedSkill: '格斗', raw }, null);
        lines.push(`对${name}：${offense.join('，')}；${name}骗主角时主角${see.success ? '能识破' : '识不破'}，${name}动手时主角${dodge.success ? '能躲开' : '躲不开'}`);
    }
    return { lines };
}

// 按预掷骰面与 roll 标签重算（结算时用）。tag：{ skill, difficulty, against, opposedSkill }。
export function checkFromPreroll(engine, state, preroll, tag) {
    if (!preroll || !tag || !tag.skill) return null;
    return resolveCheck(engine, state, { actor: tag.actor || PROTAGONIST, skill: tag.skill, difficulty: tag.difficulty, against: tag.against, opposedSkill: tag.opposedSkill, raw: preroll.raw, source: 'roll' }, null);
}

// 主角检定成功打成长勾；未学技能成功后登记进存档（「用过就会」），起点为当时的检定底数（§6.1）。
export function markGrowth(state, check) {
    if (!check || !check.success || !isProtagonist(check.actor) || !state || !state.protagonist) return state;
    const skills = state.protagonist.skills;
    const own = skills[check.skill];
    if (own) return own.marked ? state : withSkills(state, { ...skills, [check.skill]: { ...own, marked: true } });
    if (check.kind === 'attribute') return state;
    const value = clamp(Math.round(Number(check.value) || 1), 1, 99);
    return withSkills(state, { ...skills, [check.skill]: { value, marked: true } });
}

// 战斗技能：已学的里取最高；属性始终可用。
export function bestCombatSkill(engine, state, names = COMBAT_SKILLS) {
    let best = null;
    for (const name of names) {
        const entry = BUILTIN_SKILLS[name] || engine.registry.get(name);
        const owned = state.protagonist.skills[name];
        if (entry && entry.kind !== 'attribute' && !owned) continue;
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
