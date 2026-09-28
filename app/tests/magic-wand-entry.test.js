import test from 'node:test';
import assert from 'node:assert/strict';
import { createMagicWandEntry } from '../src/host/magic-wand-entry.js';

const ENTRY = '[data-igs-magic-entry="1"]';

function createDocument() {
    const clickListeners = new Set();
    const doc = {
        body: null,
        createElement(tagName) { return createElement(tagName, doc); },
        querySelectorAll(selector) { return descendants(this.body, selector); },
        getElementById(id) { return descendants(this.body, `#${id}`)[0] || null; },
        addEventListener(type, handler) { if (type === 'click') clickListeners.add(handler); },
        removeEventListener(type, handler) { if (type === 'click') clickListeners.delete(handler); },
        click(target) {
            const event = { target, preventDefault() {}, stopPropagation() {} };
            for (const handler of clickListeners) handler(event);
        },
        get clickListenerCount() { return clickListeners.size; },
    };
    doc.body = doc.createElement('body');
    return doc;
}

function matches(node, selector) {
    return selector.split(',').some((part) => {
        const value = part.trim();
        if (value === '.extensions_block .list-group') {
            return node.classList.contains('list-group')
                && node.parentNode?.classList.contains('extensions_block');
        }
        if (value.startsWith('#')) return node.id === value.slice(1);
        if (value.startsWith('.')) return node.classList.contains(value.slice(1));
        if (value === ENTRY) return node.getAttribute('data-igs-magic-entry') === '1';
        return false;
    });
}

function descendants(root, selector) {
    if (!root) return [];
    return root.children.flatMap((child) => [
        ...(matches(child, selector) ? [child] : []),
        ...descendants(child, selector),
    ]);
}

function createElement(tagName, doc) {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
        tagName: tagName.toUpperCase(), ownerDocument: doc,
        id: '', className: '', children: [], parentNode: null, parentElement: null,
        classList: { contains(name) { return element.className.split(/\s+/).includes(name); } },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) || null; },
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
        appendChild(child) { child.parentNode = element; child.parentElement = element; element.children.push(child); return child; },
        remove() {
            if (element.parentNode) element.parentNode.children = element.parentNode.children.filter((child) => child !== element);
            element.parentNode = null; element.parentElement = null;
        },
        matches(selector) { return matches(element, selector); },
        closest(selector) {
            let cursor = element;
            while (cursor) { if (cursor.matches(selector)) return cursor; cursor = cursor.parentNode; }
            return null;
        },
        querySelectorAll(selector) { return descendants(element, selector); },
        querySelector(selector) { return element.querySelectorAll(selector)[0] || null; },
    };
    return element;
}

function createHarness({ documents = [createDocument()], observer = true, failDocument = null, retryIntervalMs } = {}) {
    const observers = [];
    const timers = new Map();
    const cleared = [];
    const opened = [];
    class FakeObserver {
        constructor(callback) {
            this.callback = callback;
            this.targets = [];
            this.disconnected = false;
            observers.push(this);
        }
        observe(target) {
            if (target === failDocument?.body) throw new Error('cannot observe');
            this.targets.push(target);
        }
        disconnect() { this.disconnected = true; }
        emit(records) { this.callback(records); }
    }
    const global = {
        document: documents[0],
        setInterval(callback, delay) { const id = timers.size + cleared.length + 1; timers.set(id, { callback, delay }); return id; },
        clearInterval(id) { cleared.push(id); timers.delete(id); },
    };
    if (observer) global.MutationObserver = FakeObserver;
    if (documents[1]) global.top = { document: documents[1] };
    const entry = createMagicWandEntry({
        global,
        version: 'test',
        open(mode) { opened.push(mode); return { ok: true }; },
        ...(retryIntervalMs === undefined ? {} : { retryIntervalMs }),
    });
    return { entry, documents, observers, timers, cleared, opened };
}

test('gate:magic-wand:complete observation ignores unrelated DOM and restores menus', () => {
    const doc = createDocument();
    const menu = doc.createElement('div');
    menu.id = 'extensionsMenu';
    doc.body.appendChild(menu);
    let queries = 0;
    const querySelectorAll = doc.querySelectorAll.bind(doc);
    doc.querySelectorAll = (selector) => { queries++; return querySelectorAll(selector); };
    const { entry, observers, timers, opened } = createHarness({ documents: [doc] });
    assert.deepEqual(entry.attach(), { ok: true, menus: 1, entries: 1 });
    assert.deepEqual(observers[0].targets, [doc.body]);
    assert.equal(timers.size, 0, 'complete coverage needs no interval');
    const unrelated = doc.createElement('div');
    doc.body.appendChild(unrelated);
    const before = queries;
    observers[0].emit([{ target: doc.body, addedNodes: [unrelated], removedNodes: [] }]);
    assert.equal(queries, before, 'unrelated mutation must not scan the document');

    const removedButton = menu.querySelector(ENTRY);
    removedButton.remove();
    observers[0].emit([{ target: menu, addedNodes: [], removedNodes: [removedButton] }]);
    assert.ok(menu.querySelector(ENTRY));
    assert.notEqual(menu.querySelector(ENTRY), removedButton);
    assert.ok(queries > before, 'entry removal must trigger ensure');

    menu.remove();
    const replacement = doc.createElement('div');
    replacement.id = 'extensions_menu';
    doc.body.appendChild(replacement);
    observers[0].emit([{ target: doc.body, addedNodes: [replacement], removedNodes: [menu] }]);
    const button = replacement.querySelector(ENTRY);
    assert.ok(button, 'replacement menu must receive an entry');
    doc.click(button);
    assert.deepEqual(opened, ['pc'], 'delegated click must still open');
    entry.destroy();
    assert.equal(observers[0].disconnected, true);
    assert.equal(replacement.querySelector(ENTRY), null);
    assert.equal(doc.clickListenerCount, 0);
    doc.click(button);
    assert.deepEqual(opened, ['pc'], 'destroy must remove delegated handler');
});

test('gate:magic-wand:nested extensions menu is detected when its wrapper is added', () => {
    const doc = createDocument();
    const { entry, observers, timers } = createHarness({ documents: [doc] });
    assert.equal(entry.attach().reason, 'menu-not-found');
    assert.equal(timers.size, 0);
    const wrapper = doc.createElement('div');
    wrapper.className = 'extensions_block';
    const list = doc.createElement('div');
    list.className = 'list-group';
    wrapper.appendChild(list);
    doc.body.appendChild(wrapper);
    observers[0].emit([{ target: doc.body, addedNodes: [wrapper], removedNodes: [] }]);
    assert.ok(list.querySelector(ENTRY));
    entry.destroy();
    assert.equal(list.querySelector(ENTRY), null);
});

test('gate:magic-wand:fully observed candidate documents do not poll', () => {
    const first = createDocument();
    const second = createDocument();
    const { entry, observers, timers } = createHarness({ documents: [first, second] });
    assert.equal(entry.attach().reason, 'menu-not-found');
    assert.deepEqual(observers[0].targets, [first.body, second.body]);
    assert.equal(timers.size, 0);
    const menu = second.createElement('div');
    menu.id = 'extensions_menu';
    second.body.appendChild(menu);
    observers[0].emit([{ target: second.body, addedNodes: [menu], removedNodes: [] }]);
    assert.ok(menu.querySelector(ENTRY));
    entry.destroy();
    assert.equal(menu.querySelector(ENTRY), null);
});

test('gate:magic-wand:missing observer keeps polling until destroy', () => {
    const doc = createDocument();
    const { entry, observers, timers, cleared } = createHarness({ documents: [doc], observer: false });
    assert.equal(entry.attach().reason, 'menu-not-found');
    assert.equal(observers.length, 0);
    assert.equal(timers.size, 1);
    const [id, timer] = [...timers.entries()][0];
    assert.equal(timer.delay, 5000);
    const menu = doc.createElement('div');
    menu.id = 'extensionsMenu';
    doc.body.appendChild(menu);
    timer.callback();
    assert.ok(menu.querySelector(ENTRY));
    entry.destroy();
    assert.deepEqual(cleared, [id]);
    assert.equal(timers.size, 0);
    assert.equal(menu.querySelector(ENTRY), null);
});

test('gate:magic-wand:partially observed documents keep fallback polling', () => {
    const first = createDocument();
    const second = createDocument();
    const menu = first.createElement('div');
    menu.id = 'extensionsMenu';
    first.body.appendChild(menu);
    const { entry, observers, timers, cleared } = createHarness({
        documents: [first, second], failDocument: second,
    });
    assert.equal(entry.attach().ok, true);
    assert.deepEqual(observers[0].targets, [first.body]);
    assert.equal(timers.size, 1);
    const [id, timer] = [...timers.entries()][0];
    const newMenu = second.createElement('div');
    newMenu.id = 'extensions_menu';
    second.body.appendChild(newMenu);
    timer.callback();
    assert.ok(newMenu.querySelector(ENTRY), 'unobserved document must recover via polling');
    entry.destroy();
    assert.equal(observers[0].disconnected, true);
    assert.deepEqual(cleared, [id]);
    assert.equal(menu.querySelector(ENTRY), null);
    assert.equal(newMenu.querySelector(ENTRY), null);
});

test('gate:magic-wand:unavailable body and failed observation retain fallback', () => {
    const doc = createDocument();
    const missingBody = createDocument();
    missingBody.body = null;
    const partial = createHarness({ documents: [doc, missingBody] });
    partial.entry.attach();
    assert.equal(partial.timers.size, 1, 'a document without body is not observed');
    partial.entry.destroy();
    const failed = createHarness({ documents: [doc], failDocument: doc });
    failed.entry.attach();
    assert.equal(failed.observers[0].disconnected, true);
    assert.equal(failed.timers.size, 1, 'failed observation keeps polling');
    failed.entry.destroy();
});

test('gate:magic-wand:explicitly disabled retry does not poll without observer', () => {
    const { entry, timers } = createHarness({ observer: false, retryIntervalMs: false });
    entry.attach();
    assert.equal(timers.size, 0);
    entry.destroy();
});