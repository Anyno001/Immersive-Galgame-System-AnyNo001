// 立绘碰撞的动作表、力度别名与三档冲击参数（纯数据）。拍打以外的 NSFW 动作不在表内，交给亲密音效。
// react：受方反应形态。turn 偏头、lean 后仰、back 后退、push 被推离、mutual 互相弹开、flinch 缩一下；hug / highfive 不吃档位。
export const CLASH_ACTIONS = Object.freeze({
    slap: Object.freeze({ kind: 'strike', tier: 'mid', react: 'turn', sound: 'slap', onoma: '啪！' }),
    punch: Object.freeze({ kind: 'strike', tier: 'mid', react: 'lean', sound: 'punch', onoma: '砰！' }),
    kick: Object.freeze({ kind: 'strike', tier: 'big', react: 'back', sound: 'kick', onoma: '咚！', fly: true }),
    shove: Object.freeze({ kind: 'strike', tier: 'small', react: 'push', sound: 'shove', onoma: '' }),
    bump: Object.freeze({ kind: 'strike', tier: 'small', react: 'mutual', sound: 'bump', onoma: '咚！' }),
    pat: Object.freeze({ kind: 'strike', tier: 'small', react: 'flinch', sound: 'pat', onoma: '啪' }),
    hit: Object.freeze({ kind: 'strike', tier: 'mid', react: 'lean', sound: 'punch', onoma: '砰！' }),
    hug: Object.freeze({ kind: 'hug', tier: '', react: '', sound: 'hug', onoma: '' }),
    highfive: Object.freeze({ kind: 'highfive', tier: '', react: '', sound: 'highfive', onoma: '啪！' }),
});

const ACTION_WORDS = Object.freeze({
    slap: ['扇', '掴', '巴掌', '耳光', '一巴掌', '扇耳光', '甩耳光'],
    punch: ['揍', '拳', '一拳', '打了一拳', '捶', '挥拳'],
    kick: ['踹', '踢', '一脚'],
    shove: ['推', '推开', '搡', '推搡', '推了一把'],
    bump: ['撞', '撞上', '撞个满怀', '相撞'],
    pat: ['拍头', '敲头', '弹额头', '拍脑袋', '敲脑袋'],
    hug: ['抱', '抱住', '拥抱', '扑进怀里', '扑上去', '扑进'],
    highfive: ['击掌'],
    hit: ['打', '攻击'],
});

export const CLASH_ACTION_ALIASES = Object.freeze(Object.fromEntries(Object.entries(ACTION_WORDS).flatMap(([key, words]) => [[key, key], ...words.map((w) => [w, key])])));

export const CLASH_TIER_KEYS = Object.freeze(['small', 'mid', 'big']);
export const CLASH_TIER_ALIASES = Object.freeze({
    轻: 'small', 小: 'small', 弱: 'small', light: 'small', small: 'small', weak: 'small',
    中: 'mid', 普通: 'mid', mid: 'mid', medium: 'mid', normal: 'mid',
    重: 'big', 大: 'big', 狠: 'big', 强: 'big', heavy: 'big', big: 'big', strong: 'big',
});

// 4.0 档位表。位移类为舞台长边的百分比，角度为度，时长为毫秒；震幅为像素。
// windup 蓄力 / dash 冲刺 / freeze 命中定格 / total 总长上限（大档击退淡回不计入）。
export const CLASH_TIERS = Object.freeze({
    small: Object.freeze({
        windup: 80, lean: 2, crouch: 0, dash: 140, trails: 0, stretch: 1, freeze: 40, contrast: 0,
        flash: 1.4, flashes: 1, push: 3, turn: 2, knock: 0, jolt: 0.25,
        shake: Object.freeze({ count: 1, amp: 4, sink: 0, ms: 110 }), camera: 1, sweep: false,
        sfx: Object.freeze({ gain: 0.72, low: false, boom: false, tail: false }), symbol: 'anger', hold: 0, total: 450,
    }),
    mid: Object.freeze({
        windup: 100, lean: 4, crouch: 0, dash: 110, trails: 2, stretch: 1, freeze: 80, contrast: 0,
        flash: 1.8, flashes: 1, push: 6, turn: 4, knock: 0, jolt: 0.35,
        shake: Object.freeze({ count: 2, amp: 9, sink: 0, ms: 200 }), camera: 1.03, sweep: false,
        sfx: Object.freeze({ gain: 1, low: true, boom: false, tail: false }), symbol: 'anger', hold: 0, total: 650,
    }),
    big: Object.freeze({
        windup: 160, lean: 7, crouch: 2.2, dash: 80, trails: 3, stretch: 1.06, freeze: 140, contrast: 1.15,
        flash: 2.4, flashes: 2, push: 18, turn: 8, knock: 230, jolt: 0.5,
        shake: Object.freeze({ count: 4, amp: 16, sink: 1, ms: 360 }), camera: 1.08, sweep: true,
        sfx: Object.freeze({ gain: 1, low: true, boom: true, tail: true }), symbol: 'dizzy', hold: 800, total: 900,
    }),
});

// 受方反应的形态系数：push 位移、turn 角度、squash 竖向压缩。
export const CLASH_REACTS = Object.freeze({
    turn: Object.freeze({ push: 0.75, turn: 1.15, squash: 1 }),
    lean: Object.freeze({ push: 1, turn: 1, squash: 1 }),
    back: Object.freeze({ push: 1.35, turn: 0.6, squash: 1 }),
    push: Object.freeze({ push: 1.45, turn: 0.45, squash: 1 }),
    mutual: Object.freeze({ push: 0.85, turn: 0.5, squash: 1 }),
    flinch: Object.freeze({ push: 0.3, turn: 0.35, squash: 0.955 }),
});

export const CLASH_INTENSE_RE = /狠狠|狠命|用力|使劲|全力|重重|猛地|猛然|狠狠地|一脚踹飞|踹飞|扇飞|打飞|撞飞|拼命/;
export const CLASH_GENTLE_RE = /轻轻|轻拍|拍了拍|微微|稍稍|象征性|不轻不重|轻柔/;

export function clashActionOf(word) {
    const raw = String(word || '').trim().toLowerCase();
    if (!raw) return 'hit';
    if (Object.hasOwn(CLASH_ACTION_ALIASES, raw)) return CLASH_ACTION_ALIASES[raw];
    const hit = Object.keys(CLASH_ACTION_ALIASES).filter((w) => w.length > 1 && raw.includes(w)).sort((a, b) => b.length - a.length)[0];
    return hit ? CLASH_ACTION_ALIASES[hit] : 'hit';
}

export function clashTierWord(word) {
    const raw = String(word || '').trim().toLowerCase();
    return Object.hasOwn(CLASH_TIER_ALIASES, raw) ? CLASH_TIER_ALIASES[raw] : '';
}

// 档位来源：标签第 4 栏 → 正文强度词 → 动作默认力度。亲密类不吃档位，返回 ''。
export function resolveClashTier(action, tier = '', text = '') {
    const spec = CLASH_ACTIONS[action] || CLASH_ACTIONS.hit;
    if (!spec.tier) return '';
    if (CLASH_TIER_KEYS.includes(tier)) return tier;
    const body = String(text || '');
    if (CLASH_INTENSE_RE.test(body)) return 'big';
    if (CLASH_GENTLE_RE.test(body)) return 'small';
    return spec.tier;
}

export function normalizeClashFxSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const on = (v) => !(v === false || v === 'false' || v === 0 || v === '0');
    return { auto: on(src.auto), ghost: on(src.ghost), shake: on(src.shake) };
}
