import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStatuses, applyStatusChange, hasStatus, sanitizeStatuses, settleStatusDirectives, statusPromptLines, statusesOf } from '../src/scene/stats/stat-status.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState, withCharacter } from '../src/scene/stats/stat-state.js';
import { applyReviewStatuses, parseReviewStatuses } from '../src/core/trait-review.js';
import { STATUS_DEFS } from '../src/scene/stats/stat-status-defs.js';

const attach = (cat, name, key, o = {}) => applyStatusChange(cat, name, key, { on: true, ...o }).catalog;
const newState = () => createStatsState({ day: 1 });

test('挂上后可读，同状态不叠加只刷新天数，来源只升不降，不改入参', () => {
    const cat = { statuses: {} };
    const r = applyStatusChange(cat, '小雪', '感冒', { on: true, src: 'setting', day: 3, floor: 5 });
    assert.equal(r.catalog.statuses.小雪.感冒.until, 6);
    assert.equal(hasStatus(null, r.catalog, '小雪', '感冒'), true);
    const again = applyStatusChange(r.catalog, '小雪', '感冒', { on: true, src: 'story', day: 4, days: 5 });
    assert.equal(again.catalog.statuses.小雪.感冒.until, 9);
    assert.equal(again.catalog.statuses.小雪.感冒.src, 'setting');
    assert.equal(again.catalog.statuses.小雪.感冒.since, 3);
    assert.equal(Object.keys(statusesOf(again.catalog, '小雪')).length, 1);
    assert.deepEqual(cat, { statuses: {} });
});

test('未定义的状态拒绝', () => {
    assert.equal(applyStatusChange({ statuses: {} }, '小雪', '不存在', { on: true }).reason, 'unknown');
});

test('manualLock：非手动来源不能覆盖也不能摘', () => {
    const cat = attach({}, '小雪', '感冒', { src: 'manual', day: 1 });
    assert.equal(cat.statuses.小雪.感冒.manualLock, true);
    assert.equal(applyStatusChange(cat, '小雪', '感冒', { on: false, src: 'story' }).reason, 'locked');
    assert.equal(applyStatusChange(cat, '小雪', '感冒', { on: true, src: 'story', days: 9 }).reason, 'locked');
    assert.equal(applyStatusChange(cat, '小雪', '感冒', { on: false, src: 'manual' }).catalog.statuses.小雪, undefined);
});

test('关系状态带对象名，until 不受日推进与跳跃影响', () => {
    const cat = attach({}, '小雪', '冷战中', { src: 'story', toward: '主角', day: 2 });
    assert.equal(cat.statuses.小雪.冷战中.toward, '主角');
    assert.equal(advanceStatuses(cat, 30, 28).catalog, cat);
});

test('advanceStatuses：日推进到期才摘；跳跃直接到期；返回 withCalc 格式', () => {
    const cat = attach({}, '小雪', '感冒', { day: 0, days: 3 });
    assert.equal(advanceStatuses(cat, 2, 1).changes.length, 0);
    const day = advanceStatuses(cat, 3, 1);
    assert.equal(hasStatus(null, day.catalog, '小雪', '感冒'), false);
    assert.equal(day.changes[0].key, '感冒');
    assert.ok(Array.isArray(day.changes[0].calc));
    const jump = advanceStatuses(cat, 2, 2);
    assert.equal(hasStatus(null, jump.catalog, '小雪', '感冒'), false);
    assert.ok(hasStatus(null, cat, '小雪', '感冒'));
});

test('statusPromptLines：只给在场、可注入来源、一状态一句，空返回 []', () => {
    let cat = attach({}, '小雪', '感冒', { src: 'story', day: 0 });
    cat = attach(cat, '小雪', '身体不适', { src: 'setting', day: 0 });
    cat = attach(cat, '小云', '感冒', { src: 'manual', day: 0 });
    assert.deepEqual(statusPromptLines(null, cat, ['小雪']), ['小雪正在感冒。']);
    assert.deepEqual(statusPromptLines(null, cat, []), []);
    cat = { ...cat, statuses: { ...cat.statuses, 小云: { 感冒: { ...cat.statuses.小云.感冒, inject: false } } } };
    assert.deepEqual(statusPromptLines(null, cat, ['小云']), []);
});

test('不注入特质', () => {
    const cat = { statuses: {}, traits: { 小雪: { 不眠: { on: true, src: 'auto' } } }, nsfw: false };
    assert.deepEqual(statusPromptLines(null, cat, ['小雪']), []);
});

test('同楼同角色同状态重复只取一次', () => {
    const box = { cat: { statuses: {} } };
    const ch = [];
    const d = { kind: 'status', target: '小雪', status: '感冒', on: true };
    settleStatusDirectives(box, [d, d], { day: 1, changes: ch });
    assert.equal(ch.length, 1);
});

test('存档：旧档没有字段为 {}，清洗坏数据', () => {
    const c = sanitizeCatalog({});
    assert.deepEqual(c.statuses, {});
    assert.deepEqual(c.cycles, {});
    const d = sanitizeCatalog({ statuses: { 小雪: { 感冒: { src: '乱写', kind: 'timer', since: 1, until: 4, floor: 2 }, 坏: 5 } }, cycles: { 小雪: { 生理期: { period: 28, length: 5, last: 3, on: true } } } });
    assert.equal(d.statuses.小雪.感冒.src, 'story');
    assert.equal(d.cycles.小雪.生理期.period, 28);
    assert.deepEqual(sanitizeStatuses(d.statuses), d.statuses);
});

test('标签：status 开始/结束，关系状态第五段', () => {
    const text = '[igs-stat:status|小雪|感冒|开始][igs-stat:status|小雪|感冒|好了][igs-stat:status|小雪|冷战中|开始|主角][igs-stat:status|小雪|冷战中|开始][igs-stat:status|小雪|乱写|开始]';
    const { directives } = parseStatDirectives(text, { rev: 2 });
    assert.deepEqual(directives.map((d) => [d.status, d.on, d.toward]), [['感冒', true, undefined], ['感冒', false, undefined], ['冷战中', true, '主角']]);
    assert.equal(parseStatDirectives('[igs-stat:status|小雪|感冒|开始]', { rev: 1 }).directives.length, 0);
});

test('日结算与跳跃按天数推进状态', () => {
    const state = newState();
    const box = { cat: attach({}, '小雪', '感冒', { day: 0, days: 3 }) };
    settleDay(state, { random: () => 0.5, changes: [], statusBox: box });
    assert.ok(hasStatus(null, box.cat, '小雪', '感冒'));
    const skip = { cat: box.cat };
    const changes = [];
    settleSkip(state, 5, { random: () => 0.5, changes, statusBox: skip });
    assert.equal(hasStatus(null, skip.cat, '小雪', '感冒'), false);
    assert.ok(changes.some((c) => c.source === 'status' && c.key === '感冒'));
});

test('结算：status 标签交给 applyStatusChange，写进 meta.statuses', () => {
    const before = withCharacter(newState(), '小雪', createCharacter(1));
    const r = settleFloorText(before, '她打了个喷嚏。[igs-stat:status|小雪|感冒|开始]', { random: () => 0.5, strengthRev: 2, favorTier: 'normal', catalog: { statuses: {} }, floor: 4 });
    assert.equal(r.meta.statuses.小雪.感冒.floor, 4);
    assert.ok(r.changes.some((c) => c.source === 'status' && c.target === '小雪'));
});

test('提示词：status 段只含在场角色，并列出可用标签名', () => {
    const state = withCharacter(newState(), '小雪', createCharacter(1));
    const statusCat = { statuses: attach({}, '小雪', '感冒', { src: 'story', day: 0 }).statuses };
    const out = buildStatsPrompt(state, { present: ['小雪'], statusCat });
    assert.match(out.segments.find((s) => s.id === 'status').text, /小雪正在感冒/);
    assert.match(out.segments.find((s) => s.id === 'tags').text, /igs-stat:status\|角色名\|状态名\|开始\/结束/);
    assert.equal(buildStatsPrompt(state, { present: ['小雪'] }).segments.some((s) => s.id === 'status'), false);
});

test('副模型复核：状态与来源，setting 只升不降', () => {
    const reply = JSON.stringify({ results: [{ name: '小雪', status: [{ name: '感冒', on: true, src: 'setting' }, { name: '冷战中', on: true }, { name: '乱写', on: true }] }] });
    const parsed = parseReviewStatuses(reply, STATUS_DEFS);
    assert.deepEqual(parsed.map((p) => p.status), ['感冒']);
    const cat = attach({}, '小雪', '感冒', { src: 'setting', day: 0 });
    const down = applyReviewStatuses([{ charName: '小雪', status: '感冒', on: false, src: 'story' }], cat, applyStatusChange, { day: 1 });
    assert.equal(down.skipped[0].why, 'src-higher');
    assert.ok(hasStatus(null, down.catalog, '小雪', '感冒'));
    const up = applyReviewStatuses([{ charName: '小雪', status: '感冒', on: true, src: 'story' }], cat, applyStatusChange, { day: 1 });
    assert.equal(up.catalog.statuses.小雪.感冒.src, 'setting');
});
