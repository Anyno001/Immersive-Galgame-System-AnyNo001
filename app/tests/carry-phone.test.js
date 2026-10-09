import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFxWorldview, resolveCarryPhonePrompt, CARRY_PHONE_DEFAULT_PROMPT } from '../src/scene/fx-era.js';
import { effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { renderWorldviewRow } from '../src/visual/igs-ui/worldview-fields.js';

const base = () => ({
    liveFx: { enabled: true },
    feedFx: { enabled: true },
    chatShow: { enabled: true },
    fxTags: { call: true, voicemail: true, contact: true, delivery: true, movie: true },
    dailyFx: { photo: true, tv: true },
});

test('gate:carry-phone:ancient-keeps-phone-fx-but-not-daily', () => {
    const input = base();
    const out = applyFxWorldview(input, 'ancient', { carryPhone: true });
    assert.equal(out.liveFx.enabled, true);
    assert.equal(out.feedFx.enabled, true);
    assert.equal(out.feedFx.carryPhone, true);
    assert.equal(out.feedFx.worldview, 'ancient');
    assert.equal(out.fxTags.call, true);
    assert.equal(out.fxTags.voicemail, true);
    assert.equal(out.fxTags.contact, true);
    assert.equal(out.fxTags.delivery, false);
    assert.equal(out.fxTags.movie, false);
    assert.equal(out.dailyFx.photo, false);
    assert.equal(out.dailyFx.tv, false);
    assert.equal(input.liveFx.enabled, true);
    assert.equal(input.feedFx.carryPhone, undefined, '不改入参');
});

test('gate:carry-phone:off-matches-original', () => {
    for (const wv of ['ancient', 'fantasy', 'magic', 'apocalypse', 'taisho']) {
        assert.deepEqual(applyFxWorldview(base(), wv, { carryPhone: false }), applyFxWorldview(base(), wv));
    }
    const out = applyFxWorldview(base(), 'fantasy');
    assert.equal(out.liveFx.enabled, false);
    assert.equal(out.fxTags.call, false);
    assert.equal(out.feedFx.carryPhone, undefined);
});

test('gate:carry-phone:other-worldviews-release-phone', () => {
    for (const wv of ['fantasy', 'magic', 'apocalypse', 'taisho']) {
        const out = applyFxWorldview(base(), wv, { carryPhone: true });
        assert.equal(out.liveFx.enabled, true, wv);
        assert.equal(out.fxTags.call, true, wv);
        assert.equal(out.feedFx.carryPhone, true, wv);
        assert.equal(out.dailyFx.tv, false, wv);
    }
});

test('gate:carry-phone:modern-worldview-ignores-switch', () => {
    const out = applyFxWorldview(base(), 'modern', { carryPhone: true });
    assert.equal(out.feedFx.carryPhone, undefined);
    assert.deepEqual(out, applyFxWorldview(base(), 'modern'));
    assert.equal(resolveCarryPhonePrompt('modern', { carryPhone: true }), '');
});

test('gate:carry-phone:prompt-default-and-custom', () => {
    assert.equal(resolveCarryPhonePrompt('ancient', { carryPhone: false }), '');
    assert.equal(resolveCarryPhonePrompt('ancient', { carryPhone: true }), CARRY_PHONE_DEFAULT_PROMPT);
    assert.equal(resolveCarryPhonePrompt('ancient', { carryPhone: true, carryPhonePrompt: '   ' }), CARRY_PHONE_DEFAULT_PROMPT);
    assert.equal(resolveCarryPhonePrompt('magic', { carryPhone: true, carryPhonePrompt: '自定义句' }), '自定义句');
    assert.match(CARRY_PHONE_DEFAULT_PROMPT, /\{\{user\}\}/);
});

test('gate:carry-phone:ui-only-for-non-modern-worldviews', () => {
    for (const wv of ['ancient', 'fantasy', 'apocalypse', 'taisho', 'magic']) {
        assert.match(renderWorldviewRow({ worldview: wv, ancient: wv === 'ancient' }), /随身带着现代手机/, wv);
    }
    for (const wv of ['modern', 'horror', 'scifi']) {
        assert.doesNotMatch(renderWorldviewRow({ worldview: wv, ancient: wv === 'ancient' }), /随身带着现代手机/, wv);
    }
    const off = renderWorldviewRow({ worldview: 'ancient', ancient: true });
    assert.doesNotMatch(off, /留空用默认/, '开关关时不显示提示词框');
    const on = renderWorldviewRow({ worldview: 'ancient', ancient: true, carryPhone: true });
    assert.match(on, /留空用默认/);
    assert.match(on, /<summary>提示词<\/summary>/);
    assert.match(on, /data-carry-phone[^-]/);
});

test('gate:carry-phone:stored-per-card', () => {
    const root = { worldview: 'modern', cards: { 'card:a': { worldview: 'ancient', ancient: true, carryPhone: true, carryPhonePrompt: 'x' } } };
    const eff = effectiveSceneAssets(root, 'card:a');
    assert.equal(eff.carryPhone, true);
    assert.equal(eff.carryPhonePrompt, 'x');
});

test('carry-phone: 随身手机时线上聊天按现代写法，不开仍是书信往来', async () => {
    const { collectGrammarBlocks } = await import('../src/visual/igs-ui/tag-grammar.js');
    const chatOf = (rs) => collectGrammarBlocks(rs, { ancient: true }).find((b) => b.key === 'chat');
    const base = { chatShow: { enabled: true } };
    assert.match(chatOf(base).index, /书信往来/);
    assert.match(chatOf({ ...base, feedFx: { carryPhone: true } }).index, /线上聊天/);
});
