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

test('送礼与好感标签共用单楼 +3 上限，别名归到主名', () => {
    const r = settle('[igs-stat:favor|雪|感动][igs-stat:gift|小雪|甜点]');
    assert.equal(r.state.characters.小雪.dims.好感, 3);
    assert.equal(r.state.characters.雪, undefined);
});

test('路人、主角、未开 NSFW 的欲望标签不结算并记诊断（易错点 C3/E5）', () => {
    const r = settle('[igs-stat:favor|路人甲|开心][igs-stat:favor|<user>|开心][igs-stat:desire|小雪|上升]');
    assert.deepEqual(Object.keys(r.state.characters), []);
    assert.deepEqual(r.meta.diagnostics.map((d) => d.code), ['stat-unknown-character', 'stat-user-target', 'stat-dim-disabled']);
    assert.equal(settle('[igs-stat:desire|小雪|上升]', { nsfw: true }).state.characters.小雪.dims.欲望, 2);
});

test('欲望最低为 0；恋人起始欲望只在 NSFW 开启时给；手改欲望在 NSFW 关闭时不生效', () => {
    assert.equal(settle('[igs-stat:desire|小雪|下降]', { nsfw: true }).state.characters.小雪.dims.欲望, 0);
    assert.equal(settle('[igs-stat:start|小雪|恋人]', { nsfw: true }).state.characters.小雪.dims.欲望, 15);
    assert.equal(Object.hasOwn(settle('[igs-stat:start|小雪|恋人]').state.characters.小雪.dims, '欲望'), false);
    const base = settle('[igs-stat:favor|小雪|开心]', { nsfw: true }).state;
    assert.equal(settle('', { nsfw: true, manual: { 小雪: { 欲望: -30 } } }, base).state.characters.小雪.dims.欲望, 0);
    assert.equal(settle('', { nsfw: false, manual: { 小雪: { 欲望: 40 } } }, base).state.characters.小雪.dims.欲望, 0);
    assert.equal(settle('[igs-stat:know|小雪|上升]').state.characters.小雪.dims.了解, 2);
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

test('钟点只作辅助：深夜到早上算跨天，正文里的钟点字样不算（易错点 D3）', () => {
    assert.equal(settle('醒来。', { hour: 7 }, stateWith({}, { lastHour: 23 })).state.clock.day, 2);
    assert.equal(settle('想起三点钟的约定。').state.clock.day, 1);
});

test('连续 30 楼不跨天时软跨天：只清每日上限（易错点 D2）', () => {
    const base = stateWith({ stamina: 40 }, { floorsSinceDay: 29 });
    const state = { ...base, characters: { 小雪: { ...createCharacter(1), daily: { day: 1, gained: { 好感: 8 } } } } };
    const r = settle('闲聊。', {}, state);
    assert.equal(r.meta.flags.softDay, true);
    assert.equal(r.state.clock.day, 1);
    assert.equal(r.state.clock.floorsSinceDay, 0);
    assert.deepEqual(r.state.characters.小雪.daily.gained, {});
    assert.equal(r.state.protagonist.bars.stamina, 40);
});

test('时间跳跃上限 30 天，体力回满；生命不在生活条里，不随跳跃恢复（易错点 D4、合并计划 Q4）', () => {
    const r = settle('[igs-stat:skip|十年后]', {}, stateWith({ stamina: 10 }));
    assert.equal(r.state.clock.day, 31);
    assert.equal(r.meta.flags.skipCapped, true);
    assert.equal(r.state.protagonist.bars.stamina, 100);
    assert.equal(r.state.protagonist.bars.health, undefined);
});

test('23 点后每天只记一次熬夜，当夜入睡体力只恢复到 70', () => {
    const late = settle('', { hour: 23 });
    assert.equal(late.state.protagonist.bars.stamina, 80);
    assert.equal(settle('', { hour: 0 }, late.state).state.protagonist.bars.stamina, 80);
    const r = settle('[igs-stat:sleep]', { hour: 23 }, stateWith({ stamina: 50 }));
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.state.protagonist.bars.stamina, 70);
    assert.equal(r.state.clock.stayedUp, false);
});

test('体力归零强制休息并按入睡跨天', () => {
    const r = settle('[igs-stat:stamina|重]', {}, stateWith({ stamina: 10 }));
    assert.equal(r.meta.flags.forcedRest, true);
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.state.protagonist.bars.stamina, 100);
});

test('买不起不扣钱；漏打体力标签按正文兜底进食，好感不兜底', () => {
    const poor = settle('[igs-stat:money|花费|昂贵]');
    assert.equal(poor.meta.flags.shortfall, true);
    assert.equal(poor.state.protagonist.bars.money, 0);
    const fed = settle('他们一起吃了晚饭，她很开心。', {}, stateWith({ stamina: 50 }));
    assert.equal(fed.state.protagonist.bars.stamina, 60);
    assert.deepEqual(fed.state.characters, {});
});

test('日结算对打勾技能掷成长：通过则 +1d10 并清勾', () => {
    const s = createStatsState();
    const state = { ...s, protagonist: { ...s.protagonist, skills: { ...s.protagonist.skills, 烹饪: { value: 20, marked: true } } } };
    const r = settle('[igs-stat:sleep]', {}, state);
    assert.deepEqual(r.state.protagonist.skills.烹饪, { value: 30, marked: false });
    assert.ok(r.changes.some((c) => c.key === '烹饪' && c.note === '成长'));
});

const READERS = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
const dnd = createEngine({}, {}, 'dnd5e', READERS);
const coc = createEngine({}, {}, 'coc7', READERS);
const D20_PAIRS = Array.from({ length: 10 }, () => [12, 3]);
const COC_PAIRS = Array.from({ length: 10 }, () => ({ unit: 2, tens: [1, 5, 8] }));

test('roll 标签取骰按规则体系分流：D&D 取 rollPairs 的 d20 对，CoC 取 { unit, tens }', () => {
    const text = '她试了试。[igs-stat:roll|烹饪|普通]';
    const d = settle(text, { engine: dnd, rollPairs: D20_PAIRS });
    assert.equal(d.meta.check.ruleset, 'dnd5e');
    assert.equal(d.meta.check.roll, 12);
    assert.equal(d.meta.pendingRoll, undefined);
    const c = settle(text, { engine: coc, rollPairs: COC_PAIRS });
    assert.equal(c.meta.check.ruleset, 'coc7');
    assert.equal(c.meta.check.roll, 12);
    // 骰序形状与规则体系不符时当作没有骰序，转手动掷骰。
    assert.ok(settle(text, { engine: coc, rollPairs: D20_PAIRS }).meta.pendingRoll);
    assert.ok(settle(text, { engine: dnd, rollPairs: COC_PAIRS }).meta.pendingRoll);
});

test('roll 标签按前面出现的正文检定标签数取第几对骰；旧预掷形状匹配时仍可用', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => [i + 1, 1]);
    const text = '[igs-check:甲|力量|10]。[igs-stat:roll|烹饪|普通]';
    assert.equal(settle(text, { engine: dnd, rollPairs: pairs }).meta.check.roll, 2);
    const old = settle('[igs-stat:roll|烹饪|普通]', { engine: dnd, preroll: { ruleset: 'dnd5e', raw: { d20: [9, 1] } } });
    assert.equal(old.meta.check.roll, 9);
    const oldCoc = settle('[igs-stat:roll|烹饪|普通]', { engine: coc, preroll: { ruleset: 'coc7', raw: { unit: 2, tens: [1, 5, 8] } } });
    assert.equal(oldCoc.meta.check.roll, 12);
    assert.ok(settle('[igs-stat:roll|烹饪|普通]', { engine: coc, preroll: { ruleset: 'dnd5e', raw: { d20: [9, 1] } } }).meta.pendingRoll);
});

test('storyChecks：主角成功的检定打成长勾并写进 meta.checks；社交大成功触发突破加成', () => {
    const checks = [{ ruleset: 'dnd5e', actor: '主角', skill: '烹饪', kind: 'skill', value: 40, success: true, dc: 15, roll: 18, total: 19, tier: '大成功', ladder: 'crit' }];
    const r = settle('闲聊。', { engine: dnd, storyChecks: checks });
    assert.equal(r.state.protagonist.skills.烹饪.marked, true);
    assert.equal(r.meta.checks.length, 1);
    assert.equal(r.meta.checks[0].ruleset, 'dnd5e');
    const other = settle('闲聊。', { engine: dnd, storyChecks: [{ ...checks[0], actor: '小雪' }] });
    assert.equal(other.state.protagonist.skills.烹饪.marked, false);
    const social = { ...checks[0], skill: '话术', social: true, against: '小雪' };
    const r2 = settle('[igs-stat:favor|小雪|感动]', { engine: dnd, storyChecks: [social] });
    assert.equal(r2.state.characters.小雪.dims.好感 >= 3, true);
});

test('noBattle：战斗扩展接管时 battle 标签被丢弃', () => {
    const r = settle('[igs-stat:battle|杂兵]', { engine: dnd, noBattle: true });
    assert.equal(r.meta.flags.battle, undefined);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stats-battle-skipped-combat'));
});

test('起始关系可带修饰：恋人+猜忌扣信任、加芥蒂，同项多个修饰取最重不叠加', () => {
    const d = settle('[igs-stat:start|小雪|恋人+怀疑出轨]').state.characters.小雪.dims;
    assert.deepEqual([d.好感, d.信任, d.了解, d.芥蒂], [80, 35, 70, 10]);
    const two = settle('[igs-stat:start|小雪|恋人＋猜忌、背叛过]').state.characters.小雪.dims;
    assert.deepEqual([two.信任, two.芥蒂], [15, 25]);
    assert.equal(settle('[igs-stat:start|小雪|恋人+好得很]').state.characters.小雪.dims.芥蒂, 0);
});

test('开局修正标签：信任扣、芥蒂加，同一角色每项只生效一次', () => {
    const first = settle('[igs-stat:start|小雪|朋友][igs-stat:startfix|小雪|信任|中][igs-stat:startfix|小雪|芥蒂|重]').state;
    assert.deepEqual([first.characters.小雪.dims.信任, first.characters.小雪.dims.芥蒂], [0, 45]);
    const again = settle('[igs-stat:startfix|小雪|信任|重]', {}, first).state;
    assert.equal(again.characters.小雪.dims.信任, 0);
    assert.equal(settle('[igs-stat:start|小雪|恋人+猜忌][igs-stat:startfix|小雪|芥蒂|中]').state.characters.小雪.dims.芥蒂, 10);
    assert.equal(settle('[igs-stat:startfix|小雪|信任|3]').state.characters.小雪, undefined);
});

test('称呼：改口记入变动，相同不记，人前单独记，好感升档给一次性标记', () => {
    const state = { ...createStatsState(), characters: { 小雪: createCharacter(1) } };
    const r = settleFloorText(state, '[igs-stat:address|小雪|阿昭]', { random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal' });
    assert.equal(r.state.characters.小雪.address.private, '阿昭');
    assert.ok(r.changes.some((c) => c.key === 'address' && c.to === '阿昭' && c.note === '改口'));
    const again = settleFloorText(r.state, '[igs-stat:address|小雪|阿昭]', { random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal' });
    assert.ok(!again.changes.some((c) => c.key === 'address'));
    const pub = settleFloorText(r.state, '[igs-stat:address|小雪|昭哥|人前]', { random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal' });
    assert.equal(pub.state.characters.小雪.address.public, '昭哥');
    assert.equal(pub.state.characters.小雪.address.private, '阿昭');
    const old = settleFloorText(state, '[igs-stat:address|小雪|阿昭]', { random: high, resolveCharacter, strengthRev: 2, favorTier: 'normal' });
    assert.equal(old.state.characters.小雪.address, undefined);
});

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

test('冷战：送礼和好后芥蒂降、好感回升、有记录，并给一次性标记', () => {
    const r = settleFloorText(coldState(), '[igs-stat:gift|小雪|甜点]', coldOpts({ catalog: coldCat() }));
    const c = r.state.characters.小雪;
    assert.ok(c.dims.芥蒂 < 30);
    assert.ok(c.dims.好感 > 20);
    assert.ok(r.changes.some((x) => x.note === '和好'));
    assert.ok(!r.meta.statuses.小雪 || !r.meta.statuses.小雪.冷战中);
    assert.deepEqual(r.meta.flags.coldWar.end, ['小雪']);
    const next = settleFloorText(r.state, '平常的一楼', coldOpts({ catalog: { statuses: r.meta.statuses } }));
    assert.equal(next.meta.flags.coldWar, undefined);
});

test('闹别扭自然到期：芥蒂 ≥ 40 转冷战并摘掉闹别扭，不到 40 直接结束', () => {
    const sulk = { 闹别扭: { src: 'system', kind: 'timer', since: 1, until: 2, toward: '主角' } };
    const cat = { statuses: { 小雪: sulk } };
    const hi = settleFloorText(coldState({ 芥蒂: 45 }), '她睡下了。[igs-stat:sleep]', coldOpts({ catalog: cat }));
    assert.ok(hi.meta.statuses.小雪.冷战中);
    assert.ok(!hi.meta.statuses.小雪.闹别扭);
    assert.ok(hi.changes.some((c) => c.note === '闹别扭转为冷战'));
    assert.deepEqual(hi.meta.flags.coldWar.start, ['小雪']);
    const lo = settleFloorText(coldState({ 芥蒂: 30 }), '她睡下了。[igs-stat:sleep]', coldOpts({ catalog: cat }));
    assert.ok(!lo.meta.statuses || !lo.meta.statuses.小雪 || !lo.meta.statuses.小雪.冷战中);
});

test('冷战每日掷骰：命中好感降「小」档，不中不降；跳多天最多 7 次', () => {
    const run = (random, text, g = 30) => settleFloorText(coldState({ 芥蒂: g }), text, coldOpts({ catalog: coldCat(), random }));
    const hit = run(() => 0.05, '她睡下了。[igs-stat:sleep]');
    assert.equal(hit.state.characters.小雪.dims.好感, 17);
    assert.ok(hit.changes.some((c) => c.note === '冷战' && c.to - c.from === -3));
    const miss = run(() => 0.99, '她睡下了。[igs-stat:sleep]');
    assert.ok(!miss.changes.some((c) => c.note === '冷战'));
    const many = settleFloorText(coldState({ 芥蒂: 80, 好感: 60 }), '[igs-stat:skip|20天]', coldOpts({ catalog: coldCat(), random: () => 0.05 }));
    const drop = many.changes.find((c) => c.note === '冷战');
    assert.ok(drop);
    assert.equal(drop.from - drop.to, 21);
});

const expOpts = (expenses, o = {}) => ({ random: high, resolveCharacter, strengthRev: 3, favorTier: 'normal', expenses, ...o });
const moneyRows = (r) => r.changes.filter((c) => c.key === 'money');

test('固定支出：每天一条，睡一天扣一次并留记录', () => {
    const r = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([{ name: '房租', amount: 30, every: 1 }]));
    assert.equal(r.state.protagonist.bars.money, 470);
    assert.equal(moneyRows(r).length, 1);
    assert.equal(moneyRows(r)[0].note, '房租');
    assert.equal(moneyRows(r)[0].from - moneyRows(r)[0].to, 30);
});

test('固定支出：每隔三天，第二天不扣、跨过第三天才扣', () => {
    const list = [{ name: '会费', amount: 50, every: 3 }];
    const d2 = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts(list));
    assert.equal(d2.state.clock.day, 2);
    assert.equal(d2.state.protagonist.bars.money, 500);
    assert.equal(moneyRows(d2).length, 0);
    const d3 = settleFloorText(d2.state, '她睡下了。[igs-stat:sleep]', expOpts(list));
    assert.equal(d3.state.clock.day, 3);
    assert.equal(d3.state.protagonist.bars.money, 450);
});

test('固定支出：跳十天、每隔三天，三期合并为一条记录', () => {
    const r = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '[igs-stat:skip|10天]', expOpts([{ name: '会费', amount: 50, every: 3 }]));
    assert.equal(r.state.clock.day, 11);
    assert.equal(r.state.protagonist.bars.money, 350);
    assert.equal(moneyRows(r).length, 1);
    assert.equal(moneyRows(r)[0].note, '会费×3');
});

test('固定支出：余额不够不扣，挂囊中羞涩、记名称，提示只出现一楼', () => {
    const r = settleFloorText(stateWith({ money: 10 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([{ name: '房租', amount: 30, every: 1 }]));
    assert.equal(r.state.protagonist.bars.money, 10);
    assert.equal(moneyRows(r).filter((c) => c.note === '房租').length, 0);
    assert.ok(r.meta.statuses['主角'].囊中羞涩);
    assert.deepEqual(r.meta.flags.expenseShort, ['房租']);
    assert.deepEqual(mandatesFromFlags(r.meta.flags).filter((t) => t.includes('没有付上')), ['这一期的房租没有付上']);
    const next = settleFloorText(r.state, '平常的一楼', expOpts([{ name: '房租', amount: 30, every: 1 }], { catalog: { statuses: r.meta.statuses } }));
    assert.equal(next.meta.flags.expenseShort, undefined);
    assert.deepEqual(mandatesFromFlags(next.meta.flags).filter((t) => t.includes('没有付上')), []);
});

test('固定支出：余额 150、支出 200，囊中羞涩在本楼结算后仍挂着', () => {
    const r = settleFloorText(stateWith({ money: 150 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([{ name: '债务', amount: 200, every: 1 }]));
    assert.equal(r.state.protagonist.bars.money, 150);
    assert.ok(r.meta.statuses['主角'].囊中羞涩);
});

test('固定支出：旧结算版本不扣', () => {
    const r = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([{ name: '房租', amount: 30, every: 1 }], { strengthRev: 2 }));
    assert.equal(r.state.protagonist.bars.money, 500);
    assert.equal(moneyRows(r).length, 0);
});

test('固定支出：列表为空无变动、无标记、无状态', () => {
    const r = settleFloorText(stateWith({ money: 500 }, { day: 1 }), '她睡下了。[igs-stat:sleep]', expOpts([]));
    assert.equal(r.state.protagonist.bars.money, 500);
    assert.equal(moneyRows(r).length, 0);
    assert.equal(r.meta.flags.expenseShort, undefined);
    assert.equal(r.meta.statuses, undefined);
});

test('固定支出：目录清洗丢弃不合法条目并截断名称', () => {
    const c = sanitizeCatalog({ expenses: [{ name: ' “房租<a>” ', amount: 30, every: 7 }, { name: '', amount: 5, every: 1 }, { name: 'x', amount: 0, every: 1 }, { name: 'y', amount: 5, every: 366 }, { name: 'z', amount: 1.5, every: 1 }, { name: '一二三四五六七八九十十一十二十三', amount: 9, every: 365 }] });
    assert.deepEqual(c.expenses, [{ name: '房租a', amount: 30, every: 7 }, { name: '一二三四五六七八九十十一', amount: 9, every: 365 }]);
    assert.equal(sanitizeCatalog({ expenses: Array.from({ length: 20 }, () => ({ name: 'a', amount: 1, every: 1 })) }).expenses.length, 12);
});
