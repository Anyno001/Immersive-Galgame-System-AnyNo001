// [igs-stat:…] 数值标签解析与剔除。只认离散档位；战斗数量与时间跳跃天数是结构参数，单独限幅。
// 容错（易错点 C1）：[] 或 【】 包裹、半角或全角冒号与竖线、字段两侧多空格与换行。
import { DIM_DIRECTIONS, DIM_KINDS, ENEMY_TIERS, FAVOR_DIRECTIONS, HURT_TIERS, KEY_EVENTS, MONEY_FLOWS, MONEY_TIERS, ROLL_DIFFICULTIES, STAMINA_EVENTS, START_RELATIONS, normalizeTier } from './stat-vocab.js';
import { parseSkipDays } from './stat-duration.js';

const tagPattern = () => /[\[【]\s*igs-stat\s*[:：]([^\]】]*)[\]】]/gi;
const BATTLE_COUNT_MAX = 9;
const FREE_TEXT_MAX = 20;

function freeText(raw) {
    const text = String(raw ?? '').trim();
    return text && text.length <= FREE_TEXT_MAX && !/[0-9０-９]/.test(text) ? text : null;
}

function battleCount(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return 1;
    const count = Number.parseInt(text, 10);
    return Number.isInteger(count) && count >= 1 ? Math.min(BATTLE_COUNT_MAX, count) : null;
}

function parseFields([kindRaw, a, b, c]) {
    const kind = String(kindRaw || '').trim().toLowerCase();
    const target = freeText(a);
    if (kind === 'favor' || kind === '好感') {
        const value = normalizeTier('favor', FAVOR_DIRECTIONS, b);
        return target && value ? { kind: 'favor', target, dim: '好感', value } : null;
    }
    if (kind === 'start' || kind === '起始关系') {
        const value = normalizeTier('start', START_RELATIONS, b);
        return target && value ? { kind: 'start', target, value } : null;
    }
    if (DIM_KINDS[kind]) {
        const value = normalizeTier('dim', DIM_DIRECTIONS, b);
        return target && value ? { kind: 'dim', target, dim: DIM_KINDS[kind], value } : null;
    }
    switch (kind) {
    case 'stamina': { const value = normalizeTier('stamina', STAMINA_EVENTS, a); return value ? { kind, value } : null; }
    case 'stress': { const value = normalizeTier('dim', DIM_DIRECTIONS, a); return value ? { kind, value } : null; }
    case 'money': {
        const flow = normalizeTier('flow', MONEY_FLOWS, a);
        const value = normalizeTier('moneyTier', MONEY_TIERS, b);
        return flow && value ? { kind, flow, value } : null;
    }
    case 'sleep': return { kind };
    case 'hurt': { const value = normalizeTier('hurt', HURT_TIERS, a); return value ? { kind, value } : null; }
    case 'event': { const value = normalizeTier('event', KEY_EVENTS, b); return target && value ? { kind, target, value } : null; }
    case 'gift': { const value = freeText(b); return target && value ? { kind, target, value } : null; }
    case 'grow': { const skill = freeText(b); return target && skill ? { kind, target, skill } : null; }
    case 'work': return { kind, value: freeText(a) || '打工' };
    case 'battle': {
        const tier = normalizeTier('enemy', ENEMY_TIERS, a);
        const count = battleCount(b);
        const ally = freeText(c);
        return tier && count ? { kind, tier, count, ...(ally ? { ally } : {}) } : null;
    }
    case 'skip': { const skip = parseSkipDays(a); return skip ? { kind, ...skip } : null; }
    default: return null;
    }
}

// 预掷 / 手动掷骰标签（v2 §5.2）：[igs-stat:roll|技能|难度|属性或「对抗:角色」|对方技能]。第 3 栏起顺序不限。
const ROLL_OPPOSE = /^(?:对抗|对|vs)\s*[:：]\s*(.+)$/i;

function parseRoll(fields) {
    const skill = freeText(fields[1]);
    if (!skill) return null;
    const out = { kind: 'roll', skill, difficulty: '普通' };
    let sawOppose = false;
    for (const raw of fields.slice(2)) {
        const text = String(raw || '').trim();
        if (!text) continue;
        const diff = normalizeTier('difficulty', ROLL_DIFFICULTIES, text);
        const oppose = text.match(ROLL_OPPOSE);
        if (diff) out.difficulty = diff;
        else if (oppose && freeText(oppose[1])) { out.against = freeText(oppose[1]); sawOppose = true; }
        else if (sawOppose && !out.opposedSkill && freeText(text)) out.opposedSkill = freeText(text);
        else if (!out.attribute && freeText(text)) out.attribute = freeText(text);
    }
    return out;
}

// 返回 { directives, diagnostics }；被拒的标签记诊断，不抛错。
export function parseStatDirectives(text) {
    const directives = [];
    const diagnostics = [];
    for (const match of String(text ?? '').matchAll(tagPattern())) {
        const fields = match[1].split(/[|｜]/).map((field) => field.replace(/\s+/g, ' ').trim());
        const directive = String(fields[0] || '').trim().toLowerCase() === 'roll' || fields[0] === '检定' ? parseRoll(fields) : parseFields(fields);
        if (directive) directives.push(directive);
        else diagnostics.push({ code: 'stat-tag-rejected', raw: match[0].slice(0, 80) });
    }
    return { directives, diagnostics };
}

// 短哈希（FNV-1a）：给生命类标签算 tagHash，战斗账本按它去重与对账。
function shortHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `sh${(h >>> 0).toString(36)}`;
}

// 只扫生命类标签（battle、hurt，以及体力「受伤」折成轻伤），给每个标签算 tagHash 与同哈希出现序号，交给战斗账本记伤势。
export function scanStatLifeTags(text) {
    const out = [];
    const seen = new Map();
    const push = (tag, key) => {
        const tagHash = shortHash(key);
        const occurrence = seen.get(tagHash) || 0;
        seen.set(tagHash, occurrence + 1);
        out.push({ ...tag, tagHash, occurrence });
    };
    for (const match of String(text ?? '').matchAll(tagPattern())) {
        const directive = parseFields(match[1].split(/[|｜]/).map((field) => field.replace(/\s+/g, ' ').trim()));
        if (directive && directive.kind === 'battle') {
            push({ kind: 'battle' }, `battle|${directive.tier}|${directive.count}|${directive.ally || ''}`);
            continue;
        }
        const tier = directive && directive.kind === 'hurt' ? directive.value
            : directive && directive.kind === 'stamina' && directive.value === '受伤' ? '轻伤' : null;
        if (tier) push({ kind: 'hurt', tier }, `hurt|${tier}`);
    }
    return out;
}

// 阅读器、语音、漫画泡、弹幕统一用剔除后的文本（易错点 C4；出口接入在 P1.5 之后）。
export function stripStatDirectives(text) {
    const source = String(text ?? '');
    if (!tagPattern().test(source)) return source;
    return source.replace(tagPattern(), '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
}
