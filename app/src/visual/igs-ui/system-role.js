export const SYSTEM_ROLE_ALIGNS = Object.freeze(['left', 'center', 'indent']);
export const SYSTEM_ROLE_DEFAULTS = Object.freeze({
    words: Object.freeze(['系统', '系统消息', '系统提示', '系统通知', 'System']),
    showName: false,
    font: '',
    color: '',
    align: 'center',
});

const BRACKETS_RE = /^[\s【\[(（《<「『]+|[\s】\])）》>」』]+$/g;

export function stripRoleBrackets(value) {
    return String(value == null ? '' : value).trim().replace(BRACKETS_RE, '').trim();
}

function normalizeWords(value) {
    if (!Array.isArray(value)) return Array.from(SYSTEM_ROLE_DEFAULTS.words);
    const output = [];
    for (const item of value) {
        const word = stripRoleBrackets(item);
        if (word && !output.some((w) => w.toLowerCase() === word.toLowerCase())) output.push(word);
    }
    return output;
}

// 空 font/color 表示跟随旁白样式；显式空词池保持为空。
export function normalizeSystemRoleSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        words: normalizeWords(source.words),
        showName: source.showName === true,
        font: typeof source.font === 'string' && source.font !== 'inherit' ? source.font.trim() : '',
        color: /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? source.color.toLowerCase() : '',
        align: SYSTEM_ROLE_ALIGNS.includes(source.align) ? source.align : SYSTEM_ROLE_DEFAULTS.align,
    };
}

export function isSystemRole(name, settings) {
    const target = stripRoleBrackets(name).toLowerCase();
    return Boolean(target) && normalizeSystemRoleSettings(settings).words.some((w) => w.toLowerCase() === target);
}
