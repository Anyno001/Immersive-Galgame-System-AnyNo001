import test from 'node:test';
import assert from 'node:assert/strict';
import { jealousySignals } from '../src/scene/stats/stat-fx.js';
import { JEALOUS_FAVOR_MIN, JEALOUS_GRUDGE_MIN } from '../src/scene/stats/stat-favor.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const high = () => 0.99;
const low = () => 0.1;
const resolveCharacter = (name) => (['小雪', '阿澄'].includes(name) ? name : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, ...opts });
const withDims = (dims, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, ...dims }, ...extra } } });
const dimOf = (state, dim, name = '小雪') => state.characters[name].dims[dim];
const JEALOUS = '[igs-stat:favor|小雪|吃醋]';

test('信任受伤标记不进旧角色：没有该字段的角色日结算后仍没有', () => {
    const next = floor(withDims({ 信任: 10 }), '睡去。[igs-stat:sleep]', { favorTier: 'normal' }).state;
    assert.equal(Object.hasOwn(next.characters.小雪, 'trustWound'), false);
});

test('信任旧楼重算仍是 +1 / −4，且不写 trustWound', () => {
    const up = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|上升|大]');
    assert.equal(dimOf(up.state, '信任'), 1);
    const down = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|下降|重大]');
    assert.equal(dimOf(down.state, '信任'), -4);
    assert.equal(Object.hasOwn(down.state.characters.小雪, 'trustWound'), false);
    const hard = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|下降]', { favorMode: 'hard' });
    assert.equal(dimOf(hard.state, '信任'), -4);
});

// ---------- 第十二节：亲密消耗体力 ----------
const intimate = (level, cost, state = createStatsState(), extra = {}) => floor(state, `[igs-stat:intimate|小雪|${level}]`, { favorTier: 'normal', nsfw: true, intimateCost: cost, ...extra });
const staminaOf = (state, name) => (name ? state.characters[name].bars.stamina : state.protagonist.bars.stamina);

// ---------- 提示词：第十一、十二节 ----------
const stateOf = (stamina, favor = 0) => {
    const s = withDims({ 好感: favor, 信任: 0, 欲望: 0 });
    return { ...s, characters: { 小雪: { ...s.characters.小雪, bars: { stamina, money: 0, stress: 0 } } } };
};
const promptOf = (state, opts) => buildStatsPrompt(state, { present: ['小雪'], nsfw: true, intimacyGate: true, ...opts }).content;

test('豁免名单进聊天级存档并能还原', () => {
    const map = chatEntries({ catalog: { intimacyForced: ['小雪'] } });
    assert.deepEqual(map.get('trait:小雪'), { forced: { on: true, src: 'manual' } }, '豁免并入 trait 记录，不再写 force: 键');
    assert.deepEqual(restoreChat(map).catalog.intimacyForced, ['小雪']);
    assert.deepEqual(restoreChat(chatEntries({})).catalog.intimacyForced, []);
});

// ---------- 豁免开关在 swipe / 删楼后保留 ----------
const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function runtimeSetup({ nsfw = false } = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = { name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource, eventTypes: T, getCurrentChatId: () => 'chat-j', setExtensionPrompt() {}, saveMetadata() {} };
    const holder = { cur: { enabled: true, favorMode: 'normal' } };
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => holder.cur, isNsfw: () => nsfw, statsTables: () => tables });
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
        return ctx.chat.length - 1;
    };
    return { rt, ctx, say, eventSource, rows };
}

test('新楼记录亲密档位（NSFW 开启时）；改设置后旧楼按当时档位重算，缺字段的旧楼不结算', () => {
    const { rt, ctx, say, eventSource } = runtimeSetup({ nsfw: true });
    const id = say('她靠近。[igs-stat:favor|小雪|开心]');
    const entry = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(entry.meta.intimateCost, 'standard');
    delete entry.meta.intimateCost;
    ctx.chat[id].mes += ' [igs-stat:intimate|小雪|重]';
    eventSource.emit('upd', id);
    const redone = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(Object.hasOwn(redone.meta, 'intimateCost'), false);
    assert.equal(rt.getState().protagonist.bars.stamina, 100);
});

test('NSFW 关闭的楼不记亲密档位，日后开启 NSFW 重算该楼也不补扣体力', () => {
    const { rt, say } = runtimeSetup({ nsfw: false });
    const id = say('她靠近。[igs-stat:intimate|小雪|重]');
    const entry = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(Object.hasOwn(entry.meta, 'intimateCost'), false);
    assert.equal(rt.getState().protagonist.bars.stamina, 100);
});

