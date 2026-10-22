import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItemLedger, ITEM_LEDGER_KEY } from '../src/data/shujuku/item-ledger.js';
import { mergeItemEvents, planItemFx } from '../src/visual/igs-ui/fx-item-model.js';
import { applyItemMentionMarkup } from '../src/visual/igs-ui/fx-item-render.js';

function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}
const items = (...names) => names.map((name) => ({ name, description: `${name}的描述` }));
const ID = { chatId: 'c', messageId: 1, swipeId: 0, page: 0 };

test('gate: item ledger baselines silently, then records gains and losses of the latest floor', () => {
    const storage = memoryStorage();
    const ledger = createItemLedger({ storage });
    assert.equal(ledger.sync('c', items('钥匙', '信'), { messageId: 4, swipeId: 0 }).baseline, true);
    assert.deepEqual(ledger.eventsFor('c', 4, 0), []);
    assert.equal(ledger.isFirst('c', '钥匙', 4), false);
    ledger.sync('c', items('钥匙', '信'), { messageId: 6, swipeId: 0 });
    const result = ledger.sync('c', items('钥匙', '药水'), { messageId: 6, swipeId: 0 });
    assert.equal(result.changed, true);
    assert.deepEqual(ledger.eventsFor('c', 6, 0).map((e) => `${e.action}:${e.name}`), ['gain:药水', 'lose:信']);
    assert.equal(ledger.isFirst('c', '药水', 6), true);
    // 同一楼再同步一次：事件不重复。
    assert.equal(ledger.sync('c', items('钥匙', '药水'), { messageId: 6, swipeId: 0 }).changed, false);
    // 换一个 swipe：仍按这一楼开始前的表格比对。
    ledger.sync('c', items('钥匙', '信', '地图'), { messageId: 6, swipeId: 1 });
    assert.deepEqual(ledger.eventsFor('c', 6, 1).map((e) => `${e.action}:${e.name}`), ['gain:地图']);
    assert.ok(storage.getItem(ITEM_LEDGER_KEY).includes('药水'));
    assert.equal(createItemLedger({ storage }).isFirst('c', '药水', 6), true);
});
