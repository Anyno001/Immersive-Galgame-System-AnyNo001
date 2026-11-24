// 主角统一初始化请求与解析协议（v1）：一次请求按需补齐主角六维与剧情货币定义，不要求战斗职业、卡组或物品。
// 纯函数：只做请求构造、回复解析与错误说明，不读写宿主或数据库。
import { abilityKeyOf } from '../../combat/abilities.js';
import { ABILITY_KEYS, ABILITY_LABELS, normalizeHeroScores } from './ability-fields.js';
import { CURRENCY_INITIAL_FACTOR, currencyRequestFailure, describeCurrencyFailure, normalizeCurrencyConfig } from './stat-currency.js';
import { ABILITY_SCORE_TIERS, attributeTier, bandValue, parseHeroSkillReply, resolveTraitIds } from './stat-sheets.js';
import { DEFAULT_HERO_INIT_PROMPT } from './stat-prompt.js';

export const HERO_INIT_PROTOCOL_VERSION = 1;
export { DEFAULT_HERO_INIT_PROMPT };

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

function extractJsonObject(reply) {
    const raw = String((reply && typeof reply === 'object' ? reply.text : reply) ?? '');
    if (!raw.trim()) return { ok: false, reason: 'stats-hero-init-reply-empty' };
    const text = raw
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/```[a-z]*\n?|```/gi, '');
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        const end = balancedEnd(text, start);
        if (end < 0) continue;
        const body = text.slice(start, end + 1);
        for (const candidate of [body, body.replace(/,\s*([}\]])/g, '$1')]) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ok: true, data: parsed };
            } catch { /* 继续尝试 */ }
        }
    }
    return { ok: false, reason: 'stats-hero-init-not-json' };
}

function parseAbilityValue(raw, key, chatSeed) {
    if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 1 && raw <= 20 ? raw : null;
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) {
        const n = Number(text);
        return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
    }
    const tier = attributeTier(text);
    if (!tier) return null;
    const score = bandValue(ABILITY_SCORE_TIERS[tier], `${chatSeed}|hero-init|${key}`);
    return Number.isInteger(score) ? Math.min(20, Math.max(1, score)) : null;
}

function parseAttributesObject(raw, chatSeed) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const scores = {};
    for (const [k, v] of Object.entries(raw)) {
        const key = abilityKeyOf(k);
        if (!key || Object.hasOwn(scores, key)) return null;
        const score = parseAbilityValue(v, key, chatSeed);
        if (score === null) return null;
        scores[key] = score;
    }
    return normalizeHeroScores(scores);
}

function parseCurrencyObject(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'stats-currency-config-invalid' };
    const config = normalizeCurrencyConfig({ name: raw.name, table: raw.prices ?? raw.table, rate: raw.rate });
    if (!config) return { ok: false, reason: 'stats-currency-config-invalid' };
    const initial = Number(raw.initial);
    if (!Number.isSafeInteger(initial) || initial < 0 || initial > config.table.巨额 * CURRENCY_INITIAL_FACTOR) {
        return { ok: false, reason: 'stats-currency-initial-invalid' };
    }
    return { ok: true, config, initial };
}

function parseHeroInitSkills(data, availableSkills) {
    if (!Array.isArray(availableSkills) || !availableSkills.length) return null;
    const rawObj = data.skills ?? data.技能;
    if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
        const parsed = parseHeroSkillReply(JSON.stringify(rawObj), { skills: availableSkills });
        return parsed.ok ? parsed.tiers : null;
    }
    const strong = Array.isArray(data.擅长 ?? data.strong) ? (data.擅长 ?? data.strong) : [];
    const good = Array.isArray(data.比较擅长 ?? data.good) ? (data.比较擅长 ?? data.good) : [];
    if (!strong.length && !good.length) return null;
    const mapped = {};
    for (const item of strong) {
        const name = String(item ?? '').trim();
        if (name && !Object.hasOwn(mapped, name)) mapped[name] = '精通';
    }
    for (const item of good) {
        const name = String(item ?? '').trim();
        if (name && !Object.hasOwn(mapped, name)) mapped[name] = '熟练';
    }
    const parsed = parseHeroSkillReply(JSON.stringify(mapped), { skills: availableSkills });
    return parsed.ok ? parsed.tiers : null;
}

export function buildHeroInitRequest({
    protagonist = '主角', worldview = '', story = '', people = [], worldInfo = '', userPersona = '',
    needAttributes = true, needCurrency = true, needBio = false,
    needSkills = false, availableSkills = [], needTraits = false, traitDefs = [],
    existingCurrency = null,
} = {}, { prompt = '' } = {}) {
    const cleanSkills = needSkills && Array.isArray(availableSkills) ? availableSkills.filter(Boolean) : [];
    const cleanTraits = needTraits && Array.isArray(traitDefs) ? traitDefs.filter((d) => d && d.id && d.name) : [];
    const missing = [];
    if (needAttributes) missing.push('attributes（主角六维）');
    if (cleanSkills.length) missing.push('skills（主角擅长技能档位）');
    if (cleanTraits.length) missing.push('traits（主角初始特质，0–3项）');
    if (needCurrency) missing.push('currency（剧情货币定义与开局金额）');
    if (needBio) missing.push('bio（主角简介）');
    const lines = [
        `协议版本：heroInit/v${HERO_INIT_PROTOCOL_VERSION}`,
        `主角：${protagonist}`,
        `需要补齐的项目：${missing.join('、') || '无'}`,
    ];
    if (worldview) lines.push(`世界观：${worldview}`);
    if (cleanSkills.length) lines.push(`可用技能：${cleanSkills.join('、')}`);
    if (cleanTraits.length) lines.push(`可选特质：${cleanTraits.map((d) => d.name).join('、')}`);
    if (String(worldInfo || '').trim()) lines.push(`世界观设定：\n${String(worldInfo).trim()}`);
    if (String(userPersona || '').trim()) lines.push(`主角资料：\n${String(userPersona).trim()}`);
    if (String(story || '').trim()) lines.push(`剧情：\n${String(story).trim()}`);
    const intro = (Array.isArray(people) ? people : []).filter((p) => p && p.name).slice(0, 6)
        .map((p) => `- ${p.name}：${String(p.own ?? p.summary ?? '').trim()}`);
    if (intro.length) lines.push(`角色资料：\n${intro.join('\n')}`);
    if (!needCurrency && existingCurrency?.name) lines.push(`已有剧情货币（无需重新生成）：${existingCurrency.name}`);
    const shape = [];
    const rules = [];
    if (needAttributes) {
        const example = ABILITY_KEYS.map((key) => `"${ABILITY_LABELS[key]}":10`).join(',');
        shape.push(`"attributes":{${example}}`);
    }
    if (cleanSkills.length) {
        shape.push('"skills":{"<技能名>":"<档位>"}');
        rules.push('- skills：只从「可用技能」里选，档位为 未学、入门、熟练、精通、大师（大师至多1项、精通至多2项、熟练至多6项、入门至多8项；不写数字）');
    }
    if (cleanTraits.length) {
        shape.push('"traits":["<特质名>"]');
        rules.push('- traits：0–3 项，只从「可选特质」里挑与主角人设明显相符的特质名，没有写 []');
    }
    if (needCurrency) {
        shape.push('"currency":{"name":"货币名","initial":100,"prices":{"少量":10,"普通":50,"昂贵":200,"巨额":1000},"rate":1}');
    }
    if (needBio) {
        shape.push('"bio":"1-3句简洁主角简介"');
    }
    lines.push(['【输出要求】', `只输出一个 JSON 对象：{${shape.join(',')}}`, ...rules].join('\n'));
    return { system: prompt || DEFAULT_HERO_INIT_PROMPT, user: lines.join('\n\n') };
}

export function parseHeroInitReply(reply, {
    needAttributes = true, needCurrency = true, needSkills = false, availableSkills = [],
    needTraits = false, traitDefs = [], chatSeed = '',
} = {}) {
    const extracted = extractJsonObject(reply);
    if (!extracted.ok) return { ok: false, stage: 'parse', reason: extracted.reason };
    const data = extracted.data;
    const out = { ok: true, protocolVersion: HERO_INIT_PROTOCOL_VERSION };
    if (needAttributes) {
        const rawAttrs = data.attributes ?? data.属性 ?? (!needCurrency && !needSkills ? data : null);
        const attributes = parseAttributesObject(rawAttrs, chatSeed);
        if (!attributes) return { ok: false, stage: 'parse', reason: 'stats-hero-init-attributes-invalid' };
        out.attributes = attributes;
    }
    if (needCurrency) {
        const rawCurrency = data.currency ?? data.货币 ?? (data.name !== undefined && (data.prices !== undefined || data.table !== undefined) ? data : null);
        const parsedCurrency = parseCurrencyObject(rawCurrency);
        if (!parsedCurrency.ok) return { ok: false, stage: 'parse', reason: parsedCurrency.reason };
        out.currency = { config: parsedCurrency.config, initial: parsedCurrency.initial };
    }
    if (needSkills && Array.isArray(availableSkills) && availableSkills.length) {
        const skills = parseHeroInitSkills(data, availableSkills);
        if (skills) out.skills = skills;
    }
    if (needTraits && Array.isArray(traitDefs) && traitDefs.length) {
        const hasTraits = Object.hasOwn(data, 'traits') || Object.hasOwn(data, '特质');
        if (hasTraits) {
            out.hasTraits = true;
            out.traits = resolveTraitIds(data.traits ?? data.特质, traitDefs, 3);
        }
    }
    const rawBio = data.bio ?? data.简介 ?? data.主角简介 ?? data.summary;
    if (typeof rawBio === 'string') {
        const bio = rawBio.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim().slice(0, 240);
        if (bio) out.bio = bio;
    }
    return out;
}

export function heroInitRequestFailure(error) {
    const base = currencyRequestFailure(error);
    return base.reason === 'stats-currency-request-failed'
        ? { ...base, reason: 'stats-hero-init-request-failed' }
        : base;
}

const HERO_INIT_STAGES = Object.freeze({
    request: '请求',
    parse: '解析',
    'result-saved': '意图保存',
    attributes: '六维写入',
    'currency-config': '货币定义保存',
    'currency-seed': '初始金额入账',
    seed: '初始化',
    recover: '恢复',
    read: '读取',
});

const HERO_INIT_FAILURES = Object.freeze({
    'stats-hero-init-request-failed': '请求失败，发送状态未知',
    'stats-hero-init-reply-empty': '回复为空',
    'stats-hero-init-not-json': '回复不是有效 JSON',
    'stats-hero-init-attributes-invalid': '主角六维不完整或超出合法范围',
    'stats-hero-init-intent-invalid': '本地主角初始化待恢复记录不合法',
    'stats-hero-init-intent-read-failed': '本地主角初始化待恢复记录读取失败',
    'stats-hero-init-intent-save-failed': '本地主角初始化待恢复记录保存未确认',
    'stats-attribute-conflict': '主角六维已发生变化，未覆盖现有数据',
    'stats-attribute-save-pending': '存在未确认的属性修改，请先恢复',
    'combat-attribute-table-missing': '属性表暂不可用',
    'igs-layout-unconfirmed': '当前聊天存储布局尚未确认',
});

export function describeHeroInitFailure({ stage = 'recover', reason = '', status, done = false } = {}) {
    if (reason && Object.hasOwn(HERO_INIT_FAILURES, reason)) {
        const http = Number.isInteger(status) && status >= 400 && status <= 599 ? `（HTTP ${status}）` : '';
        return `主角初始化${HERO_INIT_STAGES[stage] || '处理'}失败：${HERO_INIT_FAILURES[reason]}${http}。可手动重试`;
    }
    return describeCurrencyFailure({ stage, reason, status, done });
}
