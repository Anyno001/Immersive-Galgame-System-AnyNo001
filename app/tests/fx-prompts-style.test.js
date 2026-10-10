import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTagGrammar, collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { FX_PROMPT_KEYS, normalizeFxPromptsSettings } from '../src/visual/igs-ui/fx-settings.js';import { resolveDanmakuPromptRule } from '../src/visual/igs-ui/danmaku-prompt.js';
import { renderFxPromptsFields } from '../src/visual/igs-ui/fx-settings-fields.js';

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

test('gate:fx-prompts:detailed-sends-full-bracket-syntax-every-turn', () => {
    const rs = { ...BASE, fxPrompts: { style: 'detailed' } };
    const blocks = collectGrammarBlocks(rs);
    for (const key of KEYS) {
        const block = blocks.find((b) => b.key === key);
        assert.ok(block && !block.adaptive, `${key} 应常驻`);
        assert.match(block.full, /\[igs-fx:/, `${key} 应写完整方括号格式`);
    }
    assert.match(blocks.find((b) => b.key === 'fx').full, /使用约束：[\s\S]*示例：/);
    const { system, depth0 } = buildTagGrammar({ readerSettings: rs });
    assert.equal(depth0, '');
    assert.match(system, /【手机社区】/);
    assert.match(system, /【直播间】/);
    assert.doesNotMatch(system, /【按需】.*社区/);
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

test('gate:fx-prompts:detailed-covers-every-block-and-none-stays-on-demand', () => {
    const blocks = collectGrammarBlocks({ ...EVERYTHING, fxPrompts: { style: 'detailed' } });
    const keys = blocks.map((b) => b.key);
    for (const key of FX_PROMPT_KEYS.filter((k) => k !== 'dlc')) assert.ok(keys.includes(key), `${key} 缺失`);
    for (const block of blocks) {
        assert.equal(block.adaptive, false, `${block.key} 仍按需`);
        if (block.key !== 'bilingual') assert.match(block.full, /\[igs-|\{效果/, `${block.key} 不是完整写法`);
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
});

test('gate:fx-prompts:legacy-danmaku-rule-takes-per-part-overrides', () => {
    assert.equal(resolveDanmakuPromptRule({ audienceFx: { enabled: true } }, { audience: '我的弹幕写法' }), '我的弹幕写法');
    assert.equal(resolveDanmakuPromptRule({ liveFx: { enabled: true }, audienceFx: { enabled: true } }, { live: false, audience: false }), '');
});
