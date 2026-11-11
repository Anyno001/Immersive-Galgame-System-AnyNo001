import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' || name === '雪' ? '小雪' : null);
function settle(text, opts = {}, state = createStatsState()) { return settleFloorText(state, text, { random: high, resolveCharacter, ...opts }); }
function stateWith(bars, clock = {}) {
    const s = createStatsState();
    return { ...s, clock: { ...s.clock, ...clock }, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...bars } } };
}

test('一楼 10 个感动只结算一次，同维度取最强方向（易错点 C5）', () => {
    const r = settle('[igs-stat:favor|小雪|感动]'.repeat(10));
    assert.equal(r.state.characters.小雪.dims.好感, 3);
    assert.equal(r.changes.filter((c) => c.key === '好感').length, 1);
    assert.equal(settle('[igs-stat:favor|小雪|开心][igs-stat:favor|小雪|受伤]').state.characters.小雪.dims.好感, -6);
});

test('sleep 标签和「第二天」同楼只跨一天（易错点 D1）', () => {
    const r = settle('她睡下了。第二天一早……[igs-stat:sleep]');
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.meta.flags.dayAdvance, 'sleep');
});

test('引号台词与回忆里的跨天字样不算，标签不论位置照常结算（易错点 C6）', () => {
    assert.equal(settle('她说：“第二天见。”').state.clock.day, 1);
    assert.equal(settle('她回忆起第二天发生的事。').state.clock.day, 1);
    assert.equal(settle('她说：“[igs-stat:sleep]”').state.clock.day, 2);
});

test('时间跳跃上限 30 天，体力回满；生命不在生活条里，不随跳跃恢复（易错点 D4、合并计划 Q4）', () => {
    const r = settle('[igs-stat:skip|十年后]', {}, stateWith({ stamina: 10 }));
    assert.equal(r.state.clock.day, 31);
    assert.equal(r.meta.flags.skipCapped, true);
    assert.equal(r.state.protagonist.bars.stamina, 100);
    assert.equal(r.state.protagonist.bars.health, undefined);
});

const READERS = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
const dnd = createEngine({}, {}, 'dnd5e', READERS);
const coc = createEngine({}, {}, 'coc7', READERS);
const D20_PAIRS = Array.from({ length: 10 }, () => [12, 3]);
const COC_PAIRS = Array.from({ length: 10 }, () => ({ unit: 2, tens: [1, 5, 8] }));

// ---- 冷战（rev ≥ 3） ----
const coldCat = (extra = {}) => ({ statuses: { 小雪: { 冷战中: { src: 'story', kind: 'until', since: 1, toward: '主角' }, ...extra } } });
const coldState = (dims = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: 20, 芥蒂: 30, ...dims } } } });
const coldOpts = (o = {}) => ({ random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal', ...o });

test('冷战中：好感上升被挡并留记录，下降照常，旧楼不受影响', () => {
    const r = settleFloorText(coldState(), '[igs-stat:favor|小雪|感动]', coldOpts({ catalog: coldCat() }));
    assert.equal(r.state.characters.小雪.dims.好感, 20);
    assert.ok(r.changes.some((c) => c.key === '好感' && c.to === c.from && String(c.note).includes('冷战中')));
    const down = settleFloorText(coldState(), '[igs-stat:favor|小雪|受伤]', coldOpts({ catalog: coldCat() }));
    assert.ok(down.state.characters.小雪.dims.好感 < 20);
    const old = settleFloorText(coldState(), '[igs-stat:favor|小雪|感动]', coldOpts({ catalog: coldCat(), strengthRev: 2 }));
    assert.ok(old.state.characters.小雪.dims.好感 > 20);
});

const expOpts = (expenses, o = {}) => ({ random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal', expenses, ...o });
const moneyRows = (r) => r.changes.filter((c) => c.key === 'money');

test('固定支出：旧结算版本不扣', () => {
    const r = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([{ name: '房租', amount: 30, every: 1 }], { strengthRev: 2 }));
    assert.equal(r.state.protagonist.bars.money, 500);
    assert.equal(moneyRows(r).length, 0);
});

const storyCoin = (balance, ready = true) => ({ ready, balance, table: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 } });

