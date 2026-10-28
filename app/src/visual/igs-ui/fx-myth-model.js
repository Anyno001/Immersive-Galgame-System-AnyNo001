// 神话妖魔包的标签语法：纯数据与解析，不碰 DOM。字段写错时按最宽松的合法形式处理，缺必填字段则整条忽略。
export const MYTH_KINDS = Object.freeze(['relic', 'clash', 'mythroll', 'formation', 'flame', 'thunder', 'aura', 'charm', 'drain', 'subdue', 'barrier', 'core', 'pact']);

export const MYTH_LABELS = Object.freeze({
    relic: '法宝祭出', clash: '法宝对撞', mythroll: '封神榜', formation: '阵法', flame: '三昧真火', thunder: '天雷',
    aura: '妖气魔气', charm: '魅惑', drain: '吸取精气', subdue: '降妖收服', barrier: '结界', core: '妖丹亮相', pact: '血契印记',
});

export const MYTH_TRIGGERS = Object.freeze({
    relic: ['法宝', '祭出'], clash: ['斗法', '法宝相撞'], mythroll: ['封神榜', '封神'], formation: ['阵法', '破阵', '大阵'],
    flame: ['三昧真火', '真火'], thunder: ['天雷', '劫雷'], aura: ['妖气', '魔气', '仙气'], charm: ['魅惑', '摄魂'],
    drain: ['吸取精气', '汲取灵气'], subdue: ['降妖', '收服', '符咒'], barrier: ['结界', '禁制'], core: ['妖丹', '内丹'], pact: ['血契', '主仆契约'],
});

export const MYTH_PROMPT_LINES = Object.freeze({
    relic: '[igs-fx:relic|持有者|法宝名|光色]：某人祭出法宝时写；法宝名取正文原名，光色可写 金/青/赤/紫/白/玉，省略按金。',
    clash: '[igs-fx:clash|甲法宝|乙法宝]：两件法宝在空中对撞、斗法分出声势时写，两栏取正文中的法宝名。',
    mythroll: '[igs-fx:mythroll|名1;名2;名3]：封神榜、金榜、册封名录逐名亮起时写，名字用分号隔开，最多 8 个。',
    formation: '[igs-fx:formation|阵名|展开/入阵/破阵|光色]：阵法展开、有人踏入或被破时写，阵名取正文，动作省略按展开；光色取正文对光、阵、气的颜色描写，可写 金/青/赤/紫/白/玉，正文没写就省略。',
    flame: '[igs-fx:flame|目标]：真火、业火焚烧时写，目标是被烧的角色，可省。',
    thunder: '[igs-fx:thunder|目标]：天雷、劫雷劈落时写，目标是被劈中的角色，可省。',
    aura: '[igs-fx:aura|角色|妖气/魔气/仙气]：角色周身气息外放、气势压人时写，类型省略按妖气。',
    charm: '[igs-fx:charm|施术者|目标]：施术者以媚术、摄魂迷住目标时写，目标在术中持续迷离可配合 [igs-fx:state|魅惑] 区间。',
    drain: '[igs-fx:drain|吸取者|被吸者]：吸取者夺取被吸者精气、灵气或修为时写。',
    subdue: '[igs-fx:subdue|符咒/金钵/葫芦/锁链|目标|光色]：以符印、法器收服或镇压目标时写，法器类型省略按符咒；光色取正文对光、阵、气的颜色描写，可写 金/青/赤/紫/白/玉，正文没写就省略。',
    barrier: '[igs-fx:barrier|展开/破碎|光色]：结界、禁制张开或被击破时写，省略按展开；光色取正文对光、阵、气的颜色描写，可写 金/青/赤/紫/白/玉，正文没写就省略。',
    core: '[igs-fx:core|名称]：妖丹、内丹取出或亮相时写，名称取正文。',
    pact: '[igs-fx:pact|甲|乙]：两人缔结血契、主仆契约，印记浮现时写。',
});

export const MYTH_RELIC_TONES = Object.freeze({
    金: 'gold', gold: 'gold', 青: 'azure', azure: 'azure', 赤: 'crimson', 红: 'crimson', crimson: 'crimson',
    紫: 'violet', violet: 'violet', 白: 'silver', 银: 'silver', silver: 'silver', 玉: 'jade', 绿: 'jade', jade: 'jade',
});
export const MYTH_AURA_MODES = Object.freeze({ 妖气: 'yao', 妖: 'yao', yao: 'yao', 魔气: 'mo', 魔: 'mo', mo: 'mo', 仙气: 'xian', 仙: 'xian', xian: 'xian' });
export const MYTH_FORMATION_MODES = Object.freeze({ 展开: 'open', 开: 'open', open: 'open', 入阵: 'enter', 入: 'enter', enter: 'enter', 破阵: 'break', 破: 'break', break: 'break' });
export const MYTH_SUBDUE_MODES = Object.freeze({ 符咒: 'talisman', 符: 'talisman', talisman: 'talisman', 金钵: 'bowl', 钵: 'bowl', bowl: 'bowl', 葫芦: 'gourd', gourd: 'gourd', 锁链: 'chain', 锁: 'chain', chain: 'chain' });
export const MYTH_BARRIER_MODES = Object.freeze({ 展开: 'open', 开: 'open', open: 'open', 破碎: 'break', 破: 'break', break: 'break' });
export const MYTH_ROLL_MAX = 8;

const text = (value) => String(value == null ? '' : value).trim();
const pick = (map, value, fallback) => {
    const key = text(value).toLowerCase();
    return Object.hasOwn(map, key) ? map[key] : fallback;
};

export function parseMythBody(type, f) {
    const a = text(f && f[0]);
    const b = text(f && f[1]);
    const c = text(f && f[2]);
    switch (type) {
    case 'relic': return a ? ['relic', b ? a : '', b || a, pick(MYTH_RELIC_TONES, c, 'gold')] : null;
    case 'clash': return a && b ? ['clash', a, b] : null;
    case 'mythroll': {
        const names = a.split(/[;；、]/).map(text).filter(Boolean).slice(0, MYTH_ROLL_MAX);
        return names.length ? ['mythroll', names.join(';')] : null;
    }
    case 'formation': return a ? ['formation', a, pick(MYTH_FORMATION_MODES, b, 'open'), pick(MYTH_RELIC_TONES, c, '')] : null;
    case 'flame': return ['flame', a];
    case 'thunder': return ['thunder', a];
    case 'aura': return a ? ['aura', a, pick(MYTH_AURA_MODES, b, 'yao')] : null;
    case 'charm': return a ? ['charm', b ? a : '', b || a] : null;
    case 'drain': return a && b ? ['drain', a, b] : null;
    case 'subdue': {
        const mode = pick(MYTH_SUBDUE_MODES, a, '');
        if (mode) return ['subdue', mode, b, pick(MYTH_RELIC_TONES, c, '')];
        return a ? ['subdue', 'talisman', a, pick(MYTH_RELIC_TONES, c, '')] : null;
    }
    case 'barrier': return ['barrier', pick(MYTH_BARRIER_MODES, a, 'open'), pick(MYTH_RELIC_TONES, b, '')];
    case 'core': return a ? ['core', a] : null;
    case 'pact': return a ? ['pact', a, b] : null;
    default: return null;
    }
}

export function mythFxOf(args) {
    const [type, a = '', b = '', c = ''] = args || [];
    switch (type) {
    case 'relic': return { type, who: a, name: b, tone: c || 'gold' };
    case 'clash': return { type, a, b };
    case 'mythroll': return { type, names: a.split(';').filter(Boolean) };
    case 'formation': return { type, name: a, mode: b || 'open', tone: c };
    case 'flame': return { type, who: a };
    case 'thunder': return { type, who: a };
    case 'aura': return { type, who: a, mode: b || 'yao' };
    case 'charm': return { type, caster: a, target: b };
    case 'drain': return { type, from: a, to: b };
    case 'subdue': return { type, mode: a || 'talisman', who: b, tone: c };
    case 'barrier': return { type, mode: a || 'open', tone: b };
    case 'core': return { type, name: a };
    case 'pact': return { type, a, b };
    default: return null;
    }
}
