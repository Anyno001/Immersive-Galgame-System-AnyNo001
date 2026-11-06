// 「修改属性」与 3+5：主角六维底数可覆盖（剧情加点照常叠加）、新聊天选擅长技能、角色卡 3+5 解析。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createInventoryTables } from '../src/data/shujuku/inventory-tables.js';
import { abilitiesForName, createCombatLedger } from '../src/combat/ledger.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { parseSheetReply, sheetFromTiers } from '../src/scene/stats/stat-sheets.js';

const HERO = '艾拉';

function world() {
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const client = createCachedTableClient({ api: host.api });
    const tables = createCombatTables({ api: host.api, client });
    const inventory = createInventoryTables({ api: host.api, client, serial: tables.serial });
    let t = 1700000000000;
    const ledger = createCombatLedger({ tables, chat: () => [{ is_user: true, mes: '开始', swipe_id: 0 }], userName: HERO, difficulty: 'normal', now: () => (t += 1000), inventory });
    return { tables, inventory, ledger };
}

const first = { str: 15, dex: 14, con: 12, int: 8, wis: 12, cha: 11 };
const edited = { str: 10, dex: 10, con: 10, int: 16, wis: 14, cha: 12 };

test('修改属性：已初始化的主角 replace 写「手改」记录覆盖底数；不带 replace 仍原样返回 unchanged', async () => {
    const w = world();
    await w.tables.ensure();
    await w.inventory.ensure();
    const init = await w.ledger.writeInit(HERO, { className: '剑士', role: 'warrior', scores: first }, { manual: true });
    assert.equal(init.ok, true);
    const view = async () => abilitiesForName(await w.ledger.effectiveState(), HERO, HERO);
    assert.deepEqual((await view()).base, first);
    const again = await w.ledger.writeInit(HERO, { className: '剑士', role: 'warrior', scores: edited }, { manual: true });
    assert.equal(again.unchanged, true);
    const replaced = await w.ledger.writeInit(HERO, { className: '剑士', role: 'warrior', scores: edited }, { manual: true, replace: true });
    assert.equal(replaced.ok, true);
    assert.equal(replaced.record.change, '手改');
    const after = await view();
    assert.deepEqual(after.base, edited);
    assert.equal(after.scores.int, 16);
    // 再改一次：最新的手改生效。
    await w.ledger.writeInit(HERO, { className: '剑士', role: 'warrior', scores: first }, { manual: true, replace: true });
    assert.deepEqual((await view()).base, first);
});

test('角色卡 3+5：擅长 60、比较擅长 30，重复与超额丢弃；旧「技能」档位表仍可识别', () => {
    const reply = JSON.stringify({ 小林: { 资历: '老手', 擅长: ['话术', '侦查', '格斗', '潜行'], 比较擅长: ['侦查', '烹饪', '急救'], 技能: { 驾驶: '相当' } } });
    const parsed = parseSheetReply(reply, { names: ['小林'] });
    assert.equal(parsed.ok, true);
    const t = parsed.sheets.小林;
    assert.deepEqual(t.strong, ['话术', '侦查', '格斗']);
    assert.deepEqual(t.good, ['烹饪', '急救']);
    const sheet = sheetFromTiers('小林', t, { chatSeed: 'c1' });
    assert.deepEqual([sheet.skills.话术, sheet.skills.烹饪], [60, 30]);
    assert.ok(sheet.skills.驾驶 > 0);
});
