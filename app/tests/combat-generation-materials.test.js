import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatGenerationMaterials } from '../src/host/combat-generation-materials.js';
import { selectGenerationMaterials, readMaterialPath, discoverMvuMaterials, compactMaterial } from '../src/combat/generation-materials.js';
import { createCombatMaterialContext } from '../src/core/combat-material-context.js';

function fixture({ mvu = true, failMvu = false, failTables = false } = {}) {
    const data = { 主角: { 技能: { 雷刃: { 等级: 3, 状态: '已掌握' }, 雷神: { 状态: '未解锁' } }, 装备: ['长剑'] }, 敌人: { 技能: { 灭世: '敌方专用' } }, 技能树: ['未来能力'], 密钥: '不要发送' };
    const chat = [{ is_user: false, mes: '旧剧情', swipe_id: 0 }, { is_user: true, mes: '继续' }];
    const sheets = {
        sheet_skill: { uid: 'sheet_skill', name: '人物技能表', content: [['所属角色', '技能', '状态'], ['艾拉', '雷步', '已掌握'], ['敌人', '灭世', '已掌握'], ['艾拉', '天雷', '未解锁']] },
        sheet_ability: { uid: 'sheet_ability', name: '能力目录', content: [['名称', '说明'], ['冰墙', '归属不明确']] },
        sheet_memo: { uid: 'sheet_memo', name: '剧情备忘', content: [['内容'], ['不应直接读取']] },
    };
    const reads = [];
    const host = { SillyTavern: { getContext: () => ({ chat }) }, AutoCardUpdaterAPI: { exportTableAsJson: () => { if (failTables) throw Error('读取失败'); return structuredClone(sheets); } } };
    if (mvu) host.Mvu = { getMvuData: (options) => { reads.push(options); if (failMvu) throw Error('读取失败'); return options.type === 'message' && options.message_id === 0 ? { stat_data: data } : {}; } };
    return { host, data, chat, sheets, reads, read: createCombatGenerationMaterials(host) };
}

test('MVU 取最近有效快照，按角色选技能；数据库过滤归属、未解锁与非技能表，全程不修改源数据', async () => {
    const f = fixture();
    const before = JSON.stringify([f.data, f.sheets]);
    const source = await f.read({ name: '艾拉', protagonist: '艾拉' });
    assert.deepEqual(f.reads, [{ type: 'message', message_id: 1 }, { type: 'message', message_id: 0 }]);
    assert.equal(source.mvuFloor, 0);
    const selected = selectGenerationMaterials(source);
    assert.equal(selected.ok, true);
    assert.deepEqual(selected.materials.mvu.map((m) => m.path), ['/主角/技能', '/主角/装备']);
    assert.deepEqual(selected.materials.tables[0].rows.map((r) => r.技能), ['雷步']);
    assert.equal(source.tables.find((t) => t.name === '能力目录').selected, false);
    assert.equal(JSON.stringify(selected.materials).includes('灭世'), false);
    assert.equal(JSON.stringify([f.data, f.sheets]), before);
});

test('其他角色不继承主角路径；无归属表只在显式选择时纳入', async () => {
    const f = fixture();
    const source = await f.read({ name: '队友', protagonist: '艾拉' });
    assert.equal(source.candidates.some((c) => c.selected), false);
    const selected = selectGenerationMaterials(source, { tableIds: ['sheet_ability'] });
    assert.equal(selected.materials.tables[0].rows[0].名称, '冰墙');
    assert.match(selected.materials.tables[0].ownership, /归属不明/);
});

test('最新空 MVU 快照有效，不回退复活旧技能；读到当前 swipe 而非旧 swipe', async () => {
    const f = fixture();
    f.host.Mvu.getMvuData = () => ({ stat_data: {} });
    const source = await f.read({ name: '艾拉', protagonist: '艾拉' });
    assert.equal(source.mvuFloor, 1);
    assert.deepEqual(source.candidates, []);
});

test('读取失败需要显式关闭相应来源；未安装可照常生成，不允许失效路径或表悄悄漏掉', async () => {
    const source = await fixture({ failMvu: true, failTables: true }).read({ name: '艾拉', protagonist: '艾拉' });
    assert.equal(selectGenerationMaterials(source).reason, 'combat-material-read-failed');
    assert.equal(selectGenerationMaterials(source, { useMvu: false, useTables: false, mvuPaths: ['/不存在'], tableIds: ['不存在'] }).ok, true);
    const missing = await createCombatGenerationMaterials({})({ name: '艾拉' });
    assert.equal(selectGenerationMaterials(missing).ok, true);
    const good = await fixture().read({ name: '艾拉', protagonist: '艾拉' });
    assert.equal(selectGenerationMaterials(good, { mvuPaths: ['/不存在'] }).reason, 'combat-material-path-invalid');
    assert.equal(selectGenerationMaterials(good, { tableIds: ['不存在'] }).reason, 'combat-material-table-missing');
});

test('手动 JSON 指针支持带点、斜杠的中文键；屏蔽原型与敏感字段，素材过量明确拒绝', () => {
    const data = JSON.parse('{"角色.甲":{"技能/特殊":{"雷刃":1}},"__proto__":{"污染":1},"技能":{"password":"秘密","名称":"雷刃"}}');
    assert.equal(readMaterialPath(data, '/角色.甲/技能~1特殊/雷刃'), 1);
    assert.equal(readMaterialPath(data, '/__proto__/污染'), undefined);
    assert.equal(readMaterialPath(data, '/技能/password'), undefined);
    assert.deepEqual(compactMaterial(data.技能), { 名称: '雷刃' });
    const large = { 技能: Array.from({ length: 40 }, () => '术'.repeat(800)) };
    assert.equal(selectGenerationMaterials({ statData: large, candidates: discoverMvuMaterials(large, []), tables: [] }, { mvuPaths: ['/技能'] }).reason, 'combat-material-too-large');
});

test('确认时重读最新技能与用户方向；预览不泄露整份变量；切聊天拒收，方向过长不发请求', async () => {
    const f = fixture();
    let chatId = 'a';
    const service = createCombatMaterialContext({ read: f.read, getChatId: () => chatId, getUserName: () => '艾拉' });
    const preview = await service.inspect({ name: '艾拉' });
    assert.equal(preview.ok, true);
    assert.equal('statData' in preview, false);
    f.data.主角.技能.雷步 = '最新习得';
    const loaded = await service.load({ name: '艾拉', generationHint: '雷系连击', materialChatId: preview.chatId, materialSelection: preview.selection });
    assert.equal(loaded.context.generationHint, '雷系连击');
    assert.equal(loaded.context.characterMaterials.mvu[0].value.雷步, '最新习得');
    chatId = 'b';
    assert.equal((await service.load({ name: '艾拉', materialChatId: preview.chatId })).reason, 'request-stale');
    assert.equal((await service.load({ name: '艾拉', generationHint: '长'.repeat(1601) })).reason, 'combat-generation-hint-too-long');
});

test('异步读取期间切聊天或取消，预览与生成都拒收', async () => {
    let finish;
    let chatId = 'a';
    const service = createCombatMaterialContext({ read: () => new Promise((r) => { finish = r; }), getChatId: () => chatId, getUserName: () => '艾拉' });
    const pending = service.load({ name: '艾拉' });
    chatId = 'b';
    finish({ ok: true });
    assert.equal((await pending).reason, 'request-stale');
});
