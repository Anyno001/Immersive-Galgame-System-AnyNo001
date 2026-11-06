import test from 'node:test';
import assert from 'node:assert/strict';
import { favorToasts } from '../src/scene/stats/stat-fx.js';
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
    assert.equal(normalizeStatsSettings({}).favorMode, 'vivid');
    assert.equal(normalizeStatsSettings({ favorMode: 'hard' }).favorMode, 'hard');
    assert.equal(normalizeStatsSettings({ favorMode: 'normal' }).favorMode, 'normal');
    assert.equal(normalizeStatsSettings({ favorMode: 'x' }).favorMode, 'vivid');
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
    holder.cur = { ...holder.cur, favorMode: 'hard' };
    const first = say('她笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 3);
    holder.cur = { ...holder.cur, favorMode: 'vivid' };
    ctx.chat[first].mes += ' 再补一句。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 3);
    assert.equal(rt.getLedger().entries.get(`chat-h|${first}|0`).meta.favorTier, 'hard');
    say('她又笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 8);
});

test('楼层记录里的好感档重新读取后保留，重算仍按当时的档', () => {
    const { rt, ctx, holder, say, eventSource, make, rows } = runtimeSetup();
    holder.cur = { ...holder.cur, favorMode: 'normal' };
    const first = say('她笑了。[igs-stat:favor|小雪|感动]');
    assert.equal(rt.getState().characters.小雪.dims.好感, 5);
    holder.cur = { ...holder.cur, favorMode: 'hard' };
    ctx.chat[first].mes += ' 再补一句。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 5);
    const stored = rows.filter((r) => r.type === 'floor').pop();
    assert.equal(stored.payload.meta.favorTier, 'normal');
    const reread = make();
    reread.sync();
    assert.equal(reread.getLedger().entries.get(`chat-h|${first}|0`).meta.favorTier, 'normal');
});

test('旧楼没有 favorTier：重算按旧普通（单楼 3）与旧困难（单楼 1）', () => {
    const { rt, ctx, say, eventSource } = runtimeSetup();
    const first = say('她笑了。[igs-stat:favor|小雪|感动]');
    const entry = rt.getLedger().entries.get(`chat-h|${first}|0`);
    assert.equal(entry.meta.favorTier, 'normal');
    delete entry.meta.favorTier;
    ctx.chat[first].mes += ' 补一句。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 3);
    const redone = rt.getLedger().entries.get(`chat-h|${first}|0`);
    assert.equal(redone.meta.favorTier, undefined);
    redone.meta.favorMode = 'hard';
    ctx.chat[first].mes += ' 再补。';
    eventSource.emit('upd', first);
    assert.equal(rt.getState().characters.小雪.dims.好感, 1);
    assert.equal(rt.getLedger().entries.get(`chat-h|${first}|0`).meta.favorMode, 'hard');
});

test('阅读设置缓存：读到的设置对象带好感档', () => {
    assert.equal(readStatsSettings({ enabled: true, favorMode: 'hard' }).favorMode, 'hard');
});

// ---------- 三档好感成长（鲜明 / 普通 / 困难） ----------
const low = () => 0.1; // d100 点数 11，低于好感 30 时判未通过
const at = (favor) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: favor } } } });
const tier = (favorTier, text, state = createStatsState(), opts = {}) => floor(state, text, { favorTier, ...opts });
const heartOf = (state) => state.characters.小雪.heart;

test('三档同一组标签：增量、上限与阶段倍率', () => {
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动]').state), 5);
    assert.equal(favorOf(tier('normal', '[igs-stat:favor|小雪|感动]').state), 5);
    assert.equal(favorOf(tier('hard', '[igs-stat:favor|小雪|感动]').state), 3);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|大]').state), 10);
    assert.equal(favorOf(tier('normal', '[igs-stat:favor|小雪|感动|大]').state), 5);
    assert.equal(favorOf(tier('hard', '[igs-stat:favor|小雪|感动|大]').state), 3);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动]', at(30)).state), 34);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动]', at(60)).state), 63);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动]', at(80)).state), 82);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|重大][igs-stat:event|小雪|约会]').state), 15);
    assert.deepEqual(days('[igs-stat:favor|小雪|感动]', 4, { favorTier: 'normal' }), [5, 8, 8, 8]);
});

test('普通档 d100 两分支：通过全额，未通过减半（至少 1）', () => {
    assert.equal(favorOf(tier('normal', '[igs-stat:favor|小雪|感动]', at(30)).state), 35);
    assert.equal(favorOf(tier('normal', '[igs-stat:favor|小雪|感动]', at(30), { random: low }).state), 32);
    assert.equal(favorOf(tier('normal', '[igs-stat:favor|小雪|开心]', at(30), { random: low }).state), 31);
    assert.equal(favorOf(tier('hard', '[igs-stat:favor|小雪|感动]', at(30), { random: low }).state), 31);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动]', at(30), { random: low }).state), 34);
});

test('省略强度按方向推定；正向重大无 event 降为大；同日第二次大降为中', () => {
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|中]').state), 5);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|重大]').state), 10);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|重大][igs-stat:event|小雪|约会]').state), 15);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|受伤|重大]', at(40)).state), 15);
    assert.deepEqual(days('[igs-stat:favor|小雪|感动|大]', 2, { favorTier: 'vivid' }), [10, 15]);
    assert.equal(tier('vivid', '[igs-stat:favor|小雪|感动|大]').state.characters.小雪.daily.bigUsed, true);
    const bad = tier('vivid', '[igs-stat:favor|小雪|感动|+10]');
    assert.equal(favorOf(bad.state), undefined);
    assert.equal(bad.meta.diagnostics.length, 1);
});

test('检定失败降档：方向与强度各降一档，小降为无', () => {
    const fail = { social: true, success: false, toward: '小雪', actor: '主角', skill: '话术' };
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|感动|大]', createStatsState(), { check: fail }).state), 5);
    assert.equal(favorOf(tier('vivid', '[igs-stat:favor|小雪|开心]', createStatsState(), { check: fail }).state) || 0, 0);
});

test('心意槽：小累计、满溢加好感并记「心意满溢」、中及以上不进槽、负向清空', () => {
    let state = tier('vivid', '[igs-stat:favor|小雪|开心]').state;
    assert.deepEqual([favorOf(state), heartOf(state)], [0, 2]);
    state = tier('vivid', '[igs-stat:favor|小雪|开心]', state).state;
    assert.deepEqual([favorOf(state), heartOf(state)], [0, 4]);
    const burst = tier('vivid', '[igs-stat:favor|小雪|开心]', state);
    assert.deepEqual([favorOf(burst.state), heartOf(burst.state)], [5, 1]);
    assert.ok(burst.changes.some((c) => c.key === '好感' && c.note === '心意满溢'));
    assert.equal(heartOf(tier('vivid', '[igs-stat:favor|小雪|感动]', state).state), 4);
    assert.equal(heartOf(tier('vivid', '[igs-stat:favor|小雪|失望]', state).state), 2);
    assert.equal(heartOf(tier('vivid', '[igs-stat:favor|小雪|反感]', state).state), 0);
    assert.equal(heartOf(tier('normal', '[igs-stat:favor|小雪|开心]', state).state), 4);
    assert.equal(heartOf(tier('hard', '[igs-stat:favor|小雪|受伤]', state).state), 4);
});

test('心意槽随楼层快照：删楼回退后槽值回到上一楼', () => {
    const { rt, ctx, holder, say, eventSource } = runtimeSetup();
    holder.cur = { ...holder.cur, favorMode: 'vivid' };
    say('她笑了。[igs-stat:favor|小雪|开心]');
    say('她又笑了。[igs-stat:favor|小雪|开心]');
    assert.equal(heartOf(rt.getState()), 4);
    ctx.chat.pop();
    eventSource.emit('del', ctx.chat.length);
    assert.equal(heartOf(rt.getState()), 2);
});

test('负向表三档一致：小 −3、中 −8、大 −15、重大 −25', () => {
    for (const t of ['vivid', 'normal', 'hard']) {
        assert.equal(favorOf(tier(t, '[igs-stat:favor|小雪|失望]', at(40)).state), 37, t);
        assert.equal(favorOf(tier(t, '[igs-stat:favor|小雪|反感]', at(40)).state), 32, t);
        assert.equal(favorOf(tier(t, '[igs-stat:favor|小雪|受伤]', at(40)).state), 25, t);
        assert.equal(favorOf(tier(t, '[igs-stat:favor|小雪|受伤|重大]', at(40)).state), 15, t);
    }
});

test('旧楼不带 favorTier：旧普通与旧困难数值与改动前一致，meta 不写 favorTier', () => {
    const legacy = floor(createStatsState(), '[igs-stat:favor|小雪|感动]');
    assert.equal(favorOf(legacy.state), 3);
    assert.equal(legacy.meta.favorTier, undefined);
    assert.equal(legacy.meta.favorMode, undefined);
    assert.deepEqual(days('[igs-stat:favor|小雪|感动]', 4), [3, 6, 8, 8]);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|感动]', { random: low }).state), 31);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|失望]').state), 28);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|反感]').state), 26);
    assert.equal(favorOf(floor(at(30), '[igs-stat:favor|小雪|受伤]').state), 24);
    assert.equal(favorOf(floor(createStatsState(), '[igs-stat:favor|小雪|感动|大]').state), 3);
    const hard = floor(createStatsState(), '[igs-stat:favor|小雪|感动]', { favorMode: 'hard' });
    assert.equal(favorOf(hard.state), 1);
    assert.equal(hard.meta.favorMode, 'hard');
    assert.equal(hard.meta.favorTier, undefined);
    assert.deepEqual(days('[igs-stat:favor|小雪|感动]', 6, { favorMode: 'hard' }), [1, 2, 3, 4, 4, 4]);
    assert.equal(tier('vivid', '[igs-stat:favor|小雪|感动]').meta.favorTier, 'vivid');
});

test('新三档同楼同角色信任上升与下降并存：保留幅度较大的下降', () => {
    for (const t of ['vivid', 'normal', 'hard']) {
        const r = tier(t, '[igs-stat:trust|小雪|上升][igs-stat:trust|小雪|下降]');
        assert.equal(r.state.characters.小雪.dims.信任, -3, t);
        assert.ok(r.changes.some((c) => c.key === '信任' && c.to < c.from), t);
    }
});

test('鲜明档心意槽满溢被关口封顶压成 0 时不扣槽，也不记满溢', () => {
    const full = at(25);
    full.characters.小雪.heart = 4;
    const r = tier('vivid', '[igs-stat:favor|小雪|开心]', full);
    assert.equal(favorOf(r.state), 25);
    assert.equal(heartOf(r.state), 4);
    assert.ok(!r.changes.some((c) => c.note === '心意满溢'));
});

test('满溢伴随检定失败时飘字仍带 burst 标记', () => {
    const toasts = favorToasts([{ source: 'tag', target: '小雪', key: '好感', from: 10, to: 15, note: '心意满溢（检定失败）' }]);
    assert.equal(toasts[0].burst, true);
});
