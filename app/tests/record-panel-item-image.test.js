import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordPanelController } from '../src/visual/igs-ui/record-panel.js';

// 最小假 DOM：innerHTML 保留为字符串，只断言渲染结果，不依赖真实布局。
function fakeElement(doc, tag) {
    const attrs = new Map();
    const listeners = new Map();
    const el = {
        tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], parentNode: null,
        innerHTML: '', textContent: '', id: '', className: '', scrollTop: 0,
        style: { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { this[k] = ''; } },
        classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
        setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        removeAttribute(k) { attrs.delete(k); },
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        remove() { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((c) => c !== el); el.parentNode = null; },
        contains(node) { return node === el || el.children.some((c) => c.contains && c.contains(node)); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { width: 1280, height: 800, top: 0, left: 0, right: 1280, bottom: 800 }; },
        focus() {},
        listeners,
    };
    return el;
}

function fakeDocument() {
    const doc = { activeElement: null, defaultView: null };
    doc.createElement = (tag) => fakeElement(doc, tag);
    doc.body = fakeElement(doc, 'body');
    doc.defaultView = { innerWidth: 1280, innerHeight: 800, setTimeout, clearTimeout };
    return doc;
}

const API = {
    exportTableAsJson() {
        return { sheet_items: { uid: 'sheet_items', name: '物品与装备表', content: [['row_id', '物品名称', '数量', '描述'], [1, '旧钥匙', 1, '刻痕已经磨浅'], [2, '信', 1, '']] } };
    },
    registerTableUpdateCallback() {},
    unregisterTableUpdateCallback() {},
};

function openPanel({ mode = 'image', images = {} } = {}) {
    const doc = fakeDocument();
    const overlay = doc.createElement('div');
    doc.body.appendChild(overlay);
    const subscribers = new Set();
    const store = { ...images };
    const panel = createRecordPanelController(doc, { AutoCardUpdaterAPI: API }, null, {
        getItemIconMode: () => mode,
        resolveItemImage: (name) => store[name] || '',
        subscribeItemImages: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    });
    assert.equal(panel.open(overlay, {}, 'inventory').ok, true);
    const root = overlay.children.find((c) => c.id === 'igs-record-panel');
    return { panel, root, subscribers, store };
}

test('record-panel-item-image:image-choice-shows-generated-image-and-svg-for-missing', () => {
    const { panel, root } = openPanel({ images: { 旧钥匙: 'data:image/png;base64,KEY' } });
    assert.ok(root, 'panel root mounted');
    assert.match(root.innerHTML, /<img class="igs-record-item-image" src="data:image\/png;base64,KEY"/);
    assert.equal((root.innerHTML.match(/igs-record-item-image/g) || []).length >= 1, true);
    assert.match(root.innerHTML, /igs-record-slot-icon" aria-hidden="true"><svg/);
    panel.close();
});

test('record-panel-item-image:svg-choice-never-renders-generated-images', () => {
    const { panel, root } = openPanel({ mode: 'svg', images: { 旧钥匙: 'data:image/png;base64,KEY', 信: 'data:image/png;base64,LETTER' } });
    assert.doesNotMatch(root.innerHTML, /igs-record-item-image/);
    assert.doesNotMatch(root.innerHTML, /base64,KEY/);
    panel.close();
});

test('record-panel-item-image:late-image-rerenders-and-close-unsubscribes', () => {
    const { panel, root, subscribers, store } = openPanel();
    assert.doesNotMatch(root.innerHTML, /igs-record-item-image/);
    assert.equal(subscribers.size, 1);
    store['信'] = 'data:image/png;base64,LETTER';
    for (const fn of subscribers) fn();
    assert.match(root.innerHTML, /base64,LETTER/);
    panel.close();
    assert.equal(subscribers.size, 0);
});

test('record-panel-item-image:no-image-options-keeps-original-svg-behavior', () => {
    const doc = fakeDocument();
    const overlay = doc.createElement('div');
    const panel = createRecordPanelController(doc, { AutoCardUpdaterAPI: API });
    assert.equal(panel.open(overlay, {}, 'inventory').ok, true);
    const root = overlay.children.find((c) => c.id === 'igs-record-panel');
    assert.doesNotMatch(root.innerHTML, /igs-record-item-image/);
    assert.match(root.innerHTML, /igs-record-slot-icon" aria-hidden="true"><svg/);
    panel.close();
});
