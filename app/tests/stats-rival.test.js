import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStatsRivals, registerStatsRivals, resolveRomanceRivalSpeaker, setStatsRivalProvider } from '../src/visual/igs-ui/romance-runtime.js';

// 别名表格式与 resolveCharacterKey 一致：{ 正名: [别名…] }。
const sceneAssets = { characters: { 小雪: {}, 阿澄: {} }, characterAliases: { 阿澄: ['澄'] } };
const page = (speaker, fx = { romance: 'ambiguous', romanceAt: 0, romanceTarget: '小雪' }) => ({ fx, spriteCharacter: speaker, speaker });

test('情敌由数值系统 provider 实时给出；主对象仍只认第 3 栏；别名归一；旧的登记/清空接口为空操作', () => {
    setStatsRivalProvider(null);
    registerStatsRivals(['澄']);
    clearStatsRivals();
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    setStatsRivalProvider(() => new Set(['澄']));
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), true);
    assert.equal(resolveRomanceRivalSpeaker(page('小雪'), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄', { romance: 'ambiguous', romanceAt: 0, romanceTarget: '' }), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄', {}), sceneAssets, '主角'), false);
    setStatsRivalProvider(() => new Set(['', 'x']));
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    setStatsRivalProvider(null);
});
