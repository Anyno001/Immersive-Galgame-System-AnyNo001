import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFirst, compileCaptureRegex, dayDifference, judgeDateAdvance, parseDate, parseHour } from '../src/scene/stats/stat-date.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { buildStatsPrompt, describeProtagonist } from '../src/scene/stats/stat-prompt.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

const high = () => 0.99;
const DATE = '<date>(.*?)</date>';
const TIME = '<time>(.*?)</time>';
const bar = (date, time, extra = '') => `<time_bar><date>${date}</date><time>${time}</time></time_bar>${extra}`;
const run = (state, text, opts = {}) => settleFloorText(state, text, { random: high, dateRegex: DATE, timeRegex: TIME, ...opts });

test('嵌套多层标签也能取到日期，残留标签被去掉', () => {
    const { regex } = compileCaptureRegex(DATE);
    assert.equal(captureFirst('<a><b><time_bar><date> 2025年3月5日 </date></time_bar></b></a>', regex), '2025年3月5日');
    assert.equal(captureFirst('<date>三月<i>初五</i></date>', regex), '三月初五');
    assert.equal(captureFirst('没有日期', regex), '');
});

test('无捕获组取整段，有捕获组取第一组', () => {
    assert.equal(captureFirst('今天是3月5日', compileCaptureRegex('\\d+月\\d+日').regex), '3月5日');
    assert.equal(captureFirst('日期：3月5日', compileCaptureRegex('日期：(.+)').regex), '3月5日');
    assert.equal(captureFirst('x', null), '');
});

test('非法正则降级为未填写并记诊断', () => {
    assert.deepEqual(compileCaptureRegex('(['), { regex: null, invalid: true });
    assert.deepEqual(compileCaptureRegex('  '), { regex: null, invalid: false });
    const r = run(createStatsState(), bar('3月5日', '9点'), { dateRegex: '([', timeRegex: '' });
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stat-date-regex-invalid'));
    assert.equal(r.state.clock.lastDate, null);
});

test('日期解析与差值：公历、中文、农历、无法解析', () => {
    assert.deepEqual(parseDate('2025-03-05'), { kind: 'solar', year: 2025, month: 3, day: 5 });
    assert.deepEqual(parseDate('2025年3月5日'), { kind: 'solar', year: 2025, month: 3, day: 5 });
    assert.deepEqual(parseDate('3月5日'), { kind: 'solar', year: null, month: 3, day: 5 });
    assert.deepEqual(parseDate('三月初五'), { kind: 'lunar', year: null, month: 3, day: 5 });
    assert.deepEqual(parseDate('正月十五'), { kind: 'lunar', year: null, month: 1, day: 15 });
    assert.deepEqual(parseDate('腊月廿三'), { kind: 'lunar', year: null, month: 12, day: 23 });
    assert.deepEqual(parseDate('甲辰年十月二十'), { kind: 'lunar', year: null, month: 10, day: 20 });
    assert.equal(parseDate('周三'), null);
    assert.equal(dayDifference(parseDate('2025-02-28'), parseDate('2025-03-02')), 2);
    assert.equal(dayDifference(parseDate('3月5日'), parseDate('3月8日')), 3);
    assert.equal(dayDifference(parseDate('3月30日'), parseDate('3月2日')), 1);
    assert.equal(dayDifference(parseDate('三月初五'), parseDate('三月初八')), 3);
    assert.equal(dayDifference(parseDate('三月初五'), parseDate('3月8日')), null);
});

test('日期判定：首次只记录、相同不过天、跳天封顶、无法解析但变化过一天、负差无年份按跨年', () => {
    assert.deepEqual(judgeDateAdvance(null, '3月5日'), { advance: false, days: 0, capped: false });
    assert.equal(judgeDateAdvance('3月5日', '3月5日').advance, false);
    assert.equal(judgeDateAdvance('3月5日', '3月6日').days, 1);
    assert.equal(judgeDateAdvance('3月5日', '3月9日').days, 4);
    assert.deepEqual(judgeDateAdvance('2025-01-01', '2025-03-01'), { advance: true, days: 30, capped: true });
    assert.deepEqual(judgeDateAdvance('周一', '周二'), { advance: true, days: 1, capped: false });
    assert.equal(judgeDateAdvance('2025-03-05', '2025-03-01').advance, false);
    assert.equal(judgeDateAdvance('', '3月5日').advance, false);
    assert.equal(judgeDateAdvance('3月5日', '').advance, false);
    assert.equal(judgeDateAdvance('十二月三十', '正月初一').days, 1);
});

test('时间解析：钟点、中文、时段、时辰', () => {
    assert.equal(parseHour('14:30'), 14);
    assert.equal(parseHour('14时'), 14);
    assert.equal(parseHour('9点'), 9);
    assert.equal(parseHour('下午三点'), 15);
    assert.equal(parseHour('晚上十一点半'), 23);
    assert.equal(parseHour('晚上十二点'), 0);
    assert.equal(parseHour('凌晨一点'), 1);
    assert.equal(parseHour('中午十二点'), 12);
    assert.equal(parseHour('早上八点'), 8);
    assert.equal(parseHour('子时'), 23);
    assert.equal(parseHour('卯时初'), 5);
    assert.equal(parseHour('亥时三刻'), 21);
    assert.equal(parseHour('不详'), null);
    assert.equal(parseHour(''), null);
});

test('时间正则把整点传入结算：23 点熬夜、夜转晨过天（修复 hour 未传入）', () => {
    const late = run(createStatsState(), bar('3月5日', '晚上十一点'));
    assert.equal(late.state.clock.stayedUp, true);
    assert.equal(late.meta.hour, 23);
    assert.equal(late.state.clock.lastHour, 23);
    const onlyTime = { dateRegex: '', timeRegex: TIME };
    const night = run(createStatsState(), bar('3月5日', '23点'), onlyTime);
    const morning = run(night.state, bar('3月6日', '8点'), onlyTime);
    assert.equal(morning.state.clock.day, 2);
    assert.equal(morning.meta.flags.dayAdvance, 'clock');
    assert.equal(morning.state.clock.lastDate, null);
});

test('捕捉到日期后：首次只记录，日期变化过天，睡觉标签只回体力不过天', () => {
    const first = run(createStatsState(), bar('3月5日', '9点'));
    assert.equal(first.state.clock.lastDate, '3月5日');
    assert.equal(first.state.clock.day, 1);
    assert.equal(first.meta.dateKey, '3月5日');
    const tired = { ...first.state, protagonist: { ...first.state.protagonist, bars: { ...first.state.protagonist.bars, stamina: 20 } } };
    const slept = run(tired, bar('3月5日', '23点', '[igs-stat:sleep]'));
    assert.equal(slept.state.clock.day, 1);
    assert.equal(slept.state.protagonist.bars.stamina, 70);
    const nextDay = run(slept.state, bar('3月6日', '8点'));
    assert.equal(nextDay.state.clock.day, 2);
    assert.equal(nextDay.state.clock.lastDate, '3月6日');
    const words = run(nextDay.state, bar('3月6日', '9点', '第二天清晨，次日。'));
    assert.equal(words.state.clock.day, 2);
});

test('某楼缺日期沿用上一个日期，不重复过天；日期不变的下一楼不过天', () => {
    const first = run(createStatsState(), bar('3月5日', '9点'));
    const second = run(first.state, bar('3月6日', '9点'));
    assert.equal(second.state.clock.day, 2);
    const missing = run(second.state, '没有状态栏的一楼。');
    assert.equal(missing.state.clock.day, 2);
    assert.equal(missing.state.clock.lastDate, '3月6日');
    const again = run(missing.state, bar('3月6日', '10点'));
    assert.equal(again.state.clock.day, 2);
});

test('已捕捉日期的聊天体力归零不强制入睡，改为透支提示；未捕捉的仍强制入睡', () => {
    const base = createStatsState();
    const empty = (state) => ({ ...state, protagonist: { ...state.protagonist, bars: { ...state.protagonist.bars, stamina: 0 } } });
    const dated = run(empty({ ...base, clock: { ...base.clock, lastDate: '3月5日' } }), bar('3月5日', '9点'));
    assert.equal(dated.meta.flags.forcedRest, undefined);
    assert.equal(dated.meta.flags.exhausted, true);
    assert.equal(dated.state.clock.day, 1);
    assert.equal(dated.state.protagonist.bars.stamina, 0);
    const plain = settleFloorText(empty(base), '平常的一楼。', { random: high });
    assert.equal(plain.meta.flags.forcedRest, true);
    assert.equal(plain.state.clock.day, 2);
    assert.match(describeProtagonist({ stamina: 0, stress: 0 }, { dateMode: true }), /主角体力透支，头晕乏力，难以继续行动/);
    assert.doesNotMatch(describeProtagonist({ stamina: 0, stress: 0 }, { dateMode: true }), /很疲惫/);
    assert.match(describeProtagonist({ stamina: 10, stress: 0 }, { dateMode: true }), /很疲惫/);
    assert.match(describeProtagonist({ stamina: 0, stress: 0 }), /很疲惫/);
});

test('两个正则都空时与现行结果一致', () => {
    const text = '[igs-stat:sleep]第二天清晨。';
    const a = settleFloorText(createStatsState(), text, { random: high });
    const b = settleFloorText(createStatsState(), text, { random: high, dateRegex: '', timeRegex: '' });
    assert.deepEqual(b.state, a.state);
    assert.deepEqual(b.changes, a.changes);
    assert.equal(a.state.clock.day, 2);
    assert.equal(a.state.clock.lastDate, null);
});

test('清空日期正则后恢复旧规则：体力归零强制入睡，睡觉标签过天，lastDate 保留', () => {
    const base = createStatsState();
    const withDate = { ...base, clock: { ...base.clock, lastDate: '3月5日' }, protagonist: { ...base.protagonist, bars: { ...base.protagonist.bars, stamina: 0 } } };
    const cleared = settleFloorText(withDate, '平常的一楼。', { random: high, dateRegex: '' });
    assert.equal(cleared.meta.flags.forcedRest, true);
    assert.equal(cleared.meta.flags.exhausted, undefined);
    assert.equal(cleared.state.clock.day, 2);
    assert.equal(cleared.state.clock.lastDate, '3月5日');
    const slept = settleFloorText({ ...withDate, protagonist: base.protagonist }, '[igs-stat:sleep]', { random: high, dateRegex: '  ' });
    assert.equal(slept.state.clock.day, 2);
    const invalid = settleFloorText(withDate, '平常的一楼。', { random: high, dateRegex: '([' });
    assert.equal(invalid.meta.flags.forcedRest, true);
    const state = { ...withDate };
    const text = (opts) => buildStatsPrompt(state, opts).content;
    assert.match(text({ dateRegex: DATE }), /体力透支/);
    assert.doesNotMatch(text({ dateRegex: '' }), /体力透支/);
    assert.doesNotMatch(text({}), /体力透支/);
    assert.doesNotMatch(text({ dateRegex: '([' }), /体力透支/);
});

test('中午加 12 只用于一到六点：中午十点不变，中午一点得 13', () => {
    assert.equal(parseHour('中午十点'), 10);
    assert.equal(parseHour('中午十一点'), 11);
    assert.equal(parseHour('中午十二点'), 12);
    assert.equal(parseHour('中午一点'), 13);
    assert.equal(parseHour('正午12:30'), 12);
});
