import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTagGrammar, collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { FX_PROMPT_KEYS, normalizeFxPromptsSettings } from '../src/visual/igs-ui/fx-settings.js';import { resolveDanmakuPromptRule } from '../src/visual/igs-ui/danmaku-prompt.js';
import { renderFxPromptsFields, fxPromptsCopyText } from '../src/visual/igs-ui/fx-settings-fields.js';

const BASE = Object.freeze({
    fxTags: { enabled: true, call: true, sfx: true },
    dailyFx: { enabled: true },
    liveFx: { enabled: true },
    feedFx: { enabled: true },
});
const KEYS = ['fx', 'daily', 'live', 'feed'];

test('gate:fx-prompts:style-defaults-to-compact-and-keeps-on-demand-blocks', () => {
    assert.equal(normalizeFxPromptsSettings({}).style, 'compact');
    assert.equal(normalizeFxPromptsSettings({ style: 'weird' }).style, 'compact');
    const blocks = collectGrammarBlocks(BASE);
    for (const key of ['daily', 'live', 'feed']) assert.equal(blocks.find((b) => b.key === key).adaptive, true, key);
});

test('gate:fx-prompts:detailed-keeps-on-demand-but-expands-to-full-bracket-syntax', () => {
    const rs = { ...BASE, fxPrompts: { style: 'detailed' } };
    const blocks = collectGrammarBlocks(rs);
    // 详细只改内容不改触发：fx 常驻，daily/live/feed 仍按场合。
    assert.ok(!blocks.find((b) => b.key === 'fx').adaptive, 'fx 应常驻');
    for (const key of ['daily', 'live', 'feed']) assert.equal(blocks.find((b) => b.key === key).adaptive, true, key);
    // 各块完整写法都是完整方括号格式。
    for (const key of KEYS) assert.match(blocks.find((b) => b.key === key).full, /\[igs-fx:/, `${key} 应写完整方括号格式`);
    assert.match(blocks.find((b) => b.key === 'fx').full, /使用约束：[\s\S]*示例：/);
    // 未命中：常驻块进 system、按场合块只列索引。
    const base = buildTagGrammar({ readerSettings: rs });
    assert.match(base.system, /【演出】/);
    assert.match(base.system, /【按需】/);
    assert.doesNotMatch(base.system, /【手机社区】|【直播间】/);
    // 命中后：详细写法进 depth0。
    const hit = buildTagGrammar({ readerSettings: rs, expand: new Set(KEYS) });
    assert.match(hit.depth0, /【手机社区】/);
    assert.match(hit.depth0, /【直播间】/);
});

test('gate:fx-prompts:inject-off-drops-live-and-feed-and-override-replaces', () => {
    const off = buildTagGrammar({ readerSettings: { ...BASE, fxPrompts: { inject: false } }, expand: new Set(KEYS) });
    assert.doesNotMatch(off.system + off.depth0, /手机社区|直播间|igs-fx:call/);
    const custom = buildTagGrammar({ readerSettings: { ...BASE, fxPrompts: { feed: '自定义社区写法' } } });
    assert.match(custom.system, /自定义社区写法/);
    assert.equal(resolveDanmakuPromptRule({ liveFx: { enabled: true } }, { live: false }), '');
    assert.equal(resolveDanmakuPromptRule({ liveFx: { enabled: true } }, { live: '我的直播写法' }), '我的直播写法');
});

const EVERYTHING = Object.freeze({
    ...BASE,
    itemFx: { enabled: true },
    bgm: { enabled: true, tracks: [{ moods: ['悲'] }] },
    romanceFx: { enabled: true },
    battleFx: { enabled: true },
    camera: { enabled: true },
    stageCast: { enabled: true, castReact: true, castStage: true },
    chatShow: { enabled: true },
    audienceFx: { enabled: true },
    textFx: { enabled: true },
    bilingual: { enabled: true },
});

test('gate:fx-prompts:detailed-covers-every-block-with-full-syntax-and-keeps-adaptive-flags', () => {
    const blocks = collectGrammarBlocks({ ...EVERYTHING, fxPrompts: { style: 'detailed' } });
    const keys = blocks.map((b) => b.key);
    for (const key of FX_PROMPT_KEYS.filter((k) => k !== 'dlc')) assert.ok(keys.includes(key), `${key} 缺失`);
    for (const block of blocks) {
        if (block.key !== 'bilingual') assert.match(block.full, /\[igs-|\{[^}]*:文字\}/, `${block.key} 不是完整写法`);
    }
    // 详细只改内容、不改触发：按场合块仍 adaptive，常驻块仍常驻。
    const ADAPTIVE = new Set(['daily', 'battle', 'romance', 'camera', 'live', 'feed']);
    for (const block of blocks) {
        if (ADAPTIVE.has(block.key)) assert.equal(block.adaptive, true, `${block.key} 应按场合`);
    }
    for (const key of ['fx', 'item', 'bgm', 'cast', 'audience', 'text', 'bilingual']) {
        const block = blocks.find((b) => b.key === key);
        assert.ok(block && !block.adaptive, `${key} 应常驻`);
    }
});

test('gate:fx-prompts:settings-fold-boxes-follow-feature-switches', () => {
    const html = renderFxPromptsFields(EVERYTHING, true);
    assert.match(html, /data-segment-path="readerSettings\.fxPrompts\.style"/);
    for (const key of FX_PROMPT_KEYS.filter((k) => k !== 'dlc')) assert.match(html, new RegExp(`data-path="readerSettings\\.fxPrompts\\.${key}"`), key);
    const fewer = renderFxPromptsFields({ ...EVERYTHING, battleFx: { enabled: false } }, true);
    assert.doesNotMatch(fewer, /fxPrompts\.battle"/);
    const kept = renderFxPromptsFields({ ...EVERYTHING, battleFx: { enabled: false }, fxPrompts: { battle: '我写的战斗' } }, true);
    assert.match(kept, /我写的战斗/, '改过的框关掉功能也留着，方便清空');
    assert.match(html, /data-action="fx-prompts-copy-all"/, '标题行应有复制全部键');
});

test('gate:fx-prompts:copy-all-joins-boxes-and-follows-overrides', () => {
    const text = fxPromptsCopyText(EVERYTHING);
    assert.match(text, /【演出】/);
    assert.match(text, /【双语台词】/);
    const custom = fxPromptsCopyText({ ...EVERYTHING, fxPrompts: { item: '我写的物品规则' } });
    assert.match(custom, /我写的物品规则/, '复制的是发给 AI 的那份：用户改过即用其覆盖');
});

test('gate:fx-prompts:resident-defaults-off-and-forces-every-block-every-turn', () => {
    assert.equal(normalizeFxPromptsSettings({}).resident, false);
    assert.equal(normalizeFxPromptsSettings({ resident: true }).resident, true);
    // 默认关：日常/直播/社区仍按场合，走索引、不进 depth0。
    const off = buildTagGrammar({ readerSettings: BASE });
    assert.match(off.system, /【按需】/);
    assert.equal(off.depth0, '');
    // 全量常驻：按场合块全进 system、索引消失。
    const on = buildTagGrammar({ readerSettings: { ...BASE, fxPrompts: { resident: true } } });
    assert.doesNotMatch(on.system, /【按需】/);
    assert.match(on.system, /【日常演出】/);
    assert.match(on.system, /【手机社区】/);
    // 渲染出开关。
    assert.match(renderFxPromptsFields(EVERYTHING, true), /data-switch="readerSettings\.fxPrompts\.resident"/);
});

test('gate:fx-prompts:legacy-danmaku-rule-takes-per-part-overrides', () => {
    assert.equal(resolveDanmakuPromptRule({ audienceFx: { enabled: true } }, { audience: '我的弹幕写法' }), '我的弹幕写法');
    assert.equal(resolveDanmakuPromptRule({ liveFx: { enabled: true }, audienceFx: { enabled: true } }, { live: false, audience: false }), '');
});
