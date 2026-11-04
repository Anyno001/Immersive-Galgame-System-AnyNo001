// 日常挑战标签解析：从楼层正文里取末行的 [igs-challenge:事件名|领域|难度|代价|对方]，校验字段并给出诊断。
// 纯函数。标签文本为 AI 输出，一律按不可信输入处理；数值全部由脚本查表，标签里只有离散词。
import { combatBodyText } from './combat-directives.js';
import { stripMarkerDirectives } from './directive-tags.js';
import { DEFAULT_SKILL_LIST } from './stats/stat-skill-match.js';

export const CHALLENGE_TIERS = Object.freeze({ 轻松: '轻松', easy: '轻松', 普通: '普通', normal: '普通', 艰难: '艰难', hard: '艰难' });
export const CHALLENGE_STAKES = Object.freeze({
    压力: '压力', stress: '压力', 体力: '体力', stamina: '体力', 金钱: '金钱', money: '金钱', 关系: '关系', relation: '关系',
});
export const CHALLENGE_ENABLED_STAKES = Object.freeze(['压力', '体力', '金钱', '关系']);
export const CHALLENGE_DEFAULT_TIER = '普通';
export const CHALLENGE_DEFAULT_STAKE = '压力';
export const CHALLENGE_QUOTA = Object.freeze({ perDay: 1, perDayMax: 5, cooldownFloors: 8 });

const NAME_MAX = 20;
const FIELD_MAX = 5;
const TAG_PATTERN = /\[igs-challenge[:：]([^\]\n]*)\]/gi;

function tagHashOf(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function scanChallengeTags(text) {
    const seen = new Map();
    const tags = [];
    for (const match of String(text || '').matchAll(TAG_PATTERN)) {
        const fields = match[1].split(/[|｜]/).map((part) => part.trim());
        const tagHash = tagHashOf(['challenge', ...fields].join('|'));
        const occurrence = seen.get(tagHash) || 0;
        seen.set(tagHash, occurrence + 1);
        tags.push({ fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

function lastNonEmptyLine(text) {
    const lines = String(text || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].trim()) return lines[i].trim();
    return '';
}

// 标签后面只剩纯标记行时视同末行；后面还有任何正文则不是末行。
function withoutTrailingMarkers(body) {
    const lines = String(body || '').split('\n');
    while (lines.length) {
        const line = lines[lines.length - 1].trim();
        if (line && (/\[igs-challenge[:：]/i.test(line) || stripMarkerDirectives(line).trim())) break;
        lines.pop();
    }
    return lines.join('\n');
}

// 每个游戏日的挑战上限与楼数冷却；state 是数值存档，settings 为 { perDay, cooldownFloors, floor }。
export function challengeQuota(state, settings = {}) {
    const rawPerDay = settings.perDay === null || settings.perDay === '' || settings.perDay === undefined ? NaN : Math.floor(Number(settings.perDay));
    // perDay 为 0 表示不限次数。
    const perDay = Number.isFinite(rawPerDay) ? Math.min(CHALLENGE_QUOTA.perDayMax, Math.max(0, rawPerDay)) : CHALLENGE_QUOTA.perDay;
    const cooldown = Number.isFinite(Number(settings.cooldownFloors)) ? Math.max(0, Math.floor(Number(settings.cooldownFloors))) : CHALLENGE_QUOTA.cooldownFloors;
    const clock = state?.clock || {};
    const used = Math.max(0, Math.floor(Number(clock.challenges)) || 0);
    if (perDay > 0 && used >= perDay) return { ok: false, reason: 'quota', used, perDay };
    const last = Number(clock.lastChallengeFloor);
    const floor = Number(settings.floor);
    if (Number.isInteger(last) && Number.isInteger(floor) && floor - last < cooldown) return { ok: false, reason: 'cooldown', used, perDay };
    return { ok: true, used, perDay };
}

const invalid = (field, problem) => ({ ok: false, field, problem });

// options：skills（领域白名单，缺省为内置技能清单）、present（在场人物名，给了才核对「对方」）、quota（challengeQuota 的结果）、enabledStakes、sourceFilter。
export function parseChallengeStart(raw, options = {}) {
    const body = combatBodyText(raw, { sourceFilter: options.sourceFilter });
    const tags = scanChallengeTags(body);
    const diagnostics = [];
    if (!tags.length) return { start: null, diagnostics };
    const head = withoutTrailingMarkers(body);
    const last = tags.at(-1);
    const atTail = lastNonEmptyLine(head) === last.raw && head.trimEnd().endsWith(last.raw);
    const where = (tag) => ({ tagHash: tag.tagHash, occurrence: tag.occurrence, index: tag.index });
    for (const tag of tags) if (tag !== last || !atTail) diagnostics.push({ code: 'challenge-not-tail', ...where(tag) });
    if (!atTail) return { start: null, diagnostics };
    const parsed = parseFields(last.fields, options, diagnostics, where(last));
    if (!parsed.ok) {
        diagnostics.push({ code: parsed.code, field: parsed.field, problem: parsed.problem, ...where(last) });
        return { start: null, diagnostics };
    }
    if (options.quota && !options.quota.ok) {
        diagnostics.push({ code: 'challenge-quota', reason: options.quota.reason, ...where(last) });
        return { start: null, diagnostics };
    }
    return { start: { ...parsed.value, ...where(last) }, diagnostics };
}

function parseFields(fields, options, diagnostics, where) {
    if (fields.length > FIELD_MAX) return { ...invalid('fields', 'too-many-fields'), code: 'challenge-too-many-fields' };
    const event = fields[0] || '';
    if (!event) return { ...invalid('event', 'required'), code: 'challenge-event-invalid' };
    if (event.length > NAME_MAX) return { ...invalid('event', 'too-long'), code: 'challenge-event-invalid' };
    const tierWord = (fields[2] || '').toLowerCase();
    if (tierWord && !Object.hasOwn(CHALLENGE_TIERS, tierWord)) return { ...invalid('tier', 'unknown-tier'), code: 'challenge-tier-unknown' };
    const stakeWord = (fields[3] || '').toLowerCase();
    if (stakeWord && !Object.hasOwn(CHALLENGE_STAKES, stakeWord)) return { ...invalid('stake', 'unknown-stake'), code: 'challenge-stake-unknown' };
    const skills = options.skills || DEFAULT_SKILL_LIST;
    let domain = fields[1] || '';
    if (domain && !skills.includes(domain)) {
        diagnostics.push({ code: 'challenge-domain-unknown', name: domain, ...where });
        domain = '';
    }
    const requestedStake = stakeWord ? CHALLENGE_STAKES[stakeWord] : CHALLENGE_DEFAULT_STAKE;
    const enabled = options.enabledStakes || CHALLENGE_ENABLED_STAKES;
    let stake = enabled.includes(requestedStake) ? requestedStake : CHALLENGE_DEFAULT_STAKE;
    let counterpart = fields[4] || '';
    if (counterpart && (counterpart.length > NAME_MAX || (Array.isArray(options.present) && !options.present.includes(counterpart)))) {
        diagnostics.push({ code: 'challenge-counterpart-ignored', name: counterpart.slice(0, NAME_MAX), ...where });
        counterpart = '';
    }
    if (stake === '关系' && !counterpart) stake = CHALLENGE_DEFAULT_STAKE;
    if (stake !== requestedStake) diagnostics.push({ code: 'challenge-stake-degraded', from: requestedStake, to: stake, ...where });
    return { ok: true, value: { event, domain, tier: tierWord ? CHALLENGE_TIERS[tierWord] : CHALLENGE_DEFAULT_TIER, stake, requestedStake, counterpart } };
}
