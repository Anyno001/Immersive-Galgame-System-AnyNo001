import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, buildSummary, normalizeBuild } from '../src/scene/stats/stat-build.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { defaultPrefs } from '../src/combat/abilities.js';
import { refreshStatsBuildStatus, renderStatsBuildFields } from '../src/visual/igs-ui/stats-settings-fields.js';

test('默认建卡：倾向取默认职业原型，默认选前 3 项特有技能（合并计划 N1）', () => {
    const s = buildSummary(undefined);
    assert.equal(s.ok, true);
    assert.deepEqual(s.prefs, defaultPrefs());
    assert.deepEqual(s.picked, ['烹饪', '家务', '学习']);
    assert.deepEqual(normalizeStatsSettings(null).build, normalizeBuild(null));
});

test('倾向收六维键或中文名；三项重复或多选特有技能时不建卡', () => {
    assert.deepEqual(normalizeBuild({ prefs: { major: '敏捷', minor: 'wis', weak: '力量' } }).prefs, { major: 'dex', minor: 'wis', weak: 'str' });
    const dup = buildInitialState({ prefs: { major: 'con' } });
    assert.deepEqual([dup.ok, dup.reason], [false, 'stats-build-prefs-duplicate']);
    const many = buildInitialState({ special: { 运动: true, 艺术: true } });
    assert.deepEqual([many.ok, many.reason], [false, 'stats-build-too-many-special']);
});

test('按倾向建卡：存档只记倾向，六维不进技能表；只保留所选特有技能（50 起），不改入参', () => {
    const input = { prefs: { major: 'cha', minor: 'dex', weak: 'str' }, special: { 烹饪: false, 家务: true, 学习: false, 话术: true } };
    const frozen = JSON.stringify(input);
    const r = buildInitialState(input);
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.protagonist.prefs, { major: 'cha', minor: 'dex', weak: 'str' });
    assert.deepEqual(Object.keys(r.state.protagonist.skills).sort(), ['家务', '话术'].sort());
    assert.equal(r.state.protagonist.skills.家务.value, 50);
    assert.equal(r.state.protagonist.bars.health, undefined);
});

test('建卡区渲染：默认折叠；倾向重复时说明原因并禁用按分配启用', () => {
    const ok = renderStatsBuildFields(undefined);
    assert.match(ok, /<details[^>]*data-advanced="stats-build">/);
    assert.match(ok, /主擅长 15、次擅长 14、短板 8/);
    assert.match(ok, /data-path="bridge\.stats\.build\.prefs\.major"/);
    assert.match(ok, /data-action="stats-chat-enable-build" type="button">/);
    const bad = renderStatsBuildFields({ prefs: { major: 'con' } });
    assert.match(bad, /三项不同的属性/);
    assert.match(bad, /data-action="stats-chat-enable-build" type="button" disabled>/);
});

test('建卡区就地刷新：提示与按分配启用同步更新，不依赖整页重绘', () => {
    const point = { textContent: '' };
    const special = { textContent: '' };
    const button = { disabled: false };
    const nodes = {
        '[data-result="stats-build"]': point,
        '[data-result="stats-build-special"]': special,
        '[data-action="stats-chat-enable-build"]': button,
    };
    const root = { querySelector: (selector) => nodes[selector] || null };
    assert.equal(refreshStatsBuildStatus(root, {}), true);
    assert.equal(button.disabled, false);
    refreshStatsBuildStatus(root, { prefs: { major: 'con' } });
    assert.match(point.textContent, /三项不同的属性/);
    assert.equal(button.disabled, true);
    refreshStatsBuildStatus(root, { special: { 运动: true } });
    assert.match(special.textContent, /最多选 3 项（已选 4 项）/);
    assert.equal(button.disabled, true);
    assert.equal(refreshStatsBuildStatus(null, {}), false);
});
