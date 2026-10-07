import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createMemoryAssetThumbStore } from '../src/media/asset-thumb-store.js';

function setup() {
    const records = new Map([['a', { id: 'a', type: 'sprite', dataUrl: 'data:image/png;base64,QUJDREVGR0g=', revision: 1 }]]);
    const store = {
        reads: 0,
        async getImage(id) { this.reads += 1; return records.get(id) || null; },
        async putImage(record) { records.set(record.id, record); },
        async deleteImage(id) { records.delete(id); },
    };
    const thumbStore = createMemoryAssetThumbStore();
    const made = [];
    let blobs = 0;
    const events = { list: [], emit(type, detail) { this.list.push(detail); } };
    const service = createAssetGenerationService({
        messageHost: { getChatId: () => '' },
        store,
        events,
        thumbStore,
        makeThumb: async (src) => { made.push(src); return 'data:image/webp;base64,U01BTEw='; },
        urlApi: { createObjectURL: () => `blob:thumb-${++blobs}`, revokeObjectURL() {} },
        Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
    });
    return { service, store, thumbStore, made, events };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('asset-thumbs: 设置页缩略图是生成一次的小图，存起来，原图只读一次', async () => {
    const { service, store, thumbStore, made, events } = setup();
    assert.equal(service.resolveThumbUrl('igs-gen:a'), '', '第一次还没准备好');
    await settle(); await settle();
    const url = service.resolveThumbUrl('igs-gen:a');
    assert.equal(url, 'blob:thumb-1');
    assert.equal(made.length, 1);
    assert.equal(await thumbStore.get('a'), 'data:image/webp;base64,U01BTEw=', '小图存进小图库');
    assert.ok(events.list.some((e) => e.imageId === 'a' && e.reason === 'image-loaded'));
    assert.equal(service.thumbSourceId(url), 'a', '点小图看大图时能找回原图编号');
    assert.equal(store.reads, 1);

    // 新开一个服务（相当于刷新页面）：小图库里有，就不再读原图。
    const again = setup();
    await again.thumbStore.put('a', 'data:image/webp;base64,U01BTEw=');
    again.service.resolveThumbUrl('igs-gen:a');
    await settle(); await settle();
    assert.ok(again.service.resolveThumbUrl('igs-gen:a').startsWith('blob:'));
    assert.equal(again.store.reads, 0, '没读原图');
    assert.equal(again.made.length, 0);
});

test('asset-thumbs: 图被覆盖或删掉时旧小图作废', async () => {
    const { service, thumbStore } = setup();
    service.resolveThumbUrl('igs-gen:a');
    await settle(); await settle();
    await service.writeStoredImage({ id: 'a', type: 'sprite', dataUrl: 'data:image/png;base64,TkVX' });
    await settle();
    assert.equal(await thumbStore.get('a'), '', '导入覆盖后小图删掉，下次重新生成');
    assert.equal(service.resolveThumbUrl('igs-gen:a'), '', '内存里的旧小图也不用了');
    await settle(); await settle();
    await service.deleteImages(['a']);
    await settle();
    assert.equal(await thumbStore.get('a'), '');
});
