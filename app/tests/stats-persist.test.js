import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsLedger, currentStatsState } from '../src/scene/stats/stat-ledger.js';
import { settleFloor } from '../src/scene/stats/stat-ledger-settle.js';
import { STATS_METADATA_KEY, createChatStatsStore, deserializeLedger, sanitizeCatalog, serializeLedger, sheetAbilityScores } from '../src/scene/stats/stat-persist.js';
import { STATS_SETTINGS_DEFAULTS, normalizeStatsSettings, statsActive } from '../src/scene/stats/stat-settings.js';

const bump = (before) => ({ state: { n: (before.n || 0) + 1 }, changes: [{ key: 'n' }] });

function sample() {
    const ledger = createStatsLedger('c', { n: 0 });
    settleFloor(ledger, { messageId: 1 }, bump, 1);
    settleFloor(ledger, { messageId: 3, swipeId: 0 }, bump, 2);
    settleFloor(ledger, { messageId: 3, swipeId: 1 }, bump, 3);
    return ledger;
}

test('存档往返：只存结算后状态，加载时重建结算前状态，当前 swipe 保留（易错点 B2/B4）', () => {
    const save = serializeLedger(sample(), { chatEnabled: true });
    assert.ok(save.entries.every((e) => !('before' in e)));
    const loaded = deserializeLedger(JSON.parse(JSON.stringify(save)), 'c');
    assert.equal(loaded.ok, true);
    assert.equal(loaded.chatEnabled, true);
    assert.equal(loaded.ledger.active.get(3), 1);
    assert.deepEqual(currentStatsState(loaded.ledger), { n: 2 });
    assert.deepEqual(loaded.ledger.entries.get('c|3|0').before, { n: 1 });
    assert.equal(loaded.ledger.log.length, 3);
});

test('存档不合法或来自更新版本时拒收并给出原因', () => {
    assert.equal(deserializeLedger(null, 'c').reason, 'stats-save-invalid');
    assert.equal(deserializeLedger({ version: 1 }, 'c').reason, 'stats-save-invalid');
    assert.equal(deserializeLedger({ version: 9, initial: {}, entries: [] }, 'c').reason, 'stats-save-newer');
    const partial = deserializeLedger({ version: 1, initial: {}, entries: [{ messageId: 'x' }], active: [] }, 'c');
    assert.equal(partial.ok, true);
    assert.equal(partial.dropped.length, 1);
});

test('聊天元数据存储：缺元数据与没有存档分开报告，写入后调用保存', () => {
    assert.equal(createChatStatsStore(() => null).read().reason, 'no-chat-metadata');
    let saved = 0;
    const ctx = { chatMetadata: {}, saveMetadata() { saved += 1; } };
    const store = createChatStatsStore(() => ctx);
    assert.deepEqual(store.read(), { ok: true, raw: null, declined: false, hasBackup: false });
    assert.equal(store.write({ version: 1 }).ok, true);
    assert.equal(saved, 1);
    assert.deepEqual(ctx.chatMetadata[STATS_METADATA_KEY], { version: 1 });
    assert.equal(createChatStatsStore(() => ({ chatMetadata: {} })).write({}).reason, 'no-save-metadata');
});

test('设置规范化：默认关闭、非法值回退、不改入参；两级开关都开才运行（易错点 H1/H2）', () => {
    assert.equal(normalizeStatsSettings(undefined).enabled, false);
    const raw = Object.freeze({ enabled: true, register: 'bogus', bars: Object.freeze({ money: false }) });
    const s = normalizeStatsSettings(raw);
    assert.equal(s.register, 'auto');
    assert.equal(s.bars.money, false);
    assert.equal(s.bars.stamina, true);
    assert.equal(s.push.enabled, STATS_SETTINGS_DEFAULTS.push.enabled);
    assert.equal(statsActive(s, { chatEnabled: true }), true);
    assert.equal(statsActive(s, { chatEnabled: false }), false);
    assert.equal(statsActive(normalizeStatsSettings({}), { chatEnabled: true }), false);
});

test('角色卡属性档：新格式保留六维与理智，旧格式（百分制旧名）迁成六维分数并把旧理智写进 san', () => {
    const fresh = sanitizeCatalog({ sheets: { 甲: { rank: '老手', scale: 'score', attributes: { 力量: 14, 敏捷: 99, 体质: 10, 智力: 11, 感知: 12, 魅力: 8 }, san: 55, skills: {} } } });
    assert.equal(fresh.sheets.甲.scale, 'score');
    assert.equal(fresh.sheets.甲.attributes.力量, 14);
    assert.equal(fresh.sheets.甲.attributes.敏捷, 30);
    assert.equal(fresh.sheets.甲.san, 55);
    const old = sanitizeCatalog({ sheets: { 乙: { rank: '普通人', attributes: { 健康: 60, 力量: 50, 敏捷: 40, 理智: 80, 观察: 55, 魅力: 30 }, skills: {} } } });
    assert.equal(old.sheets.乙.scale, 'score');
    assert.equal(old.sheets.乙.attributes.体质, 12);
    assert.equal(old.sheets.乙.attributes.智力, 16);
    assert.equal(old.sheets.乙.attributes.感知, 11);
    assert.equal(old.sheets.乙.san, 80);
    // 迁移后再读一遍结果不变
    assert.deepEqual(sanitizeCatalog({ sheets: old.sheets }).sheets.乙, old.sheets.乙);
    // 没有属性的卡不带 scale
    assert.equal(sanitizeCatalog({ sheets: { 丙: { rank: '老手', skills: {} } } }).sheets.丙.scale, undefined);
});

test('sheetAbilityScores：只有新格式且六维齐全才给出战斗六维', () => {
    const full = { scale: 'score', attributes: { 力量: 14, 敏捷: 12, 体质: 10, 智力: 11, 感知: 9, 魅力: 8 } };
    assert.deepEqual(sheetAbilityScores(full), { scores: { str: 14, dex: 12, con: 10, int: 11, wis: 9, cha: 8 } });
    assert.equal(sheetAbilityScores({ ...full, scale: undefined }), null);
    assert.equal(sheetAbilityScores({ scale: 'score', attributes: { 力量: 14 } }), null);
    assert.equal(sheetAbilityScores(null), null);
});
