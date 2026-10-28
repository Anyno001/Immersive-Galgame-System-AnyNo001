import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWardrobe } from '../src/visual/igs-ui/settings-outfit-fields.js';

test('衣柜多选渲染：卡片变勾选按钮，不带菜单和大图预览；裸体内置项不出现', () => {
    const wardrobe = { 睡衣: { prompt: 'pajamas' }, 校服: { prompt: 'uniform' }, 裸体: { prompt: '' } };
    const normal = renderWardrobe(wardrobe);
    assert.match(normal, /igs-row-menu/);
    assert.doesNotMatch(normal, /asset-pick:wardrobe/);
    const html = renderWardrobe(wardrobe, { select: new Set(['睡衣']) });
    assert.doesNotMatch(html, /igs-row-menu/);
    assert.doesNotMatch(html, /sprite-preview/);
    assert.match(html, /class="igs-sprite-slot igs-wardrobe-item is-selectable is-picked" data-action="asset-pick:wardrobe:%E7%9D%A1%E8%A1%A3" aria-pressed="true"/);
    assert.match(html, /data-action="asset-pick:wardrobe:%E6%A0%A1%E6%9C%8D" aria-pressed="false"/);
    assert.doesNotMatch(html, /%E8%A3%B8%E4%BD%93/);
    assert.match(html, /已选 1 项/);
    assert.match(html, />全选</);
    assert.match(html, /data-action="asset-delete-picked:wardrobe">删除选中/);
    assert.match(renderWardrobe(wardrobe, { select: new Set() }), /data-action="asset-delete-picked:wardrobe" disabled/);
});

test('衣柜多选批量删除：逐条走单删，引用它的服装解绑，删完退出多选', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const confirms = [];
    const global = { prompt: () => '', confirm: (msg) => { confirms.push(msg); return true; } };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        controller.setValue('bridge.sceneAssets.characters', { 爱丽: { 默认: '' } });
        controller.setValue('bridge.sceneAssets.wardrobe', { 睡衣: { prompt: 'pajamas' }, 校服: { prompt: 'uniform' }, 泳装: { prompt: 'swimsuit' } });
        controller.setValue('bridge.sceneAssets.characterOutfits', { 爱丽: { 居家: { wardrobe: '睡衣', moods: {} } } });
        let html = controller.switchPage('wardrobe').html || controller.getSnapshot().html;
        assert.match(html, /data-action="asset-select:wardrobe" aria-pressed="false">多选</);
        html = (await controller.invoke('asset-select:wardrobe')).snapshot.html;
        assert.match(html, /aria-pressed="true">完成</);
        assert.match(html, /已选 0 项/);
        await controller.invoke(`asset-pick:wardrobe:${encodeURIComponent('睡衣')}`);
        html = (await controller.invoke(`asset-pick:wardrobe:${encodeURIComponent('校服')}`)).snapshot.html;
        assert.match(html, /已选 2 项/);
        html = (await controller.invoke('asset-delete-picked:wardrobe')).snapshot.html;
        const assets = controller.getSnapshot().draft.bridge.sceneAssets;
        assert.deepEqual(Object.keys(assets.wardrobe).filter((name) => name !== '裸体'), ['泳装']);
        assert.equal('wardrobe' in assets.characterOutfits.爱丽.居家, false);
        assert.doesNotMatch(html, /已选 \d+ 项/);
        assert.match(html, /aria-pressed="false">多选</);
    } finally { vn.destroy(); }
});
