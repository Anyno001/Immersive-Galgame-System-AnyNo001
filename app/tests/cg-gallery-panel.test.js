import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { createMemoryCgGalleryStore } from '../src/media/cg-gallery-store.js';
import { createCgGalleryService } from '../src/media/cg-gallery-service.js';
import { createCgGalleryPanel } from '../src/visual/igs-ui/cg-gallery-panel.js';

function fakeDoc() {
    const doc = { activeElement: null };
    doc.createElement = (tag) => {
        const attrs = new Map();
        const listeners = new Map();
        const el = {
            tagName: String(tag).toUpperCase(), children: [], parentNode: null, innerHTML: '', id: '',
            setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener(t) { listeners.delete(t); },
            appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
            remove() { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((c) => c !== el); el.parentNode = null; },
            listeners,
        };
        return el;
    };
    return doc;
}

const button = (act, key = '') => ({ getAttribute: (name) => (name === 'data-cg-act' ? act : name === 'data-cg-key' ? key : null), parentNode: null });

async function setup({ confirm = () => true, chat = 'chat-1' } = {}) {
    const illustrationStore = createMemoryIllustrationStore();
    await illustrationStore.putSlot('chat-1|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,A' });
    await illustrationStore.putSlot('chat-1|4|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,B' });
    await illustrationStore.putSlot('chat-2|7|0', { slot: 2, status: 'done', dataUrl: 'data:image/png;base64,C' });
    await illustrationStore.putSlot('chat-2|8|0', { slot: 1, status: 'failed' });
    const galleryStore = createMemoryCgGalleryStore();
    const cleared = [];
    const service = createCgGalleryService({ illustrationStore, galleryStore, clearIllustration: async (id) => {
        cleared.push(id);
        await illustrationStore.deleteSlot(`${id.chatId}|${id.messageId}|${id.swipeId}`, id.slot);
        return { ok: true };
    } });
    const jumps = [];
    const asked = [];
    const doc = fakeDoc();
    const container = doc.createElement('div');
    const panel = createCgGalleryPanel(doc, { service, getChatId: () => chat, confirm: (m) => { asked.push(m); return confirm(m); }, onJump: (e) => jumps.push(e.messageId) });
    assert.equal(panel.open(container).ok, true);
    await panel.whenIdle();
    const root = container.children[0];
    const click = async (act, key) => { root.listeners.get('click')({ target: button(act, key) }); await panel.whenIdle(); };
    return { panel, root, container, click, cleared, jumps, asked, illustrationStore, galleryStore };
}

test('cg-gallery-panel:lists-done-cgs-and-jump-only-for-current-chat', async () => {
    const { panel, root, click, jumps } = await setup();
    assert.equal(panel.getState().count, 3);
    assert.equal((root.innerHTML.match(/class="igs-cg-tile/g) || []).length, 3);
    assert.equal((root.innerHTML.match(/data-cg-act="jump"/g) || []).length, 2);
    await click('jump', 'chat-1|3|0|1');
    await click('jump', 'chat-2|7|0|2');
    assert.deepEqual(jumps, [3]);
});

test('cg-gallery-panel:click-thumb-opens-viewer-outside-scroll-panel-and-click-closes', async () => {
    const { panel, root, container, click } = await setup();
    await click('view', 'chat-2|7|0|2');
    // 大图层挂在容器上，不在滚动的面板内部，避免随网格滚走。
    const viewer = container.children.find((c) => c.id === 'igs-cg-viewer');
    assert.ok(viewer);
    assert.match(viewer.innerHTML, /base64,C/);
    assert.doesNotMatch(root.innerHTML, /igs-cg-viewer/);
    assert.equal(panel.getState().viewing, 'chat-2|7|0|2');
    let stopped = 0;
    viewer.listeners.get('click')({ stopPropagation: () => { stopped += 1; } });
    assert.equal(stopped, 1);
    assert.equal(container.children.some((c) => c.id === 'igs-cg-viewer'), false);
    assert.equal(panel.getState().viewing, '');
    await click('view', 'chat-1|3|0|1');
    assert.equal(panel.close().ok, true);
    assert.equal(container.children.length, 0);
});

test('cg-gallery-panel:hide-and-favorite-write-marks-only-and-filters-apply', async () => {
    const { panel, click, illustrationStore, galleryStore } = await setup();
    await click('hide', 'chat-1|3|0|1');
    assert.equal(panel.getState().count, 2);
    assert.equal((await galleryStore.get('chat-1|3|0|1')).hidden, true);
    assert.equal((await illustrationStore.getSlots('chat-1|3|0')).length, 1);
    await click('filter-hidden');
    assert.equal(panel.getState().count, 3);
    await click('favorite', 'chat-2|7|0|2');
    await click('filter-favorite');
    assert.equal(panel.getState().count, 1);
    await click('filter-favorite');
    await click('filter-chat');
    assert.equal(panel.getState().count, 2);
});

test('cg-gallery-panel:delete-requires-confirmation-then-clears-floor-cg', async () => {
    const declined = await setup({ confirm: () => false });
    await declined.click('delete', 'chat-1|4|0|1');
    assert.equal(declined.asked.length, 1);
    assert.match(declined.asked[0], /楼层里的这张图也会一起消失/);
    assert.deepEqual(declined.cleared, []);
    assert.equal(declined.panel.getState().count, 3);
    const accepted = await setup();
    await accepted.click('delete', 'chat-1|4|0|1');
    assert.deepEqual(accepted.cleared, [{ chatId: 'chat-1', messageId: 4, swipeId: 0, slot: 1 }]);
    assert.equal(accepted.panel.getState().count, 2);
    assert.equal(accepted.panel.getState().notice, '已删除');
});

test('cg-gallery-panel:delete-listed-confirms-then-clears-every-shown-cg', async () => {
    const declined = await setup({ confirm: () => false });
    await declined.click('delete-listed');
    assert.equal(declined.panel.getState().count, 3);
    assert.equal(declined.cleared.length, 0);
    const accepted = await setup();
    await accepted.click('delete-listed');
    assert.equal(accepted.cleared.length, 3);
    assert.equal(accepted.panel.getState().count, 0);
    assert.match(accepted.panel.getState().notice, /已删除 3 张/);
});

test('cg-gallery-panel:keys-do-not-bubble-and-close-unbinds', async () => {
    const { panel, root, container } = await setup();
    let stopped = 0;
    root.listeners.get('keydown')({ key: ' ', stopPropagation: () => { stopped += 1; } });
    root.listeners.get('keydown')({ key: 'Enter', stopPropagation: () => { stopped += 1; } });
    assert.equal(stopped, 2);
    assert.equal(panel.close().ok, true);
    assert.equal(root.listeners.size, 0);
    assert.equal(container.children.length, 0);
    assert.equal(panel.isOpen(), false);
});

test('cg-gallery-panel:lists-the-whole-library-without-a-next-page', async () => {
    const illustrationStore = createMemoryIllustrationStore();
    for (let i = 0; i < 50; i += 1) {
        await illustrationStore.putSlot(`chat-1|${i}|0`, { slot: 1, status: 'done', dataUrl: `data:image/png;base64,${i}` });
    }
    const service = createCgGalleryService({ illustrationStore, clearIllustration: async () => ({ ok: true }) });
    const doc = fakeDoc();
    const container = doc.createElement('div');
    const panel = createCgGalleryPanel(doc, { service, getChatId: () => 'chat-1' });
    panel.open(container);
    await panel.whenIdle();
    assert.equal(panel.getState().count, 50);
    assert.equal(panel.getState().exhausted, true);
    assert.doesNotMatch(container.children[0].innerHTML, /加载更多/);
    panel.close();
});

test('cg-gallery-panel:missing-service-shows-unavailable-without-throwing', async () => {
    const doc = fakeDoc();
    const container = doc.createElement('div');
    const panel = createCgGalleryPanel(doc, {});
    panel.open(container);
    await panel.whenIdle();
    assert.equal(panel.getState().notice, 'CG 库不可用');
    panel.close();
});
