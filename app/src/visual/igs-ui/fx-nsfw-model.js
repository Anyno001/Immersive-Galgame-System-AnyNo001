// 直白亲密包的纯数据：标签解析、触发词、提示词。不碰 DOM；渲染见 fx-nsfw-build.js。
// 只写机制与画面节拍，文案不描写具体动作；触发词每类 2-4 个，仅作测试门禁。
export const NSFW_KINDS = Object.freeze(['peak', 'counter', 'aftermath', 'bedcurtain', 'dualcult', 'favortip', 'sigil', 'footfall', 'knotafter', 'conceive']);

export const NSFW_LABELS = Object.freeze({
    peak: '高潮节拍', counter: '次数计数', aftermath: '事后余韵', bedcurtain: '床幔红烛', dualcult: '双修光丝',
    favortip: '好感度提示', sigil: '契约印记', footfall: '门外脚步', knotafter: '成结余韵', conceive: '受孕心音',
});

export const NSFW_TRIGGERS = Object.freeze({
    peak: ['高潮', '顶点', '失控'],
    counter: ['第三次', '又一次', '一整夜'],
    aftermath: ['事后', '余韵', '相拥而眠'],
    bedcurtain: ['红烛', '床幔', '床帘', '纱帘'],
    dualcult: ['双修', '灵力交融', '修为'],
    favortip: ['好感度', '好感提升', '攻略值'],
    sigil: ['契约印记', '烙印', '魔纹'],
    footfall: ['脚步声', '门外', '侍寝'],
    knotafter: ['成结', '结合热', '终身标记'],
    conceive: ['怀孕', '受孕', '胎心'],
});

export const NSFW_PROMPT_LINES = Object.freeze({
    peak: '[igs-fx:peak|1-3|拟声字]：情绪攀上顶点的那一刻用一次，档位越高越强烈；拟声字写角色此刻脱口而出的音节，可省。',
    counter: '[igs-fx:counter|N|单位]：需要记次数或持续时长时写，N 是累计后的数字，单位默认「次」；每段最多写一次。',
    aftermath: '[igs-fx:aftermath|描述]：一段亲密收尾、气氛沉下来时写，描述写现场留下的凌乱痕迹，可省；角色的凌乱模样另用既有表情与服装标签表现。',
    bedcurtain: '[igs-fx:bedcurtain|题字]：床帐垂落的场面写：古代为红烛床幔，现代为纱帘与床头灯，随世界观自动切换，题字可省。',
    dualcult: '[igs-fx:dualcult|甲|乙|修为变化]：修仙双修、灵力在两人之间流转时写，甲乙是两位角色名，修为变化写带正负号的数字。',
    favortip: '[igs-fx:favortip|角色|变化|当前值]：系统流的好感度变化提示，变化写带正负号的数字，当前值可省。',
    sigil: '[igs-fx:sigil|角色|1-3]：西幻或魔法世界里契约印记随情绪亮起时写，档位表示亮度，可省。',
    footfall: '[igs-fx:footfall|渐近/远去]：宫廷场面里门外有人走近或离开时写，省略按渐近。',
    knotafter: '[igs-fx:knotafter|对象|描述]：ABO 设定里成结之后的静谧余韵，对象与描述可省。',
    conceive: '[igs-fx:conceive|胎心数值|描述]：剧情确认怀孕、第一次听到胎心的时刻写，数值取每分钟次数，可省。',
});

const text = (value) => String(value == null ? '' : value).trim();
const NUM = /^[+-]?\d{1,4}$/;
const TIER_WORDS = Object.freeze({ 一: 1, 轻: 1, 低: 1, 二: 2, 中: 2, 三: 3, 重: 3, 高: 3 });

export function tierOf(value, fallback = 2) {
    const raw = text(value);
    if (/^[123]$/.test(raw)) return Number(raw);
    return TIER_WORDS[raw.charAt(0)] || fallback;
}

// 返回 fx-directives 统一的 [type, ...字段]；缺必填字段返回 null。
export function parseNsfwBody(type, fields) {
    const [a = '', b = '', c = ''] = (fields || []).map(text);
    switch (type) {
    case 'peak': return ['peak', tierOf(a), b.slice(0, 8)];
    case 'counter': return NUM.test(a) && Number(a) >= 0 ? ['counter', Math.min(999, Number(a)), b.slice(0, 4) || '次'] : null;
    case 'aftermath': return ['aftermath', a.slice(0, 24)];
    case 'bedcurtain': return ['bedcurtain', a.slice(0, 12)];
    case 'dualcult': {
        const delta = [a, b, c].find((value) => NUM.test(value));
        if (delta == null) return null;
        const names = [a, b, c].filter((value) => value && !NUM.test(value));
        return ['dualcult', names[0] || '', names[1] || '', Number(delta)];
    }
    case 'favortip': {
        const delta = [b, a].find((value) => NUM.test(value));
        if (delta == null) return null;
        const name = NUM.test(a) ? '' : a;
        const total = NUM.test(c) ? Number(c) : null;
        return ['favortip', name, Number(delta), total];
    }
    case 'sigil': return ['sigil', a, tierOf(b, 0)];
    case 'footfall': return ['footfall', /远|离|去/.test(a) ? 'leave' : 'near'];
    case 'knotafter': return ['knotafter', a, b.slice(0, 24)];
    case 'conceive': return ['conceive', NUM.test(a) ? Math.max(60, Math.min(220, Number(a))) : 150, (NUM.test(a) ? b : a).slice(0, 24)];
    default: return null;
    }
}

export function nsfwFxOf(args) {
    const [type, ...rest] = Array.isArray(args) ? args : [];
    switch (type) {
    case 'peak': return { type, tier: rest[0], word: rest[1] || '' };
    case 'counter': return { type, count: rest[0], unit: rest[1] };
    case 'aftermath': return { type, text: rest[0] || '' };
    case 'bedcurtain': return { type, text: rest[0] || '' };
    case 'dualcult': return { type, from: rest[0] || '', to: rest[1] || '', delta: rest[2] };
    case 'favortip': return { type, who: rest[0] || '', delta: rest[1], total: rest[2] };
    case 'sigil': return { type, who: rest[0] || '', tier: rest[1] || 0 };
    case 'footfall': return { type, dir: rest[0] || 'near' };
    case 'knotafter': return { type, target: rest[0] || '', text: rest[1] || '' };
    case 'conceive': return { type, bpm: rest[0], text: rest[1] || '' };
    default: return null;
    }
}

// 古代专属 / 现代专属 / 世界观限定：随清单登记。
export const NSFW_ERA_KINDS = Object.freeze({ dualcult: 'ancient', footfall: 'ancient', favortip: 'modern' });
export const NSFW_WORLDVIEW_OFF = Object.freeze({
    modern: Object.freeze(['sigil']), ancient: Object.freeze(['sigil']), scifi: Object.freeze(['sigil']),
    apocalypse: Object.freeze(['sigil']), taisho: Object.freeze(['sigil']), horror: Object.freeze(['sigil']),
});
