import test from 'node:test';
import assert from 'node:assert/strict';
import { relationLabel, stageLabel } from '../src/scene/stats/stat-relation-label.js';

const dims = (f, t = 0, k = 0, g = 0, d = 0) => ({ 好感: f, 信任: t, 了解: k, 芥蒂: g, 欲望: d });
const love = (f, t, k, g, d, nsfw = false) => relationLabel(dims(f, t, k, g, d), { nsfw, romance: true }).name;
const friend = (f, t, k, g, d, nsfw = false) => relationLabel(dims(f, t, k, g, d), { nsfw, romance: false }).name;

test('非恋爱为默认，15 条好感大于 25 的名字两套各自命中', () => {
    const cases = [
        [[80, 60, 60, 0], '灵犀相通', '肝胆相照'], [[80, 60, 30, 0], '情根深种', '情同手足'],
        [[80, 0, 0, 30], '爱恨交织', '恩怨难断'], [[80, 0, 0, 0], '爱而生疑', '亲而生疑'],
        [[60, 0, 0, 0], '心动设防', '亲近设防'], [[60, 60, 0, 0], '情投意合', '志同道合'],
        [[60, 30, 0, 0], '暧昧未明', '交情匪浅'], [[60, 0, 0, 30], '心有芥蒂', '心有芥蒂'],
        [[30, 0, 0, 30], '欢喜冤家', '欢喜冤家'], [[30, 60, 60, 0], '知己', '知己'],
        [[30, 60, 30, 0], '可托之人', '可托之人'], [[30, 30, 0, 0], '雾里看花', '雾里看花'],
        [[30, 30, 30, 0], '颇有好感', '意气相投'],
    ];
    for (const [[f, t, k, g], a, b] of cases) {
        assert.equal(love(f, t, k, g, 0), a, a);
        assert.equal(friend(f, t, k, g, 0), b, b);
    }
    assert.equal(relationLabel(dims(30, 30, 30)).name, '意气相投');
});

test('情热难抑与欲念暗生仅 NSFW，且两套说明不同', () => {
    assert.equal(love(60, 0, 0, 0, 60, true), '情热难抑');
    assert.equal(friend(60, 0, 0, 0, 60, true), '欲念暗生');
    assert.equal(friend(60, 0, 0, 0, 60, false), '亲近设防');
    assert.equal(relationLabel(dims(60, 0, 0, 0, 60), { nsfw: true }).desc, '亲近之外，另有渴求');
});

test('好感不高于 25 与负向两套共用', () => {
    for (const args of [[10, 60, 0, 0, 0], [10, 0, 0, 30, 0], [-10, 0, 0, 0, 0], [-60, 0, 0, 55, 0], [0, 0, 0, 0, 0]]) {
        assert.equal(love(...args), friend(...args));
    }
});

test('相爱相杀排在所有正向规则之前', () => {
    assert.equal(love(40, 0, 0, 80, 0), '相爱相杀');
    assert.equal(friend(40, 0, 0, 80, 0), '亦敌亦友');
    assert.equal(love(80, 60, 60, 51, 0), '相爱相杀');
    assert.equal(love(40, 0, 0, 50, 0), '欢喜冤家');
    assert.equal(love(25, 0, 0, 80, 0), '面和心远');
    assert.equal(love(40, 0, 0, 51, 0), '相爱相杀');
    assert.equal(relationLabel(dims(40, 0, 0, 80)).desc, '放不下对方，恨意也深');
});

test('各取所需：好感大于 0 且欲望大于 50，仅 NSFW，两套共用，在情热难抑之后', () => {
    assert.equal(love(10, 0, 0, 0, 60, true), '各取所需');
    assert.equal(friend(10, 0, 0, 0, 60, true), '各取所需');
    assert.equal(love(10, 0, 0, 0, 60, false), '点头之交');
    assert.equal(love(60, 0, 0, 0, 60, true), '情热难抑');
    assert.equal(love(10, 0, 0, 0, 50, true), '点头之交');
    assert.equal(love(-10, 0, 0, 0, 60, true), '身不由己');
});

test('相知门槛：了解不高于 50 时往下落', () => {
    assert.equal(love(80, 60, 50, 0, 0), '情根深种');
    assert.equal(love(80, 60, 51, 0, 0), '灵犀相通');
    assert.equal(love(80, 60, 51, 10, 0), '两心相许');
    assert.equal(friend(80, 60, 51, 10, 0), '莫逆之交');
    assert.equal(friend(80, 60, 0, 0, 0), '情同手足');
    assert.equal(love(30, 60, 50, 0, 0), '可托之人');
    assert.equal(love(30, 60, 51, 0, 0), '知己');
});

test('阶段名：非恋爱 26 以上换友情向，恋爱与其余沿用原名', () => {
    assert.equal(stageLabel(26), '相处融洽');
    assert.equal(stageLabel(50, false), '相处融洽');
    assert.equal(stageLabel(51), '亲近信赖');
    assert.equal(stageLabel(75), '亲近信赖');
    assert.equal(stageLabel(76), '情深义重');
    assert.equal(stageLabel(100), '情深义重');
    assert.equal(stageLabel(26, true), '明确喜欢');
    assert.equal(stageLabel(51, true), '强烈在意');
    assert.equal(stageLabel(76, true), '深爱');
    assert.equal(stageLabel(10), '初步好感');
    assert.equal(stageLabel(0), '无感');
    assert.equal(stageLabel(-30), '厌烦排斥');
});

test('亲情向：非恋爱且 kin 时用亲情名，未列出的沿用友情向，恋爱优先', () => {
    const kin = (f, t, k, g) => relationLabel(dims(f, t, k, g), { kin: true }).name;
    assert.equal(kin(40, 0, 0, 80), '又爱又恨');
    assert.equal(kin(80, 60, 60, 0), '亲密无间');
    assert.equal(kin(80, 60, 60, 10), '至亲至信');
    assert.equal(kin(80, 30, 0, 0), '亲情深厚');
    assert.equal(kin(60, 60, 0, 0), '亲厚可依');
    assert.equal(kin(60, 30, 0, 0), '亲近和睦');
    assert.equal(kin(30, 30, 30, 0), '关系融洽');
    assert.equal(kin(80, 0, 0, 30), '恩怨难断');
    assert.equal(kin(80, 0, 0, 0), '亲而生疑');
    assert.equal(kin(30, 60, 60, 0), '知己');
    assert.equal(relationLabel(dims(30, 30, 30), { kin: true, romance: true }).name, '颇有好感');
    assert.equal(relationLabel(dims(30, 30, 30)).name, '意气相投');
    assert.equal(relationLabel(dims(60, 0, 0, 0, 60), { kin: true, nsfw: true }).name, '欲念暗生');
});
