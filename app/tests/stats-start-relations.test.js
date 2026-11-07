import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStartRelationRequest, parseStartRelationReply } from '../src/scene/stats/stat-sheets.js';
import { DEFAULT_STAT_PROMPTS } from '../src/scene/stats/stat-prompt.js';
import { readStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createSettingsDialogs } from '../src/visual/igs-ui/settings-dialog.js';

test('起始关系补填：只收名单内角色与白名单档位，近义词归一，数字丢弃', () => {
    const reply = '```json\n{"林夏":"青梅竹马","苏晴":"朋友","路人甲":"恋人","周默":"50","陈一":"好得很"}\n```';
    const r = parseStartRelationReply(reply, { names: ['林夏', '苏晴', '周默', '陈一'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.relations, { 林夏: '亲密', 苏晴: '朋友' });
    assert.equal(parseStartRelationReply('没有 JSON', { names: ['林夏'] }).ok, false);
    assert.equal(parseStartRelationReply('{"林夏":"7"}', { names: ['林夏'] }).ok, false);
});

test('起始关系补填：提示词可在设置里覆盖，请求带上角色资料', () => {
    assert.ok(DEFAULT_STAT_PROMPTS.startRelations.includes('恋人'));
    const req = buildStartRelationRequest([{ name: '林夏', summary: '主角的青梅竹马' }], { prompt: '自定义' });
    assert.equal(req.system, '自定义');
    assert.ok(req.user.includes('【林夏】主角的青梅竹马'));
    assert.equal(buildStartRelationRequest([{ name: '林夏', summary: '' }]).system, DEFAULT_STAT_PROMPTS.startRelations);
    const stored = readStatsSettings({ promptsVersion: 3, prompts: { startRelations: '我的提示词' } });
    assert.equal(stored.prompts.startRelations, '我的提示词');
});

test('起始关系补填：请求带上主角资料，没有时不写这一行', () => {
    const req = buildStartRelationRequest([{ name: '林夏', summary: '' }], { hero: '林夏一直暗恋我' });
    assert.ok(req.user.includes('主角资料：林夏一直暗恋我'));
    assert.ok(req.user.indexOf('主角资料') < req.user.indexOf('角色资料'));
    assert.ok(!buildStartRelationRequest([{ name: '林夏', summary: '' }]).user.includes('主角资料'));
    assert.ok(DEFAULT_STAT_PROMPTS.startRelations.includes('主角资料'));
});

test('忙碌提示：没有面板时不阻塞，close 可重复调用', async () => {
    const dialogs = createSettingsDialogs({ getContainer: () => null, fallback: (kind) => kind === 'busy' });
    const busy = dialogs.busy('正在计算');
    assert.equal(await busy.done, true);
    busy.close();
    busy.close();
    assert.equal(dialogs.isOpen(), false);
});

test('起始关系补填：回复可带修饰，修饰不认识的丢弃但关系档保留', () => {
    const r = parseStartRelationReply('{"林夏":"恋人+猜忌","苏晴":"朋友+乱写","周默":"疏远+积怨+心结+戒备"}', { names: ['林夏', '苏晴', '周默'] });
    assert.deepEqual(r.relations, { 林夏: '恋人', 苏晴: '朋友', 周默: '疏远' });
    assert.deepEqual(r.mods, { 林夏: ['猜忌'], 周默: ['积怨', '心结'] });
    assert.ok(DEFAULT_STAT_PROMPTS.startRelations.includes('猜忌'));
});
