// 生图 → 提示词：分区画师串开关 + 按「角色 / 场景与物品 / CG / 变身」分组的折叠卡片。
// 每张卡片默认只露画师串；IGS 自带的词再收一层折叠。词来自 generated-images/prompt-registry.js，可编辑的模板沿用 assets.templates，其余先只读。
import { esc } from './reader-value-utils.js';
import { PROMPT_KINDS, normalizeArtistByKind } from '../../generated-images/prompt-artists.js';
import { BUILTIN_PROMPTS, SCENE_DICTIONARY } from '../../generated-images/prompt-registry.js';
import { MOOD_PRESET } from '../../scene/mood-groups.js';

const B = BUILTIN_PROMPTS;
const rows = (list) => list.map(([key, tags]) => `${Array.isArray(key) ? key.join('|') : key} → ${tags}`).join('\n');

// 每类只读展示的 IGS 自带内容：[标题, 文本, 是否为给 AI 的写词规则]。
const BUILTIN_VIEW = {
    sprite: [
        ['灰底', B.ground.matte], ['白底', B.ground.white], ['透明底', B.ground.transparent],
        ['日常小动作', B.sprite.poseRule, true],
    ],
    expression: [
        ['立正正面', B.expression.positive], ['立正负面', B.expression.negative], ['去掉的词', B.expression.dropPositive],
        ['情绪默认词表', MOOD_PRESET.map((m) => `${m.label} → ${m.tags}${m.tagsNsfw ? `（NSFW：${m.tagsNsfw}）` : ''}`).join('\n')],
    ],
    avatar: [['正面', B.avatar.positive], ['负面', B.avatar.negative]],
    wardrobe: [['瑟瑟加强 · 衣服', B.wardrobe.nsfwBoostClothes, true], ['瑟瑟加强 · 整套', B.wardrobe.nsfwBoostCharacter, true]],
    background: [
        ['地点词典', rows(SCENE_DICTIONARY.location)], ['时间词典', rows(SCENE_DICTIONARY.time)], ['天气词典', rows(SCENE_DICTIONARY.weather)],
        ['差分 · 时段', rows(Object.entries(SCENE_DICTIONARY.variantTime))], ['差分 · 天气', rows(SCENE_DICTIONARY.variantWeather)],
    ],
    item: [['正面', B.item.positive], ['负面', B.item.negative]],
};
const KIND_NOTE = {
    cg: 'CG 的写词规则在「副LLM」页。',
    nsfwCg: 'NSFW CG 的写词规则在「副LLM」页（含温和重试）。',
};
const FORM_VIEW = [
    ['变身时摘掉的性别 / 年龄标签（正则）', B.form.bodyTagPattern],
    ['按性别补回', Object.entries(B.form.gender).map(([k, v]) => `${k === 'male' ? '男' : '女'} → ${v}`).join('\n')],
    ['按年龄档补回', Object.entries(B.form.age).map(([k, v]) => `${({ child: '幼', teen: '少年', adult: '成年', elder: '年长' })[k]} → ${v}`).join('\n')],
];
const GROUPS = [['角色', ['sprite', 'expression', 'avatar', 'wardrobe']], ['场景与物品', ['background', 'item']], ['CG', ['cg', 'nsfwCg']]];
const LABEL = new Map(PROMPT_KINDS);

function builtinBlock(items) {
    return items.map(([title, value, rule]) => `<div class="igs-settings-full igs-prompt-builtin"><span class="igs-outfit-muted">${esc(title)}${rule ? ' · 给 AI 的写词规则' : ''}</span>`
        + `<textarea readonly rows="${Math.min(6, String(value).split('\n').length + 1)}">${esc(value)}</textarea></div>`).join('');
}

function fold(key, summary, body, advancedOpen) {
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="${esc(key)}"${advancedOpen(key)}><summary>${summary}</summary>${body}</details>`;
}

// templateFields：{ sprite: [html…], background: [html…], nsfwCg: [html…] } —— 可编辑的 IGS 自带模板。
export function renderPromptKindsPanel({ nai, field, textarea, checkbox, advancedOpen, templateFields = {} }) {
    const conf = normalizeArtistByKind(nai && nai.artistByKind);
    const base = 'bridge.autoIllustration.nai.artistByKind';
    const card = (id) => {
        const entry = conf.kinds[id];
        const filled = entry.positive.trim() || entry.negative.trim();
        const editable = (templateFields[id] || []).map((html) => `<div class="igs-settings-full">${html}</div>`).join('');
        const view = BUILTIN_VIEW[id] || [];
        const builtin = editable || view.length ? fold(`prompt-builtin-${id}`, 'IGS 自带', editable + builtinBlock(view), advancedOpen) : '';
        const path = (side) => `${base}.kinds.${id}.${side}`;
        return fold(`prompt-kind-${id}`, esc(LABEL.get(id)) + (filled ? ' ·' : ''),
            `<div class="igs-settings-full">${field(path('positive'), '画师串 · 正面', textarea(path('positive'), entry.positive, '留空用全局画师串'))}</div>`
            + `<div class="igs-settings-full">${field(path('negative'), '画师串 · 负面', textarea(path('negative'), entry.negative, '留空用全局负面'))}</div>`
            + builtin
            + (KIND_NOTE[id] ? `<div class="igs-source-filter-note">${esc(KIND_NOTE[id])}</div>` : ''), advancedOpen);
    };
    const group = (title, body) => `<div class="igs-source-filter"><div class="igs-source-filter-title">${esc(title)}</div>${body}</div>`;
    return group('分区画师串', checkbox(`${base}.enabled`, conf.enabled, '分区画师串（打开后每类用自己的画师串替换全局）')
        + '<div class="igs-source-filter-note">外来提示词里的 artist: 标签会先摘掉；没写 artist: 前缀的画师名分不出来，不会被摘。</div>')
        + GROUPS.map(([title, ids]) => group(title, ids.map(card).join(''))).join('')
        + group('变身', fold('prompt-kind-form', 'IGS 自带', builtinBlock(FORM_VIEW), advancedOpen));
}
