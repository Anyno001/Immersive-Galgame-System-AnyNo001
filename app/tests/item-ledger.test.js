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

test('gate: item ledger regained items are not first-time, bulk changes and gaps re-baseline', () => {
    const ledger = createItemLedger({ storage: memoryStorage() });
    ledger.sync('c', items('钥匙'), { messageId: 2, swipeId: 0 });
    ledger.sync('c', [], { messageId: 4, swipeId: 0 });
    ledger.sync('c', items('钥匙'), { messageId: 6, swipeId: 0 });
    assert.deepEqual(ledger.eventsFor('c', 6, 0).map((e) => e.action), ['gain']);
    assert.equal(ledger.isFirst('c', '钥匙', 6), false);
    const many = items(...'ABCDEFGHIJ'.split('').map((c) => `物品${c}`));
    ledger.sync('c', many, { messageId: 8, swipeId: 0 });
    assert.deepEqual(ledger.eventsFor('c', 8, 0), []);
    ledger.sync('c', [...many, ...items('跳楼')], { messageId: 30, swipeId: 0 });
    assert.deepEqual(ledger.eventsFor('c', 30, 0), []);
});

test('gate: item ledger tag items mark their first floor', () => {
    const ledger = createItemLedger({ storage: memoryStorage() });
    assert.equal(ledger.noteTagItems('c', [{ action: 'gain', name: '星之坠饰' }, { action: 'use', name: '药' }], 9), true);
    assert.equal(ledger.isFirst('c', '星之坠饰', 9), true);
    assert.equal(ledger.isFirst('c', '药', 9), false);
    assert.equal(ledger.noteTagItems('c', [{ action: 'gain', name: '星之坠饰' }], 12), false);
    assert.equal(ledger.isFirst('c', '星之坠饰', 12), false);
    assert.deepEqual(ledger.knownItems('c').map((i) => i.name), ['星之坠饰']);
});

test('gate: table events land on the page that first mentions the item, late events play once on the current page', () => {
    const segments = ['清晨。', '她递来黄铜钥匙。', '窗外下雨。'];
    const events = [{ action: 'gain', name: '黄铜钥匙', description: '' }, { action: 'gain', name: '地图', description: '' }];
    const shown = new Set();
    const at = (index, set = shown) => mergeItemEvents({ items: [], itemOverflow: 0 }, { events, segments, index, shown: set, floorKey: 'f' }).items.map((i) => i.name);
    assert.deepEqual(at(0), ['地图']);
    assert.deepEqual(at(1), ['黄铜钥匙']);
    assert.deepEqual(at(2), []);
    // 表格晚到：已经翻到第 3 页才拿到事件，补在当前页播一次。
    const late = new Set();
    assert.deepEqual(at(2, late), ['黄铜钥匙', '地图']);
    assert.deepEqual(at(2, late), []);
    // AI 已写标签的物品不重复。
    const tagged = mergeItemEvents({ items: [], itemOverflow: 0 }, { events, segments, index: 1, shown: new Set(), tagNames: new Set(['黄铜钥匙']) });
    assert.deepEqual(tagged.items.map((i) => i.name), ['地图']);
});

test('gate: first-time gains go to the centre, re-mentions and losses to the corner', () => {
    const fx = { items: [
        { action: 'gain', name: '新物品', first: true },
        { action: 'gain', name: '旧物品', first: false, rarity: 'rare' },
        { action: 'lose', name: '丢了', first: false },
    ] };
    const plan = planItemFx(fx, { settings: { enabled: true }, identity: ID });
    assert.deepEqual(plan.showcases.map((c) => c.name), ['新物品']);
    assert.deepEqual(plan.stackCards.map((c) => c.name), ['旧物品', '丢了']);
    // 没有账本时退回旧规则：只有「重要」走中央。
    const legacy = planItemFx({ items: [{ action: 'gain', name: 'R', rarity: 'rare' }, { action: 'gain', name: 'N' }] }, { settings: { enabled: true }, identity: ID });
    assert.deepEqual(legacy.showcases.map((c) => c.name), ['R']);
});

test('gate: item mentions only wrap text between tags, longest name first', () => {
    const html = '<span class="igs-char" title="黄铜钥匙">她把黄铜钥匙和钥匙递来</span>';
    const out = applyItemMentionMarkup(html, [{ name: '钥匙' }, { name: '黄铜钥匙' }, { name: '笔' }]);
    assert.equal(out, '<span class="igs-char" title="黄铜钥匙">她把<span class="igs-item-mention" data-igs-item="黄铜钥匙">黄铜钥匙</span>和<span class="igs-item-mention" data-igs-item="钥匙">钥匙</span>递来</span>');
    assert.equal(applyItemMentionMarkup('A&amp;B 的盒子', [{ name: 'A&B' }]), '<span class="igs-item-mention" data-igs-item="A&amp;B">A&amp;B</span> 的盒子');
    assert.equal(applyItemMentionMarkup('普通文字', null), '普通文字');
});
