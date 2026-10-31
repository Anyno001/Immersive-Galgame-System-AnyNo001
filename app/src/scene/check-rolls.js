// 正文 d20 判定（v3 §3.9）：每楼预生成 10 个 d20 骰序，正文 [igs-check:角色|属性|DC] 按出现顺序取用，生成结束后程序复算。
// 楼层号 = 第几条非用户楼（1 起，含已隐藏的楼，隐藏 / 取消隐藏不改号）；与用户楼何时落入聊天无关：
// 同楼 swipe / 重新生成 / 继续得到同一号，新楼 +1。纯函数，不读宿主；聊天 ID、聊天快照与属性读取由调用方注入。
import { hash32, randomInt } from '../combat/random.js';
import { ABILITY_KEYS, ABILITY_LABELS, abilityKeyOf } from '../combat/abilities.js';
import { D20_DC_RANGE, d20Bonus, d20Outcome } from '../choices/dice-check.js';
import { combatExpansionEnabled } from './combat-prompt.js';

export const CHECK_ROLL_COUNT = 10;
export const CHECK_ROLLS_SEGMENT_ID = 'igs-check-rolls';
export const CHECK_ACTOR_MAX = 6;
const CHECK_TAG_RE = /\[igs-check:([^\]\n]*)\]/g;
const CHECK_WRITTEN_CHARS = 40;
const SKILL_TEXT_MAX = 20;
const TIER_RE = /大成功|大失败|成功|失败/;
const REWRITE_TYPES = new Set(['swipe', 'regenerate', 'continue']);
const SKIP_TYPES = new Set(['impersonate', 'quiet']);

const listOf = (chat) => (Array.isArray(chat) ? chat : []);
const isAi = (m) => Boolean(m) && typeof m === 'object' && !(m.is_user ?? m.user);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
// 楼层当前 swipe 序号；缺省或非法按 0（与战斗日志锚点的 swipeOf 一致）。
const swipeIdOf = (m) => (Number.isSafeInteger(m?.swipe_id) && m.swipe_id > 0 ? m.swipe_id : 0);
const halfDigits = (s) => String(s ?? '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

// 即将生成的楼号：重写类生成且末尾是 AI 楼时取该楼号，否则为下一楼；代写与静默生成返回 null。
export function upcomingCheckOrdinal(chat, generationType = null) {
    if (SKIP_TYPES.has(generationType)) return null;
    const list = listOf(chat);
    const aiCount = list.filter(isAi).length;
    if (REWRITE_TYPES.has(generationType) && isAi(list.at(-1))) return aiCount;
    return aiCount + 1;
}

// 已有楼层的楼号：messageId 为 chat 下标；该楼是用户楼或不存在时返回 null。
export function floorCheckOrdinal(chat, messageId) {
    const list = listOf(chat);
    const id = Number(messageId);
    if (!Number.isSafeInteger(id) || id < 0 || id >= list.length || !isAi(list[id])) return null;
    return list.slice(0, id + 1).filter(isAi).length;
}

// 即将生成的楼所在 swipe（合并计划 Q3）：swipe / 继续时宿主已把末尾 AI 楼切到目标 swipe，取其 swipe_id；其余（新楼、重新生成）为 0。
export function upcomingCheckSwipe(chat, generationType = null) {
    if (SKIP_TYPES.has(generationType)) return null;
    const last = listOf(chat).at(-1);
    if ((generationType === 'swipe' || generationType === 'continue') && isAi(last)) return swipeIdOf(last);
    return 0;
}

// 已有楼层的 swipe 序号；该楼是用户楼或不存在时返回 null。
export function floorCheckSwipe(chat, messageId) {
    const list = listOf(chat);
    const id = Number(messageId);
    if (!Number.isSafeInteger(id) || id < 0 || id >= list.length || !isAi(list[id])) return null;
    return swipeIdOf(list[id]);
}

// 指定楼号所在的 chat 下标；没有时返回 -1。
export function floorIndexOfOrdinal(chat, ordinal) {
    let seen = 0;
    const list = listOf(chat);
    for (let i = 0; i < list.length; i += 1) {
        if (isAi(list[i]) && ++seen === ordinal) return i;
    }
    return -1;
}

// 种子 = 聊天 ID + 楼号 + swipe 序号（合并计划 Q3：换 swipe 换一组骰，继续生成沿用本 swipe 这组）；
// swipe 0 的种子与旧版一致，已有楼层的骰序不变。没有聊天 ID 或楼号时不产出骰序（调用方据此不注入、不复算）。
export function checkRollsFor(chatId, ordinal, swipeId = 0) {
    const id = String(chatId ?? '').trim();
    if (!id || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    const swipe = Number.isSafeInteger(swipeId) && swipeId > 0 ? swipeId : 0;
    let state = hash32(swipe ? `igs-check|${id}|${ordinal}|s${swipe}` : `igs-check|${id}|${ordinal}`);
    const rolls = [];
    for (let i = 0; i < CHECK_ROLL_COUNT; i += 1) {
        const r = randomInt(state, 20);
        state = r.state;
        rolls.push(r.value + 1);
    }
    return rolls;
}

// 每楼 10 对 d20（合并计划 P3，助手选 B）：第一颗与 checkRollsFor 相同（无优劣势时结果与旧版一致），第二颗另起一条同种子派生的序列。
// 无优劣势取第一颗，优势取较大、劣势取较小。
export function checkRollPairsFor(chatId, ordinal, swipeId = 0) {
    const first = checkRollsFor(chatId, ordinal, swipeId);
    if (!first) return null;
    const swipe = Number.isSafeInteger(swipeId) && swipeId > 0 ? swipeId : 0;
    let state = hash32(`igs-check-b|${String(chatId).trim()}|${ordinal}|s${swipe}`);
    return first.map((a) => {
        const r = randomInt(state, 20);
        state = r.state;
        return [a, r.value + 1];
    });
}

// 骰对取值：edge > 0 取大、< 0 取小、0 取第一颗。旧调用给单颗骰值时两颗视为相同。
export function pickDie(pair, edge = 0) {
    const [a, b] = Array.isArray(pair) ? pair : [pair, pair];
    return edge > 0 ? Math.max(a, b) : edge < 0 ? Math.min(a, b) : a;
}

const EDGE_WORD = Object.freeze({ 优势: 1, 优: 1, 劣势: -1, 劣: -1 });
const validDie = (d) => Number.isInteger(d) && d >= 1 && d <= 20;
const validRolls = (rolls) => Array.isArray(rolls) && rolls.length === CHECK_ROLL_COUNT
    && rolls.every((p) => (Array.isArray(p) ? p.length === 2 && p.every(validDie) : validDie(p)));

// 解析本楼 [igs-check:角色|属性或技能|DC] 或 [igs-check:角色|属性或技能|DC|优势/劣势]，按正文出现顺序编号（1 起）；
// 第二栏不是六维时记为技能（skill），复算时交给 resolveSkill 换算，换算不了才算非法（合并计划 P3）。
// 栏位非法的标签照样占一个序号（与模型所见顺序一致），只记诊断。第 4 栏缺省为无优劣势。
export function scanCheckTags(body) {
    const tags = [];
    const diagnostics = [];
    for (const m of String(body || '').matchAll(CHECK_TAG_RE)) {
        const fields = m[1].split('|').map((f) => f.trim());
        const [actor = '', abilityText = '', dcText = '', edgeText = ''] = fields;
        const ability = abilityKeyOf(abilityText);
        const skill = !ability && abilityText && abilityText.length <= SKILL_TEXT_MAX && !/[0-9０-９]/.test(abilityText) ? abilityText : null;
        const dc = Number(halfDigits(dcText).replace(/^dc\s*[=＝:：]?\s*/i, ''));
        const edge = edgeText ? EDGE_WORD[edgeText] : 0;
        let problem = null;
        if (fields.length < 3 || fields.length > 4) problem = 'field-count';
        else if (!actor) problem = 'actor-missing';
        else if (!ability && !skill) problem = 'unknown-ability';
        else if (!dcText || !Number.isInteger(dc) || dc < D20_DC_RANGE[0] || dc > D20_DC_RANGE[1]) problem = 'invalid-dc';
        else if (edge === undefined) problem = 'invalid-edge';
        const order = tags.length + 1;
        tags.push({ order, actor, ability, skill, dc: problem ? null : dc, edge: problem ? 0 : edge, valid: !problem, raw: m[0], index: m.index, end: m.index + m[0].length });
        if (problem) diagnostics.push({ code: 'check-tag-invalid', problem, order, raw: m[0], index: m.index });
    }
    return { tags, diagnostics };
}

// 复算：第 n 个判定取 rolls[n-1]（一对 d20，按标签的优劣势取值；旧调用给单颗时两颗视为相同）；第 11 次起不计。
// readAbilities(角色名) 同步返回属性视图，读不到记 check-actor-unknown。技能标签用 resolveSkill(角色, 技能, 属性视图) → { ability, bonus }
// 换算（所属属性加值 + 熟练加值）；未提供或换算不了时按非法标签记 check-tag-invalid / unknown-ability。
// edgeOf(角色, 标签) 返回数字时为程序判定的优劣势（权威，覆盖正文第 4 栏，不一致记 check-edge-mismatch）；返回 null 时按第 4 栏。
// shiftOf(角色, 标签) 返回额外加减值（数值系统的压力修正），缺省 0。
// 标签之后到下一个判定标签之前的前 40 字里出现的结果词与复算成败不符时记 check-mismatch（大成功算成功、大失败算失败）。
export function replayChecks({ body, rolls, readAbilities, resolveSkill, edgeOf, shiftOf } = {}) {
    const text = String(body || '');
    const { tags, diagnostics } = scanCheckTags(text);
    const results = [];
    if (!tags.length) return { results, diagnostics };
    if (!validRolls(rolls)) return { results, diagnostics: [...diagnostics, { code: 'check-rolls-missing' }] };
    tags.forEach((tag, i) => {
        if (tag.order > CHECK_ROLL_COUNT) { diagnostics.push({ code: 'check-over-limit', order: tag.order, raw: tag.raw, index: tag.index }); return; }
        if (!tag.valid) return;
        const pair = rolls[tag.order - 1];
        let edge = tag.edge;
        let forced = null;
        try { forced = typeof edgeOf === 'function' ? edgeOf(tag.actor, tag) : null; } catch (error) { forced = null; }
        if (forced !== null && forced !== undefined && Number.isFinite(Number(forced))) {
            edge = Math.sign(Number(forced));
            if (edge !== tag.edge) diagnostics.push({ code: 'check-edge-mismatch', order: tag.order, actor: tag.actor, written: tag.edge, edge, index: tag.index });
        }
        const die = pickDie(pair, edge);
        let attr = null;
        try { attr = typeof readAbilities === 'function' ? readAbilities(tag.actor) : null; } catch (error) { attr = null; }
        let ability = tag.ability;
        let bonus = null;
        if (tag.skill) {
            let mapped = null;
            try { mapped = typeof resolveSkill === 'function' ? resolveSkill(tag.actor, tag.skill, attr) : null; } catch (error) { mapped = null; }
            if (!mapped || !abilityKeyOf(mapped.ability) || !Number.isFinite(Number(mapped.bonus))) { diagnostics.push({ code: 'check-tag-invalid', problem: 'unknown-ability', order: tag.order, raw: tag.raw, index: tag.index }); return; }
            ability = abilityKeyOf(mapped.ability);
            bonus = attr ? Math.round(Number(mapped.bonus)) : null;
        } else bonus = d20Bonus(attr, ability);
        if (bonus === null) { diagnostics.push({ code: 'check-actor-unknown', actor: tag.actor, order: tag.order, index: tag.index }); return; }
        let shift = 0;
        try { shift = typeof shiftOf === 'function' ? Math.round(Number(shiftOf(tag.actor, tag)) || 0) : 0; } catch (error) { shift = 0; }
        bonus += shift;
        const r = d20Outcome(die, bonus, tag.dc);
        const stop = i + 1 < tags.length ? tags[i + 1].index : text.length;
        const written = text.slice(tag.end, Math.min(stop, tag.end + CHECK_WRITTEN_CHARS)).match(TIER_RE)?.[0] || null;
        const mismatch = written !== null && written.includes('成功') !== r.success;
        const dice = Array.isArray(pair) ? [...pair] : [pair, pair];
        const result = { order: tag.order, actor: tag.actor, ability, skill: tag.skill, label: tag.skill || ABILITY_LABELS[ability], dc: tag.dc, edge, dice, die, bonus, total: r.total, tier: r.tier, success: r.success, written, mismatch, index: tag.index };
        results.push(result);
        if (mismatch) diagnostics.push({ code: 'check-mismatch', order: tag.order, actor: tag.actor, written, tier: r.tier, index: tag.index });
    });
    return { results, diagnostics };
}

// 在场人物六维加值（已含熟练）；属性视图不完整时返回 null，不拿缺省值冒充。
export function checkActorBonuses(attr) {
    const out = {};
    for (const key of ABILITY_KEYS) {
        const b = d20Bonus(attr, key);
        if (b === null) return null;
        out[key] = b;
    }
    return out;
}

const edgeText = (edge) => (edge > 0 ? '优势' : edge < 0 ? '劣势' : '');

// 上一楼复算与正文写法不符的条目，转成提示词里的一句更正。
export function checkCorrections(results) {
    return (Array.isArray(results) ? results : []).filter((r) => r && r.mismatch)
        .map((r) => `${r.actor}的${r.label}检定（DC ${r.dc}${r.edge ? `，${edgeText(r.edge)}` : ''}）实际为 ${r.die}${signed(r.bonus)}=${r.total}【${r.tier}】，正文写成了「${r.written}」`);
}

const pairText = (p) => (Array.isArray(p) ? `${p[0]}/${p[1]}` : String(p));

// 正文提示词段：战斗扩展开启或数值系统本聊天启用（statsActive）且骰序完整时产出。
// actors 为 [{ name, attr }]；edges 为 [{ name, edge, reasons }]（当前持续的优劣势及原因，由数值系统给出）；corrections 为 checkCorrections 的结果。
export function resolveCheckRollsSegment(readerSettings, { rolls, actors = [], edges = [], corrections = [], statsActive = false } = {}) {
    if ((!combatExpansionEnabled(readerSettings) && statsActive !== true) || !validRolls(rolls)) return null;
    const lines = [];
    for (const a of (Array.isArray(actors) ? actors : []).slice(0, CHECK_ACTOR_MAX)) {
        const b = a && a.name ? checkActorBonuses(a.attr) : null;
        if (b) lines.push(`${a.name}：${ABILITY_KEYS.map((k) => `${ABILITY_LABELS[k]}${signed(b[k])}`).join(' ')}`);
    }
    const edgeLines = (Array.isArray(edges) ? edges : []).filter((e) => e && e.name && Math.sign(Number(e.edge) || 0))
        .slice(0, CHECK_ACTOR_MAX)
        .map((e) => `${e.name}${edgeText(Math.sign(e.edge))}${Array.isArray(e.reasons) && e.reasons.length ? `（${e.reasons.join('、')}）` : ''}`);
    const content = [
        `【检定】本层出现需要掷骰的行动时，在行动处写 [igs-check:角色|属性|DC]，有优势或劣势时写 [igs-check:角色|属性|DC|优势] 或 [igs-check:角色|属性|DC|劣势]：属性只写 力量/敏捷/体质/智力/感知/魅力 之一；DC 写 ${D20_DC_RANGE[0]}–${D20_DC_RANGE[1]} 的整数（10 容易、15 中等、20 困难、25 极难）。本层骰序（每个判定一对 d20，按判定出现顺序依次取用，第 1 个判定用第 1 对）：${rolls.map(pairText).join('、')}。`,
        `取值：没有优劣势用斜线前的骰值；优势取两颗中较大的，劣势取较小的；优势与劣势同时成立时互相抵消。结果 = 取用的骰值 + 该角色该属性加值，达到 DC 为成功；骰值 20 为大成功、1 为大失败。标签后紧接着按结果写剧情走向，成功与失败都推进剧情；每层最多 ${CHECK_ROLL_COUNT} 个判定，不必每层都写；正文不写骰值和算式。`,
        edgeLines.length ? `当前优劣势（这些人物本层检定都按此写第 4 栏）：${edgeLines.join('；')}。` : '',
        lines.length ? `在场人物加值（已含熟练）：\n${lines.join('\n')}\n未列出的人物由前端按其强弱估算。` : '',
        Array.isArray(corrections) && corrections.length ? `更正：上一层${corrections.join('；')}；以前端结果为准，本层剧情按实际结果衔接。` : '',
    ].filter(Boolean).join('\n');
    return { id: CHECK_ROLLS_SEGMENT_ID, position: 'depth0', depth: 0, content, keys: ['check-rolls'], rolls: rolls.map((p) => (Array.isArray(p) ? [...p] : p)) };
}
