import test from 'node:test';
import assert from 'node:assert/strict';
import { RELATION_RULES, relationLabel } from '../src/scene/stats/stat-relation-label.js';

const name = (f, t = 0, k = 0, g = 0, d = 0, nsfw = false) => relationLabel({ 好感: f, 信任: t, 了解: k, 芥蒂: g, 欲望: d }, { nsfw }).name;

test('规则表共三十一条，第十五条为颇有好感', () => {
    assert.equal(RELATION_RULES.length, 31);
    assert.equal(RELATION_RULES[14].name, '颇有好感');
    assert.equal(new Set(RELATION_RULES.map((r) => r.name)).size, 31);
});

test('每条规则至少一例命中', () => {
    const cases = [
        ['灵犀相通', 80, 60, 60, 0], ['两心相许', 80, 60, 0, 0], ['爱恨交织', 80, 0, 0, 30], ['爱而生疑', 80, 0, 0, 0],
        ['情根深种', 80, 30, 0, 0], ['情热难抑', 60, 0, 0, 0, 60, true], ['心有芥蒂', 60, 0, 0, 30], ['心动设防', 60, 0, 0, 0],
        ['情投意合', 60, 60, 0, 0], ['暧昧未明', 60, 30, 0, 0], ['欢喜冤家', 30, 0, 0, 30], ['知己', 30, 60, 60, 0],
        ['可托之人', 30, 60, 30, 0], ['雾里看花', 30, 30, 0, 0], ['颇有好感', 30, 30, 30, 0], ['可靠旧识', 10, 60, 0, 0],
        ['面和心远', 10, 0, 0, 30], ['熟稔之交', 10, 30, 60, 0], ['点头之交', 10, 30, 30, 0], ['身不由己', -10, 0, 0, 0, 60, true],
        ['不喜但信得过', -10, 60, 0, 0], ['误会丛生', -10, 30, 0, 0], ['势不两立', -80, 0, 0, 0], ['积怨已深', -60, 0, 0, 55],
        ['深恶痛绝', -60, 0, 0, 0], ['针锋相对', -30, 0, 0, 30], ['敬而远之', -30, 0, 30, 0], ['心生嫌隙', -10, 30, 30, 5],
        ['淡淡疏离', -10, 30, 30, 0], ['素昧平生', 0, 0, 0, 0], ['萍水相逢', 0, 10, 0, 0],
    ];
    for (const [label, f, t, k, g, d, nsfw] of cases) assert.equal(name(f, t, k, g, d || 0, Boolean(nsfw)), label, label);
    assert.equal(new Set(cases.map((c) => c[0])).size, 31);
});

test('NSFW 关闭时情热难抑、身不由己跳过', () => {
    assert.equal(name(60, 0, 0, 0, 60, false), '心动设防');
    assert.equal(name(-10, 0, 30, 0, 60, false), '淡淡疏离');
    assert.equal(name(60, 0, 0, 0, 60, true), '情热难抑');
});

test('好感边界：25 与 26、50 与 51、75 与 76、负二十五与负二十六', () => {
    assert.equal(name(25, 30, 30), '点头之交');
    assert.equal(name(26, 30, 30), '颇有好感');
    assert.equal(name(50, 30, 30), '颇有好感');
    assert.equal(name(51, 30, 30), '暧昧未明');
    assert.equal(name(75, 30, 30), '暧昧未明');
    assert.equal(name(76, 30, 30), '情根深种');
    assert.equal(name(-25, 30, 30), '敬而远之');
    assert.equal(name(-26, 30, 30), '敬而远之');
    assert.equal(name(-24, 30, 30), '淡淡疏离');
    assert.equal(name(-49, 60), '不喜但信得过');
    assert.equal(name(-50, 60), '深恶痛绝');
    assert.equal(name(-74, 0, 0, 0), '深恶痛绝');
    assert.equal(name(-75, 0, 0, 0), '势不两立');
});

test('芥蒂边界：25 与 26、50 与 51、75 与 76', () => {
    assert.equal(name(60, 0, 0, 25), '心动设防');
    assert.equal(name(60, 0, 0, 26), '心有芥蒂');
    assert.equal(name(-60, 0, 0, 50), '深恶痛绝');
    assert.equal(name(-60, 0, 0, 51), '积怨已深');
    assert.equal(name(0, 0, 0, 75), '萍水相逢');
    assert.equal(name(0, 0, 0, 76), '势不两立');
    assert.equal(name(10, 30, 30, 76), '面和心远');
});

test('缺项按零，只给名称与说明', () => {
    assert.deepEqual(relationLabel({}), { name: '素昧平生', desc: '尚无交集' });
    assert.deepEqual(relationLabel(null), { name: '素昧平生', desc: '尚无交集' });
    assert.equal(typeof relationLabel({ 好感: 80 }).desc, 'string');
});
