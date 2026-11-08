// [igs-stat:…] 数值标签解析与剔除。只认离散档位；战斗数量与时间跳跃天数是结构参数，单独限幅。
// 容错（易错点 C1）：[] 或 【】 包裹、半角或全角冒号与竖线、字段两侧多空格与换行。
import { FAVOR_STRENGTHS, INTIMATE_LEVELS, DIM_DIRECTIONS, DIM_KINDS, ENEMY_TIERS, FAVOR_DIRECTIONS_LEGACY, HERO_STATES, HURT_TIERS, KEY_EVENTS, KEY_EVENTS_LEGACY, TRAIT_EVENTS, MONEY_FLOWS, MONEY_TIERS, ROLL_DIFFICULTIES, STAMINA_EVENTS, START_FIX_DIMS, START_FIX_LEVELS, STRESS_STRENGTHS, normalizeTier, parseStartRelation, resolveFavorWord } from './stat-vocab.js';
import { SKIP_DAYS_MAX, SKIP_DAYS_MAX_LEGACY, parseSkipDays } from './stat-duration.js';
import { STATUS_TAG_OFF, STATUS_TAG_ON, getStatusDef } from './stat-status-defs.js';
import { STRAIN_NAMES, normalizeStressSource } from './stat-strain.js';

const tagPattern = () => /[\[【]\s*igs-stat\s*[:：]([^\]】]*)[\]】]/gi;
const BATTLE_COUNT_MAX = 9;
const FREE_TEXT_MAX = 20;

function freeText(raw) {
    const text = String(raw ?? '').trim();
    return text && text.length <= FREE_TEXT_MAX && !/[0-9０-９]/.test(text) ? text : null;
}

// 声望标签字段：找到方向词所在位置，之前的一段为条名、两段为条名与搭档，之后一段为可选强度（小/中/大，写了归一不了整条丢弃）。
const FAME_STRENGTH_WORDS = Object.freeze(['小', '中', '大']);
function parseFame(fields) {
    const list = fields.map((f) => String(f ?? '').trim());
    const at = list.findIndex((f) => normalizeTier('dim', DIM_DIRECTIONS, f));
    if (at < 0 || at > 2) return null;
    const value = normalizeTier('dim', DIM_DIRECTIONS, list[at]);
    const given = list[at + 1] || '';
    const strength = given ? normalizeTier('strength', FAME_STRENGTH_WORDS, given) : null;
    if (given && !strength) return null;
    const bar = at >= 1 ? freeText(list[0]) : null;
    const partner = at === 2 ? freeText(list[1]) : null;
    if ((at >= 1 && !bar) || (at === 2 && !partner)) return null;
    return { kind: 'fame', value, ...(bar ? { bar } : {}), ...(partner ? { partner } : {}), ...(strength ? { strength } : {}) };
}

function battleCount(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return 1;
    const count = Number.parseInt(text, 10);
    return Number.isInteger(count) && count >= 1 ? Math.min(BATTLE_COUNT_MAX, count) : null;
}

// ctx：{ rev, moodGroups, diagnostics }。rev ≥ 1（新楼）才认新方向词、情绪组兜底、芥蒂与压力强度；rev ≥ 2 另认交心、clear、insight、hero、romance、起始关系标记、更多近义词与十年跳跃上限；缺省按旧规则，旧楼重算结果不变。
function parseFields([kindRaw, a, b, c, d], ctx = {}) {
    const rev = Number(ctx.rev) >= 1;
    const rev2 = Number(ctx.rev) >= 2;
    const kind = String(kindRaw || '').trim().toLowerCase();
    const target = freeText(a);
    if (kind === 'favor' || kind === '好感') {
        let value;
        if (rev) {
            const hit = resolveFavorWord(b, ctx.moodGroups, Number(ctx.rev) || 0);
            if (!hit) { if (ctx.diagnostics && target) ctx.diagnostics.push({ code: 'stat-favor-unknown', name: target, word: String(b ?? '').slice(0, 20) }); return null; }
            if (hit.valued === false && ctx.diagnostics) ctx.diagnostics.push({ code: 'stat-favor-group-unvalued', name: target, group: hit.group });
            value = hit.value;
        } else value = normalizeTier('favor', FAVOR_DIRECTIONS_LEGACY, b);
        // 第四段为可选强度；写了但归一不了（含数字）整条丢弃，省略则由结算按方向推定。
        const given = String(c ?? '').trim();
        const strength = given ? normalizeTier('strength', FAVOR_STRENGTHS, given) : null;
        if (given && !strength) return null;
        return target && value ? { kind: 'favor', target, dim: '好感', value, ...(strength ? { strength } : {}) } : null;
    }
    if (kind === 'start' || kind === '起始关系') {
        const parsed = parseStartRelation(b, c, { marks: rev2 });
        return target && parsed ? { kind: 'start', target, value: parsed.tier, ...(parsed.mods.length ? { mods: parsed.mods } : {}), ...(parsed.marks ? { marks: parsed.marks } : {}), ...(parsed.kin ? { kin: true } : {}) } : null;
    }
    // 开局修正：[igs-stat:startfix|角色|信任/芥蒂|轻/中/重]，每个角色每项只生效一次。
    if (kind === 'startfix' || kind === '开局修正') {
        const dim = normalizeTier('fixDim', START_FIX_DIMS, b);
        const level = normalizeTier('fixLevel', START_FIX_LEVELS, c);
        return target && dim && level ? { kind: 'startfix', target, dim, value: level } : null;
    }
    if (DIM_KINDS[kind]) {
        const value = normalizeTier('dim', DIM_DIRECTIONS, b);
        // 信任可带强度（第四段）；新楼的芥蒂同样可带。写了但归一不了（含数字）整条丢弃，省略按「小」。其他维度不读第四段。
        const given = DIM_KINDS[kind] === '信任' || (rev && DIM_KINDS[kind] === '芥蒂') ? String(c ?? '').trim() : '';
        const strength = given ? normalizeTier('strength', FAVOR_STRENGTHS, given) : null;
        if (given && !strength) return null;
        return target && value ? { kind: 'dim', target, dim: DIM_KINDS[kind], value, ...(strength ? { strength } : {}) } : null;
    }
    switch (kind) {
    // 生活条标签可选带角色名：stamina|档位 或 stamina|角色|档位；money|收入/花费|档位 或 money|角色|收入/花费|档位。不带角色名算主角。
    case 'stamina': {
        const own = normalizeTier('stamina', STAMINA_EVENTS, a);
        const value = own || normalizeTier('stamina', STAMINA_EVENTS, b);
        const who = own ? null : freeText(a);
        return value && (own || who) ? { kind, value, ...(who ? { target: who } : {}) } : null;
    }
    case 'stress': {
        const own = normalizeTier('dim', DIM_DIRECTIONS, a);
        const value = own || normalizeTier('dim', DIM_DIRECTIONS, b);
        const who = own ? null : freeText(a);
        // 新楼可带强度：方向在第一段时第二段为强度，第一段是角色名时第三段为强度；省略按「中」，写了但归一不了整条丢弃。
        const given = rev ? String((own ? b : c) ?? '').trim() : '';
        const tier = given ? normalizeTier('stressStrength', STRESS_STRENGTHS, given) : null;
        if (given && !tier) return null;
        // 极大只在 rev ≥ 2 且为上升时有效，其余按「大」。
        const strength = tier === '极大' && !(rev2 && value === '上升') ? '大' : tier;
        // rev ≥ 2：强度之后可带来源（被迫、恐惧等），认不出的来源忽略，不影响整条。
        const source = rev2 ? normalizeStressSource(own ? c : d) : null;
        return value && (own || who) ? { kind, value, ...(who ? { target: who } : {}), ...(strength ? { strength } : {}), ...(source ? { source } : {}) } : null;
    }
    // 压力满后转换（rev ≥ 2）：break|状态名（主角）或 break|角色名|状态名。
    case 'break': {
        if (!rev2) return null;
        const own = STRAIN_NAMES.includes(String(a ?? '').trim()) ? String(a).trim() : null;
        const name = own || (STRAIN_NAMES.includes(String(b ?? '').trim()) ? String(b).trim() : null);
        const who = own ? null : freeText(a);
        return name && (own || who) ? { kind, value: name, ...(who ? { target: who } : {}) } : null;
    }
    case 'money': {
        const own = normalizeTier('flow', MONEY_FLOWS, a);
        const flow = own || normalizeTier('flow', MONEY_FLOWS, b);
        const value = normalizeTier('moneyTier', MONEY_TIERS, own ? b : c);
        const who = own ? null : freeText(a);
        return flow && value && (own || who) ? { kind, flow, value, ...(who ? { target: who } : {}) } : null;
    }
    case 'intimate': case '亲密': {
        const level = normalizeTier('intimate', INTIMATE_LEVELS, b);
        return target && level ? { kind: 'intimate', target, value: level } : null;
    }
    case 'sleep': return { kind };
    case 'hurt': { const value = normalizeTier('hurt', HURT_TIERS, a); return value ? { kind, value } : null; }
    case 'event': {
        const value = normalizeTier('event', rev2 ? KEY_EVENTS : KEY_EVENTS_LEGACY, b);
        if (value) return target ? { kind, target, value } : null;
        const mark = rev2 ? normalizeTier('event', TRAIT_EVENTS, b) : null;
        return target && mark ? { kind: 'traitEvent', target, value: mark } : null;
    }
    case 'gift': { const value = freeText(b); return target && value ? { kind, target, value } : null; }
    case 'grow': { const skill = freeText(b); return target && skill ? { kind, target, skill } : null; }
    case 'work': return { kind, value: freeText(a) || '打工' };
    case 'battle': {
        const tier = normalizeTier('enemy', ENEMY_TIERS, a);
        const count = battleCount(b);
        const ally = freeText(c);
        return tier && count ? { kind, tier, count, ...(ally ? { ally } : {}) } : null;
    }
    // 误会解除、顿悟、主角离体复归、恋爱结束：rev≥2 才认。
    case 'clear': return rev2 && target ? { kind, target } : null;
    case 'insight': { const skill = freeText(b); return rev2 && target && skill ? { kind, target, skill } : null; }
    case 'hero': { const value = rev2 ? normalizeTier('hero', HERO_STATES, a) : null; return value ? { kind, value } : null; }
    case 'romance': { const end = rev2 && String(b ?? '').trim() === '结束'; return end && target ? { kind, target, value: '结束' } : null; }
    // 声望（rev≥2）：fame|条名|方向|强度 或 fame|方向|强度（只开一条时）；组合热度 fame|条名|搭档|方向|强度。
    case 'fame': case '声望': return rev2 ? parseFame([a, b, c, d]) : null;
    // 状态（rev ≥ 2）：status|角色名|状态名|开始/结束，关系状态第五段为对象名；状态名须在定义表里，开始/结束词认不出整条丢弃。
    case 'status': case '状态': {
        const def = rev2 ? getStatusDef(String(b ?? '').trim()) : null;
        const word = String(c ?? '').trim();
        const on = STATUS_TAG_ON.includes(word) ? true : STATUS_TAG_OFF.includes(word) ? false : null;
        const toward = def && def.relation ? freeText(d) : null;
        return target && def && on !== null && (!def.relation || toward) ? { kind: 'status', target, status: def.name, on, ...(toward ? { toward } : {}) } : null;
    }
    case 'skip': { const skip = parseSkipDays(a, rev2 ? SKIP_DAYS_MAX : SKIP_DAYS_MAX_LEGACY); return skip ? { kind, ...skip } : null; }
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
// opts：{ rev（≥1 为新规则）, moodGroups（当前情绪分组，用于好感方向词兜底） }。
export function parseStatDirectives(text, opts = {}) {
    const directives = [];
    const diagnostics = [];
    for (const match of String(text ?? '').matchAll(tagPattern())) {
        const fields = match[1].split(/[|｜]/).map((field) => field.replace(/\s+/g, ' ').trim());
        const directive = String(fields[0] || '').trim().toLowerCase() === 'roll' || fields[0] === '检定' ? parseRoll(fields) : parseFields(fields, { rev: opts.rev, moodGroups: opts.moodGroups, diagnostics });
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
            : directive && directive.kind === 'stamina' && !directive.target && directive.value === '受伤' ? '轻伤' : null;
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
