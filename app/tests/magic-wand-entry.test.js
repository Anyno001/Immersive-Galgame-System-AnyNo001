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
