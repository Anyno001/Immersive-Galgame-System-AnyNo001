import { createItemImageService } from './helpers/media-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { itemAssetKeyOf } from '../src/generated-images/illustration/item-image-service.js';

const TEXT = '[igs-fx:item|获得|黄铜钥匙|旧钥匙]\n她把钥匙递过来。';
const TABLES = { ok: true, data: { a: { uid: 'sheet_a', name: '物品表', content: [['物品名称', '描述'], ['信', '一封信'], ['黄铜钥匙', ''], ['药水', ''], ['地图', '']] } } };

function setup(overrides = {}) {
    const calls = { llm: 0, nai: [], tables: 0 };
    let chatId = 'chat-1';
    let id = 0;
    const store = createMemoryGeneratedAssetStore();
    const service = createItemImageService({
        messageHost: {
            getChatId: () => chatId,
            readFloor: () => ({ chatId, messageId: 5, swipeId: 0, isAi: true, isLatest: true, text: TEXT }),
            on: () => () => {},
        },
        llm: { async request() { calls.llm += 1; return 'id: ch1\ntags: brass key\nid: ch2\ntags: letter\nid: ch3\ntags: potion'; } },
        nai: { async generate(slot, settings) {
            calls.nai.push({ slot, size: settings.size });
            return overrides.generate ? overrides.generate(calls.nai.length) : { ok: true, dataUrl: `data:image/png;base64,${calls.nai.length}` };
        } },
        store,
        readTables: () => { calls.tables += 1; return TABLES; },
        matte: async (url) => `${url}#m`,
        getSettings: () => ({ itemImages: { enabled: overrides.enabled !== false } }),
        newId: () => `img${++id}`,
    });
    return { service, store, calls, setChat: (next) => { chatId = next; } };
}

test('item-image:disabled-short-circuits-without-reading-tables-or-network', async () => {
    const { service, calls } = setup({ enabled: false });
    assert.equal((await service.processMessage(5)).reason, 'disabled');
    assert.equal((await service.fillMissing()).reason, 'disabled');
    assert.equal((await service.regenerate('信')).reason, 'disabled');
    assert.deepEqual([calls.llm, calls.nai.length, calls.tables], [0, 0, 0]);
});
