import { getTavernHelper } from './tavern-helper-adapter.js';

// 战报楼在聊天界面里折叠为「战斗记录」：只注册 display 目标，prompt 目标不处理，主模型看到原文。
// 战报是程序发出的用户楼，所以只作用于 user_input；战报块后面程序附带的 exp 与 loot 标签行一并折叠。
export const COMBAT_REPORT_REGEX_ID = 'igs-combat-report-display';
export const COMBAT_REPORT_FIND = '/<igs-combat-report\\b[^>]*>[\\s\\S]*?<\\/igs-combat-report>(?:\\n\\[igs-combat:(?:exp|loot)\\|[^\\]\\n]*\\])*/gi';
export const COMBAT_REPORT_REPLACE = '<details><summary>战斗记录</summary>\n\n{{match}}\n\n</details>';

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

// 幂等：已有同 ID 且内容一致时不写；其余全局正则原样保留。
export async function ensureCombatReportRegex(globalObject = globalThis) {
    const helper = getTavernHelper(globalObject);
    if (!helper || typeof helper.getTavernRegexes !== 'function' || typeof helper.replaceTavernRegexes !== 'function') {
        return { ok: false, reason: 'regex-api-missing' };
    }
    const wanted = combatReportRegex();
    let current;
    try { current = helper.getTavernRegexes({ scope: 'global' }) || []; } catch { return { ok: false, reason: 'regex-read-failed' }; }
    const existing = current.find((r) => r && r.id === COMBAT_REPORT_REGEX_ID);
    if (existing && JSON.stringify(existing) === JSON.stringify(wanted)) return { ok: true, changed: false };
    const others = current.filter((r) => r && r.id !== COMBAT_REPORT_REGEX_ID);
    try {
        await helper.replaceTavernRegexes([...others, wanted], { scope: 'global' });
    } catch {
        return { ok: false, reason: 'regex-write-failed' };
    }
    return { ok: true, changed: true };
}
