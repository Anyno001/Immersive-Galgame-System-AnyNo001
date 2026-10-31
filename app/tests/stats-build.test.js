import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, buildSummary, manualBuildSummary, normalizeBuild } from '../src/scene/stats/stat-build.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { defaultPrefs } from '../src/combat/abilities.js';
import { refreshStatsBuildStatus, renderStatsBuildFields, renderStatsBuildModeField } from '../src/visual/igs-ui/stats-settings-fields.js';

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

test('手动建档（P8c 2A）：缺省底分 8、定位战士；总分不超过 72、单项 3–18；擅长项按分值推导', () => {
    const d = normalizeBuild(null);
    assert.deepEqual(d.scores, { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    assert.equal(d.role, 'warrior');
    const base = manualBuildSummary(null);
    assert.deepEqual([base.ok, base.total, base.left], [true, 48, 24]);
    const full = manualBuildSummary({ scores: { str: 18, dex: 14, con: 10, int: 8, wis: 12, cha: 10 } });
    assert.deepEqual([full.ok, full.total, full.left], [true, 72, 0]);
    assert.deepEqual(full.prefs, { major: 'str', minor: 'dex', weak: 'int' });
    const over = manualBuildSummary({ scores: { str: 18, dex: 18, con: 18, int: 18 } });
    assert.deepEqual([over.ok, over.errors[0], over.prefs], [false, 'stats-build-over-total', null]);
    const low = manualBuildSummary({ scores: { str: 2 } });
    assert.deepEqual([low.ok, low.errors[0]], [false, 'stats-build-score-range']);
    const high = manualBuildSummary({ scores: { cha: 19 } });
    assert.deepEqual([high.ok, high.errors[0]], [false, 'stats-build-score-range']);
});

test('手动建档建卡：返回 manual 载荷供写 init，存档倾向由分值推导；超点不建卡；不改入参', () => {
    const input = { scores: { str: 8, dex: 16, con: 10, int: 14, wis: 12, cha: 12 }, role: 'mage', className: '  见习法师  ' };
    const frozen = JSON.stringify(input);
    const r = buildInitialState(input, { mode: 'manual' });
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(r.ok, true);
    assert.deepEqual(r.manual, { className: '见习法师', role: 'mage', scores: input.scores });
    assert.deepEqual(r.state.protagonist.prefs, { major: 'dex', minor: 'int', weak: 'str' });
    const bad = buildInitialState({ scores: { str: 18, dex: 18, con: 18, int: 18 } }, { mode: 'manual' });
    assert.deepEqual([bad.ok, bad.reason], [false, 'stats-build-over-total']);
    assert.equal(buildInitialState(input).manual, undefined);
});

test('手动建档表单：六维加点替代三项倾向；建档方式分段按钮发 stats-build-mode；就地刷新按手动规则', () => {
    const html = renderStatsBuildFields(undefined, () => '', { mode: 'manual' });
    assert.match(html, /data-stats-mode="manual"/);
    assert.match(html, /data-path="bridge\.stats\.build\.scores\.str"/);
    assert.match(html, /data-path="bridge\.stats\.build\.role"/);
    assert.doesNotMatch(html, /bridge\.stats\.build\.prefs\.major/);
    assert.match(html, /剩余 24 点 · 总分 48\/72/);
    assert.doesNotMatch(renderStatsBuildFields(undefined), /data-stats-mode/);
    assert.match(renderStatsBuildModeField('manual'), /data-action="stats-build-mode:manual"/);
    const point = { textContent: '' };
    const button = { disabled: false };
    const holder = { getAttribute: (n) => ({ 'data-stats-mode': 'manual', 'data-stats-worldview': 'modern' })[n] || null };
    const nodes = { '[data-advanced="stats-build"]': holder, '[data-result="stats-build"]': point, '[data-action="stats-chat-enable-build"]': button };
    refreshStatsBuildStatus({ querySelector: (s) => nodes[s] || null }, { scores: { str: 18, dex: 18, con: 18, int: 18 } });
    assert.match(point.textContent, /总分超过 72/);
    assert.equal(button.disabled, true);
});
