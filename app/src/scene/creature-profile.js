// 非人角色档案：挂在角色 DNA 的 creature 字段上，缺省即人类。
// 纯数据与规则，不依赖提示词、存储或界面；人类方案不读取本文件。

// auto：自动建的临时档案，形态待写词时判定（人类 / 半人形 / 完全非人形）；画面上按完全非人形处理。
export const CREATURE_FORMS = Object.freeze(['humanoid', 'beast', 'auto']);
export const CREATURE_SIZES = Object.freeze(['small', 'medium', 'large', 'giant']);
export const CREATURE_ANCHORS = Object.freeze(['ground', 'float']);
export const CREATURE_CANVASES = Object.freeze(['portrait', 'square', 'landscape']);
// 半人形默认走完整情绪档，完全非人形默认走四档姿态。
export const CREATURE_TIER_MODES = Object.freeze(['full', 'four']);
// 取景：仅半人形可选半身；默认全身。半身时出图与显示都按人类半身立绘的构图与布局。
export const CREATURE_FRAMINGS = Object.freeze(['full', 'half']);

// 非人角色系统的运行开关，由设置同步；关闭时所有角色按人类处理，已保存的档案不动。
// giantFill 只影响显示：关闭时巨型按大型处理。
let systemEnabled = true;
let giantFill = true;
export function setCreatureSystem({ enabled = true, giantFill: fill = true } = {}) {
    systemEnabled = enabled !== false;
    giantFill = fill !== false;
}
export const creatureSystemEnabled = () => systemEnabled;
export const creatureGiantFill = () => giantFill;

// 设置 readerSettings.creatureDisplay：总开关、体型缩放（百分比）、巨型铺满舞台。缺省值与显示层一致。
export const CREATURE_DISPLAY_DEFAULTS = Object.freeze({ small: 70, medium: 100, large: 135 });
export const CREATURE_DISPLAY_RANGE = Object.freeze({ min: 30, max: 220 });
export function normalizeCreatureDisplaySettings(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const off = (value) => value === false || value === 'false' || value === 0 || value === '0';
    const percent = (value, fallback) => {
        const n = Math.round(Number(value));
        return Number.isFinite(n) && n > 0 ? Math.max(CREATURE_DISPLAY_RANGE.min, Math.min(CREATURE_DISPLAY_RANGE.max, n)) : fallback;
    };
    return {
        enabled: !off(src.enabled),
        small: percent(src.small, CREATURE_DISPLAY_DEFAULTS.small),
        medium: percent(src.medium, CREATURE_DISPLAY_DEFAULTS.medium),
        large: percent(src.large, CREATURE_DISPLAY_DEFAULTS.large),
        giantFill: !off(src.giantFill),
    };
}
// 同一张卡内临时怪物档案的上限，超出后按最近出场淘汰。
export const CREATURE_TEMP_LIMIT = 50;

export const CREATURE_FORM_LABELS = Object.freeze({ humanoid: '半人形', beast: '完全非人形' });
export const CREATURE_SIZE_LABELS = Object.freeze({ small: '小型', medium: '中型', large: '大型', giant: '巨型' });
export const CREATURE_ANCHOR_LABELS = Object.freeze({ ground: '落地', float: '悬浮' });
export const CREATURE_CANVAS_LABELS = Object.freeze({ portrait: '竖图', square: '方图', landscape: '横图' });
export const CREATURE_FRAMING_LABELS = Object.freeze({ full: '全身', half: '半身' });

// 四档姿态与回落链使用的既有情绪组。受创用「哭泣」组（词表含「痛苦」）；
// 狂暴用「不满」组：该组回落到「愤怒」，缺狂暴图时落到威吓图，不会落到喜悦类图。
export const CREATURE_TIERS = Object.freeze([
    Object.freeze({ id: 'calm', label: '常态', mood: '平和' }),
    Object.freeze({ id: 'menace', label: '威吓', mood: '愤怒' }),
    Object.freeze({ id: 'wounded', label: '受创', mood: '哭泣' }),
    Object.freeze({ id: 'frenzy', label: '狂暴', mood: '不满' }),
]);

const TIER_BY_WORD = new Map(CREATURE_TIERS.flatMap((tier) => [[tier.id, tier], [tier.label, tier], [tier.mood, tier]]));
const TIER_WORDS = Object.freeze({
    calm: ['常态', '待机', '平静'], menace: ['威吓', '咆哮', '登场', '蓄力'],
    wounded: ['受创', '受伤', '负伤', '濒死', '痛苦'], frenzy: ['狂暴', '暴走', '狂化', '二阶段', '暴怒'],
});
for (const [id, words] of Object.entries(TIER_WORDS)) {
    const tier = TIER_BY_WORD.get(id);
    for (const word of words) if (!TIER_BY_WORD.has(word)) TIER_BY_WORD.set(word, tier);
}

const WORDS = {
    form: { humanoid: ['humanoid', '半人', '半人形', '人形', '兽人', '魔物娘', '人外'],
        beast: ['beast', 'creature', 'monster', '兽', '野兽', '非人', '怪', '怪物', '完全非人', '非人形', '妖', '妖魔'] },
    size: { small: ['small', 'tiny', '小', '小型', '微型'], medium: ['medium', 'normal', '中', '中型', '普通'],
        large: ['large', 'big', '大', '大型'], giant: ['giant', 'huge', 'colossal', '巨', '巨型', '巨大', '超大型'] },
    anchor: { ground: ['ground', 'land', '落地', '地面', '地上', '着地'],
        float: ['float', 'fly', 'flying', 'hover', '悬浮', '飘浮', '漂浮', '飞行', '浮空', '空中'] },
    canvas: { portrait: ['portrait', '竖图', '竖'], square: ['square', '方图', '方'], landscape: ['landscape', '横图', '横'] },
};

function parseWord(table, value) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (!text) return '';
    for (const [key, words] of Object.entries(table)) if (words.includes(text)) return key;
    return '';
}
export const parseCreatureForm = (value) => parseWord(WORDS.form, value);
export const parseCreatureSize = (value) => parseWord(WORDS.size, value);
export const parseCreatureAnchor = (value) => parseWord(WORDS.anchor, value);
export const parseCreatureCanvas = (value) => parseWord(WORDS.canvas, value);

const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);

// 校验并补默认值；非对象视为人类（返回 null）。字段取值无效时回落默认，不整体丢弃。
export function normalizeCreatureProfile(raw) {
    const source = plain(raw);
    if (!source) return null;
    const form = pick(CREATURE_FORMS, parseCreatureForm(source.form) || source.form, 'beast');
    const profile = {
        form,
        size: pick(CREATURE_SIZES, parseCreatureSize(source.size) || source.size, 'medium'),
        anchor: pick(CREATURE_ANCHORS, parseCreatureAnchor(source.anchor) || source.anchor, 'ground'),
        temp: source.temp === true,
        group: source.group === true,
        canvas: pick(CREATURE_CANVASES, parseCreatureCanvas(source.canvas) || source.canvas, 'portrait'),
        tiers: pick(CREATURE_TIER_MODES, source.tiers, form === 'humanoid' ? 'full' : 'four'),
    };
    // 半身取景只记在半人形档案上，默认全身时不写字段。
    if (form === 'humanoid' && source.framing === 'half') profile.framing = 'half';
    // 最近出场序号，只用于临时档案淘汰。
    if (Number.isFinite(Number(source.seenAt)) && Number(source.seenAt) > 0) profile.seenAt = Math.floor(Number(source.seenAt));
    return profile;
}

// 已保存的档案（不看总开关），设置页编辑用。
export const storedCreatureOf = (dna) => normalizeCreatureProfile(dna && typeof dna === 'object' ? dna.creature : null);
export const creatureOf = (dna) => (systemEnabled ? storedCreatureOf(dna) : null);
// 已确认为非人的档案：form 为 humanoid / beast 才返回；form 为 auto 的待定临时档返回 null（显示层按人类处理）。
export function confirmedCreatureOf(dna) {
    const profile = creatureOf(dna);
    return profile && profile.form !== 'auto' ? profile : null;
}
export const isCreatureDna = (dna) => Boolean(systemEnabled && dna && typeof dna === 'object' && plain(dna.creature));

// 取景对应的 DNA 景别：巨型只画局部，用半身景别；半人形选了半身同样用半身景别；其余全身。
export function creatureFraming(profile) {
    const p = normalizeCreatureProfile(profile);
    return p && (p.size === 'giant' || p.framing === 'half') ? 'half_body' : 'full_body';
}
export const isHalfFraming = (profile) => Boolean(profile && profile.framing === 'half');

// 默认竖图沿用立绘尺寸；只有手动改过画布时才换成方图或横图。
export function creatureCanvasSize(profile, portraitSize = '832x1216') {
    const p = normalizeCreatureProfile(profile);
    if (!p || p.canvas === 'portrait') return portraitSize;
    const [w, h] = String(portraitSize).split('x').map(Number);
    if (!(w > 0) || !(h > 0)) return portraitSize;
    const long = Math.max(w, h), short = Math.min(w, h);
    if (p.canvas === 'square') return `${long}x${long}`;
    return `${long}x${short}`;
}

// 差分档位：完全非人形和选了四档的半人形用四档姿态；半人形默认返回 null，由调用方沿用完整情绪档。
export function creatureMoodLabels(profile) {
    const p = normalizeCreatureProfile(profile);
    return p && p.tiers === 'four' ? CREATURE_TIERS.map((tier) => tier.mood) : null;
}
export const creatureTierOf = (mood) => TIER_BY_WORD.get(String(mood || '').trim()) || null;

// ---- 临时档案（战斗对手自动建档） ----

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

// 在一张卡的 characterDna 表里登记战斗对手：已有同名角色（任何档案）不重复建，只刷新临时档案的最近出场；
// 超出上限按最近出场淘汰最旧的临时档案。返回新表，不改入参。
export function ensureTempCreature(dnaMap, name, { now = Date.now(), limit = CREATURE_TEMP_LIMIT, profile = {} } = {}) {
    const key = String(name == null ? '' : name).trim();
    const map = plain(dnaMap) || {};
    if (!key || FORBIDDEN.has(key)) return { map, created: false, evicted: [] };
    if (Object.hasOwn(map, key)) {
        const existing = plain(map[key]);
        const creature = normalizeCreatureProfile(existing && existing.creature);
        if (!creature || !creature.temp) return { map, created: false, evicted: [] };
        return { map: { ...map, [key]: { ...existing, creature: { ...creature, seenAt: now } } }, created: false, evicted: [] };
    }
    const next = { ...map, [key]: { creature: normalizeCreatureProfile({ form: 'auto', size: 'medium', anchor: 'ground', ...profile, temp: true, seenAt: now }) } };
    const evicted = [];
    const temps = Object.entries(next).filter(([k, v]) => k !== key && normalizeCreatureProfile(v && v.creature)?.temp)
        .map(([k, v]) => [k, normalizeCreatureProfile(v.creature).seenAt || 0]);
    const over = temps.length + 1 - Math.max(1, Math.floor(limit));
    if (over > 0) {
        temps.sort((a, b) => a[1] - b[1]);
        for (const [k] of temps.slice(0, over)) { delete next[k]; evicted.push(k); }
    }
    return { map: next, created: true, evicted };
}

// 转正：去掉临时标记，之后不再被淘汰。
export function promoteTempCreature(dnaMap, name) {
    const map = plain(dnaMap) || {};
    const entry = plain(map[name]);
    const creature = normalizeCreatureProfile(entry && entry.creature);
    if (!creature || !creature.temp) return map;
    const { seenAt, ...rest } = creature;
    return { ...map, [name]: { ...entry, creature: { ...rest, temp: false } } };
}

// 非人角色还没有可用身份资料：写词需要读取人设、角色卡与世界书参考。
export function creatureNeedsReference(dna) {
    if (!creatureOf(dna)) return false;
    const views = dna && dna.views && typeof dna.views === 'object' ? Object.values(dna.views) : [];
    return !String(dna.identity || '').trim() && !views.some((view) => view && String(view.subject || '').trim());
}

// 群体称呼（成群的人或怪）不自动建档。
export const isGroupName = (name) => /(?:们|群|众|一伙|等人)$/.test(String(name || '').trim()) || String(name || '').includes('、');
