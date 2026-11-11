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

test('手动 JSON 指针支持带点、斜杠的中文键；屏蔽原型与敏感字段，素材过量明确拒绝', () => {
    const data = JSON.parse('{"角色.甲":{"技能/特殊":{"雷刃":1}},"__proto__":{"污染":1},"技能":{"password":"秘密","名称":"雷刃"}}');
    assert.equal(readMaterialPath(data, '/角色.甲/技能~1特殊/雷刃'), 1);
    assert.equal(readMaterialPath(data, '/__proto__/污染'), undefined);
    assert.equal(readMaterialPath(data, '/技能/password'), undefined);
    assert.deepEqual(compactMaterial(data.技能), { 名称: '雷刃' });
    const large = { 技能: Array.from({ length: 40 }, () => '术'.repeat(800)) };
    assert.equal(selectGenerationMaterials({ statData: large, candidates: discoverMvuMaterials(large, []), tables: [] }, { mvuPaths: ['/技能'] }).reason, 'combat-material-too-large');
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
