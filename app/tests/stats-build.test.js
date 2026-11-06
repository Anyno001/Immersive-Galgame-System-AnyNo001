import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BUILD_ABILITY_OPTIONS, BUILD_ROLE_OPTIONS, buildInitialState, buildSummary, manualBuildSummary, normalizeBuild, pickCandidates,
} from '../src/scene/stats/stat-build.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { MANUAL_TOTAL } from '../src/combat/abilities.js';

test('默认建卡：倾向取默认职业、六维 8 分；技能默认擅长前 3 项、比较擅长后 5 项', () => {
    const s = buildSummary(undefined);
    assert.equal(s.ok, true);
    assert.deepEqual(s.picked, ['烹饪', '家务', '学习', '运动', '艺术', '话术', '照顾', '应变']);
    assert.deepEqual([s.skills.烹饪, s.skills.运动], [60, 30]);
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
    const dupPick = buildInitialState({ picks: { strong1: '话术', strong2: '话术', strong3: '侦查' } });
    assert.deepEqual([dupPick.ok, dupPick.reason], [false, 'stats-build-pick-duplicate']);
    const missing = buildInitialState({ picks: { strong1: '话术', strong2: '', strong3: '侦查' } });
    assert.deepEqual([missing.ok, missing.reason], [false, 'stats-build-strong-missing']);
});

test('倾向建卡：倾向写进 protagonist.prefs，只保留所选技能（擅长 60、比较擅长 30），不改入参；下拉候选含全部内置技能', () => {
    const input = { prefs: { major: 'cha', minor: 'dex', weak: 'str' }, picks: { strong1: '话术', strong2: '侦查', strong3: '家务', good1: '格斗', good2: '' } };
    const frozen = JSON.stringify(input);
    const r = buildInitialState(input);
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.protagonist.prefs, { major: 'cha', minor: 'dex', weak: 'str' });
    assert.deepEqual(Object.keys(r.state.protagonist.skills).sort(), ['侦查', '家务', '格斗', '话术'].sort());
    assert.deepEqual([r.state.protagonist.skills.话术.value, r.state.protagonist.skills.格斗.value], [60, 30]);
    assert.equal(r.manual, undefined);
    assert.ok(pickCandidates(undefined).includes('开锁'));
});

test('旧设置 build.special 迁成擅长格，不在候选里的名字丢弃', () => {
    const b = normalizeBuild({ special: { 话术: true, 烹饪: false, 咒语: true } });
    assert.deepEqual([b.picks.strong1, b.picks.strong2, b.picks.strong3], ['话术', '烹饪', '家务']);
    assert.equal(Object.values(b.picks).includes('咒语'), false);
    assert.equal(Object.hasOwn(b, 'special'), false);
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

test('自定义技能所属六维：只保留 custom 里有名字的有效六维，pickSummary 带出已选自定义技能的属性', async () => {
    const { normalizeBuild, pickSummary } = await import('../src/scene/stats/stat-build.js');
    const build = normalizeBuild({ custom: ['钓鱼'], customAttrs: { 钓鱼: '感知', 别的: '力量', 钓虾: '乱写' }, picks: { strong1: '钓鱼', strong2: '烹饪', strong3: '家务' } });
    assert.deepEqual(build.customAttrs, { 钓鱼: '感知' });
    const summary = pickSummary(build);
    assert.deepEqual(summary.attributes, { 钓鱼: '感知' });
    assert.equal(summary.skills.钓鱼, 60);
    assert.ok(normalizeBuild({ custom: ['钓鱼'], picks: { strong1: '唱歌', strong2: '舞蹈', strong3: '察言观色' } }).picks.strong3 === '察言观色');
});

test('3+5 下拉分组：内置候选各归一组且不落「其他」，漏组的技能落「其他」，自定义技能单列', async () => {
    const { groupPickCandidates, groupSkillNames, pickCandidates, SKILL_GROUPS } = await import('../src/scene/stats/stat-build.js');
    const all = pickCandidates({ custom: [] });
    const { custom, groups } = groupPickCandidates({ custom: ['钓鱼'] });
    assert.deepEqual(custom, ['钓鱼']);
    assert.ok(!groups.some((g) => g.label === '其他'), `内置候选漏组：${groups.filter((g) => g.label === '其他').flatMap((g) => g.items).join('、')}`);
    const placed = groups.flatMap((g) => g.items);
    assert.equal(new Set(placed).size, placed.length, '同一技能不能出现在两组');
    assert.deepEqual([...placed].sort(), all.filter((n) => n !== '钓鱼').sort());
    assert.ok(groups.some((g) => g.label === '歪门邪道'));
    assert.deepEqual(groupSkillNames(['烹饪', '虚构技能']), [{ label: '日常', items: ['烹饪'] }, { label: '其他', items: ['虚构技能'] }]);
    const members = SKILL_GROUPS.flatMap(([, list]) => list);
    assert.equal(new Set(members).size, members.length, '分组成员表不能重复列同一技能');
});
