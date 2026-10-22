import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_POOL, buildInitialState, buildSummary, normalizeBuild } from '../src/scene/stats/stat-build.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { refreshStatsBuildStatus, renderStatsBuildFields } from '../src/visual/igs-ui/stats-settings-fields.js';

test('默认分配：基础属性各 40、未用点数 60、默认选前 3 项特有技能（§6）', () => {
    const s = buildSummary(undefined);
    assert.deepEqual([s.spent, s.left, s.ok], [0, BUILD_POOL, true]);
    assert.deepEqual(s.picked, ['烹饪', '家务', '学习']);
    assert.deepEqual(normalizeStatsSettings(null).build, normalizeBuild(null));
});

test('单项夹在 10–80；调低退回点数；超出 60 点或多选特有技能时不建卡', () => {
    const b = normalizeBuild({ base: { 健康: 200, 力量: 0, 敏捷: '55' } });
    assert.deepEqual([b.base.健康, b.base.力量, b.base.敏捷], [80, 10, 55]);
    assert.equal(buildSummary({ base: { 健康: 80, 力量: 10 } }).spent, 10);
    const over = buildInitialState({ base: { 健康: 80, 力量: 80 } });
    assert.deepEqual([over.ok, over.reason], [false, 'stats-build-over-pool']);
    const many = buildInitialState({ special: { 运动: true, 艺术: true } });
    assert.deepEqual([many.ok, many.reason], [false, 'stats-build-too-many-special']);
});

test('按分配建卡：基础属性写入分配值，只保留所选特有技能（50 起），不改入参', () => {
    const input = { base: { 魅力: 70 }, special: { 烹饪: false, 家务: true, 学习: false, 话术: true } };
    const frozen = JSON.stringify(input);
    const r = buildInitialState(input);
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(r.ok, true);
    const skills = r.state.protagonist.skills;
    assert.equal(skills.魅力.value, 70);
    assert.equal(skills.健康.value, 40);
    assert.deepEqual(Object.keys(skills).filter((k) => !['健康', '力量', '敏捷', '理智', '观察', '魅力'].includes(k)).sort(), ['家务', '话术'].sort());
    assert.equal(skills.家务.value, 50);
});

test('建卡区渲染：默认折叠；超点时显示超出并禁用按分配启用', () => {
    const ok = renderStatsBuildFields(undefined);
    assert.match(ok, /<details[^>]*data-advanced="stats-build">/);
    assert.match(ok, /剩余 60 点/);
    assert.match(ok, /data-action="stats-chat-enable-build" type="button">/);
    assert.match(ok, /data-path="bridge\.stats\.build\.base\.魅力"/);
    const bad = renderStatsBuildFields({ base: { 健康: 80, 力量: 80 } });
    assert.match(bad, /超出 20 点/);
    assert.match(bad, /data-action="stats-chat-enable-build" type="button" disabled>/);
});

test('建卡区就地刷新：数字框输入后剩余点数、技能提示与按分配启用同步更新，不依赖整页重绘', () => {
    const point = { textContent: '' };
    const special = { textContent: '' };
    const button = { disabled: false };
    const nodes = {
        '[data-result="stats-build"]': point,
        '[data-result="stats-build-special"]': special,
        '[data-action="stats-chat-enable-build"]': button,
    };
    const root = { querySelector: (selector) => nodes[selector] || null };
    assert.equal(refreshStatsBuildStatus(root, { base: { 健康: 60 } }), true);
    assert.match(point.textContent, /剩余 40 点/);
    assert.equal(button.disabled, false);
    refreshStatsBuildStatus(root, { base: { 健康: 80, 力量: 80 } });
    assert.match(point.textContent, /超出 20 点/);
    assert.equal(button.disabled, true);
    refreshStatsBuildStatus(root, { special: { 运动: true } });
    assert.match(special.textContent, /最多选 3 项（已选 4 项）/);
    assert.equal(button.disabled, true);
    assert.equal(refreshStatsBuildStatus(null, {}), false);
});

test('设置页建卡开关：默认预选的特有技能可以取消，取消后能改选其他技能；数字框改动不丢其余默认值', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: { prompt: () => '', confirm: () => true }, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        const build = () => normalizeBuild(controller.getSnapshot().draft.bridge.stats.build);
        // 修复前：草稿里默认项是 undefined，取反仍为 true，默认技能关不掉。
        controller.toggle('bridge.stats.build.special.烹饪');
        assert.equal(build().special.烹饪, false);
        assert.deepEqual(buildSummary(build()).picked, ['家务', '学习']);
        controller.toggle('bridge.stats.build.special.运动');
        assert.equal(build().special.运动, true);
        const s = buildSummary(build());
        assert.deepEqual([s.picked.length, s.ok], [3, true]);
        controller.setValue('bridge.stats.build.base.健康', '60', { liveInput: true });
        const b = build();
        assert.deepEqual([b.base.健康, b.base.力量, b.special.运动, b.special.烹饪], [60, 40, true, false]);
        assert.equal(buildSummary(b).left, 40);
        assert.notEqual(controller.close().ok, false);
    } finally {
        vn.destroy?.();
    }
});
