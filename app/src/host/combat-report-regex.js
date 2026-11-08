// 战报折叠显示的酒馆正则：把正文里的 <igs-combat-report> 块（及其后的经验/战利品标记行）
// 在显示层折叠成 <details>，不影响发给模型的提示词。
import { getTavernHelper } from './tavern-helper-adapter.js';

export const COMBAT_REPORT_REGEX_ID = 'igs-combat-report-display';
// 匹配战报块及其后紧跟的 [igs-combat:exp|...] / [igs-combat:loot|...] / [igs-combat:purge|...] / [igs-combat:card-upgrade|...] 行
export const COMBAT_REPORT_FIND = '/<igs-combat-report\\b[^>]*>[\\s\\S]*?<\\/igs-combat-report>(?:\\n\\[igs-combat:(?:exp|loot|purge|card-upgrade)\\|[^\\]\\n]*\\])*/gi';
export const COMBAT_REPORT_REPLACE = `<details><summary>战斗记录</summary>

{{match}}

</details>`;

// 正则定义（全局作用域，仅作用于显示层的用户输入）
export function combatReportRegex() {
    return {
        id: COMBAT_REPORT_REGEX_ID,
        script_name: 'IGS 战斗扩展：折叠战报',
        enabled: true,
        run_on_edit: true,
        scope: 'global',
        find_regex: COMBAT_REPORT_FIND,
        replace_string: COMBAT_REPORT_REPLACE,
        source: { user_input: true, ai_output: false, slash_command: false, world_info: false },
        destination: { display: true, prompt: false },
        min_depth: null,
        max_depth: null,
    };
}

// 确保酒馆里存在且与当前定义一致的正则；一致则不写，返回 changed:false。
export async function ensureCombatReportRegex(host = globalThis) {
    const helper = getTavernHelper(host);
    if (!helper || typeof helper.getTavernRegexes !== 'function' || typeof helper.replaceTavernRegexes !== 'function') {
        return { ok: false, reason: 'regex-api-missing' };
    }
    const wanted = combatReportRegex();
    let existing;
    try {
        existing = helper.getTavernRegexes({ scope: 'global' }) || [];
    } catch {
        return { ok: false, reason: 'regex-read-failed' };
    }
    const current = existing.find((item) => item && item.id === COMBAT_REPORT_REGEX_ID);
    if (current && JSON.stringify(current) === JSON.stringify(wanted)) return { ok: true, changed: false };
    const others = existing.filter((item) => item && item.id !== COMBAT_REPORT_REGEX_ID);
    try {
        await helper.replaceTavernRegexes([...others, wanted], { scope: 'global' });
    } catch {
        return { ok: false, reason: 'regex-write-failed' };
    }
    return { ok: true, changed: true };
}

export const CHALLENGE_REPORT_REGEX_ID = 'igs-challenge-report-display';
export const CHALLENGE_REPORT_FIND = '/<igs-challenge-report\b[^>]*>[\s\S]*?<\/igs-challenge-report>/gi';
export const CHALLENGE_REPORT_REPLACE = `<details><summary>挑战记录</summary>

{{match}}

</details>`;

export function challengeReportRegex() {
    return { ...combatReportRegex(), id: CHALLENGE_REPORT_REGEX_ID, script_name: 'IGS 日常挑战：折叠战报', find_regex: CHALLENGE_REPORT_FIND, replace_string: CHALLENGE_REPORT_REPLACE };
}

// 日常挑战战报的折叠正则，写法与 ensureCombatReportRegex 一致。
export async function ensureChallengeReportRegex(host = globalThis) {
    const helper = getTavernHelper(host);
    if (!helper || typeof helper.getTavernRegexes !== 'function' || typeof helper.replaceTavernRegexes !== 'function') {
        return { ok: false, reason: 'regex-api-missing' };
    }
    const wanted = challengeReportRegex();
    let existing;
    try {
        existing = helper.getTavernRegexes({ scope: 'global' }) || [];
    } catch {
        return { ok: false, reason: 'regex-read-failed' };
    }
    const current = existing.find((item) => item && item.id === CHALLENGE_REPORT_REGEX_ID);
    if (current && JSON.stringify(current) === JSON.stringify(wanted)) return { ok: true, changed: false };
    const others = existing.filter((item) => item && item.id !== CHALLENGE_REPORT_REGEX_ID);
    try {
        await helper.replaceTavernRegexes([...others, wanted], { scope: 'global' });
    } catch {
        return { ok: false, reason: 'regex-write-failed' };
    }
    return { ok: true, changed: true };
}
