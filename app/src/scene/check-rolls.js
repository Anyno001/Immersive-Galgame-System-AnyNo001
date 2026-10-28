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
const TIER_RE = /大成功|大失败|成功|失败/;
const REWRITE_TYPES = new Set(['swipe', 'regenerate', 'continue']);
const SKIP_TYPES = new Set(['impersonate', 'quiet']);

const listOf = (chat) => (Array.isArray(chat) ? chat : []);
const isAi = (m) => Boolean(m) && typeof m === 'object' && !(m.is_user ?? m.user);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
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

// 指定楼号所在的 chat 下标；没有时返回 -1。
export function floorIndexOfOrdinal(chat, ordinal) {
    let seen = 0;
    const list = listOf(chat);
    for (let i = 0; i < list.length; i += 1) {
        if (isAi(list[i]) && ++seen === ordinal) return i;
    }
    return -1;
}

// 种子 = 聊天 ID + 楼号；没有聊天 ID 或楼号时不产出骰序（调用方据此不注入、不复算）。
export function checkRollsFor(chatId, ordinal) {
    const id = String(chatId ?? '').trim();
    if (!id || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    let state = hash32(`igs-check|${id}|${ordinal}`);
    const rolls = [];
    for (let i = 0; i < CHECK_ROLL_COUNT; i += 1) {
        const r = randomInt(state, 20);
        state = r.state;
        rolls.push(r.value + 1);
    }
    return rolls;
}

// 解析本楼 [igs-check:角色|属性|DC]，按正文出现顺序编号（1 起）；栏位非法的标签照样占一个序号（与模型所见顺序一致），只记诊断。
export function scanCheckTags(body) {
    const tags = [];
    const diagnostics = [];
    for (const m of String(body || '').matchAll(CHECK_TAG_RE)) {
        const fields = m[1].split('|').map((f) => f.trim());
        const [actor = '', abilityText = '', dcText = ''] = fields;
        const ability = abilityKeyOf(abilityText);
        const dc = Number(halfDigits(dcText).replace(/^dc\s*[=＝:：]?\s*/i, ''));
        let problem = null;
        if (fields.length !== 3) problem = 'field-count';
        else if (!actor) problem = 'actor-missing';
        else if (!ability) problem = 'unknown-ability';
        else if (!dcText || !Number.isInteger(dc) || dc < D20_DC_RANGE[0] || dc > D20_DC_RANGE[1]) problem = 'invalid-dc';
        const order = tags.length + 1;
        tags.push({ order, actor, ability, dc: problem ? null : dc, valid: !problem, raw: m[0], index: m.index, end: m.index + m[0].length });
        if (problem) diagnostics.push({ code: 'check-tag-invalid', problem, order, raw: m[0], index: m.index });
    }
    return { tags, diagnostics };
}

// 复算：第 n 个判定取 rolls[n-1]；第 11 次起不计。readAbilities(角色名) 同步返回属性视图，读不到记 check-actor-unknown。
// 标签之后到下一个判定标签之前的前 40 字里出现的结果词与复算成败不符时记 check-mismatch（大成功算成功、大失败算失败）。
export function replayChecks({ body, rolls, readAbilities } = {}) {
    const text = String(body || '');
    const { tags, diagnostics } = scanCheckTags(text);
    const results = [];
    if (!tags.length) return { results, diagnostics };
    if (!Array.isArray(rolls) || rolls.length !== CHECK_ROLL_COUNT) return { results, diagnostics: [...diagnostics, { code: 'check-rolls-missing' }] };
    tags.forEach((tag, i) => {
        if (tag.order > CHECK_ROLL_COUNT) { diagnostics.push({ code: 'check-over-limit', order: tag.order, raw: tag.raw, index: tag.index }); return; }
        if (!tag.valid) return;
        const die = rolls[tag.order - 1];
        let attr = null;
        try { attr = typeof readAbilities === 'function' ? readAbilities(tag.actor) : null; } catch (error) { attr = null; }
        const bonus = d20Bonus(attr, tag.ability);
        if (bonus === null) { diagnostics.push({ code: 'check-actor-unknown', actor: tag.actor, order: tag.order, index: tag.index }); return; }
        const r = d20Outcome(die, bonus, tag.dc);
        const stop = i + 1 < tags.length ? tags[i + 1].index : text.length;
        const written = text.slice(tag.end, Math.min(stop, tag.end + CHECK_WRITTEN_CHARS)).match(TIER_RE)?.[0] || null;
        const mismatch = written !== null && written.includes('成功') !== r.success;
        const result = { order: tag.order, actor: tag.actor, ability: tag.ability, label: ABILITY_LABELS[tag.ability], dc: tag.dc, die, bonus, total: r.total, tier: r.tier, success: r.success, written, mismatch, index: tag.index };
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

// 上一楼复算与正文写法不符的条目，转成提示词里的一句更正。
export function checkCorrections(results) {
    return (Array.isArray(results) ? results : []).filter((r) => r && r.mismatch)
        .map((r) => `${r.actor}的${r.label}检定（DC ${r.dc}）实际为 ${r.die}${signed(r.bonus)}=${r.total}【${r.tier}】，正文写成了「${r.written}」`);
}

// 正文提示词段：仅战斗扩展开启且骰序可用时产出。actors 为 [{ name, attr }]，corrections 为 checkCorrections 的结果。
export function resolveCheckRollsSegment(readerSettings, { rolls, actors = [], corrections = [] } = {}) {
    if (!combatExpansionEnabled(readerSettings) || !Array.isArray(rolls) || rolls.length !== CHECK_ROLL_COUNT) return null;
    const lines = [];
    for (const a of (Array.isArray(actors) ? actors : []).slice(0, CHECK_ACTOR_MAX)) {
        const b = a && a.name ? checkActorBonuses(a.attr) : null;
        if (b) lines.push(`${a.name}：${ABILITY_KEYS.map((k) => `${ABILITY_LABELS[k]}${signed(b[k])}`).join(' ')}`);
    }
    const content = [
        `【检定】本层出现需要掷骰的行动时，在行动处写 [igs-check:角色|属性|DC]：属性只写 力量/敏捷/体质/智力/感知/魅力 之一；DC 写 ${D20_DC_RANGE[0]}–${D20_DC_RANGE[1]} 的整数（10 容易、15 中等、20 困难、25 极难）。本层骰序（d20，按判定出现顺序依次取用，第 1 个判定用第 1 个骰值）：${rolls.join('、')}。`,
        `结果 = 骰值 + 该角色该属性加值，达到 DC 为成功；骰值 20 为大成功、1 为大失败。标签后紧接着按结果写剧情走向，成功与失败都推进剧情；每层最多 ${CHECK_ROLL_COUNT} 个判定，不必每层都写；正文不写骰值和算式。`,
        lines.length ? `在场人物加值（已含熟练）：\n${lines.join('\n')}\n未列出的人物由前端按其强弱估算。` : '',
        Array.isArray(corrections) && corrections.length ? `更正：上一层${corrections.join('；')}；以前端结果为准，本层剧情按实际结果衔接。` : '',
    ].filter(Boolean).join('\n');
    return { id: CHECK_ROLLS_SEGMENT_ID, position: 'depth0', depth: 0, content, keys: ['check-rolls'], rolls: [...rolls] };
}
