import test from 'node:test';
import assert from 'node:assert/strict';

// 打开角色卡时场景存在本卡库里：添加 / 删除别名、添加时间与天气都要写进本卡那份，不能读全局找不到条目而静默不写。
function scoped(scene) {
    const assets = { scenes: {}, cards: { 'card:Current': { scenes: { 酒馆: scene } } } };
    const settings = { draft: { bridge: { sceneAssets: assets }, readerSettings: {} }, asyncState: { assetScopeKey: 'card:Current' } };
    return { assets, settings };
}

async function run(action, settings, answer) {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    let saved = 0;
    await handleSettingsAction(action, {
        state: { activeSettings: settings },
        options: { global: { alert() {}, SillyTavern: { getContext: () => ({ name2: 'Current' }) } } },
        dialogs: { confirm: async () => true, prompt: async () => answer, alert() {} },
        persistSettingsDraft: () => { saved += 1; return { ok: true }; }, rerenderSettings: () => ({ ok: true }) });
    return saved;
}

test('本卡场景可以添加和删除别名', async () => {
    const { assets, settings } = scoped({ url: '', times: {} });
    assert.equal(await run(`scene-add-bg-word:${encodeURIComponent('酒馆')}`, settings, '小酒馆'), 1);
    assert.deepEqual(assets.cards['card:Current'].scenes.酒馆.words, ['小酒馆']);
    assert.equal(assets.scenes.小酒馆, undefined);
    await run(`scene-remove-bg-word:${encodeURIComponent('酒馆')}:${encodeURIComponent('小酒馆')}`, settings);
    assert.deepEqual(assets.cards['card:Current'].scenes.酒馆.words, []);
});

test('本卡场景可以添加时间与天气', async () => {
    const { assets, settings } = scoped({ url: '', times: {} });
    await run(`scene-add-time:${encodeURIComponent('酒馆')}`, settings, '夜晚');
    assert.ok(assets.cards['card:Current'].scenes.酒馆.times.夜晚);
    await run(`scene-add-weather:${encodeURIComponent('酒馆')}:${encodeURIComponent('夜晚')}`, settings, '下雨');
    assert.ok(assets.cards['card:Current'].scenes.酒馆.times.夜晚.weathers.下雨);
});
