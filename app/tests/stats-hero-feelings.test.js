import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState, heroDimsOf, withCharacter } from '../src/scene/stats/stat-state.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const settle = (text, opts = {}, state = createStatsState()) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'normal', strengthRev: 3, ...opts });
const withXue = (dims = {}) => {
    const c = createCharacter(1);
    return withCharacter(createStatsState(), '小雪', { ...c, dims: { ...c.dims, ...dims } });
};

test('开关关闭：my 标签不结算，meta 不带 heroSide', () => {
    const r = settle('[igs-stat:my|小雪|信任|上升|大]', {}, withXue());
    assert.equal(r.state.characters.小雪.hero, undefined);
    assert.equal(r.meta.heroSide, undefined);
});

test('开启：同项取幅度最大的一条结算一次', () => {
    const r = settle('[igs-stat:my|小雪|信任|上升|小][igs-stat:my|小雪|信任|上升|大]', { heroSide: true }, withXue());
    assert.equal(r.state.characters.小雪.hero.dims.信任, 6);
    assert.equal(r.state.characters.小雪.dims.信任, 0);
    assert.equal(r.changes.filter((c) => c.heroSide && c.key === 'my:信任').length, 1);
    assert.equal(r.meta.heroSide, true);
});

test('开启：老角色首次结算照抄角色侧好感信任了解；无档案的 my 标签丢弃', () => {
    const r = settle('[igs-stat:my|小雪|芥蒂|上升|中]', { heroSide: true }, withXue({ 好感: 30, 信任: 20, 了解: 10 }));
    assert.deepEqual(r.state.characters.小雪.hero.dims, { 好感: 30, 信任: 20, 了解: 10, 芥蒂: 5 });
    const none = settle('[igs-stat:my|小雪|信任|上升]', { heroSide: true });
    assert.equal(none.state.characters.小雪, undefined);
    assert.deepEqual(heroDimsOf(withXue({ 好感: 7 }).characters.小雪), { 好感: 7, 信任: 0, 了解: 0, 芥蒂: 0 });
});

test('新建档取起始关系初值', () => {
    const r = settle('[igs-stat:start|小雪|朋友]', { heroSide: true });
    assert.deepEqual(r.state.characters.小雪.hero.dims, { 好感: 30, 信任: 25, 了解: 35, 芥蒂: 0 });
});

test('手改主角侧后重算同一楼仍保留', () => {
    const manual = { 小雪: { hero: { 信任: 40 } } };
    const r = settle('', { heroSide: true, manual }, withXue());
    assert.equal(r.state.characters.小雪.hero.dims.信任, 40);
    const again = settle('', { heroSide: true, manual }, withXue());
    assert.equal(again.state.characters.小雪.hero.dims.信任, 40);
    assert.equal(r.state.characters.小雪.dims.信任, 0);
});

test('提示词：关闭时与原来逐字相同，开启后出现标签行与态度句', () => {
    const state = withXue({ 好感: 60, 信任: 30 });
    const off = buildStatsPrompt(state, { present: ['小雪'] }).content;
    assert.equal(buildStatsPrompt(state, { present: ['小雪'], heroFeelings: false }).content, off);
    assert.ok(!off.includes('igs-stat:my'));
    const hero = settle('', { heroSide: true }, state).state;
    const on = buildStatsPrompt(hero, { present: ['小雪'], heroFeelings: true }).content;
    assert.match(on, /\[igs-stat:my\|角色名\|好感\/信任\/了解\/芥蒂\|上升\/下降\|强度\]/);
    assert.ok(!on.includes('/欲望|'));
    assert.match(on, /主角自己的心意用 my 标签写|主角自己的心意用my标签写/);
    assert.match(on, /主角对其：强烈在意。/);
    assert.match(on, /主角的心理与主动举动须符合上面写的主角态度/);
    const low = withCharacter(hero, '小雪', { ...hero.characters.小雪, hero: { dims: { 好感: 10, 信任: 0, 了解: 0, 芥蒂: 0 } } });
    assert.match(buildStatsPrompt(low, { present: ['小雪'], heroFeelings: true }).content, /主角目前不会接受其表白。/);
});

test('人物卡：开关开启时显示「主角对TA」与修改按钮，关闭时不出现', async () => {
    const { renderStatsPeople } = await import('../src/visual/igs-ui/stats-settings-fields.js');
    const base = {
        day: 1, bars: {}, wallet: 0, vitals: null, attributes: [], skills: [], log: [], total: 0, checks: [], story: [], sheets: [], skillEdit: [],
        characters: [{ name: '小雪', stage: '朋友', dims: { 好感: 30, 信任: 10, 了解: 5 } }],
        traitList: {}, traitNsfw: false, traits: {}, aptitude: {}, heroNotes: {},
        heroDims: { 小雪: { 好感: 20, 信任: 5, 了解: 5, 芥蒂: 0 } },
    };
    const open = (key) => (key.startsWith('stats-edit-') ? ' open' : '');
    const on = renderStatsPeople({ ...base, heroFeelings: true }, open);
    assert.match(on, /主角对TA/);
    assert.match(on, /stats-op:hero-dims:/);
    const off = renderStatsPeople({ ...base, heroFeelings: false }, open);
    assert.ok(!off.includes('主角对TA') && !off.includes('hero-dims'));
});

import { relationLabel } from '../src/scene/stats/stat-relation-label.js';

test('双向关系名：六条各命中一次，恋爱向与友情向分开', () => {
    const cases = [
        [{ 好感: 60 }, { 好感: -5 }, '避之不及', '避之不及'],
        [{ 好感: 60 }, { 好感: 10 }, '一厢情愿', '单方面亲近'],
        [{ 好感: -10 }, { 好感: 60 }, '求而不得', '热脸冷遇'],
        [{ 好感: 10 }, { 好感: 60 }, '暗自倾心', '有心结交'],
        [{ 好感: 30 }, { 好感: 30, 芥蒂: 55 }, '难以释怀', '难以释怀'],
        [{ 好感: 10 }, { 好感: 0, 欲望: 60 }, '只图一时', '只图一时'],
    ];
    for (const [dims, hero, love, friend] of cases) {
        assert.equal(relationLabel(dims, { hero, nsfw: true, romance: true }).name, love);
        assert.equal(relationLabel(dims, { hero, nsfw: true }).name, friend);
    }
    assert.equal(relationLabel({ 好感: 60 }, { hero: { 好感: 60 } }).name, relationLabel({ 好感: 60 }).name);
});

test('告白：主角侧好感不够不置恋爱标记，记 confessed，之后升过 25 自动补记', () => {
    const base = withXue({ 好感: 30 });
    const low = withCharacter(base, '小雪', { ...base.characters.小雪, hero: { dims: { 好感: 10, 信任: 0, 了解: 0, 芥蒂: 0 } } });
    const r = settle('[igs-stat:event|小雪|告白]', { heroSide: true }, low);
    assert.equal(r.state.characters.小雪.romance, undefined);
    assert.equal(r.state.characters.小雪.confessed, true);
    const up = settle('[igs-stat:my|小雪|好感|上升|大]', { heroSide: true }, withCharacter(r.state, '小雪', { ...r.state.characters.小雪, hero: { dims: { 好感: 24, 信任: 0, 了解: 0, 芥蒂: 0 } } }));
    assert.equal(up.state.characters.小雪.romance, true);
    assert.equal(up.state.characters.小雪.confessed, undefined);
    const off = settle('[igs-stat:event|小雪|告白]', {}, withXue({ 好感: 30 }));
    assert.equal(off.state.characters.小雪.romance, true);
});

test('起始关系恋人不受告白限制', () => {
    const r = settle('[igs-stat:start|小雪|恋人]', { heroSide: true });
    assert.equal(r.state.characters.小雪.romance, true);
    assert.equal(r.state.characters.小雪.confessed, undefined);
});

import { traitScale } from '../src/scene/stats/stat-traits.js';

test('钓系读主角侧好感，舔狗在启用时不再减角色侧好感', () => {
    const cat = (id) => ({ traits: { 小雪: { [id]: { on: true, src: 'manual' } } }, nsfw: false });
    const c = { ...withXue({ 好感: 60 }).characters.小雪, hero: { dims: { 好感: 10, 信任: 0, 了解: 0, 芥蒂: 0 } } };
    const st = withCharacter(createStatsState(), '小雪', c);
    assert.equal(traitScale(st, cat('钓系'), '小雪', '好感', 'up', { heroSide: true }), 1);
    assert.equal(traitScale(st, cat('钓系'), '小雪', '好感', 'up', null), 0.5);
    assert.equal(traitScale(st, cat('舔狗'), '小雪', '好感', 'up', { heroSide: true }), 1);
    assert.equal(traitScale(st, cat('舔狗'), '小雪', '好感', 'up', null), 0.5);
});
