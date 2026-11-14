// NPC 角色卡与批量补全（数值 v2 §6.2–§6.4）：LLM 只给档位词，脚本按「聊天种子 + 角色名 + 项目名」在档位区间里取底数。
// 解析只收白名单档位；出现数字整格丢弃；整份解析失败时返回 ok:false，不写半份数据（易错点 N3/N4）。
import { BASE_ATTRIBUTES } from './stat-state.js';
import { LEGACY_ATTRIBUTE_MAP, normalizeAttribute, validSkillName } from './stat-registry.js';
import { PROTAGONIST, RANKS, SAN_ATTRIBUTE, profileOf } from './stat-engine.js';
import { seededRandom } from './stat-ledger.js';
import { DEFAULT_STAT_PROMPTS } from './stat-prompt.js';
import { parseStartRelation } from './stat-vocab.js';

// 档位词 → 区间。六维存战斗分数（3–30，ABILITY_SCORE_TIERS）；理智值（SAN）仍是百分制（ATTRIBUTE_TIERS）。
export const ATTRIBUTE_TIERS = Object.freeze({ 很弱: [20, 30], 偏弱: [35, 45], 普通: [45, 55], 出众: [60, 70], 顶尖: [75, 90], 超凡: [91, 99] });
export const ABILITY_SCORE_TIERS = Object.freeze({ 很弱: [3, 6], 偏弱: [7, 9], 普通: [10, 11], 出众: [12, 14], 顶尖: [15, 17], 超凡: [18, 22] });
export const SHEET_SCORE_MIN = 1;
export const SHEET_SCORE_MAX = 30;
export const SHEET_SAN_MIN = 1;
export const SHEET_SAN_MAX = 99;
export const SKILL_TIERS = Object.freeze({ 未学: null, 入门: [25, 45], 熟练: [50, 70], 精通: [75, 85], 大师: [90, 95] });
export const SKILL_TIER_ORDER = Object.freeze(['未学', '入门', '熟练', '精通', '大师']);
// NPC 技能档：相对主角同项的偏移（百分制），初次生成角色卡时换算成绝对值后冻结。
export const NPC_SKILL_OFFSETS = Object.freeze({ 生疏: -30, 略逊: -15, 相当: 0, 擅长: 15, 精通: 30, 大师: 45 });
export const NPC_SKILL_BASELINE = 50;
export const NPC_SKILL_MIN = 5;
export const NPC_SKILL_MAX = 95;
export const NPC_SKILL_JITTER = 5;
// 主角补全不设上限（11-07 用户放开），补出来不合适时在「我的角色」里手改。
export const PROTAGONIST_BACKFILL_MAX = '大师';
export const SHEET_BATCH_MAX = 8;
// 角色卡 3+5：与主角选技能同值（擅长 60、比较擅长 30）。
export const NPC_STRONG_COUNT = 3;
export const NPC_GOOD_COUNT = 5;
export const NPC_STRONG_VALUE = 60;
export const NPC_GOOD_VALUE = 30;
export const BACKFILL_SKILL_MAX = 6;
const NUMERIC = /[0-9０-９]/;
const ATTR_SYNONYM = Object.freeze({ 弱: '偏弱', 差: '偏弱', 一般: '普通', 中等: '普通', 强: '出众', 优秀: '出众', 很强: '顶尖', 极强: '顶尖', 非人: '超凡' });
const SKILL_SYNONYM = Object.freeze({ 不会: '未学', 无: '未学', 新手: '入门', 初学: '入门', 会: '熟练', 擅长: '熟练', 专精: '精通', 专家: '精通', 宗师: '大师' });
const NPC_SKILL_SYNONYM = Object.freeze({ 不会: '未学', 无: '未学', 新手: '入门', 初学: '入门', 会: '熟练', 差: '生疏', 不擅长: '略逊', 一般: '相当', 普通: '相当', 擅长: '擅长', 专精: '精通', 专家: '精通', 宗师: '大师' });
const RANK_SYNONYM = Object.freeze({ 平民: '普通人', 普通: '普通人', 新手: '普通人', 熟手: '老手', 高手: '精英', 宗师: '大师', 传说: '传奇' });

function tierWord(raw, table, synonyms) {
    const text = String(raw ?? '').trim();
    if (!text || NUMERIC.test(text)) return null;
    if (Object.hasOwn(table, text)) return text;
    return synonyms[text] && Object.hasOwn(table, synonyms[text]) ? synonyms[text] : null;
}

export const attributeTier = (raw) => tierWord(raw, ATTRIBUTE_TIERS, ATTR_SYNONYM);
export const skillTier = (raw) => tierWord(raw, SKILL_TIERS, SKILL_SYNONYM);
const NPC_TIER_TABLE = Object.freeze({ ...SKILL_TIERS, ...NPC_SKILL_OFFSETS });
// NPC 档名：相对档优先；入门、熟练、未学是旧的绝对档，仍可识别。精通、大师新旧同名，按相对档处理。
export const npcSkillTier = (raw) => tierWord(raw, NPC_TIER_TABLE, NPC_SKILL_SYNONYM);

// NPC 技能档 → 绝对值。相对档：主角同项值（没有时取 50）加偏移与确定性抖动，夹在 5–95；旧绝对档沿用区间取值；未学为 null。
export function npcSkillValue(tier, heroValue, seedText) {
    if (Object.hasOwn(NPC_SKILL_OFFSETS, tier)) {
        const hero = Number(heroValue) > 0 ? Number(heroValue) : NPC_SKILL_BASELINE;
        const jitter = bandValue([-NPC_SKILL_JITTER, NPC_SKILL_JITTER], seedText);
        return Math.min(NPC_SKILL_MAX, Math.max(NPC_SKILL_MIN, Math.round(hero + NPC_SKILL_OFFSETS[tier] + jitter)));
    }
    return Object.hasOwn(SKILL_TIERS, tier) ? bandValue(SKILL_TIERS[tier], seedText) : null;
}
export function rankWord(raw) {
    const text = String(raw ?? '').trim();
    if (RANKS.includes(text)) return text;
    return RANK_SYNONYM[text] || null;
}

function hash(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h >>> 0;
}

// 区间内取值：同一聊天、同一角色、同一项目永远得到同一个数。
export function bandValue(band, seedText) {
    if (!band) return null;
    const [lo, hi] = band;
    return lo + Math.floor(seededRandom(hash(seedText))() * (hi - lo + 1));
}

export function capSkillTier(tier, max = PROTAGONIST_BACKFILL_MAX) {
    const i = SKILL_TIER_ORDER.indexOf(tier);
    const m = SKILL_TIER_ORDER.indexOf(max);
    return i > m ? max : tier;
}

export function skillTierOfValue(value) {
    const v = Number(value) || 0;
    if (v >= 90) return '大师';
    if (v >= 75) return '精通';
    if (v >= 50) return '熟练';
    if (v >= 25) return '入门';
    return '未学';
}

// 从 { 起按括号配对找到对应的 }（跳过字符串里的括号）；配不上返回 -1。
function balancedEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
    }
    return -1;
}

// 回复里取第一个能解析的 JSON 对象：去掉思考块与代码块标记，按括号配对截取，前后的说明文字不影响；多余的尾逗号容忍。
function extractJson(reply) {
    const text = String((reply && typeof reply === 'object' ? reply.text : reply) ?? '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/```[a-z]*\n?|```/gi, '');
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        const end = balancedEnd(text, start);
        if (end < 0) continue;
        const body = text.slice(start, end + 1);
        for (const candidate of [body, body.replace(/,\s*([}\]])/g, '$1')]) {
            try {
                const obj = JSON.parse(candidate);
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
            } catch (error) { /* 试下一种写法 */ }
        }
    }
    return null;
}

const ownOf = (p) => String((p && (p.own ?? p.summary)) || '').trim();
function worldRef(people) {
    const text = [...new Set((people || []).map((p) => String(p?.world || '').trim()).filter(Boolean))].join('\n\n');
    return text ? `世界观及角色设定：\n${text}\n` : '';
}

export function sheetHistoryContext(floors) {
    const picked = [];
    const seen = new Set();
    for (const floor of [...(Array.isArray(floors) ? floors : [])].reverse()) {
        const user = Boolean(floor?.user);
        if (seen.has(user)) continue;
        const body = String(floor?.text || '').replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\[igs-[^\]]*\]/g, '').replace(/<[^>]+>/g, '').trim();
        if (!body) continue;
        seen.add(user);
        picked.unshift(`${user ? '用户输入' : 'AI 回复'}：\n${body}`);
        if (seen.size === 2) break;
    }
    return picked.join('\n\n');
}

// 输出格式由程序固定附在请求末尾，不随用户改写的提示词丢失；占位符带尖括号，照抄时会被名字校验拒收。
function sheetReplyFormat(names) {
    return [
        '【输出要求】',
        `只输出一个 JSON 对象，不要代码块、解释或其他文字。顶层键是角色名，必须与下列名字一字不差，每人都要有：${names.join('、')}`,
        '{"<角色名>":{"资历":"<资历档>","属性":{"<属性名>":"<属性档>"},"擅长":["<技能>"],"比较擅长":["<技能>"],"招牌技能":[{"名":"<技能>","属性":"<六维之一>"}]}}',
        '- 资历：普通人、老手、精英、大师、传奇 之一',
        '- 属性名：力量、敏捷、体质、智力、感知、魅力、理智；属性档：很弱、偏弱、普通、出众、顶尖、超凡 之一；只写与「普通」不同的项，没有就写 {}',
        '- 擅长写 3 项、比较擅长写 5 项，只从可用技能里选，两组不重复',
        '- 招牌技能 0–3 个，可以是清单外的新技能（名字不超过 8 个字），属性填 力量、敏捷、体质、智力、感知、魅力 之一',
        '- 全部用档位词，任何位置都不写数字',
    ].join('\n');
}

export function buildSheetRequest(people, { worldview = '', skills = [], history = '', settings = '', worldInfo = '', userPersona = '', protagonists = [], prompt } = {}) {
    const batch = people.slice(0, SHEET_BATCH_MAX);
    const list = batch.map((p) => `【${p.name}】${ownOf(p) || '（没有资料，按普通人处理）'}`);
    const skillText = skills.map(([name, attribute]) => `${name}（${attribute}）`).join('、');
    const settingText = [...new Set([String(settings).trim(), String(worldInfo).trim(),
        ...batch.map((p) => String(p?.world || '').trim())].filter(Boolean))].join('\n\n');
    const heroNames = batch.filter((p) => p.name === PROTAGONIST || protagonists.includes(p.name)).map((p) => p.name);
    return {
        system: prompt || DEFAULT_STAT_PROMPTS.sheetGen,
        user: [
            `世界观：${worldview || '现代'}\n可用技能：${skillText || '（无）'}`,
            settingText ? `世界观及角色设定：\n${settingText}` : '',
            `角色资料：\n${list.join('\n\n')}`,
            heroNames.length && String(userPersona).trim()
                ? `以下是主角的补充信息（${heroNames.join('、')}）：\n${String(userPersona).trim()}` : '',
            String(history).trim() ? `历史上下文（最新一层 AI 回复与用户输入，仅供判断，不要续写）：\n${String(history).trim()}` : '',
            sheetReplyFormat(batch.map((p) => p.name)),
        ].filter(Boolean).join('\n\n'),
    };
}

// 返回 { ok, sheets: { 名: { rank, attributes: {名: 档}, skills: {名: 档}, signature: [{ name, attribute }] } }, diagnostics }
export function parseSheetReply(reply, { names = [], registry } = {}) {
    const obj = extractJson(reply);
    const diagnostics = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'stats-sheet-invalid', sheets: {}, diagnostics };
    const sheets = {};
    for (const name of names) {
        const raw = obj[name];
        if (!raw || typeof raw !== 'object') continue;
        const attributes = {};
        for (const [k, v] of Object.entries(raw.属性 || raw.attributes || {})) {
            // 理智是CoC的第七项属性，角色卡里始终记档（只有CoC体系读它）；其余名字照常归一，旧名也认。
            const attr = String(k).trim() === SAN_ATTRIBUTE ? SAN_ATTRIBUTE : normalizeAttribute(k);
            const tier = attributeTier(v);
            if (attr && tier) attributes[attr] = tier;
            else diagnostics.push({ code: 'stats-sheet-cell-dropped', name, key: k });
        }
        const skills = {};
        for (const [k, v] of Object.entries(raw.技能 || raw.skills || {})) {
            const skill = registry ? registry.resolve(k) : validSkillName(k);
            const tier = npcSkillTier(v);
            if (skill && tier && !BASE_ATTRIBUTES.includes(skill)) skills[skill] = tier;
            else if (tier && validSkillName(k)) skills[validSkillName(k)] = tier;
            else diagnostics.push({ code: 'stats-sheet-cell-dropped', name, key: k });
        }
        // 3+5：擅长 3 项、比较擅长 5 项（与主角选技能同一套起步值）；旧格式的「技能」档位表仍可识别。
        const pickList = (list, max) => (Array.isArray(list) ? list : []).map((k) => (registry ? registry.resolve(k) : null) || validSkillName(k))
            .filter((k) => k && !BASE_ATTRIBUTES.includes(k)).filter((k, i, all) => all.indexOf(k) === i).slice(0, max);
        const strong = pickList(raw.擅长 || raw.strong, NPC_STRONG_COUNT);
        const good = pickList(raw.比较擅长 || raw.good, NPC_GOOD_COUNT).filter((k) => !strong.includes(k));
        const signature = [];
        for (const item of Array.isArray(raw.招牌技能 || raw.signature) ? (raw.招牌技能 || raw.signature) : []) {
            const skillName = validSkillName(item && (item.名 || item.name));
            if (skillName && signature.length < 3) signature.push({ name: skillName, attribute: normalizeAttribute(item.属性 || item.attribute) });
        }
        sheets[name] = { rank: rankWord(raw.资历 || raw.rank) || RANKS[0], attributes, skills, strong, good, signature };
    }
    if (!Object.keys(sheets).length) return { ok: false, reason: 'stats-sheet-empty', sheets, diagnostics };
    return { ok: true, sheets, diagnostics };
}

// 档位 → 底数。chatSeed 为聊天 id，保证切换体系、重开都不变（N4）。
// 六维写战斗分数（scale:'score'）；理智按百分制档位另存 san。
// heroSkill(技能名) 返回主角同项的当前值（没有则 null），技能档按它换算后冻结，之后不随主角变化。
export function sheetFromTiers(name, tiers, { chatSeed = '', heroSkill = null } = {}) {
    const heroOf = (skill) => (typeof heroSkill === 'function' ? heroSkill(skill) : null);
    const attributes = {};
    const tierOf = (attr) => (tiers.attributes && tiers.attributes[attr]) || '普通';
    for (const attr of BASE_ATTRIBUTES) attributes[attr] = bandValue(ABILITY_SCORE_TIERS[tierOf(attr)], `${chatSeed}|${name}|${attr}`);
    const san = bandValue(ATTRIBUTE_TIERS[tierOf(SAN_ATTRIBUTE)], `${chatSeed}|${name}|${SAN_ATTRIBUTE}`);
    const skills = {};
    for (const [skill, tier] of Object.entries(tiers.skills || {})) {
        const v = npcSkillValue(tier, heroOf(skill), `${chatSeed}|${name}|${skill}`);
        if (v) skills[skill] = v;
    }
    for (const skill of tiers.strong || []) if (!skills[skill]) skills[skill] = NPC_STRONG_VALUE;
    for (const skill of tiers.good || []) if (!skills[skill]) skills[skill] = NPC_GOOD_VALUE;
    for (const sig of tiers.signature || []) {
        if (!skills[sig.name]) skills[sig.name] = npcSkillValue('精通', heroOf(sig.name), `${chatSeed}|${name}|${sig.name}`);
    }
    return { rank: tiers.rank || RANKS[0], attributes, san, skills, signature: (tiers.signature || []).map((s) => s.name), source: 'llm', provisional: {}, scale: 'score' };
}

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)));

// 旧角色卡（没有 scale 标记，attributes 是百分制旧名）迁成新格式：旧名改名、值 ÷5 夹到 1–30；
// 旧「理智」原值同时写进 san。已是新格式或没有属性的卡原样返回（不改入参）。
export function migrateSheetAttributes(sheet) {
    if (!sheet || typeof sheet !== 'object' || sheet.scale === 'score') return sheet;
    const old = sheet.attributes && typeof sheet.attributes === 'object' && !Array.isArray(sheet.attributes) ? sheet.attributes : null;
    if (!old || !Object.keys(old).length) {
        const { attributes, san, ...rest } = sheet;
        return rest;
    }
    const attributes = {};
    let san = Number(sheet.san) > 0 ? clampInt(Number(sheet.san), SHEET_SAN_MIN, SHEET_SAN_MAX) : null;
    for (const [key, raw] of Object.entries(old)) {
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        if (key === SAN_ATTRIBUTE && san === null) san = clampInt(value, SHEET_SAN_MIN, SHEET_SAN_MAX);
        const name = BASE_ATTRIBUTES.includes(key) ? key : LEGACY_ATTRIBUTE_MAP[key];
        if (name) attributes[name] = clampInt(value / 5, SHEET_SCORE_MIN, SHEET_SCORE_MAX);
    }
    for (const name of BASE_ATTRIBUTES) if (!Object.hasOwn(attributes, name)) attributes[name] = 10;
    const next = { ...sheet, attributes, scale: 'score' };
    if (san !== null) next.san = san;
    return next;
}

// 手改属性：六维收档位词或 1–30 整数（返回分数），理智收档位词或 1–99 整数（返回百分制）。认不出返回 null。
export function sheetAttributeInput(attribute, raw, seedText = '') {
    const isSan = attribute === SAN_ATTRIBUTE;
    if (!isSan && !BASE_ATTRIBUTES.includes(attribute)) return null;
    const text = String(raw ?? '').trim();
    if (/^\d+$/.test(text)) {
        const n = Number(text);
        const [min, max] = isSan ? [SHEET_SAN_MIN, SHEET_SAN_MAX] : [SHEET_SCORE_MIN, SHEET_SCORE_MAX];
        return n >= min && n <= max ? n : null;
    }
    const tier = attributeTier(text);
    return tier ? bandValue((isSan ? ATTRIBUTE_TIERS : ABILITY_SCORE_TIERS)[tier], seedText) : null;
}

// 角色六维（及CoC下的理智）一行，写进提示词 sheets 段：D&D 为检定加值，CoC 为百分制目标值。
export function abilityLine(engine, state, actor) {
    if (!engine || !engine.ruleset) return '';
    const coc = engine.ruleset.ID === 'coc7';
    const names = coc ? [...BASE_ATTRIBUTES, SAN_ATTRIBUTE] : BASE_ATTRIBUTES;
    return names.map((name) => {
        const profile = profileOf(engine, state, actor, name);
        if (coc) return `${name}${Math.round(profile.value)}`;
        const bonus = engine.ruleset.bonusOf(profile);
        return `${name}${bonus >= 0 ? '+' : ''}${bonus}`;
    }).join(' ');
}

// people：[{ name, summary }]（含主角，名字为「主角」）；skills：待补的技能名。
export function buildBackfillRequest(people, skills, { prompt } = {}) {
    const list = people.slice(0, SHEET_BATCH_MAX).map((p) => `【${p.name}】${ownOf(p) || '（没有资料）'}`);
    return {
        system: prompt || DEFAULT_STAT_PROMPTS.backfill,
        user: `需要补的技能：${skills.slice(0, BACKFILL_SKILL_MAX).join('、')}\n角色资料：\n${list.join('\n')}`,
    };
}

// 返回 { ok, fills: { 名: { 技能: 档 } } }；只收清单里的人与技能。
export function parseBackfillReply(reply, { names = [], skills = [] } = {}) {
    const obj = extractJson(reply);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'stats-backfill-invalid', fills: {} };
    const fills = {};
    for (const name of names) {
        const row = obj[name];
        if (!row || typeof row !== 'object') continue;
        const out = {};
        for (const skill of skills) {
            const tier = name === PROTAGONIST ? skillTier(row[skill]) : npcSkillTier(row[skill]);
            if (tier) out[skill] = tier;
        }
        if (Object.keys(out).length) fills[name] = out;
    }
    return Object.keys(fills).length ? { ok: true, fills } : { ok: false, reason: 'stats-backfill-empty', fills };
}

// 主角技能一次性分配（CoC）：每个档位的名额上限，超额按回复顺序降一档；未学不限。
export const HERO_TIER_LIMITS = Object.freeze({ 大师: 1, 精通: 2, 熟练: 6, 入门: 8 });

// skills：可分配的技能名。回复格式 { "技能名": "档位" }。
export function buildHeroSkillRequest(people, skills, { prompt } = {}) {
    const hero = (people || []).find((p) => p && p.name === PROTAGONIST) || (people || [])[0] || {};
    return {
        system: prompt || DEFAULT_STAT_PROMPTS.heroSkills,
        user: `可分配技能：${skills.join('、')}
${worldRef([hero])}角色资料：
【${PROTAGONIST}】${ownOf(hero) || '（没有资料，按普通人处理）'}`,
    };
}

// 返回 { ok, tiers: { 技能: 档 }, demoted }：只收清单内技能与白名单档位，含数字的项整项丢弃；
// 档位名额按回复顺序占用，超额降一档直到有空位（降到未学则不写）。全部为未学或没有有效项视为失败。
export function parseHeroSkillReply(reply, { skills = [] } = {}) {
    const obj = extractJson(reply);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'stats-hero-skills-invalid', tiers: {} };
    const allowed = new Set(skills);
    const used = {};
    const tiers = {};
    let demoted = 0;
    for (const [key, raw] of Object.entries(obj)) {
        const skill = allowed.has(key) ? key : null;
        let tier = skill ? skillTier(raw) : null;
        if (!tier || tier === '未学') continue;
        let i = SKILL_TIER_ORDER.indexOf(tier);
        while (i > 0 && (used[SKILL_TIER_ORDER[i]] || 0) >= HERO_TIER_LIMITS[SKILL_TIER_ORDER[i]]) { i -= 1; demoted += 1; }
        tier = SKILL_TIER_ORDER[i];
        if (tier === '未学') continue;
        used[tier] = (used[tier] || 0) + 1;
        tiers[skill] = tier;
    }
    return Object.keys(tiers).length ? { ok: true, tiers, demoted } : { ok: false, reason: 'stats-hero-skills-empty', tiers };
}

// 起始关系一次性补填：people 为 [{ name, summary }]，回复格式 { "角色名": "关系档" }。
// hero 为主角资料（用户人设）：玩家常把「谁喜欢主角」写在这里，角色资料里反而没有。
// plot 为剧情注入器的设定条目，人物关系常写在这里。
export function buildStartRelationRequest(people, { prompt, hero = '', plot = '' } = {}) {
    const list = people.slice(0, SHEET_BATCH_MAX).map((p) => `【${p.name}】${ownOf(p) || '（没有资料）'}`);
    const heroText = String(hero || '').trim();
    const plotText = String(plot || '').trim();
    return {
        system: prompt || DEFAULT_STAT_PROMPTS.startRelations,
        user: `主角：${PROTAGONIST}\n${heroText ? `主角资料：${heroText}\n` : ''}${plotText ? `剧情设定：${plotText}\n` : ''}${worldRef(people.slice(0, SHEET_BATCH_MAX))}角色资料：\n${list.join('\n')}`,
    };
}

// 返回 { ok, relations: { 角色: 关系档 }, mods: { 角色: [修饰] } }：只收名单内角色与白名单档位（含近义词），含数字的项丢弃。
// 关系档可带修饰（「恋人+猜忌」），修饰词不认识的单个丢弃，不影响关系档。
export function parseStartRelationReply(reply, { names = [] } = {}) {
    const obj = extractJson(reply);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'stats-start-invalid', relations: {}, mods: {} };
    const allowed = new Set(names);
    const relations = {};
    const mods = {};
    for (const [name, raw] of Object.entries(obj)) {
        const parsed = allowed.has(name) && typeof raw === 'string' ? parseStartRelation(raw) : null;
        if (!parsed) continue;
        relations[name] = parsed.tier;
        if (parsed.mods.length) mods[name] = parsed.mods;
    }
    return Object.keys(relations).length ? { ok: true, relations, mods } : { ok: false, reason: 'stats-start-empty', relations, mods };
}

// 补全写回 NPC 卡：已有的非临时值不改，只填空（§6.2 第三层）。返回新卡。
export function applyBackfillToSheet(sheet, fill, { name, chatSeed = '', heroSkill = null } = {}) {
    const base = sheet || { rank: RANKS[0], attributes: {}, skills: {}, signature: [], source: 'default', provisional: {} };
    const skills = { ...(base.skills || {}) };
    const provisional = { ...(base.provisional || {}) };
    let changed = false;
    for (const [skill, tier] of Object.entries(fill || {})) {
        if (skills[skill] && !provisional[skill]) continue;
        const v = npcSkillValue(tier, typeof heroSkill === 'function' ? heroSkill(skill) : null, `${chatSeed}|${name}|${skill}`);
        if (v) skills[skill] = v;
        else delete skills[skill];
        delete provisional[skill];
        changed = true;
    }
    return changed ? { ...base, skills, provisional } : base;
}

// 角色卡里的「擅长」一行（提示词 sheets 段）：精通以上，最多 4 项。
export function strongSkills(sheet, growth = null) {
    if (!sheet || !sheet.skills) return '';
    const bonus = (skill) => Number(growth && growth[skill] && growth[skill].bonus) || 0;
    return Object.entries(sheet.skills).map(([k, v]) => [k, Number(v) + bonus(k)]).filter(([, v]) => Number(v) >= 75).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}（${skillTierOfValue(v)}）`).join('、');
}
