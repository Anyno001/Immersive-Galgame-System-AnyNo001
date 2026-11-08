// 恩情、仇怨、罪犯分组规则测试：直接调用钩子与倍率入口，覆盖每条已接规则。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { dailyTraitPass, settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { getTraitByName, hasTrait, traitCatalogOf, traitDaily, traitDice, traitScale } from '../src/scene/stats/stat-traits.js';
import { addRel, bondDice, consumeFavorDice, findRel, hasRel } from '../src/scene/stats/stat-trait-rules-bond.js';

const on = { on: true, src: 'manual' };
const traitsOf = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [getTraitByName(n).id, on]))]));
const make = (patch = {}, bars = {}, names = []) => {
    const base = createCharacter(1, { nsfw: true });
    const state = { ...createStatsState(), characters: { 林夏: { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } } } };
    return { state, traits: traitsOf({ 林夏: names }) };
};
const cat = (traits) => traitCatalogOf(traits, true);
const tags = (state, traits, directives = [], ctx = {}) => {
    const full = { traits, nsfw: true, changes: [], flags: {}, present: ['林夏'], ...ctx };
    return { state: settleTraitTags(state, directives, full), ctx: full };
};
const dim = (s, k, n = '林夏') => s.characters[n].dims[k];
const hero = (s) => s.protagonist.bars;
const days = (state, traits, present = []) => dailyTraitPass({ ...state, clock: { ...state.clock, day: 10 } }, { traits, nsfw: true, present }, []);
const withZhang = (state) => ({ ...state, characters: { ...state.characters, 张三: createCharacter(1, { nsfw: true }) } });
const dropAll = (s) => ({ ...s, characters: { 林夏: { ...s.characters.林夏, relStates: [] } } });

// ---- 倍率 ----

test('骗子：他人对其了解上升减半；混混信任 x0.75；前科犯信任过半前 x0.5、过半后 x1.5', () => {
    const { state, traits } = make({}, {}, ['骗子']);
    assert.equal(traitScale(state, cat(traits), '林夏', '了解', 'up'), 0.5);
    const m = make({}, {}, ['混混']);
    assert.equal(traitScale(m.state, cat(m.traits), '林夏', '信任', 'up'), 0.75);
    const low = make({ dims: { 信任: 40 } }, {}, ['前科犯']);
    assert.equal(traitScale(low.state, cat(low.traits), '林夏', '信任', 'up'), 0.5);
    const high = make({ dims: { 信任: 60 } }, {}, ['前科犯']);
    assert.equal(traitScale(high.state, cat(high.traits), '林夏', '信任', 'up'), 1.5);
});

test('以德报怨：伤害类芥蒂上升减半', () => {
    const { state, traits } = make({}, {}, ['以德报怨']);
    assert.equal(traitScale(state, cat(traits), '林夏', '芥蒂', 'up'), 0.5);
});

// ---- 每日 ----

test('黑帮、大佬：每天压力缓升', () => {
    const a = make({}, {}, ['黑帮']);
    assert.equal(traitDaily(a.state, cat(a.traits), '林夏', '压力'), 3);
    const b = make({}, {}, ['大佬']);
    assert.equal(traitDaily(b.state, cat(b.traits), '林夏', '压力'), 3);
});

// ---- 检定骰 ----

test('杀手战斗、混混街头冲突、黑客技术检定各多一个奖励骰', () => {
    for (const [name, kind] of [['杀手', '战斗'], ['混混', '街头冲突'], ['黑客', '技术']]) {
        const { state, traits } = make({}, {}, [name]);
        assert.equal(traitDice(state, cat(traits), '林夏', kind), 1, name);
        assert.equal(traitDice(state, cat(traits), '林夏', '社交'), 0, name);
    }
});

test('睚眦必报：对抗结怨对象的检定多一个奖励骰；主角侧由 ctx.hates 声明', () => {
    const { state, traits } = make({}, {}, ['睚眦必报']);
    assert.equal(traitDice(state, cat(traits), '林夏', '对抗'), 0);
    const hated = { ...state, characters: { 林夏: { ...state.characters.林夏, feud: true } } };
    assert.equal(traitDice(hated, cat(traits), '林夏', '对抗'), 1);
    assert.equal(traitDice(state, cat(traits), '林夏', '对抗', { hates: true }), 1);
});

test('结怨（你恨 TA）：主角对 TA 的对抗检定多一骰；欠你人情：受恩方被求助多一骰，用掉即清', () => {
    const { state } = make();
    const grudge = addRel(state, '林夏', '结怨', 'me');
    assert.equal(bondDice(grudge, '主角', '林夏'), 1);
    assert.equal(bondDice(state, '主角', '林夏'), 0);
    const debt = addRel(state, '林夏', '欠你人情', 'ta');
    assert.equal(bondDice(debt, '林夏'), 1);
    assert.equal(hasRel(consumeFavorDice(debt, '林夏'), '林夏', '欠你人情'), false);
    assert.equal(hasRel(debt, '林夏', '欠你人情'), true, '不原地改');
});

// ---- 罪犯事件 ----

test('通缉犯：身份被揭开，在场角色对其信任下降一档', () => {
    const { state } = make({ dims: { 信任: 20 } });
    const t = { 张三: { [getTraitByName('通缉犯').id]: on } };
    const r = tags(withZhang(state), t, [], { bondEvents: [{ type: '身份揭开', who: '张三' }], present: ['林夏', '张三'] });
    assert.equal(dim(r.state, '信任'), 17);
});

test('惯偷：偷窃成功金钱小增；被发现在场角色信任下降一大档', () => {
    const base = make({ dims: { 信任: 30 } }, {}, ['惯偷']);
    const ok = tags(base.state, base.traits, [], { bondEvents: [{ type: '偷窃成功', who: '林夏' }] });
    assert.equal(ok.state.characters.林夏.bars.money, base.state.characters.林夏.bars.money + 20);
    const t = { 张三: { [getTraitByName('惯偷').id]: on } };
    const r = tags(withZhang(make({ dims: { 信任: 30 } }).state), t, [], { bondEvents: [{ type: '偷窃被发现', who: '张三' }], present: ['林夏', '张三'] });
    assert.equal(dim(r.state, '信任'), 15);
});

test('骗子：谎言被揭穿，对方信任下降一大档、芥蒂上升一档', () => {
    const { state } = make({ dims: { 信任: 30, 芥蒂: 0 } });
    const t = { 张三: { [getTraitByName('骗子').id]: on } };
    const r = tags(withZhang(state), t, [], { bondEvents: [{ type: '谎言揭穿', who: '张三', by: '林夏' }], present: ['林夏', '张三'] });
    assert.equal(dim(r.state, '信任'), 15);
    assert.equal(dim(r.state, '芥蒂'), 2);
});

test('黑客：被追查那一楼压力小升', () => {
    const { state, traits } = make({}, { stress: 10 }, ['黑客']);
    const r = tags(state, traits, [], { bondEvents: [{ type: '被追查', who: '林夏' }] });
    assert.equal(r.state.characters.林夏.bars.stress, 15);
});

test('杀手：战斗后其压力不上升（退回本楼标签结算的增量）', () => {
    const { state, traits } = make({}, { stress: 30 }, ['杀手']);
    const ctx = { changes: [{ source: 'tag', target: '林夏', key: 'stress', from: 20, to: 30 }] };
    const r = tags(state, traits, [{ kind: 'battle', tier: '杂兵', count: 1 }], { ...ctx, changes: [...ctx.changes] });
    assert.equal(r.state.characters.林夏.bars.stress, 20);
    const none = tags(state, traits, [], { changes: [...ctx.changes] });
    assert.equal(none.state.characters.林夏.bars.stress, 30);
});

test('黑帮：打工收入再高一档', () => {
    const { state } = make();
    const t = { 主角: { [getTraitByName('黑帮').id]: on } };
    const r = tags(state, t, [], { flags: { work: { income: '普通' } } });
    assert.equal(hero(r.state).money, hero(state).money + 400);
});

test('共犯：信任下降被抵消；一方被抓另一方压力上升一大档；关系状态同样生效', () => {
    const { state, traits } = make({ dims: { 信任: 40 } }, {}, ['共犯']);
    const drop = tags(state, traits, [], { changes: [{ source: 'tag', target: '林夏', key: '信任', from: 50, to: 40 }] });
    assert.equal(dim(drop.state, '信任'), 50, '补回下降的 10 点');
    const caught = tags(state, traits, [], { bondEvents: [{ type: '被抓', who: '主角' }] });
    assert.equal(caught.state.characters.林夏.bars.stress, state.characters.林夏.bars.stress + 20);
    const mate = tags(state, traits, [], { bondEvents: [{ type: '被抓', who: '林夏' }] });
    assert.equal(hero(mate.state).stress, hero(state).stress + 20);
    const rel = tags(addRel(make({ dims: { 信任: 3 } }).state, '林夏', '共犯', 'both'), {}, [], { changes: [{ source: 'tag', target: '林夏', key: '信任', from: 6, to: 3 }] });
    assert.equal(dim(rel.state, '信任'), 6);
});

test('共犯关系状态：事件挂上；特质判定读得到', () => {
    const { state, traits } = make({}, {}, ['共犯']);
    assert.equal(hasTrait(state, cat(traits), '林夏', '共犯'), true);
    const r = tags(make().state, {}, [], { bondEvents: [{ type: '共犯', target: '林夏' }] });
    assert.ok(hasRel(r.state, '林夏', '共犯'));
});

test('斯德哥尔摩：被挟持期间对挟持者不记芥蒂，好感上升多一半', () => {
    const { state, traits } = make({ dims: { 芥蒂: 8, 好感: 4 } }, {}, ['斯德哥尔摩']);
    const changes = () => [
        { source: 'tag', target: '林夏', key: '芥蒂', from: 0, to: 8 },
        { source: 'tag', target: '林夏', key: '好感', from: 0, to: 4 },
    ];
    const r = tags(state, traits, [], { bondEvents: [{ type: '挟持', target: '林夏' }], changes: changes() });
    assert.equal(dim(r.state, '芥蒂'), 0);
    assert.equal(dim(r.state, '好感'), 6);
    const free = tags(state, traits, [], { changes: changes() });
    assert.equal(dim(free.state, '芥蒂'), 8, '未被挟持不生效');
    const forced = tags(state, traits, [{ kind: 'stress', value: '上升', target: '林夏', source: '被迫' }], { changes: changes() });
    assert.equal(dim(forced.state, '芥蒂'), 0, '被迫类压力来源也算挟持');
});

// ---- 恩情 ----

test('救命之恩（TA 欠你）：当楼信任上升一大档、芥蒂下降一大档；好感单楼最多降一小档', () => {
    const { state, traits } = make({ dims: { 信任: 0, 芥蒂: 30, 好感: 50 } });
    const r = tags(state, traits, [], { bondEvents: [{ type: '救命', target: '林夏' }] });
    assert.equal(dim(r.state, '信任'), 6);
    assert.equal(dim(r.state, '芥蒂'), 20);
    assert.ok(hasRel(r.state, '林夏', '救命之恩', 'ta'));
    const cur = r.state.characters.林夏;
    const dropped = { ...r.state, characters: { 林夏: { ...cur, dims: { ...cur.dims, 好感: 38 } } } };
    const hit = tags(dropped, traits, [], { changes: [{ source: 'tag', target: '林夏', key: '好感', from: 50, to: 38 }] });
    assert.equal(dim(hit.state, '好感'), 47);
    assert.equal(state.characters.林夏.relStates, undefined, '不原地改');
});

test('救命之恩（你欠 TA）：TA 好感小升；TA 遇险主角压力上升；报恩后好感信任各上升一大档', () => {
    const { state, traits } = make({ dims: { 好感: 10, 信任: 10 } });
    const a = tags(state, traits, [], { bondEvents: [{ type: '救命', target: '林夏', dir: 'me' }] });
    assert.equal(dim(a.state, '好感'), 12);
    assert.ok(hasRel(a.state, '林夏', '救命之恩', 'me'));
    const b = tags(a.state, traits, [], { bondEvents: [{ type: '遇险', target: '林夏' }] });
    assert.equal(hero(b.state).stress, hero(a.state).stress + 5);
    const c = tags(a.state, traits, [], { bondEvents: [{ type: '报恩', target: '林夏', dir: 'me' }] });
    assert.equal(dim(c.state, '好感'), 18);
    assert.equal(dim(c.state, '信任'), 16);
    assert.equal(hasRel(c.state, '林夏', '救命之恩'), false);
});

test('知恩图报：受恩方恩情效果加倍', () => {
    const { state, traits } = make({ dims: { 信任: 0, 芥蒂: 30 } }, {}, ['知恩图报']);
    const r = tags(state, traits, [], { bondEvents: [{ type: '救命', target: '林夏' }] });
    assert.equal(dim(r.state, '信任'), 12);
    assert.equal(dim(r.state, '芥蒂'), 10);
});

test('欠你人情与报恩：帮忙挂人情，报恩清除；恩怨分明报恩后好感一大档', () => {
    const { state, traits } = make({ dims: { 好感: 10 } }, {}, ['恩怨分明']);
    const a = tags(state, traits, [], { bondEvents: [{ type: '帮忙', target: '林夏' }] });
    assert.ok(hasRel(a.state, '林夏', '欠你人情', 'ta'));
    const b = tags(a.state, traits, [], { bondEvents: [{ type: '报恩', target: '林夏' }] });
    assert.equal(hasRel(b.state, '林夏', '欠你人情'), false);
    assert.equal(dim(b.state, '好感'), 16);
});

test('白眼狼：救命之恩过七天淡化为欠你人情；知恩图报不淡化', () => {
    const { state, traits } = make({}, {}, ['白眼狼']);
    const owed = addRel(state, '林夏', '救命之恩', 'ta');
    const faded = days(owed, traits);
    assert.equal(hasRel(faded, '林夏', '救命之恩'), false);
    assert.ok(hasRel(faded, '林夏', '欠你人情', 'ta'));
    const early = dailyTraitPass({ ...owed, clock: { ...owed.clock, day: 3 } }, { traits, nsfw: true, present: [] }, []);
    assert.ok(hasRel(early, '林夏', '救命之恩'));
    const keep = make({}, {}, ['白眼狼', '知恩图报']);
    assert.ok(hasRel(days(addRel(keep.state, '林夏', '救命之恩', 'ta'), keep.traits), '林夏', '救命之恩'));
});

test('恩怨分明：欠恩期间每天压力缓升（NPC 欠主角、主角欠 TA 两侧）', () => {
    const { state, traits } = make({}, { stress: 10 }, ['恩怨分明']);
    const npc = days(addRel(state, '林夏', '欠你人情', 'ta'), traits);
    assert.equal(npc.characters.林夏.bars.stress, 13);
    const t = { 主角: { [getTraitByName('恩怨分明').id]: on } };
    const me = days(addRel(state, '林夏', '救命之恩', 'me'), t);
    assert.equal(hero(me).stress, hero(state).stress + 3);
});

test('恩怨两难：救了宿仇转为此状态，芥蒂不再上升，好感上升时 TA 压力小升；决裂转回宿仇', () => {
    const { state, traits } = make({ feud: true, dims: { 芥蒂: 100, 好感: 10 } });
    const a = tags(state, traits, [], { bondEvents: [{ type: '救命', target: '林夏' }] });
    assert.ok(hasRel(a.state, '林夏', '恩怨两难', 'ta'));
    assert.equal(a.state.characters.林夏.feud, undefined);
    const cur = a.state.characters.林夏;
    const mid = { ...a.state, characters: { 林夏: { ...cur, dims: { ...cur.dims, 芥蒂: 90, 好感: 14 } } } };
    const up = tags(mid, traits, [], { changes: [
        { source: 'tag', target: '林夏', key: '芥蒂', from: 85, to: 90 }, { source: 'tag', target: '林夏', key: '好感', from: 10, to: 14 }] });
    assert.equal(dim(up.state, '芥蒂'), 85);
    assert.equal(up.state.characters.林夏.bars.stress, cur.bars.stress + 5);
    const split = tags(a.state, traits, [], { bondEvents: [{ type: '决裂', target: '林夏' }] });
    assert.equal(split.state.characters.林夏.feud, true);
    assert.equal(hasRel(split.state, '林夏', '恩怨两难'), false);
});

// ---- 仇怨 ----

test('结怨（TA 恨你）：芥蒂当楼上升一大档，不自然消退，好感上升减半，可经道歉化解', () => {
    const { state, traits } = make({ dims: { 芥蒂: 5, 好感: 10 } });
    const a = tags(state, traits, [], { bondEvents: [{ type: '结怨', target: '林夏' }] });
    assert.equal(dim(a.state, '芥蒂'), 15);
    assert.equal(findRel(a.state, '林夏', '结怨', 'ta').hold, 15);
    const cur = a.state.characters.林夏;
    const faded = { ...a.state, characters: { 林夏: { ...cur, dims: { ...cur.dims, 芥蒂: 8 } } } };
    assert.equal(dim(days(faded, traits), '芥蒂'), 15, '日结算后补回');
    const raised = { ...a.state, characters: { 林夏: { ...cur, dims: { ...cur.dims, 好感: 18 } } } };
    const half = tags(raised, traits, [], { changes: [{ source: 'tag', target: '林夏', key: '好感', from: 10, to: 18 }] });
    assert.equal(dim(half.state, '好感'), 14);
    const sorry = tags(a.state, traits, [], { bondEvents: [{ type: '道歉', target: '林夏' }] });
    assert.equal(hasRel(sorry.state, '林夏', '结怨'), false);
});

test('结怨由标签推导：芥蒂大档上升挂结怨；睚眦必报中档即可；以德报怨不会结怨', () => {
    const big = make({ dims: { 芥蒂: 10 } });
    const tag = (strength) => [{ kind: 'dim', dim: '芥蒂', value: '上升', strength, target: '林夏' }];
    assert.ok(hasRel(tags(big.state, big.traits, tag('大')).state, '林夏', '结怨', 'ta'));
    const mid = make({ dims: { 芥蒂: 5 } }, {}, ['睚眦必报']);
    assert.ok(hasRel(tags(mid.state, mid.traits, tag('中')).state, '林夏', '结怨', 'ta'));
    assert.equal(hasRel(tags(big.state, big.traits, tag('中')).state, '林夏', '结怨'), false);
    const kind = make({ dims: { 芥蒂: 10 } }, {}, ['以德报怨']);
    const k = tags(kind.state, kind.traits, tag('大'), { bondEvents: [{ type: '结怨', target: '林夏' }] });
    assert.equal(hasRel(k.state, '林夏', '结怨'), false);
});

test('结怨（你恨 TA）：TA 在场时主角压力缓升', () => {
    const { state, traits } = make();
    const r = days(addRel(state, '林夏', '结怨', 'me'), traits, ['林夏']);
    assert.equal(hero(r).stress, hero(state).stress + 3);
    const away = days(addRel(state, '林夏', '结怨', 'me'), traits, []);
    assert.equal(hero(away).stress, hero(state).stress);
});

test('血仇：直接定型宿仇；一次救命不解，两次才转恩怨两难', () => {
    const { state, traits } = make({ dims: { 芥蒂: 20 } });
    const a = tags(state, traits, [], { bondEvents: [{ type: '血仇', target: '林夏' }] });
    assert.equal(a.state.characters.林夏.feud, true);
    assert.equal(dim(a.state, '芥蒂'), 100);
    const b = tags(a.state, traits, [], { bondEvents: [{ type: '救命', target: '林夏' }] });
    assert.equal(b.state.characters.林夏.feud, true);
    const c = tags(b.state, traits, [], { bondEvents: [{ type: '救命', target: '林夏' }] });
    assert.ok(hasRel(c.state, '林夏', '恩怨两难', 'ta'));
    assert.equal(c.state.characters.林夏.feud, undefined);
});

test('爱恨交织：有结怨且好感到喜欢时挂上，好感上升欲望同步小升，条件消失即摘除', () => {
    const { state, traits } = make({ dims: { 好感: 30, 欲望: 0 } });
    const a = tags(addRel(state, '林夏', '结怨', 'ta'), traits, []);
    assert.ok(hasRel(a.state, '林夏', '爱恨交织', 'ta'));
    const b = tags(a.state, traits, [], { changes: [{ source: 'tag', target: '林夏', key: '好感', from: 28, to: 30 }] });
    assert.equal(dim(b.state, '欲望'), 2);
    const gone = tags(dropAll(b.state), traits, []);
    assert.equal(hasRel(gone.state, '林夏', '爱恨交织'), false);
});

test('冰释前嫌：结怨清除，芥蒂下降一大档，信任上升一小档；宿仇一笑泯恩仇直接解开，否则先转恩怨两难', () => {
    const { state, traits } = make({ dims: { 芥蒂: 40, 信任: 0 } });
    const a = tags(addRel(state, '林夏', '结怨', 'ta'), traits, [], { bondEvents: [{ type: '和解', target: '林夏' }] });
    assert.equal(hasRel(a.state, '林夏', '结怨'), false);
    assert.equal(dim(a.state, '芥蒂'), 30);
    assert.equal(dim(a.state, '信任'), 1);
    const feud = make({ feud: true, dims: { 芥蒂: 100 } });
    const b = tags(feud.state, feud.traits, [], { bondEvents: [{ type: '和解', target: '林夏' }] });
    assert.ok(hasRel(b.state, '林夏', '恩怨两难', 'ta'));
    const smile = make({ feud: true, dims: { 芥蒂: 100 } }, {}, ['一笑泯恩仇']);
    const c = tags(smile.state, smile.traits, [], { bondEvents: [{ type: '和解', target: '林夏' }] });
    assert.equal(c.state.characters.林夏.feud, undefined);
    assert.equal(hasRel(c.state, '林夏', '恩怨两难'), false);
    const d = tags(addRel(state, '林夏', '结怨', 'ta'), traits, [{ kind: 'event', target: '林夏', value: '共患难' }]);
    assert.equal(hasRel(d.state, '林夏', '结怨'), false, '共患难事件视为和解');
});

test('大仇得报：报复方压力下降一大档、结怨清除', () => {
    const { state, traits } = make({}, { stress: 50 });
    const a = tags(addRel(state, '林夏', '结怨', 'ta'), traits, [], { bondEvents: [{ type: '复仇', target: '林夏' }] });
    assert.equal(a.state.characters.林夏.bars.stress, 30);
    assert.equal(hasRel(a.state, '林夏', '结怨'), false);
    const heroSide = tags(addRel(state, '林夏', '结怨', 'me'), traits, [], { bondEvents: [{ type: '复仇', target: '林夏', dir: 'me' }] });
    assert.equal(hasRel(heroSide.state, '林夏', '结怨'), false);
    assert.equal(hero(heroSide.state).stress, Math.max(0, hero(state).stress - 20));
});
