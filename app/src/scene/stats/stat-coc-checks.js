// CoC第七版的正文检定（数值侧自有，不改 check-rolls.js）：思路与 d20 版相同，
// AI 在正文里写 [igs-check:角色|属性或技能|难度|奖惩]，骰子由前端按「楼序号 + swipe」预掷并告诉 AI，同一楼重放结果恒定。
// 一个判定对应一组百分骰：个位 1 颗、十位 3 颗（基础、奖励/惩罚各备 2 颗），按难度与奖惩取用。
import { hash32, randomInt } from '../../combat/random.js';
import { ABILITY_LABELS, abilityKeyOf } from '../../combat/abilities.js';
import * as coc7 from './rulesets/coc7.js';
import { CHECK_ROLL_COUNT, CHECK_ROLLS_SEGMENT_ID, fillCheckRolls } from '../check-rolls.js';

export { CHECK_ROLL_COUNT, CHECK_ROLLS_SEGMENT_ID };
export { floorCheckOrdinal, floorCheckSwipe, upcomingCheckOrdinal, upcomingCheckSwipe } from '../check-rolls.js';
export const COC_SAN_LABEL = '理智';
export const COC_CHECK_ACTOR_MAX = 6;
export const COC_EDGE_MAX = coc7.EDGE_MAX;
const COC_CHECK_TAG = /\[igs-check:([^\]\n]*)\]/g;
const WRITTEN_WINDOW = 40;
const SKILL_NAME_MAX = 20;
const WRITTEN_RESULT = /大成功|大失败|成功|失败/;
const SKILL_LINE_MAX = 4;
const SKILL_LINE_FROM = 60;
const TENS_PER_ROLL = 3;
// 标签里的难度词；「常规」按普通。数字 DC 是 d20 的写法，CoC 下无效。
const DIFFICULTY_WORDS = Object.freeze({ 普通: '普通', 常规: '普通', 困难: '困难', 极难: '极难' });
// 奖惩词：奖励 / 惩罚各 1–2 颗；优势、劣势视同 1 颗。
const EDGE_WORDS = Object.freeze({ 奖励: 1, 奖励1: 1, 奖励2: 2, 惩罚: -1, 惩罚1: -1, 惩罚2: -2, 优势: 1, 劣势: -1 });

const asArray = (value) => (Array.isArray(value) ? value : []);
const clampEdge = (value) => Math.max(-COC_EDGE_MAX, Math.min(COC_EDGE_MAX, Math.round(Number(value) || 0)));
const valueOf = (unit, ten) => (ten === 0 && unit === 0 ? 100 : ten * 10 + unit);
const pad2 = (n) => String(n).padStart(2, '0');
const edgeText = (edge) => (edge > 0 ? `奖励${edge > 1 ? edge : ''}` : edge < 0 ? `惩罚${edge < -1 ? -edge : ''}` : '');

// 某楼的 10 组百分骰：[{ unit, tens: [t0, t1, t2] }]，各颗取 0–9。
export function cocCheckRollsFor(chatId, ordinal, swipe = 0) {
    const key = String(chatId ?? '').trim();
    if (!key || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    const swipeId = Number.isSafeInteger(swipe) && swipe > 0 ? swipe : 0;
    let state = hash32(swipeId ? `igs-check-coc|${key}|${ordinal}|s${swipeId}` : `igs-check-coc|${key}|${ordinal}`);
    const draw = () => {
        const r = randomInt(state, 10);
        state = r.state;
        return r.value;
    };
    const rolls = [];
    for (let i = 0; i < CHECK_ROLL_COUNT; i += 1) {
        const unit = draw();
        rolls.push({ unit, tens: Array.from({ length: TENS_PER_ROLL }, draw) });
    }
    return rolls;
}

const isDigit = (value) => Number.isInteger(value) && value >= 0 && value <= 9;
const isCocRoll = (roll) => !!roll && typeof roll === 'object' && isDigit(roll.unit) && Array.isArray(roll.tens) && roll.tens.length === TENS_PER_ROLL && roll.tens.every(isDigit);
export const isCocRollSet = (rolls) => Array.isArray(rolls) && rolls.length === CHECK_ROLL_COUNT && rolls.every(isCocRoll);

// 骰面：base 为不加骰的结果，bonus[0..1] 为取 1、2 颗奖励骰后的结果（十位取小），penalty 同理取大。00+0 记 100。
export function cocFaces(raw) {
    const totals = raw.tens.map((ten) => valueOf(raw.unit, ten));
    return {
        base: totals[0],
        bonus: [Math.min(totals[0], totals[1]), Math.min(...totals)],
        penalty: [Math.max(totals[0], totals[1]), Math.max(...totals)],
    };
}

// 提示词里的一项：37（奖17/07，罚57/87）。
export function formatCocRoll(raw) {
    const f = cocFaces(raw);
    return `${pad2(f.base)}（奖${f.bonus.map(pad2).join('/')}，罚${f.penalty.map(pad2).join('/')}）`;
}

// 扫描正文里的检定标签，返回 { tags, diagnostics }；无效标签也会列出（valid=false）。
export function scanCocCheckTags(body) {
    const tags = [];
    const diagnostics = [];
    for (const match of String(body || '').matchAll(COC_CHECK_TAG)) {
        const fields = match[1].split('|').map((field) => field.trim());
        const [actor = '', abilityText = '', difficultyText = '', edgeField = ''] = fields;
        const key = abilityKeyOf(abilityText);
        const isSan = abilityText === COC_SAN_LABEL;
        // 六维记能力键，理智与其他不含数字的短词当作技能名（理智在 CoC 是属性，由引擎认）。
        const skill = !key && abilityText && abilityText.length <= SKILL_NAME_MAX && !/[0-9０-９]/.test(abilityText) ? abilityText : null;
        const difficulty = Object.hasOwn(DIFFICULTY_WORDS, difficultyText) ? DIFFICULTY_WORDS[difficultyText] : null;
        const edge = edgeField ? EDGE_WORDS[edgeField] : 0;
        let problem = null;
        if (fields.length < 3 || fields.length > 4) problem = 'field-count';
        else if (!actor) problem = 'actor-missing';
        else if (!key && !skill) problem = 'unknown-ability';
        else if (!difficulty) problem = 'invalid-difficulty';
        else if (edge === undefined) problem = 'invalid-edge';
        const order = tags.length + 1;
        tags.push({
            order, actor, ability: key, skill, san: isSan, difficulty: problem ? null : difficulty, edge: problem ? 0 : edge,
            valid: !problem, raw: match[0], index: match.index, end: match.index + match[0].length,
        });
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
// profileOf(actor, 名称) 取检定对象（{ kind, value, learned, attributeValue, rank, entry }），名称是六维中文名、理智或技能名；
// edgeOf / shiftOf 给出持续的奖惩骰（与标签叠加，最多 2 颗）与目标值修正。
export function replayCocChecks({ body, rolls, ruleset = coc7, profileOf, edgeOf, shiftOf } = {}) {
    const text = String(body || '');
    const { tags, diagnostics } = scanCocCheckTags(text);
    const results = [];
    if (!tags.length) return { results, diagnostics };
    if (!isCocRollSet(rolls)) return { results, diagnostics: [...diagnostics, { code: 'check-rolls-missing' }] };
    tags.forEach((tag, position) => {
        if (tag.order > CHECK_ROLL_COUNT) {
            diagnostics.push({ code: 'check-over-limit', order: tag.order, raw: tag.raw, index: tag.index });
            return;
        }
        if (!tag.valid) return;
        const label = tag.skill || ABILITY_LABELS[tag.ability];
        const profile = safeCall(profileOf, tag.actor, label);
        if (!profile || !Number.isFinite(Number(profile.value))) {
            diagnostics.push({ code: 'check-actor-unknown', actor: tag.actor, order: tag.order, index: tag.index });
            return;
        }
        const ongoing = Number(safeCall(edgeOf, tag.actor, tag));
        const edge = clampEdge(tag.edge + (Number.isFinite(ongoing) ? ongoing : 0));
        const shift = Math.round(Number(safeCall(shiftOf, tag.actor, tag)) || 0);
        const raw = rolls[tag.order - 1];
        const res = ruleset.resolve(profile, { difficulty: tag.difficulty, edge, shift }, raw);
        // 标签后一小段里写的成败，要和实际结果一致。
        const segmentEnd = position + 1 < tags.length ? tags[position + 1].index : text.length;
        const written = text.slice(tag.end, Math.min(segmentEnd, tag.end + WRITTEN_WINDOW)).match(WRITTEN_RESULT)?.[0] || null;
        const mismatch = written !== null && written.includes('成功') !== res.success;
        results.push({
            ruleset: ruleset.ID, order: tag.order, actor: tag.actor, ability: tag.ability, skill: tag.skill, label,
            kind: profile.kind, value: profile.value, difficulty: tag.difficulty, edge: res.edge,
            dice: { unit: raw.unit, tens: [...raw.tens] }, die: res.roll, target: res.target, threshold: res.threshold, dc: res.threshold,
            total: res.roll, roll: res.roll, tier: res.tier, ladder: res.ladder, outcome: res.outcome, success: res.success,
            written, mismatch, index: tag.index,
        });
        if (mismatch) diagnostics.push({ code: 'check-mismatch', order: tag.order, actor: tag.actor, written, tier: res.tier, index: tag.index });
    });
    return { results, diagnostics };
}

// 正文成败措辞与实际结果不符时，生成给下一层看的更正句。
export function cocCheckCorrections(results) {
    return asArray(results)
        .filter((result) => result && result.mismatch)
        .map((result) => `${result.actor}的${result.label}检定（${result.difficulty}${result.edge ? `，${edgeText(result.edge)}` : ''}）实际掷出 ${pad2(result.die)}【${result.outcome}】，正文写成了「${result.written}」`);
}

function actorLine(actor) {
    const attrs = actor && actor.attrs && typeof actor.attrs === 'object' ? actor.attrs : null;
    if (!actor || !actor.name || !attrs) return '';
    const names = [...Object.keys(attrs)].filter((name) => Number.isFinite(Number(attrs[name])));
    if (!names.length) return '';
    const main = names.map((name) => `${name}${Math.round(Number(attrs[name]))}`).join(' ');
    const skills = asArray(actor.skills)
        .filter(([, value]) => Number(value) >= SKILL_LINE_FROM)
        .sort((a, b) => b[1] - a[1])
        .slice(0, SKILL_LINE_MAX)
        .map(([name, value]) => `${name}${Math.round(Number(value))}`);
    return `${actor.name}：${main}${skills.length ? `；高技能 ${skills.join(' ')}` : ''}`;
}

export const COC_CHECK_ROLLS_TEMPLATE = [
    '【检定】角色做结果不确定、失败有后果的事时都要检定：动手（搬、爬、躲、打、追）、察觉与搜寻、偷偷行事、技艺与专业活，以及靠言语办事（说服、讨价还价、撒谎、求情、威胁、撩人、表白、看穿对方）。毫无悬念的日常举动不检定。在行动处写 [igs-check:角色|属性或技能|难度]，另有奖励骰或惩罚骰时写 [igs-check:角色|属性或技能|难度|奖励]（奖励、奖励2、惩罚、惩罚2）：属性写 力量/敏捷/体质/智力/感知/魅力/理智 之一，技能写其名称；难度写 普通、困难、极难（少用极难）。',
    '难度按情境定，不看骰序：普通指常人在正常条件下有把握做到的事；困难指条件不利（时间紧、有人阻挠、环境恶劣、对方戒备）或任务本身超出常规；极难指多重不利叠加，或常人几乎做不到的事。好感、关系与角色意愿用奖惩骰体现，不调难度。',
    '本层骰序（每个判定一组 d100，按判定出现顺序依次取用，第 1 个判定用第 1 组；括号内依次是取 1、2 颗奖励骰后的结果与取 1、2 颗惩罚骰后的结果）：{{骰序}}。',
    '判定：骰值 ≤ 目标值为成功，≤ 目标值的一半为困难成功，≤ 五分之一为极难成功；骰值 ≤ 5 为大成功，≥ 96 为大失败。难度写困难须达到困难成功，写极难须达到极难成功，达不到都算失败。奖励骰取较小的，惩罚骰取较大的，奖惩相互抵消，最多 2 颗。',
    '标签后紧接着按结果写剧情走向，成功与失败都推进剧情；本层有几处这样的行动就写几个判定，最多 10 个；正文不写骰值和算式。',
    '{{奖惩}}',
    '{{在场属性}}',
    '{{更正}}',
].join('\n');

// 组装模板变量；骰子不合法返回 null。
// 入参：{ rolls, actors: [{ name, attrs: { 力量: 百分制, …, 理智 }, skills: [[技能, 百分制]] }], edges: [{ name, edge, shift, reasons }], corrections }
export function cocRollsVars({ rolls, actors = [], edges = [], corrections = [] } = {}) {
    if (!isCocRollSet(rolls)) return null;
    const attrLines = asArray(actors).slice(0, COC_CHECK_ACTOR_MAX).map(actorLine).filter(Boolean);
    const edgeLines = asArray(edges)
        .filter((item) => item && item.name && (clampEdge(item.edge) || Math.round(Number(item.shift) || 0)))
        .slice(0, COC_CHECK_ACTOR_MAX)
        .map((item) => {
            const edge = clampEdge(item.edge);
            const shift = Math.round(Number(item.shift) || 0);
            const parts = [edgeText(edge), shift ? `目标值${shift > 0 ? '+' : ''}${shift}` : ''].filter(Boolean).join('、');
            return `${item.name}${parts}${Array.isArray(item.reasons) && item.reasons.length ? `（${item.reasons.join('、')}）` : ''}`;
        });
    return {
        骰序: rolls.map(formatCocRoll).join('、'),
        奖惩: edgeLines.length ? `持续的奖惩骰（前端自动计入这些人物本层的每次检定，与标签里写的叠加，相反时抵消；标签不必重复写）：${edgeLines.join('；')}。` : '',
        在场属性: attrLines.length ? `在场人物目标值（百分制，含理智）：\n${attrLines.join('\n')}\n未列出的人物由前端按其强弱估算。` : '',
        更正: asArray(corrections).length ? `更正：上一层${corrections.join('；')}；以前端结果为准，本层剧情按实际结果衔接。` : '',
    };
}

// 检定提示词段（形状同 check-rolls 的 resolveCheckRollsSegment）；骰子不合法返回 null。vars.template 可换模板。
export function resolveCocCheckRollsSegment(vars = {}) {
    const input = vars || {};
    const table = cocRollsVars(input);
    if (!table) return null;
    return {
        id: CHECK_ROLLS_SEGMENT_ID,
        position: 'depth0',
        depth: 0,
        content: fillCheckRolls(typeof input.template === 'string' && input.template ? input.template : COC_CHECK_ROLLS_TEMPLATE, table),
        keys: ['check-rolls'],
        rolls: input.rolls.map((roll) => ({ unit: roll.unit, tens: [...roll.tens] })),
    };
}
