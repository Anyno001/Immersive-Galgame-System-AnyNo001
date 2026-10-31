import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, diffState, importLegacyStats, mergeStatLog, verifyStatImport } from '../src/scene/stats/stat-log.js';
import { createStatsLedger, currentStatsState } from '../src/scene/stats/stat-ledger.js';
import { settleFloor } from '../src/scene/stats/stat-ledger-settle.js';
import { STATS_METADATA_KEY, serializeLedger } from '../src/scene/stats/stat-persist.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { fakeStatsTables } from './helpers/fake-stats-db.js';

const OLD = { 健康: 60, 力量: 45, 敏捷: 55, 理智: 50, 观察: 62, 魅力: 58 };
function legacyState() {
    const s = createStatsState();
    const skills = { ...s.protagonist.skills, ...Object.fromEntries(Object.entries(OLD).map(([k, v]) => [k, { value: v, marked: false }])) };
    return { ...s, protagonist: { ...s.protagonist, skills, bars: { ...s.protagonist.bars, health: 80 } } };
}
const nextDay = (before) => ({ state: { ...before, clock: { ...before.clock, day: before.clock.day + 1 } }, changes: [{ target: '主角', key: '日', from: before.clock.day, to: before.clock.day + 1 }] });

function legacyChat() {
    const ledger = createStatsLedger('c', legacyState());
    settleFloor(ledger, { messageId: 1 }, nextDay, 7);
    settleFloor(ledger, { messageId: 3 }, nextDay, 8);
    const chat = [{ is_user: true, mes: '你好' }, { is_user: false, mes: '睡了。[igs-stat:sleep]', swipe_id: 0 }, { is_user: true, mes: '早' }, { is_user: false, mes: '又睡。[igs-stat:sleep]', swipe_id: 0 }];
    return { raw: { ...serializeLedger(ledger, { chatEnabled: true, learned: { 熟魔药: '烹饪' } }), version: 1 }, chat };
}

test('状态差量：应用后与结算后状态一致，不改基准', () => {
    const a = createStatsState();
    const b = { ...a, clock: { ...a.clock, day: 3 }, characters: { 小雪: { dims: { 好感: 5 } } } };
    const ops = diffState(a, b);
    assert.deepEqual(applyOps(a, ops), b);
    assert.equal(a.clock.day, 1);
    assert.deepEqual(applyOps(b, diffState(b, a)), a);
});

test('旧存档导入：六维按 Q1 换算为分值并定主 / 次擅长与短板，去掉生命与旧六维技能项；归并读回与旧档一致', () => {
    const { raw, chat } = legacyChat();
    const plan = importLegacyStats(raw, { chatId: 'c', chat });
    assert.equal(plan.ok, true);
    const init = plan.records.at(-1);
    assert.equal(init.type, 'init');
    assert.deepEqual(init.payload.legacy.scores, { 体质: 12, 力量: 9, 敏捷: 11, 智力: 10, 感知: 12, 魅力: 12 });
    const merged = mergeStatLog(plan.records, { chatId: 'c', chat });
    assert.deepEqual(verifyStatImport(merged, plan), { ok: true });
    const state = currentStatsState(merged.ledger);
    assert.equal(state.clock.day, 3);
    assert.deepEqual(state.protagonist.prefs, { major: 'con', minor: 'wis', weak: 'str' });
    assert.equal(state.protagonist.bars.health, undefined);
    assert.ok(!Object.keys(state.protagonist.skills).some((k) => k in OLD));
    assert.equal(merged.learned.熟魔药, '烹饪');
    assert.equal(merged.chatEnabled, true);
    assert.equal(importLegacyStats(raw, { chatId: 'c', chat }).records.map((r) => r.id).join(), plan.records.map((r) => r.id).join());
});

test('归并回退：编辑去掉标签、换 swipe、删楼后该楼记录不计；后续楼层按原基准还原', () => {
    const { raw, chat } = legacyChat();
    const { records } = importLegacyStats(raw, { chatId: 'c', chat });
    const day = (c) => currentStatsState(mergeStatLog(records, { chatId: 'c', chat: c }).ledger).clock.day;
    assert.equal(day(chat), 3);
    assert.equal(day(chat.slice(0, 2)), 2);
    const swiped = chat.map((m, i) => (i === 3 ? { ...m, swipe_id: 1, swipes: [m.mes, '新的'] } : m));
    assert.equal(day(swiped), 2);
    const edited = chat.map((m, i) => (i === 1 ? { ...m, mes: '没睡。' } : m));
    const ledger = mergeStatLog(records, { chatId: 'c', chat: edited }).ledger;
    assert.equal(ledger.active.has(1), false);
    assert.equal(currentStatsState(ledger).clock.day, 3);
});

test('导入写入失败：保持旧档不动、本聊天不启用，给出原因', async () => {
    const { raw, chat } = legacyChat();
    const db = fakeStatsTables();
    db.api.failInsert = true;
    const T = { CHAT_CHANGED: 'chat' };
    const handlers = new Map();
    const eventSource = { on(n, f) { handlers.set(n, f); }, removeListener() {} };
    const ctx = { name2: '小雪', chat, chatMetadata: { [STATS_METADATA_KEY]: JSON.parse(JSON.stringify(raw)) }, eventSource, eventTypes: T, getCurrentChatId: () => 'c', saveMetadata() {} };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true }), statsTables: db.statsTables });
    rt.sync();
    await rt.whenSaved();
    assert.equal(rt.isChatEnabled(), false);
    assert.equal(rt.chatStatus().blocked, 'combat-ledger-insert-failed');
    assert.deepEqual(ctx.chatMetadata[STATS_METADATA_KEY], JSON.parse(JSON.stringify(raw)));
    assert.ok(rt.notices().some((n) => n.id === 'import'));
    assert.equal(rt.getState(), null);
});
