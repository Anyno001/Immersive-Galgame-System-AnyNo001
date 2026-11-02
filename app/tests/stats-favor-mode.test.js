import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDim, favorLimits } from '../src/scene/stats/stat-favor.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { readStatsSettings, normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const favorOf = (state) => state.characters.小雪?.dims.好感;
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, ...opts });
// 同一游戏日内连续结算若干楼，返回每楼结束时的好感
function days(text, count, opts) {
    let state = createStatsState();
    const out = [];
    for (let i = 0; i < count; i += 1) { state = floor(state, text, opts).state; out.push(favorOf(state)); }
    return out;
}

test('好感档位：缺省与未知值都是普通，困难档为单楼 1、每日 4', () => {
    assert.deepEqual({ ...favorLimits() }, { mode: 'normal', floor: 3, daily: 8 });
    assert.deepEqual({ ...favorLimits('hard') }, { mode: 'hard', floor: 1, daily: 4 });
    assert.equal(favorLimits('其他').mode, 'normal');
    assert.equal(normalizeStatsSettings({}).favorMode, 'normal');
    assert.equal(normalizeStatsSettings({ favorMode: 'hard' }).favorMode, 'hard');
    assert.equal(normalizeStatsSettings({ favorMode: 'x' }).favorMode, 'normal');
});

test('普通档行为不变：单楼最多 3，每日最多 8', () => {
    assert.equal(favorOf(floor(createStatsState(), '[igs-stat:favor|小雪|感动]').state), 3);
    assert.deepEqual(days('[igs-stat:favor|小雪|感动]', 4), [3, 6, 8, 8]);
    assert.equal(favorOf(floor(createStatsState(), '[igs-stat:favor|小雪|感动]', { favorMode: 'normal' }).state), 3);
});

test('困难档：单楼不超过 1，每日不超过 4', () => {
    const one = floor(createStatsState(), '[igs-stat:favor|小雪|感动]', { favorMode: 'hard' });
    assert.equal(favorOf(one.state), 1);
    assert.equal(one.meta.favorMode, 'hard');
    assert.deepEqual(days('[igs-stat:favor|小雪|感动]', 6, { favorMode: 'hard' }), [1, 2, 3, 4, 4, 4]);
    assert.equal(floor(createStatsState(), '[igs-stat:favor|小雪|感动]').meta.favorMode, undefined);
});

test('困难档：大成功加成、关口封顶、负向不设上限与普通档一致', () => {
    const crit = { social: true, success: true, ladder: 'crit', toward: '小雪' };
    assert.equal(favorOf(floor(createStatsState(), '[igs-stat:favor|小雪|感动]', { favorMode: 'hard', storyChecks: [{ ...crit, skill: '话术' }] }).state), 2);
    const at = (favor, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: favor }, ...extra } } });
    assert.equal(favorOf(floor(at(25), '[igs-stat:favor|小雪|感动]', { favorMode: 'hard' }).state), 25);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|受伤]', { favorMode: 'hard' }).state), 24);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|受伤]').state), 24);
});

test('困难档只管好感的普通加分：送礼与信任不受限制', () => {
    assert.equal(favorOf(floor(createStatsState(), '[igs-stat:gift|小雪|甜点]', { favorMode: 'hard' }).state), 2);
    const trust = floor(createStatsState(), '[igs-stat:trust|小雪|上升]', { favorMode: 'hard' });
    assert.equal(trust.state.characters.小雪.dims.信任, 1);
});

test('applyDim 新增每日上限参数，缺省仍是 8', () => {
    const c = createCharacter(1);
    assert.equal(applyDim(c, '好感', '感动', { random: high }).character.dims.好感, 3);
    assert.equal(applyDim(c, '好感', '感动', { random: high, dailyMax: 2 }).character.dims.好感, 2);
});

// ---------- 改档只影响之后的楼 ----------
const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function runtimeSetup() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = { name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource, eventTypes: T, getCurrentChatId: () => 'chat-h', setExtensionPrompt() {}, saveMetadata() {} };
    const holder = { cur: { enabled: true, favorMode: 'normal' } };
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const make = () => createStatsRuntime({ getContext: () => ctx, readSettings: () => holder.cur, statsTables: () => tables });
    const rt = make();
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
        return ctx.chat.length - 1;
    };
    return { rt, ctx, holder, say, rows, make, eventSource };
}

test('改档后旧楼重算沿用当时的档位，新楼按新档位', () => {
    const { rt, ctx, holder, say, eventSource } = runtimeSetup();
    const first = say('她笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 3);
    holder.cur = { ...holder.cur, favorMode: 'hard' };
    ctx.chat[first].mes += ' 再补一句。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 3);
    assert.equal(rt.getLedger().entries.get(`chat-h|${first}|0`).meta.favorMode, undefined);
    say('她又笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 4);
});

test('困难档楼层重算仍按困难档，记录里的档位重新读取后保留', () => {
    const { rt, ctx, holder, say, eventSource, make, rows } = runtimeSetup();
    holder.cur = { ...holder.cur, favorMode: 'hard' };
    const first = say('她笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 1);
    holder.cur = { ...holder.cur, favorMode: 'normal' };
    ctx.chat[first].mes += ' 再补一句。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 1);
    const stored = rows.filter((r) => r.type === 'floor').pop();
    assert.equal(stored.payload.meta.favorMode, 'hard');
    const reread = make();
    reread.sync();
    assert.equal(reread.getLedger().entries.get(`chat-h|${first}|0`).meta.favorMode, 'hard');
});

test('阅读设置缓存：读到的设置对象带好感档', () => {
    assert.equal(readStatsSettings({ enabled: true, favorMode: 'hard' }).favorMode, 'hard');
});
