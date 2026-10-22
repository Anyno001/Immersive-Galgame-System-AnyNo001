// 武侠江湖包的标签语法：纯数据与解析，不碰 DOM。缺必填字段则整条忽略。
export const WUXIA_KINDS = Object.freeze(['wxname', 'wxpalm', 'wxdart', 'wxmanual', 'wxtoken', 'wxoath', 'wxmad']);

export const WUXIA_LABELS = Object.freeze({
    wxname: '名号亮相', wxpalm: '内力对掌', wxdart: '暗器', wxmanual: '秘籍', wxtoken: '江湖令', wxoath: '结义拜师', wxmad: '走火入魔',
});

export const WUXIA_TRIGGERS = Object.freeze({
    wxname: ['名号', '绰号', '外号', '人称'], wxpalm: ['对掌', '内力', '比拼内力'], wxdart: ['暗器', '袖箭', '飞镖', '银针'],
    wxmanual: ['秘籍', '剑谱', '心法', '拳谱'], wxtoken: ['令牌', '江湖令', '信物'], wxoath: ['结义', '结拜', '拜师'], wxmad: ['走火入魔', '内息大乱'],
});

export const WUXIA_PROMPT_LINES = Object.freeze({
    wxname: '[igs-fx:wxname|名号|姓名]：重要人物第一次报出名号时写，名号可省。',
    wxpalm: '[igs-fx:wxpalm|甲|乙|胜者]：两人对掌硬拼内力时写，胜者是甲或乙，可省。',
    wxdart: '[igs-fx:wxdart|暗器名]：暗器出手时写。',
    wxmanual: '[igs-fx:wxmanual|书名|一句说明]：得到秘籍、剑谱或心法时写，说明可省。',
    wxtoken: '[igs-fx:wxtoken|令名]：亮出令牌或信物时写。',
    wxoath: '[igs-fx:wxoath|结义/拜师|甲|乙]：结拜或拜入师门时写。',
    wxmad: '[igs-fx:wxmad|角色]：内息失控、走火入魔时写，角色可省。',
});

export const WUXIA_OATH_MODES = Object.freeze({ 结义: 'oath', 结拜: 'oath', oath: 'oath', 拜师: 'master', 入门: 'master', master: 'master' });
export const WUXIA_OATH_WORDS = Object.freeze({ oath: '义结金兰', master: '入我门下' });

const text = (value) => String(value == null ? '' : value).trim();
const pick = (map, value, fallback) => {
    const key = text(value).toLowerCase();
    return Object.hasOwn(map, key) ? map[key] : fallback;
};

export function parseWuxiaBody(type, f) {
    const a = text(f && f[0]);
    const b = text(f && f[1]);
    const c = text(f && f[2]);
    switch (type) {
    case 'wxname': return b ? ['wxname', a, b] : a ? ['wxname', '', a] : null;
    case 'wxpalm': return a && b ? ['wxpalm', a, b, c === a || c === b ? c : ''] : null;
    case 'wxdart': return ['wxdart', a || '暗器'];
    case 'wxmanual': return a ? ['wxmanual', a, b] : null;
    case 'wxtoken': return a ? ['wxtoken', a] : null;
    case 'wxoath': {
        const mode = pick(WUXIA_OATH_MODES, a, '');
        if (mode) return ['wxoath', mode, b, c];
        return a ? ['wxoath', 'oath', a, b] : null;
    }
    case 'wxmad': return ['wxmad', a];
    default: return null;
    }
}

export function wuxiaFxOf(args) {
    const [type, a = '', b = '', c = ''] = args || [];
    switch (type) {
    case 'wxname': return { type, title: a, name: b };
    case 'wxpalm': return { type, a, b, winner: c };
    case 'wxdart': return { type, name: a };
    case 'wxmanual': return { type, name: a, note: b };
    case 'wxtoken': return { type, name: a };
    case 'wxoath': return { type, mode: a || 'oath', a: b, b: c };
    case 'wxmad': return { type, who: a };
    default: return null;
    }
}
