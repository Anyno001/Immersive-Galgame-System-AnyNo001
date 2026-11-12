// 生图 → 分类：自动生成开关、模型与提示词按用途分组，内置 NAI 和数据库生图共用画师库选择。
// IGS 自带的词来自 generated-images/prompt-registry.js，可编辑的模板沿用 assets.templates，其余只读。
import { esc } from './reader-value-utils.js';
import { PROMPT_KINDS, normalizeArtistByKind } from '../../generated-images/prompt-artists.js';
import { BUILTIN_PROMPTS, SCENE_DICTIONARY } from '../../generated-images/prompt-registry.js';
import { MOOD_PRESET } from '../../scene/mood-groups.js';
import { renderArtistSelector, renderGlobalArtistRow } from './settings-artist-library.js';
import { perfItem } from './fx-settings-fields.js';

const B = BUILTIN_PROMPTS;
const rows = (list) => list.map(([key, tags]) => `${Array.isArray(key) ? key.join('|') : key} → ${tags}`).join('\n');

// 每类只读展示的 IGS 自带内容：[标题, 文本, 是否为给 AI 的写词规则]。
const BUILTIN_VIEW = {
    sprite: [
        ['灰底', B.ground.matte], ['白底', B.ground.white], ['透明底', B.ground.transparent],
        ['日常小动作', B.sprite.poseRule, true],
    ],
    // 非人角色（完全非人形 / 半人形）：与人类立绘分开的固定词；取景与悬浮词按体型、落地方式拼入。
    creature: [
        ['完全非人形 · 正向', B.creatureBeast.positive], ['完全非人形 · 负向', B.creatureBeast.negative],
        ['半人形 · 正向', B.creatureHumanoid.positive], ['半人形 · 负向', B.creatureHumanoid.negative],
        ['取景（按体型）', Object.entries(B.creatureBeast.framing).map(([size, f]) => `${size} → ${f.positive}`).join('\n')],
        ['悬浮', B.creatureBeast.anchor.float.positive],
        ['半人形半身取景', `${B.creatureHumanoid.halfBody.positive}\n负向：${B.creatureHumanoid.halfBody.negative}`],
        ['姿态规则 · 完全非人形', B.creatureBeast.poseRule, true], ['姿态规则 · 半人形', B.creatureHumanoid.poseRule, true],
        ['姿态规则 · 半人形半身', B.creatureHumanoid.halfPoseRule, true],
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
const FORM_VIEW = [
    ['变身时摘掉的性别 / 年龄标签（匹配规则，进阶）', B.form.bodyTagPattern],
    ['按性别补回', Object.entries(B.form.gender).map(([k, v]) => `${k === 'male' ? '男' : '女'} → ${v}`).join('\n')],
    ['按年龄档补回', Object.entries(B.form.age).map(([k, v]) => `${({ child: '幼', teen: '少年', adult: '成年', elder: '年长' })[k]} → ${v}`).join('\n')],
];
// [卡片标题, 画师串分类, slots 键]
const GROUPS = [['角色', ['sprite', 'wardrobe', 'expression', 'avatar', 'creature'], 'character'],
    ['场景与物品', ['background', 'item'], 'scene'], ['CG', ['cg', 'nsfwCg'], 'cg']];
// 该分类入口之前先放的生成开关（NSFW 开关紧贴自己的入口行）。
const SLOT_BEFORE = { nsfwCg: 'nsfw' };
const LABEL = new Map(PROMPT_KINDS);

function builtinBlock(items) {
    return items.map(([title, value, rule]) => `<div class="igs-settings-full igs-prompt-builtin"><span class="igs-outfit-muted">${esc(title)}${rule ? ' · 给AI的写词规则' : ''}</span>`
        + `<textarea readonly rows="${Math.min(6, String(value).split('\n').length + 1)}">${esc(value)}</textarea></div>`).join('');
}

// templateFields：{ sprite: [html…], background: [html…], nsfwCg: [html…] } —— 可编辑的 IGS 自带模板。
// slots：{ common, character, scene, cg, nsfw } —— 各卡片顶部的生成开关与模型。
export function renderPromptKindsPanel({ nai, sourceMode, checkbox, advancedOpen, templateFields = {}, slots = {}, artistLibraryState }) {
    const conf = normalizeArtistByKind(nai && nai.artistByKind);
    const artistSelectionAvailable = sourceMode === 'nai' || sourceMode === 'dbgen';
    const base = 'bridge.autoIllustration.nai.artistByKind';
    // 每类一行：画师串下拉 + ›，点 › 才展开 IGS 自带的词；展开状态记在 advancedOpen['perf-prompt-kind-<id>']。
    const more = { isOpen: (key) => Boolean(advancedOpen(`perf-${key}`)) };
    const rowName = (text) => `<span class="igs-image-prompt-row-name">${esc(text)}</span>`;
    const card = (id) => {
        const editable = (templateFields[id] || []).map((html) => `<div class="igs-settings-full">${html}</div>`).join('');
        return perfItem(more, `prompt-kind-${id}`, artistSelectionAvailable ? renderArtistSelector(nai, id, sourceMode) : rowName(LABEL.get(id)),
            { detail: editable + builtinBlock(BUILTIN_VIEW[id] || []) });
    };
    // 每组一个折叠区，展开状态记在 advancedOpen['prompt-group-<key>']，默认收起。
    const group = (key, title, body) => `<details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-group-${key}"${advancedOpen(`prompt-group-${key}`) ? ' open' : ''}>`
        + `<summary>${esc(title)}</summary><div class="igs-settings-sub">${body}</div></details>`;
    return group('common', '通用', checkbox(`${base}.enabled`, conf.enabled, '分区画师串')
        + (artistSelectionAvailable ? renderGlobalArtistRow(nai, sourceMode, artistLibraryState) : '')
        + (slots.common || ''))
        + GROUPS.map(([title, ids, slot]) => group(slot, title, (slot && slots[slot] || '') + ids.map((id) => (SLOT_BEFORE[id] && slots[SLOT_BEFORE[id]] || '') + card(id)).join('')
            + (slot === 'character' ? perfItem(more, 'prompt-kind-form', rowName('变身'), { detail: builtinBlock(FORM_VIEW) }) : ''))).join('')
        + (slots.inpaint ? group('inpaint', '局部重绘', slots.inpaint) : '');
}
