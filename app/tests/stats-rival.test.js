import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStatsRivals, registerStatsRivals, resolveRomanceRivalSpeaker } from '../src/visual/igs-ui/romance-runtime.js';

// 别名表格式与 resolveCharacterKey 一致：{ 正名: [别名…] }。
const sceneAssets = { characters: { 小雪: {}, 阿澄: {} }, characterAliases: { 阿澄: ['澄'] } };
const page = (speaker, fx = { romance: 'ambiguous', romanceAt: 0, romanceTarget: '小雪' }) => ({ fx, spriteCharacter: speaker, speaker });

test('数值系统吃醋的角色算修罗场情敌；主对象仍只认第 3 栏；别名归一；换聊天清空（§5.3）', () => {
    clearStatsRivals();
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    registerStatsRivals(['澄']);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), true);
    assert.equal(resolveRomanceRivalSpeaker(page('小雪'), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄', { romance: 'ambiguous', romanceAt: 0, romanceTarget: '' }), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄', {}), sceneAssets, '主角'), false);
    clearStatsRivals();
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    registerStatsRivals(['', null, 3]);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
});
