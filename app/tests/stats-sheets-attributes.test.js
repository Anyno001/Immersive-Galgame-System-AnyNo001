import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ABILITY_SCORE_TIERS, abilityLine, migrateSheetAttributes, parseSheetReply, sheetAttributeInput, sheetFromTiers,
} from '../src/scene/stats/stat-sheets.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

test('属性档词 → 分数区间；解析认新六维名、旧名与理智', () => {
    assert.deepEqual(ABILITY_SCORE_TIERS.很弱, [3, 6]);
    assert.deepEqual(ABILITY_SCORE_TIERS.超凡, [18, 22]);
    const reply = JSON.stringify({ 小雪: { 资历: '老手', 属性: { 力量: '顶尖', 健康: '出众', 观察: '弱', 理智: '普通', 乱写: '顶尖', 魅力: '99' }, 技能: {}, 招牌技能: [] } });
    const { ok, sheets, diagnostics } = parseSheetReply(reply, { names: ['小雪'] });
    assert.equal(ok, true);
    assert.deepEqual(sheets.小雪.attributes, { 力量: '顶尖', 体质: '出众', 感知: '偏弱', 理智: '普通' });
    assert.equal(diagnostics.length, 2);
});

test('档位 → 底数：六维写分数（scale:score），理智写百分制，同聊天同角色恒定', () => {
    const tiers = { rank: '精英', attributes: { 力量: '顶尖', 智力: '很弱', 理智: '出众' }, skills: {}, signature: [] };
    const a = sheetFromTiers('小雪', tiers, { chatSeed: 'c1' });
    assert.deepEqual(sheetFromTiers('小雪', tiers, { chatSeed: 'c1' }), a);
    assert.equal(a.scale, 'score');
    assert.ok(a.attributes.力量 >= 15 && a.attributes.力量 <= 17);
    assert.ok(a.attributes.智力 >= 3 && a.attributes.智力 <= 6);
    assert.ok(a.attributes.体质 >= 10 && a.attributes.体质 <= 11);
    assert.ok(a.san >= 60 && a.san <= 70);
    assert.deepEqual(Object.keys(a.attributes), ['力量', '敏捷', '体质', '智力', '感知', '魅力']);
});

test('旧卡迁移：旧名改名、百分制 ÷5 夹到 1–30，旧理智同时写进 san；新卡与无属性卡不动', () => {
    const old = { rank: '老手', attributes: { 健康: 80, 力量: 45, 敏捷: 500, 理智: 62, 观察: 50, 魅力: 3 }, skills: { 格斗: 70 } };
    const frozen = JSON.stringify(old);
    const next = migrateSheetAttributes(old);
    assert.equal(JSON.stringify(old), frozen);
    assert.equal(next.scale, 'score');
    assert.deepEqual(next.attributes, { 体质: 16, 力量: 9, 敏捷: 30, 智力: 12, 感知: 10, 魅力: 1 });
    assert.equal(next.san, 62);
    assert.deepEqual(next.skills, { 格斗: 70 });
    const fresh = { scale: 'score', attributes: { 力量: 10 } };
    assert.equal(migrateSheetAttributes(fresh), fresh);
    assert.deepEqual(migrateSheetAttributes({ rank: '普通人', skills: {} }), { rank: '普通人', skills: {} });
    assert.equal(migrateSheetAttributes(null), null);
});

test('手改属性：六维收档位词或 1–30，理智收档位词或 1–99，其余拒绝', () => {
    assert.equal(sheetAttributeInput('力量', '18'), 18);
    assert.equal(sheetAttributeInput('力量', '31'), null);
    assert.equal(sheetAttributeInput('力量', '0'), null);
    assert.equal(sheetAttributeInput('理智', '99'), 99);
    assert.equal(sheetAttributeInput('理智', '100'), null);
    const high = sheetAttributeInput('力量', '顶尖', 'seed');
    assert.ok(high >= 15 && high <= 17);
    const san = sheetAttributeInput('理智', '顶尖', 'seed');
    assert.ok(san >= 75 && san <= 90);
    assert.equal(sheetAttributeInput('力量', '很厉害'), null);
    assert.equal(sheetAttributeInput('敏锐', '12'), null);
});

test('提示词里的六维一行：D&D 为检定加值，CoC 为百分制并含理智', () => {
    const readers = { readAbilities: () => ({ scores: { str: 14, dex: 10, con: 10, int: 8, wis: 12, cha: 10 } }) };
    const state = createStatsState();
    assert.equal(abilityLine(createEngine({}, {}, 'dnd5e', readers), state, '小雪'), '力量+2 敏捷+0 体质+0 智力-1 感知+1 魅力+0');
    assert.equal(abilityLine(createEngine({}, {}, 'coc7', readers), state, '小雪'), '力量70 敏捷50 体质50 智力40 感知60 魅力50 理智60');
});
