// 猜忌 / 背叛 / 后宫一批（A–H）：背叛挂结怨、误会解除清结怨、猜忌关系状态、坐实转结怨、相安同心、起始恋人记 romance、主角侧睚眦必报骰、相爱相杀。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualRelations, settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { getTraitByName, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { traitEdgeOf } from '../src/scene/stats/stat-trait-dice.js';
import { addRel, findRel, hasRel, repairLegacyStart } from '../src/scene/stats/stat-trait-rules-bond.js';
import { statsRivalSet } from '../src/scene/stats/stat-rivals.js';
import { relationLabel } from '../src/scene/stats/stat-relation-label.js';

const on = { on: true, src: 'manual' };
const traitsOf = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [n.startsWith('combo:') ? n : getTraitByName(n).id, on]))]));
const people = (spec, day = 10) => {
    const chars = {};
    for (const [name, patch] of Object.entries(spec)) {
        const base = createCharacter(1, { nsfw: true });
        chars[name] = { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) } };
    }
    const s = createStatsState();
    return { ...s, clock: { ...s.clock, day }, characters: chars };
};
const settle = (state, text, opts = {}) => settleFloorText(state, text, { random: () => 0.99, nsfw: true, strengthRev: 2, favorTier: 'normal', resolveCharacter: (n) => (['林夏', '苏晴'].includes(n) ? n : null), ...opts });
const dim = (s, k, n = '林夏') => s.characters[n].dims[k];

test('A 背叛：主角背叛 TA 挂结怨；以德报怨不挂；TA 背叛主角不挂', () => {
    const s = people({ 林夏: {} });
    const ev = (dir) => ({ reviewEvents: [{ type: '背叛', name: '林夏', dir }] });
    assert.ok(hasRel(settle(s, '正文', ev('ta')).state, '林夏', '结怨', 'ta'));
    assert.equal(hasRel(settle(s, '正文', { traits: traitsOf({ 林夏: ['以德报怨'] }), ...ev('ta') }).state, '林夏', '结怨', 'ta'), false);
    assert.equal(hasRel(settle(s, '正文', ev('me')).state, '林夏', '结怨', 'ta'), false);
});

test('B 误会解除：近 7 天的结怨摘掉，更早的保留', () => {
    const s = addRel(people({ 林夏: { dims: { 芥蒂: 40 } } }, 10), '林夏', '结怨', 'ta', { hold: 40 });
    assert.equal(hasRel(settle(s, '[igs-stat:clear|林夏]').state, '林夏', '结怨', 'ta'), false);
    const old = people({ 林夏: { dims: { 芥蒂: 40 }, relStates: [{ id: '结怨', dir: 'ta', since: 10, hold: 40 }] } }, 30);
    assert.ok(hasRel(settle(old, '[igs-stat:clear|林夏]').state, '林夏', '结怨', 'ta'));
});

test('C 开局恋人+猜忌：romance、挂猜忌并记数额；解除退一半', () => {
    const r = settle(people({}), '[igs-stat:start|林夏|恋人+猜忌]');
    assert.equal(r.state.characters.林夏.romance, true);
    const rel = findRel(r.state, '林夏', '猜忌', 'ta');
    assert.deepEqual([rel.src, rel.trust, rel.grudge], ['setting', 25, 10]);
    assert.equal(dim(r.state, '信任'), 35);
    const clear = settle(r.state, '[igs-stat:clear|林夏]');
    assert.equal(hasRel(clear.state, '林夏', '猜忌', 'ta'), false);
    assert.equal(dim(clear.state, '信任'), 35 + 13);
    assert.equal(dim(clear.state, '芥蒂'), 10 - 5);
});

test('C 猜忌减半：挂着猜忌时信任涨幅约为一半', () => {
    const s = people({ 林夏: { dims: { 信任: 10 } } });
    const text = '[igs-stat:trust|林夏|上升|大]';
    const plain = dim(settle(s, text).state, '信任') - 10;
    const doubt = addRel(s, '林夏', '猜忌', 'ta', { src: 'story', trust: 0, grudge: 0 });
    const half = dim(settle(doubt, text).state, '信任') - 10;
    assert.ok(plain >= 2);
    assert.equal(half, plain - Math.round(plain / 2));
});

test('C 心结：只退芥蒂', () => {
    const r = settle(people({}), '[igs-stat:start|林夏|恋人+心结]');
    const rel = findRel(r.state, '林夏', '心结', 'ta');
    assert.deepEqual([rel.trust, rel.grudge], [0, 25]);
    const clear = settle(r.state, '[igs-stat:clear|林夏]');
    assert.equal(hasRel(clear.state, '林夏', '心结', 'ta'), false);
    assert.equal(dim(clear.state, '芥蒂'), 25 - 13);
});

test('C 旧档补挂：有起始关系备注无关系状态时补挂，且只补一次', () => {
    const s = people({ 林夏: { dims: { 信任: 35, 芥蒂: 10 } } });
    const info = { notes: { 林夏: '起始关系·恋人+猜忌' }, jealous: [] };
    const fixed = repairLegacyStart(s, info);
    assert.ok(hasRel(fixed, '林夏', '猜忌', 'ta'));
    assert.equal(fixed.characters.林夏.romance, true);
    assert.equal(repairLegacyStart(fixed, info), fixed);
});

test('D 坐实转结怨：挂着猜忌时发生背叛，摘猜忌挂结怨', () => {
    const s = addRel(people({ 林夏: {} }), '林夏', '猜忌', 'ta', { src: 'story', trust: 0, grudge: 0 });
    const r = settle(s, '正文', { reviewEvents: [{ type: '背叛', name: '林夏', dir: 'ta' }] });
    assert.equal(hasRel(r.state, '林夏', '猜忌', 'ta'), false);
    assert.ok(hasRel(r.state, '林夏', '结怨', 'ta'));
});

const harem = (a = {}, b = {}) => people({ 林夏: { romance: true, jealousSeen: true, dims: { 好感: 60 }, ...a }, 苏晴: { romance: true, jealousSeen: true, dims: { 好感: 60 }, ...b } });
const both = '[igs-stat:event|林夏|交心][igs-stat:event|苏晴|交心]';
test('E 相安：两位恋爱对象都吃过醋，同楼都写交心 → 互挂相安；条件不足不挂', () => {
    const r = settle(harem(), both);
    assert.equal(findRel(r.state, '林夏', '相安').toward, '苏晴');
    assert.equal(findRel(r.state, '苏晴', '相安').toward, '林夏');
    assert.equal(hasRel(settle(harem(), '[igs-stat:event|林夏|交心]').state, '林夏', '相安'), false);
    assert.equal(hasRel(settle(harem({}, { jealousSeen: false }), both).state, '林夏', '相安'), false);
    assert.ok(hasRel(settle(harem(), '[igs-stat:event|林夏|交心]', { present: ['林夏', '苏晴'] }).state, '苏晴', '相安'));
});

test('E 同心：已相安且双方好感 ≥ 76 再次满足升同心；好感不够仍相安', () => {
    const hi = { dims: { 好感: 80 } };
    const first = settle(harem(hi, hi), both);
    assert.ok(hasRel(first.state, '林夏', '相安') && !hasRel(first.state, '林夏', '同心'));
    const again = settle(first.state, both);
    assert.ok(hasRel(again.state, '林夏', '同心'));
    assert.equal(hasRel(again.state, '林夏', '相安'), false);
    const low = settle(settle(harem(), both).state, both);
    assert.ok(hasRel(low.state, '林夏', '相安') && !hasRel(low.state, '林夏', '同心'));
});

test('E 相安后不再因对方吃醋；情敌集合不再彼此算入', () => {
    const paired = settle(harem(), both).state;
    const jealous = '[igs-stat:favor|林夏|吃醋]';
    const r = settle(paired, jealous, { present: ['林夏', '苏晴'] });
    assert.ok(!r.changes.some((c) => c.target === '林夏' && c.note === '吃醋'));
    assert.ok(settle(harem(), jealous, { present: ['林夏', '苏晴'] }).changes.some((c) => c.target === '林夏' && c.note === '吃醋'));
    assert.equal(statsRivalSet({ active: new Map(), entries: new Map(), initial: paired }).size, 0);
    assert.deepEqual([...statsRivalSet({ active: new Map(), entries: new Map(), initial: harem() })].sort(), ['林夏', '苏晴']);
});

test('F 起始关系补填出恋人：manual 带 romance 写入 romance=true；旧档补 true；已明确结束的不改', () => {
    const next = applyManualRelations(people({ 林夏: {} }), { 林夏: { 好感: 80, 信任: 60, 了解: 40, romance: true } });
    assert.equal(next.characters.林夏.romance, true);
    assert.equal(relationLabel(next.characters.林夏.dims, { romance: true }).name, '情根深种');
    assert.equal(relationLabel(next.characters.林夏.dims, { romance: false }).name, '情同手足');
    const note = { notes: { 林夏: '起始关系·恋人' } };
    assert.equal(repairLegacyStart(people({ 林夏: { dims: { 好感: 80 } } }), note).characters.林夏.romance, true);
    assert.equal(repairLegacyStart(people({ 林夏: { romance: false } }), note).characters.林夏.romance, false);
});

test('G 睚眦必报：主角对抗结怨对象多一骰，非结怨对象没有；宿仇也算', () => {
    const s = addRel(people({ 林夏: {}, 苏晴: {} }), '林夏', '结怨', 'ta');
    const cat = traitCatalogOf(traitsOf({ 主角: ['睚眦必报'] }), true);
    const edge = (state, who) => traitEdgeOf(state, cat, { actor: '主角', skill: '魅力', toward: who }).edge;
    assert.equal(edge(s, '林夏'), 1);
    assert.equal(edge(s, '苏晴'), 0);
    assert.equal(edge({ ...s, characters: { ...s.characters, 苏晴: { ...s.characters.苏晴, feud: true } } }, '苏晴'), 1);
});

test('H 相爱相杀：战斗取胜 / 亲密对决我方主导，持有者好感上升；败、同伴、对方主导、别人不加', () => {
    const s = people({ 林夏: { dims: { 好感: 30 } } });
    const traits = traitsOf({ 林夏: ['combo:相爱相杀'] });
    const run = (flags, directives = []) => settleTraitTags(s, directives, { traits, nsfw: true, changes: [], flags, present: ['林夏'] }).characters.林夏.dims.好感;
    assert.ok(run({ battle: { outcome: '胜' } }) > 30);
    assert.equal(run({ battle: { outcome: '败' } }), 30);
    assert.equal(run({ battle: { outcome: '胜', ally: '林夏' } }), 30);
    const duel = (ending, counterpart) => [{ kind: 'challenge', ending, mechanic: '主导', counterpart }];
    assert.ok(run({}, duel('我方主导', '林夏')) > 30);
    assert.equal(run({}, duel('对方主导', '林夏')), 30);
    assert.equal(run({}, duel('我方主导', '别人')), 30);
});
