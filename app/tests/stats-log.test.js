import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, chatEntries, diffChatRecords, diffState, floorRecord, importLegacyStats, initRecord, legacyScores, mergeStatLog, prefsOfScores, statTagHash, verifyStatImport } from '../src/scene/stats/stat-log.js';
import { createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { serializeLedger } from '../src/scene/stats/stat-persist.js';

const mes = (text) => ({ is_user: false, mes: text, swipe_id: 0, swipes: [text] });

test('差分与回放互逆，不改入参', () => {
    const a = Object.freeze({ x: 1, y: Object.freeze({ z: 2, w: 3 }) });
    const b = { x: 1, y: { z: 5 }, q: [1] };
    const ops = diffState(a, b);
    assert.deepEqual(applyOps(a, ops), b);
    assert.equal(diffState(a, a).length, 0);
});

test('标签哈希只看数值标签，叙述改动不影响', () => {
    assert.equal(statTagHash('甲[igs-stat:好感+1]乙'), statTagHash('丙[igs-stat: 好感+1 ]丁'));
    assert.notEqual(statTagHash('[igs-stat:好感+1]'), statTagHash('[igs-stat:好感+2]'));
});

test('楼层记录链重放：正文标签不符的记录被丢弃', () => {
    const s0 = { n: 0 };
    const s1 = { n: 1 };
    const s2 = { n: 2 };
    const t1 = '一[igs-stat:好感+1]';
    const t2 = '二[igs-stat:好感+1]';
    const r1 = floorRecord({ messageId: 1, swipeId: 0, tagHash: statTagHash(t1), seed: 7, before: s0, after: s1, changes: [{ target: '甲', key: '好感', from: 0, to: 1 }] });
    const r2 = floorRecord({ messageId: 2, swipeId: 0, tagHash: statTagHash(t2), baseId: r1.id, seed: 8, before: s1, after: s2 });
    const rows = [initRecord(s0), r1, r2];
    const merged = mergeStatLog(rows, { chatId: 'c', chat: [mes('x'), mes(t1), mes(t2)] });
    assert.equal(merged.ledger.entries.size, 2);
    assert.deepEqual(merged.stateOf(r2.id), s2);
    assert.equal(merged.ledger.active.get(2), 0);
    assert.equal(merged.ledger.log.length, 1);
    const edited = mergeStatLog(rows, { chatId: 'c', chat: [mes('x'), mes(t1), mes('二[igs-stat:好感+9]')] });
    assert.equal(edited.ledger.entries.size, 1);
    assert.equal(mergeStatLog([], { chatId: 'c' }).ledger, null);
});

test('聊天级键值：差分只写变化项，restore 往返含 NPC 属性档', () => {
    const sheet = { rank: '老手', attributes: { 力量: 12, 敏捷: 9, 体质: 10, 智力: 14, 感知: 11, 魅力: 8 }, san: 60, scale: 'score', skills: {}, provisional: {}, signature: [], source: 'llm' };
    const base = chatEntries({ chatEnabled: true });
    const next = chatEntries({ chatEnabled: true, catalog: { sheets: { 阿月: sheet } }, buildMode: 'manual' });
    const records = diffChatRecords(base, next, { tag: 't' });
    assert.deepEqual(records.map((r) => r.payload.key).sort(), ['chat:buildMode', 'sheet:阿月']);
    const merged = mergeStatLog([initRecord({ n: 0 }), ...records], { chatId: 'c', chat: [] });
    assert.equal(merged.buildMode, 'manual');
    assert.deepEqual(merged.catalog.sheets.阿月.attributes, sheet.attributes);
    assert.equal(merged.catalog.sheets.阿月.san, 60);
    const removed = diffChatRecords(next, base, { tag: 'u' });
    assert.ok(removed.some((r) => r.payload.removed));
});

test('旧存档导入：保留 coc7 检定、迁移旧角色卡属性、保留主角理智，读回校验通过', () => {
    const skill = (value) => ({ value });
    const initial = { protagonist: { skills: { 健康: skill(50), 力量: skill(40), 敏捷: skill(45), 理智: skill(70), 观察: skill(55), 魅力: skill(60), 烹饪: skill(50) }, bars: { health: 80, stamina: 50 } } };
    const after = { protagonist: { skills: { ...initial.protagonist.skills, 理智: skill(72) }, bars: { health: 70, stamina: 40 } } };
    const ledger = createStatsLedger('c', initial);
    const check = { ruleset: 'coc7', actor: '主角', skill: '理智', dice: { unit: 3, tens: [2, 5, 7] }, success: true };
    ledger.entries.set('c|1|0', { messageId: 1, swipeId: 0, seed: 5, before: initial, after, changes: [], meta: { check } });
    ledger.active.set(1, 0);
    const oldSheet = { rank: '老手', attributes: { 健康: 60, 力量: 50, 敏捷: 40, 理智: 80, 观察: 55, 魅力: 30 }, skills: {}, provisional: {}, signature: [], source: 'llm' };
    const raw = serializeLedger(ledger, { chatEnabled: true, catalog: { sheets: { 阿月: oldSheet } } });
    const chat = [mes('开场'), mes('正文[igs-stat:好感+1]')];
    const plan = importLegacyStats(JSON.parse(JSON.stringify(raw)), { chatId: 'c', chat });
    assert.equal(plan.ok, true);
    const floor = plan.records.find((r) => r.type === 'floor');
    assert.equal(floor.payload.meta.check.ruleset, 'coc7');
    const merged = mergeStatLog(plan.records, { chatId: 'c', chat });
    assert.deepEqual(verifyStatImport(merged, plan), { ok: true });
    const state = merged.stateOf(floor.id);
    assert.equal(state.protagonist.skills.理智.value, 72);
    assert.equal(state.protagonist.skills.健康, undefined);
    assert.equal(state.protagonist.bars.health, undefined);
    assert.ok(state.protagonist.prefs);
    const sheet = merged.catalog.sheets.阿月;
    assert.equal(sheet.scale, 'score');
    assert.equal(sheet.attributes.体质, 12);
    assert.equal(sheet.attributes.智力, 16);
    assert.equal(sheet.san, 80);
});

test('旧存档拒收原因透传；倾向由六维推导', () => {
    assert.equal(importLegacyStats({ version: 9, initial: {}, entries: [] }, { chatId: 'c' }).reason, 'stats-save-newer');
    const skills = Object.fromEntries(Object.entries({ 健康: 30, 力量: 90, 敏捷: 80, 理智: 60, 观察: 50, 魅力: 20 }).map(([k, v]) => [k, { value: v }]));
    const scores = legacyScores({ protagonist: { skills } });
    assert.equal(scores.力量, 18);
    const prefs = prefsOfScores(scores);
    assert.equal(prefs.major, 'str');
    assert.equal(prefs.minor, 'dex');
    assert.equal(prefs.weak, 'cha');
});
