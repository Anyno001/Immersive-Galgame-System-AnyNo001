import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BUILD_ABILITY_OPTIONS, BUILD_ROLE_OPTIONS, buildInitialState, buildSummary, manualBuildSummary, normalizeBuild,
} from '../src/scene/stats/stat-build.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { MANUAL_TOTAL } from '../src/combat/abilities.js';

test('默认建卡：倾向取默认职业、六维 8 分、选前 3 项特有技能', () => {
    const s = buildSummary(undefined);
    assert.equal(s.ok, true);
    assert.deepEqual(s.picked, ['烹饪', '家务', '学习']);
    assert.deepEqual(normalizeStatsSettings(null).build, normalizeBuild(null));
    const b = normalizeBuild(undefined);
    assert.deepEqual(b.prefs, { major: 'str', minor: 'con', weak: 'int' });
    assert.equal(b.role, 'warrior');
    assert.equal(Object.values(b.scores).every((v) => v === 8), true);
    assert.equal(BUILD_ABILITY_OPTIONS.length, 6);
    assert.ok(BUILD_ROLE_OPTIONS.some(([key]) => key === 'mage'));
});

test('旧的 60 点分配（build.base）被忽略；倾向写法可中英混用，重复倾向不建卡', () => {
    const legacy = normalizeBuild({ base: { 健康: 80, 力量: 80 } });
    assert.equal(Object.hasOwn(legacy, 'base'), false);
    assert.deepEqual(normalizeBuild({ prefs: { major: '敏捷', minor: 'int', weak: '魅' } }).prefs, { major: 'dex', minor: 'int', weak: 'cha' });
    const dup = buildInitialState({ prefs: { major: 'str', minor: 'str', weak: 'int' } });
    assert.deepEqual([dup.ok, dup.reason], [false, 'stats-build-prefs-duplicate']);
    const many = buildInitialState({ special: { 运动: true, 艺术: true } });
    assert.deepEqual([many.ok, many.reason], [false, 'stats-build-too-many-special']);
});

test('倾向建卡：倾向写进 protagonist.prefs，只保留所选特有技能（50 起），不改入参', () => {
    const input = { prefs: { major: 'cha', minor: 'dex', weak: 'str' }, special: { 烹饪: false, 家务: true, 学习: false, 话术: true } };
    const frozen = JSON.stringify(input);
    const r = buildInitialState(input);
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.protagonist.prefs, { major: 'cha', minor: 'dex', weak: 'str' });
    assert.deepEqual(Object.keys(r.state.protagonist.skills).sort(), ['家务', '话术'].sort());
    assert.equal(r.state.protagonist.skills.家务.value, 50);
    assert.equal(r.manual, undefined);
});

test('手动六维：单项 3–18、合计不超过 72，合法时附 manual 交战斗侧写初始档案', () => {
    assert.equal(MANUAL_TOTAL, 72);
    const ok = buildInitialState({ scores: { str: 15, dex: 14, con: 12, int: 8, wis: 12, cha: 11 }, role: 'mage', className: '术士' }, { mode: 'manual' });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.manual, { className: '术士', role: 'mage', scores: { str: 15, dex: 14, con: 12, int: 8, wis: 12, cha: 11 } });
    assert.deepEqual(ok.state.protagonist.prefs, { major: 'str', minor: 'dex', weak: 'int' });
    const over = buildInitialState({ scores: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 } }, { mode: 'manual' });
    assert.deepEqual([over.ok, over.reason], [false, 'stats-build-over-total']);
    const range = buildInitialState({ scores: { str: 2, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } }, { mode: 'manual' });
    assert.deepEqual([range.ok, range.reason], [false, 'stats-build-score-range']);
    const sum = manualBuildSummary({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    assert.deepEqual([sum.total, sum.left, sum.ok], [60, 12, true]);
    assert.equal(normalizeBuild({ role: '不存在', className: '一二三四五六七八九十十一十二十三' }).role, 'warrior');
    assert.equal(normalizeBuild({ className: '一二三四五六七八九十十一十二十三' }).className.length, 12);
});
