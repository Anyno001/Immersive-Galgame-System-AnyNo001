import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { buildStatsPrompt, INTIMATE_TAG_LINE } from '../src/scene/stats/stat-prompt.js';
import { relationLabel, RELATION_RULES } from '../src/scene/stats/stat-relation-label.js';
import { characterStatMetrics, protagonistStatMetrics } from '../src/scene/stats/stat-metrics.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { shiftStress } from '../src/scene/stats/stat-strain.js';

const high = () => 0.99;
const autoResolve = (name) => name; // 宽松登记：任何名字都能建档，用来验证群体拦截。
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: autoResolve, favorTier: 'normal', strengthRev: 2, ...opts });
const diag = (r, code) => r.meta.diagnostics.some((d) => d.code === code);
const heroBars = (bars) => ({ ...createStatsState(), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 0, ...bars } } });
const withNpc = (patch = {}, bars = {}) => {
    const base = createCharacter(1, { nsfw: true });
    return { ...createStatsState(), characters: { 林夏: { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } } } };
};

// ---------- 二、群体亲密 ----------
test('亲密对象写群体：只扣主角体力，不建档', () => {
    const r = floor(createStatsState(), '[igs-stat:intimate|群体|重]', { nsfw: true, intimateCost: 'standard' });
    assert.ok(r.state.protagonist.bars.stamina < 100);
    assert.deepEqual(Object.keys(r.state.characters), []);
    assert.ok(!diag(r, 'stat-unknown-character'));
});

test('群体亲密与具名角色同楼：角色照扣，群体不建档', () => {
    const r = floor(withNpc(), '[igs-stat:intimate|群体|轻][igs-stat:intimate|林夏|中]', { nsfw: true, intimateCost: 'standard' });
    assert.ok(r.state.characters.林夏.bars.stamina < 100);
    assert.ok(!r.state.characters.群体);
});

test('旧楼：群体亲密照旧走登记解析', () => {
    const r = floor(createStatsState(), '[igs-stat:intimate|群体|重]', { nsfw: true, intimateCost: 'standard', strengthRev: 1, resolveCharacter: () => null });
    assert.equal(r.state.protagonist.bars.stamina, 100);
});

test('提示词亲密行补「角色名写群体」', () => {
    assert.ok(INTIMATE_TAG_LINE.includes('对象是无名者或多人时，角色名写群体'));
});

// ---------- 三、群体建档拦截 ----------
test('群体称呼拦截：们/群/众结尾与词表，记 stat-group-name', () => {
    for (const name of ['村民们', '信众', '粉丝', '人群', '观众', '狼群']) {
        const r = floor(createStatsState(), `[igs-stat:favor|${name}|开心]`);
        assert.ok(diag(r, 'stat-group-name'), name);
        assert.ok(!r.state.characters[name], name);
    }
    const ok = floor(createStatsState(), '[igs-stat:favor|林夏|开心]');
    assert.ok(ok.state.characters.林夏);
});

test('群体拦截：已登记、手动登记、表格导入不拦；旧楼不拦', () => {
    const known = { ...createStatsState(), characters: { 信众: createCharacter(1) } };
    assert.ok(!diag(floor(known, '[igs-stat:favor|信众|开心]'), 'stat-group-name'));
    const manual = floor(createStatsState(), '[igs-stat:favor|信众|开心]', { manual: { 信众: { 好感: 10 } } });
    assert.ok(!diag(manual, 'stat-group-name'));
    assert.ok(manual.state.characters.信众);
    const seeded = floor(createStatsState(), '[igs-stat:favor|观众|开心]', { seedCharacters: { 观众: {} } });
    assert.ok(!diag(seeded, 'stat-group-name'));
    assert.ok(seeded.state.characters.观众);
    assert.ok(!diag(floor(createStatsState(), '[igs-stat:favor|信众|开心]', { strengthRev: 1 }), 'stat-group-name'));
});

// ---------- 四、奉若神明 ----------
test('奉若神明：好感>75、信任>75、了解≤25，三套共用', () => {
    const dims = { 好感: 80, 信任: 80, 了解: 10 };
    for (const opts of [{ romance: true }, {}, { kin: true }]) {
        assert.deepEqual(relationLabel(dims, opts), { name: '奉若神明', desc: '全心信奉，却并不了解真实的你' });
    }
    assert.equal(relationLabel({ 好感: 80, 信任: 75, 了解: 10 }, { romance: true }).name, '情根深种');
    assert.equal(relationLabel({ 好感: 80, 信任: 80, 了解: 26 }, { romance: true }).name, '情根深种');
});

test('奉若神明排序：在相知类之后、情根深种之前', () => {
    const names = RELATION_RULES.map((r) => r.name);
    const at = names.indexOf('奉若神明');
    assert.ok(at > names.indexOf('两心相许') && at > names.indexOf('爱而生疑'));
    assert.equal(names[at + 1], '情根深种');
    // 知根知底的仍落相知类。
    assert.equal(relationLabel({ 好感: 80, 信任: 80, 了解: 80 }, { romance: true }).name, '灵犀相通');
});

// ---------- 五、压力满后转换 ----------
const atPeak = (n, extra = {}) => heroBars({ stress: 100, ...(n ? { stressPeak: n } : {}), ...extra });

test('压力 100 连续 3 楼：提示词出现极限与主要来源，回到 90 以下解除', () => {
    let state = heroBars({ stress: 95 });
    state = floor(state, '[igs-stat:stress|上升|大|被迫]').state;
    assert.equal(state.protagonist.bars.stress, 100);
    assert.equal(state.protagonist.bars.stressPeak, 1);
    state = floor(state, '平静的一楼').state;
    assert.ok(!buildStatsPrompt(state).content.includes('撑到极限'));
    state = floor(state, '平静的一楼').state;
    assert.equal(state.protagonist.bars.stressPeak, 3);
    const text = buildStatsPrompt(state).content;
    assert.ok(text.includes('主角已经撑到极限，压力主要来自被迫'));
    assert.ok(text.includes('[igs-stat:break|状态名]'));
    state = floor(state, '[igs-stat:stress|下降|小]').state;
    assert.equal(state.protagonist.bars.stress, 95);
    assert.ok(buildStatsPrompt(state).content.includes('撑到极限'));
    state = floor(state, '[igs-stat:stress|下降|中]').state;
    assert.ok(!buildStatsPrompt(state).content.includes('撑到极限'));
    assert.ok(!('stressPeak' in state.protagonist.bars));
});

test('未满 3 楼时降下来就重新计数', () => {
    let state = floor(atPeak(1), '[igs-stat:stress|下降|小]').state;
    assert.ok(!('stressPeak' in state.protagonist.bars));
    state = floor(heroBars({ stress: 100 }), '').state;
    assert.equal(state.protagonist.bars.stressPeak, 1);
});

test('break：未到极限丢弃；到极限后换名从 0 计，提示词改为状态与程度', () => {
    const early = floor(atPeak(1), '[igs-stat:break|堕落]');
    assert.ok(diag(early, 'stat-break-not-ready'));
    assert.ok(!early.state.protagonist.bars.strain);
    const r = floor(atPeak(3), '[igs-stat:break|堕落]');
    assert.deepEqual(r.state.protagonist.bars.strain, { name: '堕落', type: '沦陷' });
    assert.equal(r.state.protagonist.bars.stress, 0);
    const up = floor(r.state, '[igs-stat:stress|上升|大][igs-stat:stress|上升|大]').state;
    assert.ok(buildStatsPrompt(up).content.includes('主角已堕落（程度：中）'));
    assert.equal(protagonistStatMetrics(up.protagonist.bars).find((m) => m.colorKey !== 'slot-2').label, '堕落');
    assert.ok(diag(floor(atPeak(3), '[igs-stat:break|顿悟]'), 'stat-tag-rejected'));
});

test('break 带角色名作用于 NPC；旧楼不认', () => {
    const state = withNpc({}, { stress: 100, stressPeak: 3 });
    const r = floor(state, '[igs-stat:break|林夏|黑化]');
    assert.equal(r.state.characters.林夏.bars.strain.name, '黑化');
    assert.ok(buildStatsPrompt(r.state, { present: ['林夏'] }).content.includes('林夏已黑化（程度：轻）。'));
    const old = floor(state, '[igs-stat:break|林夏|黑化]', { strengthRev: 1 });
    assert.ok(!old.state.characters.林夏.bars.strain);
});

test('四类走向：沦陷只涨不跌且满了二次转换；崩溃回落归零恢复；扭曲不自然变化；蜕变用完恢复', () => {
    const fall = { stress: 90, strain: { name: '堕落', type: '沦陷' } };
    assert.equal(shiftStress(fall, -20).stress, 90);
    assert.deepEqual(shiftStress(fall, 20).strain, { name: '彻底堕落', type: '沦陷', final: true });
    const broken = { stress: 10, strain: { name: '破碎', type: '崩溃' } };
    const healed = shiftStress(broken, -10);
    assert.equal(healed.stress, 0);
    assert.ok(!healed.strain);
    const dark = { ...heroBars({ stress: 40, strain: { name: '黑化', type: '扭曲' } }) };
    assert.equal(settleDay(dark, { random: high, rev: 2 }).protagonist.bars.stress, 40);
    const crumble = heroBars({ stress: 40, strain: { name: '疯狂', type: '崩溃' } });
    assert.equal(settleDay(crumble, { random: high, rev: 2 }).protagonist.bars.stress, 30);
    const r = floor(atPeak(3), '[igs-stat:break|觉醒]');
    assert.equal(r.state.protagonist.bars.stress, 100);
    const spent = shiftStress({ stress: 5, strain: { name: '觉醒', type: '蜕变' } }, 10);
    assert.equal(spent.stress, 0);
    assert.ok(!spent.strain);
});

// ---------- 五点五、宿仇与痴迷 ----------
test('芥蒂满 100 定为宿仇：不再自然消退', () => {
    const r = floor(withNpc({ dims: { 芥蒂: 100 } }), '');
    assert.equal(r.state.characters.林夏.feud, true);
    const after = floor(r.state, '[igs-stat:skip|10天]').state;
    assert.equal(after.characters.林夏.dims.芥蒂, 100);
    const plain = floor(withNpc({ dims: { 芥蒂: 99 } }), '[igs-stat:skip|10天]').state;
    assert.equal(plain.characters.林夏.dims.芥蒂, 89);
});

test('欲望满 100 定为痴迷：注入念念不忘，离开主角时压力上涨', () => {
    const r = floor(withNpc({ dims: { 欲望: 100 } }), '', { nsfw: true });
    assert.equal(r.state.characters.林夏.obsessed, true);
    assert.ok(buildStatsPrompt(r.state, { present: ['林夏'] }).content.includes('林夏对主角念念不忘。'));
    const away = { ...r.state, clock: { ...r.state.clock, day: 5 }, characters: { 林夏: { ...r.state.characters.林夏, lastSeenDay: 1 } } };
    assert.equal(settleDay(away, { random: high, rev: 2 }).characters.林夏.bars.stress, 5);
    assert.equal(settleSkip(away, 3, { random: high, rev: 2 }).characters.林夏.bars.stress, 15);
    const near = { ...away, characters: { 林夏: { ...away.characters.林夏, lastSeenDay: 5 } } };
    assert.equal(settleDay(near, { random: high, rev: 2 }).characters.林夏.bars.stress, 0);
});

test('宿仇、痴迷只在新楼定型', () => {
    const r = floor(withNpc({ dims: { 芥蒂: 100, 欲望: 100 } }), '', { strengthRev: 1, nsfw: true });
    assert.ok(!r.state.characters.林夏.feud);
    assert.ok(!r.state.characters.林夏.obsessed);
});

// ---------- 五点六、NPC 体力与压力注入 ----------
test('NPC 体力、压力四句定稿措辞，数值正常时不写，不再限于亲密消耗', () => {
    const say = (bars) => buildStatsPrompt(withNpc({}, bars), { present: ['林夏'] }).content;
    assert.ok(say({ stamina: 20 }).includes('林夏很疲惫，动作变慢，容易走神。'));
    assert.ok(say({ stamina: 0 }).includes('林夏体力耗尽，撑不住了，需要立刻休息。'));
    assert.ok(say({ stress: 75 }).includes('林夏有心事，睡不好，容易烦躁。'));
    assert.ok(say({ stress: 95 }).includes('林夏神经紧绷到了极限，一点小事就可能失态。'));
    const calm = say({ stamina: 80, stress: 30 });
    for (const word of ['疲惫', '耗尽', '有心事', '神经紧绷']) assert.ok(!calm.includes(word), word);
});

test('设置开关开启时显示角色体力与压力两条，关时都不显示', () => {
    const c = withNpc({}, { stamina: 40, stress: 60 }).characters.林夏;
    const on = characterStatMetrics(c, { stamina: true }).map((m) => m.label);
    assert.deepEqual(on.slice(0, 2), ['体力', '压力']);
    const off = characterStatMetrics(c, { stamina: false }).map((m) => m.label);
    assert.ok(!off.includes('体力') && !off.includes('压力'));
});

// ---------- 旧楼不变 ----------
test('旧楼：压力 100 不计满格楼数，break 与来源不认', () => {
    const r = floor(heroBars({ stress: 95 }), '[igs-stat:stress|上升|大|被迫][igs-stat:break|堕落]', { strengthRev: 1 });
    assert.equal(r.state.protagonist.bars.stress, 100);
    assert.ok(!('stressPeak' in r.state.protagonist.bars));
    assert.ok(!('stressFrom' in r.state.protagonist.bars));
    assert.ok(!r.state.protagonist.bars.strain);
});

// ---------- 创伤瞬间拉满 ----------
test('压力极大＋50（rev 2），旧楼按大＋20', () => {
    assert.equal(floor(heroBars({ stress: 10 }), '[igs-stat:stress|上升|极大]').state.protagonist.bars.stress, 60);
    assert.equal(floor(heroBars({ stress: 10 }), '[igs-stat:stress|上升|巨大]').state.protagonist.bars.stress, 60);
    assert.equal(floor(heroBars({ stress: 10 }), '[igs-stat:stress|上升|极大]', { strengthRev: 1 }).state.protagonist.bars.stress, 30);
    assert.equal(floor(heroBars({ stress: 60 }), '[igs-stat:stress|下降|极大]').state.protagonist.bars.stress, 40);
});

test('脆弱：压力上升 x2，叠加极大从 0 到 100；下降不翻倍；不写进提示词', () => {
    const traits = { 主角: { fragile: true } };
    assert.equal(floor(heroBars({ stress: 0 }), '[igs-stat:stress|上升|极大]', { traits }).state.protagonist.bars.stress, 100);
    assert.equal(floor(heroBars({ stress: 0 }), '[igs-stat:stress|上升|中]', { traits }).state.protagonist.bars.stress, 20);
    assert.equal(floor(heroBars({ stress: 50 }), '[igs-stat:stress|下降|中]', { traits }).state.protagonist.bars.stress, 40);
    const r = floor(withNpc({}, { stress: 0 }), '[igs-stat:stress|林夏|上升|大]', { traits: { 林夏: { fragile: true } } });
    assert.equal(r.state.characters.林夏.bars.stress, 40);
    const p = buildStatsPrompt(heroBars({ stress: 0 }), { traits });
    assert.ok(!p.content.includes('脆弱') && !p.content.includes('fragile'));
});

test('单楼从 70 以下直接到 100：当楼即进入极限；从 70 以上到 100 仍要连续 3 楼', () => {
    const jump = floor(heroBars({ stress: 10 }), '[igs-stat:stress|上升|极大][igs-stat:stress|上升|极大]');
    assert.equal(jump.state.protagonist.bars.stress, 100);
    assert.ok(jump.state.protagonist.bars.stressPeak >= 3);
    const slow = floor(heroBars({ stress: 85 }), '[igs-stat:stress|上升|大]');
    assert.equal(slow.state.protagonist.bars.stress, 100);
    assert.equal(slow.state.protagonist.bars.stressPeak, 1);
});
