// 正文检定：AI 在正文里写 [igs-check:角色|属性或技能|DC|优势/劣势]，骰子由前端按「楼序号 + swipe」预掷，
// 同一楼重放结果恒定。本模块负责骰序生成、标签扫描、结果重放、与正文成败措辞的核对，以及检定提示词段。
import { hash32, randomInt } from '../combat/random.js';
import { ABILITY_KEYS, ABILITY_LABELS, abilityKeyOf } from '../combat/abilities.js';
import { D20_DC_RANGE, d20Bonus, d20Outcome } from '../choices/dice-check.js';
import { combatExpansionEnabled } from './combat-prompt.js';

export const CHECK_ROLL_COUNT = 10;
export const CHECK_ROLLS_SEGMENT_ID = 'igs-check-rolls';
export const CHECK_ACTOR_MAX = 6;
const CHECK_TAG = /\[igs-check:([^\]\n]*)\]/g;
const WRITTEN_WINDOW = 40;
const SKILL_NAME_MAX = 20;
const WRITTEN_RESULT = /大成功|大失败|成功|失败/;
// 这些生成方式会重写/续写已有的 AI 楼，序号不加一。
const REWRITE_TYPES = new Set(['swipe', 'regenerate', 'continue']);
// 这些生成方式不产生新楼，不预掷。
const NO_FLOOR_TYPES = new Set(['impersonate', 'quiet']);
const EDGE_WORDS = Object.freeze({ 优势: 1, 优: 1, 劣势: -1, 劣: -1 });

const asArray = (value) => (Array.isArray(value) ? value : []);
const isAiFloor = (message) => !!message && typeof message === 'object' && !(message.is_user ?? message.user);
const signed = (value) => (value >= 0 ? `+${value}` : `${value}`);
const swipeOf = (message) => (Number.isSafeInteger(message?.swipe_id) && message.swipe_id > 0 ? message.swipe_id : 0);
// 全角数字转半角。
const toHalfWidthDigits = (text) => String(text ?? '').replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248));

// 即将生成的这一楼是第几个 AI 楼（从 1 起）；不产生新楼返回 null。
export function upcomingCheckOrdinal(messages, generationType = null) {
    if (NO_FLOOR_TYPES.has(generationType)) return null;
    const list = asArray(messages);
    const aiCount = list.filter(isAiFloor).length;
    return REWRITE_TYPES.has(generationType) && isAiFloor(list.at(-1)) ? aiCount : aiCount + 1;
}

// 已有楼层是第几个 AI 楼；不是 AI 楼返回 null。
export function floorCheckOrdinal(messages, index) {
    const list = asArray(messages);
    const at = Number(index);
    if (!Number.isSafeInteger(at) || at < 0 || at >= list.length || !isAiFloor(list[at])) return null;
    return list.slice(0, at + 1).filter(isAiFloor).length;
}

// 即将生成这一楼时的 swipe 序号。
export function upcomingCheckSwipe(messages, generationType = null) {
    if (NO_FLOOR_TYPES.has(generationType)) return null;
    const last = asArray(messages).at(-1);
    return (generationType === 'swipe' || generationType === 'continue') && isAiFloor(last) ? swipeOf(last) : 0;
}

export function floorCheckSwipe(messages, index) {
    const list = asArray(messages);
    const at = Number(index);
    return !Number.isSafeInteger(at) || at < 0 || at >= list.length || !isAiFloor(list[at]) ? null : swipeOf(list[at]);
}

// 第 ordinal 个 AI 楼在消息数组里的下标，找不到 -1。
export function floorIndexOfOrdinal(messages, ordinal) {
    let seen = 0;
    const list = asArray(messages);
    for (let i = 0; i < list.length; i += 1) {
        if (isAiFloor(list[i]) && ++seen === ordinal) return i;
    }
    return -1;
}

// 某楼的 10 个 d20 骰值（1~20）。
export function checkRollsFor(chatKey, ordinal, swipe = 0) {
    const key = String(chatKey ?? '').trim();
    if (!key || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    const swipeId = Number.isSafeInteger(swipe) && swipe > 0 ? swipe : 0;
    let state = hash32(swipeId ? `igs-check|${key}|${ordinal}|s${swipeId}` : `igs-check|${key}|${ordinal}`);
    const rolls = [];
    for (let i = 0; i < CHECK_ROLL_COUNT; i += 1) {
        const roll = randomInt(state, 20);
        state = roll.state;
        rolls.push(roll.value + 1);
    }
    return rolls;
}

// 每个判定一对骰（第二颗用于优劣势）：[主骰, 备骰]。
export function checkRollPairsFor(chatKey, ordinal, swipe = 0) {
    const primary = checkRollsFor(chatKey, ordinal, swipe);
    if (!primary) return null;
    const swipeId = Number.isSafeInteger(swipe) && swipe > 0 ? swipe : 0;
    let state = hash32(`igs-check-b|${String(chatKey).trim()}|${ordinal}|s${swipeId}`);
    return primary.map((first) => {
        const second = randomInt(state, 20);
        state = second.state;
        return [first, second.value + 1];
    });
}

// edge>0 取较大、<0 取较小、0 取第一颗；单个数字按两颗相同处理。
export function pickDie(roll, edge = 0) {
    const [first, second] = Array.isArray(roll) ? roll : [roll, roll];
    return edge > 0 ? Math.max(first, second) : edge < 0 ? Math.min(first, second) : first;
}

const isDie = (value) => Number.isInteger(value) && value >= 1 && value <= 20;
const isRollSet = (rolls) => Array.isArray(rolls) && rolls.length === CHECK_ROLL_COUNT
    && rolls.every((roll) => (Array.isArray(roll) ? roll.length === 2 && roll.every(isDie) : isDie(roll)));

// 扫描正文里的检定标签，返回 { tags, diagnostics }；无效标签也会列出（valid=false）。
export function scanCheckTags(body) {
    const tags = [];
    const diagnostics = [];
    for (const match of String(body || '').matchAll(CHECK_TAG)) {
        const fields = match[1].split('|').map((field) => field.trim());
        const [actor = '', abilityText = '', dcText = '', edgeText = ''] = fields;
        const ability = abilityKeyOf(abilityText);
        // 不是六维时，不含数字的短词当作技能名。
        const skill = !ability && abilityText && abilityText.length <= SKILL_NAME_MAX && !/[0-9０-９]/.test(abilityText) ? abilityText : null;
        const dc = Number(toHalfWidthDigits(dcText).replace(/^dc\s*[=＝:：]?\s*/i, ''));
        const edge = edgeText ? EDGE_WORDS[edgeText] : 0;
        let problem = null;
        if (fields.length < 3 || fields.length > 4) problem = 'field-count';
        else if (!actor) problem = 'actor-missing';
        else if (!ability && !skill) problem = 'unknown-ability';
        else if (!dcText || !Number.isInteger(dc) || dc < D20_DC_RANGE[0] || dc > D20_DC_RANGE[1]) problem = 'invalid-dc';
        else if (edge === undefined) problem = 'invalid-edge';
        const order = tags.length + 1;
        tags.push({ order, actor, ability, skill, dc: problem ? null : dc, edge: problem ? 0 : edge, valid: !problem, raw: match[0], index: match.index, end: match.index + match[0].length });
        if (problem) diagnostics.push({ code: 'check-tag-invalid', problem, order, raw: match[0], index: match.index });
    }
    return { tags, diagnostics };
}

// 回调都可能抛错或返回垃圾，这里统一兜底。
function safeCall(fn, ...args) {
    if (typeof fn !== 'function') return null;
    try {
        return fn(...args);
    } catch {
        return null;
    }
}

// 按预掷的骰子重放正文里的全部检定。
// readAbilities(actor) 取角色能力；resolveSkill(actor, skill, abilities) 取技能的 { ability, bonus }；
// edgeOf / shiftOf 给出持续的优劣势与检定修正。
export function replayChecks({ body, rolls, readAbilities, resolveSkill, edgeOf, shiftOf } = {}) {
    const text = String(body || '');
    const { tags, diagnostics } = scanCheckTags(text);
    const results = [];
    if (!tags.length) return { results, diagnostics };
    if (!isRollSet(rolls)) return { results, diagnostics: [...diagnostics, { code: 'check-rolls-missing' }] };
    tags.forEach((tag, position) => {
        if (tag.order > CHECK_ROLL_COUNT) {
            diagnostics.push({ code: 'check-over-limit', order: tag.order, raw: tag.raw, index: tag.index });
            return;
        }
        if (!tag.valid) return;
        const roll = rolls[tag.order - 1];
        let edge = tag.edge;
        const ongoingEdge = safeCall(edgeOf, tag.actor, tag);
        if (ongoingEdge != null && Number.isFinite(Number(ongoingEdge))) edge = Math.sign(Number(ongoingEdge));
        const die = pickDie(roll, edge);
        const abilities = safeCall(readAbilities, tag.actor);
        let ability = tag.ability;
        let bonus = null;
        if (tag.skill) {
            if (!abilities) {
                diagnostics.push({ code: 'check-actor-unknown', actor: tag.actor, order: tag.order, index: tag.index });
                return;
            }
            const skill = safeCall(resolveSkill, tag.actor, tag.skill, abilities);
            if (!skill || !abilityKeyOf(skill.ability) || !Number.isFinite(Number(skill.bonus))) {
                diagnostics.push({ code: 'check-tag-invalid', problem: 'unknown-ability', order: tag.order, raw: tag.raw, index: tag.index });
                return;
            }
            ability = abilityKeyOf(skill.ability);
            bonus = Math.round(Number(skill.bonus));
        } else {
            bonus = d20Bonus(abilities, ability);
        }
        if (bonus === null) {
            diagnostics.push({ code: 'check-actor-unknown', actor: tag.actor, order: tag.order, index: tag.index });
            return;
        }
        let shift = 0;
        try {
            shift = typeof shiftOf === 'function' ? Math.round(Number(shiftOf(tag.actor, tag)) || 0) : 0;
        } catch {
            shift = 0;
        }
        bonus += shift;
        const outcome = d20Outcome(die, bonus, tag.dc);
        // 标签后一小段里写的成败，要和实际结果一致。
        const segmentEnd = position + 1 < tags.length ? tags[position + 1].index : text.length;
        const written = text.slice(tag.end, Math.min(segmentEnd, tag.end + WRITTEN_WINDOW)).match(WRITTEN_RESULT)?.[0] || null;
        const mismatch = written !== null && written.includes('成功') !== outcome.success;
        const dice = Array.isArray(roll) ? [...roll] : [roll, roll];
        results.push({ order: tag.order, actor: tag.actor, ability, skill: tag.skill, label: tag.skill || ABILITY_LABELS[ability], dc: tag.dc, edge, dice, die, bonus, total: outcome.total, tier: outcome.tier, success: outcome.success, written, mismatch, index: tag.index });
        if (mismatch) diagnostics.push({ code: 'check-mismatch', order: tag.order, actor: tag.actor, written, tier: outcome.tier, index: tag.index });
    });
    return { results, diagnostics };
}

// 某角色六维的检定加值；任何一项读不到返回 null。
export function checkActorBonuses(abilities) {
    const bonuses = {};
    for (const key of ABILITY_KEYS) {
        const bonus = d20Bonus(abilities, key);
        if (bonus === null) return null;
        bonuses[key] = bonus;
    }
    return bonuses;
}

const edgeLabel = (edge) => (edge > 0 ? '优势' : edge < 0 ? '劣势' : '');

// 正文成败措辞与实际结果不符时，生成给下一层看的更正句。
export function checkCorrections(results) {
    return (Array.isArray(results) ? results : [])
        .filter((result) => result && result.mismatch)
        .map((result) => `${result.actor}的${result.label}检定（DC ${result.dc}${result.edge ? `，${edgeLabel(result.edge)}` : ''}）实际为 ${result.die}${signed(result.bonus)}=${result.total}【${result.tier}】，正文写成了「${result.written}」`);
}

const formatRoll = (roll) => (Array.isArray(roll) ? `${roll[0]}/${roll[1]}` : String(roll));

export function formatActorBonuses(abilities) {
    const bonuses = checkActorBonuses(abilities);
    return bonuses ? ABILITY_KEYS.map((key) => `${ABILITY_LABELS[key]}${signed(bonuses[key])}`).join(' ') : '';
}

// 合并两份检定输入：以 primary 为主，补上 fallback 里没有的角色，更正优先取 primary 的。
export function mergeCheckInputs(primary, fallback) {
    if (!primary) return fallback || null;
    const known = new Set((primary.actors || []).map((actor) => actor.name));
    const extra = ((fallback && fallback.actors) || []).filter((actor) => actor && !known.has(actor.name));
    const corrections = primary.corrections && primary.corrections.length ? primary.corrections : (fallback && fallback.corrections) || [];
    return { ...primary, actors: [...(primary.actors || []), ...extra], corrections };
}

export const CHECK_ROLLS_TEMPLATE = [
    `【检定】角色做结果不确定、失败有后果的事时都要检定：动手（搬、爬、躲、打、追）、察觉与搜寻、偷偷行事、技艺与专业活，以及靠言语办事（说服、讨价还价、撒谎、求情、威胁、撩人、表白、看穿对方）。毫无悬念的日常举动不检定。在行动处写 [igs-check:角色|属性或技能|DC]，本次行动另有优势或劣势时写 [igs-check:角色|属性或技能|DC|优势] 或 [igs-check:角色|属性或技能|DC|劣势]：属性只写 力量/敏捷/体质/智力/感知/魅力 之一，技能写其名称（按所属属性加值，学过的再加熟练）；DC 写 ${D20_DC_RANGE[0]}–${D20_DC_RANGE[1]} 的整数（10 容易、15 中等、20 困难、25 极难）。DC 按情境定，不看骰序：10 指正常条件下的寻常事；15 指有一项不利（时间紧、有人阻挠、环境恶劣、对方戒备）；20 指多项不利叠加或任务本身超出常规；25 指常人几乎做不到的事。好感、关系与角色意愿用优势或劣势体现，不调 DC。本层骰序（每个判定一对 d20，按判定出现顺序依次取用，第 1 个判定用第 1 对）：{{骰序}}。`,
    `取值：没有优劣势用斜线前的骰值；优势取两颗中较大的，劣势取较小的；优势与劣势同时成立时互相抵消。结果 = 取用的骰值 + 该角色该属性或技能的加值，达到 DC 为成功；骰值 20 为大成功、1 为大失败。标签后紧接着按结果写剧情走向，成功与失败都推进剧情；本层有几处这样的行动就写几个判定，最多 ${CHECK_ROLL_COUNT} 个；正文不写骰值和算式。`,
    '{{优劣势}}',
    '{{在场加值}}',
    '{{更正}}',
].join('\n');

// 组装模板变量；骰子不合法返回 null。
export function checkRollsVars({ rolls, actors = [], edges = [], corrections = [] } = {}) {
    if (!isRollSet(rolls)) return null;
    const bonusLines = [];
    for (const actor of (Array.isArray(actors) ? actors : []).slice(0, CHECK_ACTOR_MAX)) {
        const line = actor && actor.name ? formatActorBonuses(actor.attr) : '';
        if (line) bonusLines.push(`${actor.name}：${line}`);
    }
    const edgeLines = (Array.isArray(edges) ? edges : [])
        .filter((item) => item && item.name && (Math.sign(Number(item.edge) || 0) || Math.round(Number(item.shift) || 0)))
        .slice(0, CHECK_ACTOR_MAX)
        .map((item) => {
            const shift = Math.round(Number(item.shift) || 0);
            const parts = [edgeLabel(Math.sign(Number(item.edge) || 0)), shift ? `检定${signed(shift)}` : ''].filter(Boolean).join('、');
            return `${item.name}${parts}${Array.isArray(item.reasons) && item.reasons.length ? `（${item.reasons.join('、')}）` : ''}`;
        });
    return {
        骰序: rolls.map(formatRoll).join('、'),
        优劣势: edgeLines.length ? `持续的优劣势（前端自动计入这些人物本层的每次检定，与第 4 栏叠加，相反时抵消；第 4 栏不必重复写）：${edgeLines.join('；')}。` : '',
        在场加值: bonusLines.length ? `在场人物加值（已含熟练）：\n${bonusLines.join('\n')}\n未列出的人物由前端按其强弱估算。` : '',
        更正: Array.isArray(corrections) && corrections.length ? `更正：上一层${corrections.join('；')}；以前端结果为准，本层剧情按实际结果衔接。` : '',
    };
}

// 填模板变量；只含变量且变量为空的整行会被删掉，未知变量原样保留。
export function fillCheckRolls(template, vars) {
    const table = vars || {};
    return String(template ?? '').split('\n').map((line) => {
        let replaced = false;
        const filled = line.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (whole, name) => {
            if (!Object.hasOwn(table, name)) return whole;
            replaced = true;
            return String(table[name] ?? '');
        });
        return replaced && !filled.trim() ? null : filled;
    }).filter((line) => line !== null).join('\n');
}

// 检定提示词段：战斗开启或数值系统开启，且骰子合法时才有。
export function resolveCheckRollsSegment(settings, options = {}) {
    const input = options || {};
    const { rolls, statsActive = false } = input;
    if (!combatExpansionEnabled(settings) && statsActive !== true) return null;
    if (!isRollSet(rolls)) return null;
    return {
        id: CHECK_ROLLS_SEGMENT_ID,
        position: 'depth0',
        depth: 0,
        content: fillCheckRolls(CHECK_ROLLS_TEMPLATE, checkRollsVars(input)),
        keys: ['check-rolls'],
        rolls: rolls.map((roll) => (Array.isArray(roll) ? [...roll] : roll)),
    };
}
